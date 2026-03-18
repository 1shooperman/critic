#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"
PLAN_FILE="${1:-$SCRIPT_DIR/FAKE_PLAN.md}"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

if [[ ! -f "$PLAN_FILE" ]]; then
  echo "Plan file not found: $PLAN_FILE" >&2
  exit 1
fi

PORT="${PORT:-3000}"
CRITIC_URL="${CRITIC_URL:-http://localhost:${PORT}/}"
CRITIC_MODEL="${CRITIC_MODEL:-gpt-4o-mini}"
CRITIC_PIPELINE="${CRITIC_PIPELINE:-engineering-review}"
CRITIC_TECH_STACK="${CRITIC_TECH_STACK:-TypeScript, Node.js, React}"
CRITIC_USER_ASK="${CRITIC_USER_ASK:-Please review this implementation plan and return actionable, plan-specific feedback.}"

request_body="$(
  node -e 'const fs=require("fs"); const [planFile, model, pipeline, techStack, userAsk] = process.argv.slice(1);
const plan=fs.readFileSync(planFile,"utf8");
const body={
  model,
  pipeline,
  variables: {
    tech_stack: techStack,
    user_ask: userAsk,
    plan
  }
};
process.stdout.write(JSON.stringify(body));' \
    "$PLAN_FILE" \
    "$CRITIC_MODEL" \
    "$CRITIC_PIPELINE" \
    "$CRITIC_TECH_STACK" \
    "$CRITIC_USER_ASK"
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
