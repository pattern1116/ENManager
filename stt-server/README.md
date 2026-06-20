# Local STT server (mlx-whisper)

Apple Silicon speech-to-text for the Speaking Coach app. Implements the
HTTP contract that `src/lib/providers/stt.ts` (`STT_PROVIDER=local`) expects.

## Requirements
- Apple Silicon Mac
- `ffmpeg` on PATH (`brew install ffmpeg`) — used to decode the browser's webm/opus
- Python 3.12 (`brew install python@3.12`)

## Run
```bash
./run.sh --setup   # first time: builds .venv + installs deps
./run.sh           # subsequent starts
```
Server listens on `http://localhost:8000`. The first transcription downloads
the Whisper weights from Hugging Face (cached afterwards).

## Config (env)
- `STT_PORT` — port (default 8000)
- `STT_MLX_REPO` — default model repo (default `mlx-community/whisper-small-mlx`)

Per-request the Next.js app sends `model` (from `STT_MODEL`, default `small`)
and `language` (`en`). Pass a full HF repo id as `model` to override.

## Endpoints
- `GET /health`
- `POST /transcribe` — form: `file`, `model`, `language` → `{ text, language, durationMs }`
