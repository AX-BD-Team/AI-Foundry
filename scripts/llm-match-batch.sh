#!/bin/bash
# LLM Semantic Match — Batch Runner
# Processes all unmatched items in batches of 10 with 3s delay between batches.
# Usage: bash scripts/llm-match-batch.sh [start_offset]

RESULT_ID="${1:-db337e29-2bbc-4fa0-b082-2847581a4fc5}"
SECRET="e2e-test-secret-2026"
BASE="https://svc-extraction-production.ktds-axbd.workers.dev"
BATCH_SIZE=10
TOTAL=284
LOGFILE="scripts/llm-match-results-v2.jsonl"
START_OFFSET="${2:-0}"

echo "Starting LLM match batch from offset=$START_OFFSET, batchSize=$BATCH_SIZE, total=$TOTAL"
echo "Log: $LOGFILE"

total_matches=0
total_confirmed=0
total_errors=0
total_processed=0

for ((offset=START_OFFSET; offset<TOTAL; offset+=BATCH_SIZE)); do
  echo -n "Batch offset=$offset ... "

  RESPONSE=$(curl -s -X POST \
    -H "X-Internal-Secret: $SECRET" \
    -H "Content-Type: application/json" \
    -d "{\"batchSize\": $BATCH_SIZE, \"offset\": $offset}" \
    "$BASE/factcheck/results/$RESULT_ID/llm-match" \
    --max-time 120)

  # Log raw response
  echo "$RESPONSE" >> "$LOGFILE"

  # Parse stats
  processed=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['llmMatching']['processed'])" 2>/dev/null || echo "0")
  matches=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['llmMatching']['newMatches'])" 2>/dev/null || echo "0")
  confirmed=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['llmMatching']['confirmedGaps'])" 2>/dev/null || echo "0")
  errs=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['llmMatching']['errors'])" 2>/dev/null || echo "0")
  has_more=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['pagination']['hasMore'])" 2>/dev/null || echo "False")

  total_processed=$((total_processed + processed))
  total_matches=$((total_matches + matches))
  total_confirmed=$((total_confirmed + confirmed))
  total_errors=$((total_errors + errs))

  echo "processed=$processed matches=$matches confirmed=$confirmed errors=$errs"

  if [ "$has_more" = "False" ]; then
    echo "No more items. Done."
    break
  fi

  # Delay between batches to avoid rate limiting
  sleep 3
done

echo ""
echo "=== SUMMARY ==="
echo "Total processed: $total_processed"
echo "Total new matches: $total_matches"
echo "Total confirmed gaps: $total_confirmed"
echo "Total errors: $total_errors"
echo "Match rate: $(python3 -c "print(f'{$total_matches/$total_processed*100:.1f}%' if $total_processed > 0 else 'N/A')")"
