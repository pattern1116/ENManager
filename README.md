# AI Speaking Coach

A self-hosted AI coach that trains you to structure what you say in English. You speak, a local STT model transcribes it, and a rule-based parser plus a local LLM tell you which structure you used, what was missing, and how to say it more clearly.

Everything runs on one Mac: the Next.js app, a Whisper STT server, a TTS server, and a quantized Gemma LLM. No third-party API is required.

**Stack:** Next.js 14 (App Router) · TypeScript · FastAPI · mlx-whisper · Kokoro TTS · Gemma 4 26B (4-bit, OpenAI-compatible gateway) · SQLite (better-sqlite3) · Vitest (120+ tests)

---

## Why I built it

I wanted to practice speaking English with instant, specific feedback, and I wanted to learn what actually hurts when you serve LLM, STT, and TTS models yourself instead of calling a hosted API. Most of the interesting engineering here came from the second goal.

---

## Architecture

```
Browser                         Next.js API routes                  Local model servers
───────                         ──────────────────                  ───────────────────
RecordPanel  ── audio ──▶  /api/transcribe ──▶ STT provider ───▶  mlx-whisper   (FastAPI :9797)
FeedbackPanel             /api/analyze    ──▶ rule parser
                                              + LLM provider ───▶  Gemma 4 26B   (OpenAI-compatible :8001)
SmallTalkRoom             /api/small-talk ──▶ STT → LLM → TTS ──▶  Kokoro TTS    (FastAPI, streamed WAV)
History / Report          /api/sessions, /api/report ──▶ SQLite (WAL), per-user scoped queries
```

### The analyze pipeline

1. The rule-based parser makes a first guess at the structure pattern and the missing pieces.
2. That guess is injected into the LLM prompt as a hint.
3. The LLM returns JSON feedback. Every field is validated and coerced.
4. **If the LLM output does not parse, the rule-parser result is used instead**, so the user always gets feedback.
5. The result is stored in SQLite and shown in the UI.

---

## Features

- **Structure feedback** on five patterns: Point–Reason–Example, Signpost–Idea–Detail, Cause–Effect, Contrast Connector, Hedging + Opinion. Each answer gets detected patterns, a 0–100 clarity score, missing elements, and a suggested rewrite with reasoning.
- **Practice loop:** a round-robin deck across all five patterns with a countdown timer, a hit/miss check on the target pattern, LLM-generated follow-up topics, and a "simplify" option for abstract topics.
- **Small talk mode:** a voice-only conversation. Record → STT → LLM reply → TTS, one turn at a time.
- **Progress and weekly reports:** per-pattern averages and trends, top three weaknesses, daily/weekly/monthly charts, all computed with SQL aggregates.
- **Provider abstraction:** LLM and STT sit behind interfaces. Switch between mock, local Gemma, Ollama, Claude, or OpenAI with one line in `.env.local`. **Mock mode** runs the whole pipeline without any model.

---

## Engineering notes

### Designing for unreliable model output
A 26B local model does not always follow instructions, so the app never trusts it alone:
- Invalid or partial JSON falls back to the rule-parser result.
- Small talk has a **hard server-side cap on user turns** (`MAX_USER_TURNS = 10`) instead of relying on the model to decide when the conversation is over. Goodbye detection is a regex with unit tests, including negative lookaheads so phrases like "go over my notes" are not mistaken for "goodbye".
- Practice patterns kept drifting toward the same two or three, so the **client picks the target pattern round-robin** instead of the LLM.
- The "simplify" feature drifted off topic, so I lowered the temperature, rewrote the prompts per pattern, and keep the original topic if the rewrite fails.

### Measuring before optimizing
I benchmarked STT engines before deciding whether to build a streaming STT server:

| Batch STT (base model, 19s clip, warm) | Time |
|---|---|
| mlx-whisper | **0.235s** |
| whisper.cpp (Metal) | 0.267s |
| faster-whisper (CPU, int8) | 0.838s |

| Streaming STT (emit latency) | Latency |
|---|---|
| SimulWhisper (AlignAtt + MLX) | **885ms** |
| LocalAgreement + MLX | 1591ms |
| LocalAgreement + faster-whisper | 1858ms |

**STT was not the bottleneck.** A conversation turn was dominated by the LLM response and TTS. So instead of adding a heavy streaming server (torch, WebSockets), live captions use periodic re-transcription.

The same habit applied to TTS: the 82M Kokoro model ran **faster on CPU (4.10s) than on the GPU (6.10s)** because transfer overhead outweighed the speedup, so it runs on CPU.

### Incident: STT event-loop starvation
- **Symptom:** after a deploy, small talk stopped transcribing, or transcribed but never replied.
- **Cause:** `/transcribe` was an `async def` that called the blocking `mlx_whisper.transcribe()` directly, so each decode held uvicorn's single event loop for 0.3–0.5s. A new live-caption feature sent a partial-transcription request every ~900ms, so 10–15 requests piled up per turn and the final transcription starved behind them.
- **Response:** rolled the feature back and rebuilt cleanly. Decoding now runs in a worker thread (`run_in_threadpool`) behind a semaphore that keeps one decode on the GPU at a time, so the event loop stays responsive.

### Working around upstream bugs
- The LLM gateway leaked Gemma's EOS token into tool-call responses (upstream issue #1087). I added a small client-side proxy that strips it.
- Tracked down why three mlx-lm releases failed to run Gemma 4 (a missing module, a thread-local GPU stream crash, and a parameter mismatch) before settling on the gateway setup.

### Security
The app is exposed through a Cloudflare Tunnel, so it is locked down even though it is a personal tool:
- **Cloudflare Access** in front, plus a **PIN gate** in middleware for every page and `/api` route. Codes live only in env vars, never in the repo.
- **Per-user data isolation:** every row has a `user_id` and every query is scoped to it. The column was added with a non-destructive migration (`ALTER` + migrate on startup), and cross-user access is covered by tests.
- **Server-to-server auth:** calls to the TTS server carry a short-lived **HMAC token** minted server-side, so the secret never reaches the browser.
- The companion news app adds **Turnstile → HMAC session tokens**, per-IP **rate limiting** (verified to return 429 from the 11th request in a burst test), and an **SSRF allowlist** on article fetching.

---

## Quick start (mock mode, no models needed)

```bash
npm install
cp .env.example .env.local   # defaults to mock providers
npm run db:init
npm run dev                  # http://localhost:5555
```

## Connecting real models

**STT (mlx-whisper, Apple Silicon)**
```bash
brew install ffmpeg python@3.12
cd stt-server && ./run.sh --setup   # first time only
cd stt-server && ./run.sh
```
```env
STT_PROVIDER=local
STT_BASE_URL=http://localhost:9797
STT_MODEL=small
```

**LLM (local Gemma via OpenAI-compatible gateway)**
```env
LLM_PROVIDER=openai-compat
LLM_BASE_URL=http://localhost:8001
LLM_MODEL=gemma-4-26b-a4b-it-4bit
LLM_API_KEY=<gateway key>
```

Ollama, Claude, and OpenAI are also supported through `LLM_PROVIDER`. Check provider status at `GET /api/health` or on the Settings page.

---

## Tests

```bash
npm test
```

120+ Vitest tests cover feedback validation and coercion, the rule parser, practice generation and scoring, provider selection, DB aggregates and trends, the DB migration, auth and middleware, and the `/api/analyze` route end to end.

---

## Project layout

```
stt-server/                 FastAPI wrapper around mlx-whisper
src/
├── app/api/                analyze · transcribe · small-talk · tts · sessions · practice · report · auth · health
├── components/             coach UI and small-talk room
├── hooks/                  recorder, session, practice plan
├── lib/
│   ├── providers/          LLM and STT provider interfaces + mock implementations
│   ├── parsers/            rule-based structure analysis, practice generation
│   ├── smalltalk/          prompts, turn cap, goodbye detection
│   ├── db/                 SQLite CRUD and aggregates
│   └── feedback.ts         LLM output validation and coercion
└── middleware.ts           PIN gate
tests/                      Vitest unit and route tests
```
