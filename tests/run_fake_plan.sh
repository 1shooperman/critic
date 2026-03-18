#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLAN_FILE="${1:-$SCRIPT_DIR/FAKE_PLAN.md}"

if [[ ! -f "$PLAN_FILE" ]]; then
  echo "Plan file not found: $PLAN_FILE" >&2
  exit 1
fi

CRITIC_URL="${CRITIC_URL:-http://localhost:3000/}"
CRITIC_MODEL="${CRITIC_MODEL:-gpt-4o-mini}"
CRITIC_PIPELINE="${CRITIC_PIPELINE:-engineering-review}"
CRITIC_TECH_STACK="${CRITIC_TECH_STACK:-TypeScript, Node.js, React}"
CRITIC_USER_ASK="${CRITIC_USER_ASK:-Please review this implementation plan and return actionable, plan-specific feedback.}"

request_body="$(
  node -e 'const fs=require("fs"); const plan=fs.readFileSync(process.argv[1],"utf8");
const body={
  model: process.env.CRITIC_MODEL,
  pipeline: process.env.CRITIC_PIPELINE,
  variables: {
    tech_stack: process.env.CRITIC_TECH_STACK,
    user_ask: process.env.CRITIC_USER_ASK,
    plan
  }
};
process.stdout.write(JSON.stringify(body));' "$PLAN_FILE"
)"

echo "Sending fake plan to $CRITIC_URL"

curl -sS -X POST "$CRITIC_URL" \
  -H "Content-Type: application/json" \
  --data "$request_body" | node -e '
let raw="";
process.stdin.on("data", c => raw += c);
process.stdin.on("end", () => {
  try {
    const json = JSON.parse(raw);
    console.log(JSON.stringify(json, null, 2));
  } catch {
    console.log(raw);
  }
});'

echo

echo "If CRITIC_LOG_RUNS is enabled in the container env, inspect logs with:"
echo "  docker logs critic --tail=200"
echo "  ls -1 logs/"
