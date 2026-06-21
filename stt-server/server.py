# ─────────────────────────────────────────────────────────────────
# Local STT server for AI Speaking Coach
#
# Wraps mlx-whisper (Apple Silicon) behind the HTTP contract that
# src/lib/providers/stt.ts (WhisperLocalProvider) expects:
#
#   POST /transcribe   multipart/form-data
#     file:     audio blob (webm/opus from the browser)
#     model:    size name ("small") or a full HF repo id
#     language: ISO code (e.g. "en")
#   → { "text": "...", "language": "en", "durationMs": 123 }
#
# Requires ffmpeg on PATH (mlx-whisper uses it to decode webm).
# ─────────────────────────────────────────────────────────────────

import os
import time
import tempfile

import mlx_whisper
from fastapi import FastAPI, Form, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware

# Friendly size name → mlx-community HF repo.
# Override per-request by passing a full repo id (contains "/") as `model`,
# or globally with STT_MLX_REPO.
MODEL_REPOS = {
    "tiny": "mlx-community/whisper-tiny",
    "base": "mlx-community/whisper-base-mlx",
    "small": "mlx-community/whisper-small-mlx",
    "medium": "mlx-community/whisper-medium-mlx",
    "large": "mlx-community/whisper-large-v3-mlx",
    "large-v3": "mlx-community/whisper-large-v3-mlx",
    "turbo": "mlx-community/whisper-large-v3-turbo",
}

DEFAULT_REPO = os.environ.get("STT_MLX_REPO", "mlx-community/whisper-small-mlx")


def resolve_repo(model: str) -> str:
    if not model:
        return DEFAULT_REPO
    if "/" in model:  # already a full HF repo id
        return model
    return MODEL_REPOS.get(model.lower(), DEFAULT_REPO)


app = FastAPI(title="Speaking Coach STT", version="1.0")

# The Next.js API route calls this server-side, but allow browser calls too.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok", "engine": "mlx-whisper", "default_repo": DEFAULT_REPO}


@app.post("/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    model: str = Form(""),
    language: str = Form("en"),
):
    repo = resolve_repo(model)

    # mlx-whisper loads audio via ffmpeg from a path, so spool to a temp file.
    suffix = os.path.splitext(file.filename or "")[1] or ".webm"
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(await file.read())
            tmp_path = tmp.name

        t0 = time.time()
        result = mlx_whisper.transcribe(
            tmp_path,
            path_or_hf_repo=repo,
            language=language or None,
        )
        duration_ms = int((time.time() - t0) * 1000)

        return {
            "text": result.get("text", "").strip(),
            "language": result.get("language", language),
            "durationMs": duration_ms,
        }
    except Exception as e:  # surface decode/model errors to the Next.js route
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {e}")
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.remove(tmp_path)


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("STT_PORT", "9797"))
    uvicorn.run(app, host="127.0.0.1", port=port)
