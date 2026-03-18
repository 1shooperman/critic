#!/bin/zsh
SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
REPO_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

source "${REPO_DIR}/.env"

export PLAN="$(cat "${SCRIPT_DIR}/FAKE_PLAN.md")"
export USER_ASK="$(cat "${SCRIPT_DIR}/fake_user_ask.txt")"

curl -s \
  -H "Accept: application/json, text/event-stream" \
  -H "Content-Type: application/json" \
  -X POST "http://localhost:${PORT}/mcp" \
  -d "$(python3 - <<'PY'
import json
import os

plan = os.environ.get("PLAN", "")
user_ask = os.environ.get("USER_ASK", "")

print(json.dumps({
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "critique_pipeline",
    "arguments": {
      "model": "gemini-2.5-flash",
      "pipeline": "engineering-review",
      "variables": {
        "plan": plan,
        "user_ask": user_ask,
        "tech_stack": "tyepscript,node,jest,react,nextjs,biomejs",
      },
    },
  },
}))
PY
)"