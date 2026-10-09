# AI Speaking Coach

A self-hosted coach that trains you to structure what you say in English. You speak, a local Whisper model transcribes it, and a rule-based parser plus a local LLM tell you which structure you used, what was missing, and how to say it more clearly.

**Stack:** Next.js 14 (App Router) · TypeScript · Tailwind · SQLite (better-sqlite3, WAL) · FastAPI + mlx-whisper · Gemma 4 26B 4-bit behind an OpenAI-compatible gateway · Kokoro TTS · Vitest (129 tests)

Everything runs on one Mac. No third-party API is required.

---

## Why I built it

Two reasons. I wanted instant, specific feedback while practising spoken English, and I wanted to find out what actually hurts when you serve the LLM, STT and TTS models yourself instead of calling a hosted API. Most of the engineering worth reading about below came from the second reason.

---

## Architecture

```
Browser                    Next.js API routes                    Local model servers
───────                    ──────────────────                    ───────────────────
RecordPanel ── audio ─▶ /api/transcribe ──▶ STT provider ──────▶ mlx-whisper  (FastAPI :9797)
FeedbackPanel           /api/analyze    ──▶ rule parser
                                            + LLM provider ────▶ Gemma 4 26B  (OpenAI-compat :8001)
SmallTalkRoom           /api/small-talk ──▶ LLM provider
                        /api/tts        ──▶ HMAC-signed proxy ─▶ Kokoro TTS   (:8787, streamed audio)
History / Report        /api/sessions, /api/report ──▶ SQLite, per-user scoped SQL aggregates
```

Both model layers sit behind an interface (`LLMProvider`, `STTProvider`) with a mock implementation, so the whole product runs end to end with no model loaded.

### The analyze pipeline

1. `parseStructure()` makes a rule-based first guess at the pattern and at which pieces are missing.
2. That guess goes into the LLM prompt as a hint, at temperature 0.2.
3. The LLM returns JSON. `buildFeedback()` validates and coerces every field: an unknown pattern becomes `UNKNOWN`, the score is clamped to 0 to 100, `gapsFound` is forced to an array.
4. If the output is not valid JSON at all, the rule-parser result is used instead, so the user always gets feedback.
5. The result is written to SQLite and rendered in the feedback panel.

---

## Features

**Structure feedback** on five patterns: Point-Reason-Example, Signpost-Idea-Detail, Cause-Effect, Contrast Connector, Hedging + Opinion. Each answer gets a detected pattern, a 0 to 100 score, the missing elements, and a rewrite with reasoning.

**Practice loop.** A seed deck covering all five patterns, a countdown timer, a hit/miss check against the target pattern, LLM-generated follow-up prompts that dig into the answer you just gave, and a "simplify" action for topics that are too abstract.

**Small talk mode.** A voice-only conversation: record, transcribe, LLM reply, TTS playback, one turn at a time. Nothing the coach says is shown on screen during the chat. Afterwards there is a review screen where tapping your own turn produces a level-preserving rewrite, computed lazily and cached on the row.

**Dictionary popup.** Double-clicking a word calls `dictionaryapi.dev` first and falls back to the local LLM, which also works offline and handles rarer words.

**Progress and weekly reports.** Per-pattern averages and trends, top three weak points, this week against last week, and a score trend selectable by day, week or month. All of it is SQL aggregation in `lib/db`, no separate analytics service.

---

## Engineering notes

### Designing for unreliable model output

A 4-bit local model does not reliably follow instructions, so nothing in the app trusts it on its own.

- **JSON fallback.** In the analyze path, `buildFeedback()` strips ```` ```json ```` fences and falls back to the rule-parser result on anything that is not a valid JSON object. The small-talk routes go further with `extractJsonObject()`, which also brace-scans the response to recover an object the model wrapped in prose.
- **Hard turn cap.** The model's own `done` flag kept the conversation going forever, so `MAX_USER_TURNS = 10` forces a warm closing server-side regardless of what the model returns.
- **Farewell detection.** The model also ignored "wrap up when they say goodbye", so a regex set does it instead. The patterns match phrases rather than lone words, and `go` carries a negative lookahead for `over|through|on|ahead|back` so "I need to go over my notes" is not read as leaving. Covered by unit tests in both directions.
- **The client picks the pattern.** Left to choose, the LLM skewed to PRE/SID/HO and almost never asked for CE or CC, so the client drives a round-robin rotation and the route pins the pattern in the prompt. The cursor starts at a random offset so sessions do not all open on PRE.
- **Topic drift.** "Simplify" wandered onto a different question, so it runs at 0.3 instead of 0.7, gets a per-pattern prompt, and keeps the original topic when the rewrite fails.

### Measuring before optimizing

Before building a streaming STT server, I benchmarked what I already had.

| Batch STT (base model, 19s clip, warm) | Time |
|---|---|
| mlx-whisper | **0.235s** |
| whisper.cpp (Metal) | 0.267s |
| faster-whisper (CPU, int8) | 0.838s |

| Streaming STT | Emit latency |
|---|---|
| SimulWhisper (AlignAtt + MLX) | **885ms** |
| LocalAgreement + MLX | 1591ms |
| LocalAgreement + faster-whisper | 1858ms |

STT was not the bottleneck. A conversation turn was dominated by LLM response time and TTS. So instead of taking on a streaming server with torch and WebSockets, I built live captions as periodic re-transcription on a roughly 900ms cycle. That turned out to have its own problem, below, and the feature is currently off.

The same check paid off on TTS. Kokoro ran faster on CPU (4.10s) than on MPS (6.10s), because transfer overhead outweighed the speedup for a model this small, so it runs on CPU.

### Incident: STT event-loop starvation

**Symptom.** After shipping live captions, small talk stopped transcribing, or transcribed but never replied.

**Cause.** `/transcribe` was an `async def` calling the blocking `mlx_whisper.transcribe()` directly, so every decode held uvicorn's single event loop. Live captions sent a partial-transcript request about every 900ms, so a turn's worth of requests queued up and the final transcription starved behind them.

**Response.** Reverted the feature first to get back to a working state, then fixed the server: the decode now runs in a worker thread via `run_in_threadpool`, gated by an `asyncio.Semaphore(1)` so only one decode touches the GPU at a time while the event loop stays free to accept requests. Measured against the old code under a burst of 12 queued decodes, `/health` went from blocking for 1.64s to answering in 2.4ms.

**Still off, deliberately.** That fixes the event loop, not the queue. Because GPU decoding is serialized, a flood of partials still delays the final transcription by whatever is queued ahead of it: in the same test, final-request latency was 1.88s before and 1.79s after. So captions stay disabled (see the comment in `SmallTalkRoom.tsx`) until there is a policy for dropping superseded partials rather than queueing them, which is the actual missing piece.

### Working around an upstream bug

The LLM gateway (oMLX) leaked Gemma's EOS token into tool-call responses, upstream issue #1087. Rather than wait for a fix or patch the gateway, I put a small proxy in front of it that strips the token. That proxy lives with the gateway, not in this repo.

### Security

The app is reachable through a Cloudflare Tunnel with Cloudflare Access in front, so the application layer is locked down too. In this repo:

- **PIN gate in middleware** (`src/middleware.ts`) covers every page and every `/api` route except the auth endpoints. API calls get 401, pages get redirected, and the redirect honours `x-forwarded-host`/`-proto` so it does not bounce a tunnelled browser to localhost. Codes come only from `AUTH_CODES`; with it unset, nobody can log in and there is no hardcoded default.
- **Per-user isolation.** Every row carries a `user_id` and every `lib/db` function takes it as its first argument, so there is no ambient current user at the data layer. Routes read it from an httpOnly cookie.
- **Zero-downtime migration.** `migrate()` adds the `user_id` columns to a pre-isolation database on first connect. Legacy rows keep the `''` default owner, which a 4-digit login code can never match, so old data stays archived instead of leaking into the first account that logs in. Index creation is deliberately deferred until after the migration, since several indexes are on the column being added.
- **Server-to-server auth.** `/api/tts` mints a short-lived HMAC token (`exp.hmac_sha256(secret, exp)`) per request and attaches it server-side, so the shared secret never reaches the browser. When TTS is not configured the route returns 503 with `fallback: true` and the client falls back to `speechSynthesis`.

---

## Quick start (mock mode, no models)

```bash
npm install
cp .env.example .env.local   # defaults to mock providers
npm run db:init
npm run dev                  # http://localhost:5555
```

Change `AUTH_CODES` in `.env.local` from the example value to your own 4-digit code. The entered code becomes the user id, and with the variable unset nobody can log in.

## Connecting real models

STT (mlx-whisper, Apple Silicon):

```bash
brew install ffmpeg python@3.12
cd stt-server && ./run.sh --setup   # first run: venv + deps
./run.sh                            # STT_PORT overrides the port
```

```env
STT_PROVIDER=local
STT_BASE_URL=http://localhost:9797
STT_MODEL=small                 # size name or a full HF repo id
```

LLM, via any OpenAI-compatible endpoint:

```env
LLM_PROVIDER=openai-compat
LLM_BASE_URL=http://localhost:8001
LLM_MODEL=gemma-4-26b-a4b-it-4bit
LLM_API_KEY=<gateway key>
```

`LLM_PROVIDER` also accepts `claude`, `openai`, `ollama`, `lmstudio` and `mock`. `GET /api/health` and the settings page report which providers are live.

---

## Tests

```bash
npm test
```

129 Vitest tests across 13 files: the rule parser (21), DB aggregates and trends (21), provider selection and the mock implementations (17), LLM output validation and coercion (13), middleware (9), practice generation (9), the practice/next route (9), auth (12 across unit and route), the `/api/analyze` route (5), practice scoring (5), small-talk pacing (5) and the schema migration (3).

---

## Project layout

```
stt-server/                FastAPI wrapper around mlx-whisper
src/
├── app/api/               analyze · transcribe · small-talk · tts · define
│                          sessions · practice · report · auth · health
├── components/            coach panels, small-talk room, review chat
├── hooks/                 recorder, session pipeline, practice plan
├── lib/
│   ├── providers/         LLM + STT interfaces and implementations
│   ├── parsers/           rule-based structure analysis, practice bank
│   ├── smalltalk/         prompts, turn cap, farewell detection, pacing
│   ├── db/                schema, migration, CRUD, SQL aggregates
│   ├── auth.ts            PIN allowlist
│   ├── currentUser.ts     authenticated user id from the cookie
│   ├── practiceResult.ts  target-pattern hit/miss scoring
│   └── feedback.ts        LLM output validation and coercion
└── middleware.ts          PIN gate
tests/                     Vitest unit + route tests
```
