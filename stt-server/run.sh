#!/usr/bin/env bash
# Start the local mlx-whisper STT server on :8000
# First run: ./run.sh --setup   (creates venv + installs deps)
set -euo pipefail
cd "$(dirname "$0")"

VENV=".venv"

if [[ "${1:-}" == "--setup" || ! -d "$VENV" ]]; then
  echo "→ creating venv with python3.12"
  python3.12 -m venv "$VENV"
  "$VENV/bin/pip" install --upgrade pip
  "$VENV/bin/pip" install -r requirements.txt
fi

exec "$VENV/bin/python" server.py
