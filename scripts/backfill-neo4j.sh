#!/usr/bin/env bash
# backfill-neo4j.sh — Batch backfill D1 ontologies → Neo4j
#
# Usage:
#   ./scripts/backfill-neo4j.sh [local|staging|production] [batch_size]
#
# Examples:
#   ./scripts/backfill-neo4j.sh local 20        # local wrangler dev (default)
#   ./scripts/backfill-neo4j.sh staging 50
#   ./scripts/backfill-neo4j.sh production 20

set -euo pipefail

ENV="${1:-local}"
BATCH="${2:-20}"

case "$ENV" in
  local)
    BASE_URL="http://localhost:8787"
    SECRET="${INTERNAL_API_SECRET:-dev-secret}"
    ;;
  staging)
    BASE_URL="https://svc-ontology.ktds-axbd.workers.dev"
    SECRET="${INTERNAL_API_SECRET:?Set INTERNAL_API_SECRET for staging}"
    ;;
  production)
    BASE_URL="https://svc-ontology-production.ktds-axbd.workers.dev"
    SECRET="${INTERNAL_API_SECRET:?Set INTERNAL_API_SECRET for production}"
    ;;
  *)
    echo "Unknown env: $ENV (use local|staging|production)"
    exit 1
    ;;
esac

URL="$BASE_URL/admin/backfill-neo4j?limit=$BATCH"

echo "=== Neo4j Backfill ==="
echo "  Env:   $ENV"
echo "  URL:   $URL"
echo "  Batch: $BATCH"
echo ""

# Dry run first
echo "[dry-run] Checking scope..."
DRY=$(curl -s -X POST "$URL&dryRun=true" \
  -H "X-Internal-Secret: $SECRET" \
  -H "Content-Type: application/json")
TOTAL=$(echo "$DRY" | jq -r '.data.totalNull // 0')
echo "  Total NULL records: $TOTAL"
echo ""

if [ "$TOTAL" -eq 0 ]; then
  echo "Nothing to backfill. Done."
  exit 0
fi

read -p "Proceed with backfill? (y/N) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 0
fi

# Loop until remaining = 0
ROUND=1
TOTAL_OK=0
TOTAL_FAIL=0

while true; do
  echo "[round $ROUND] Processing batch of $BATCH (offset=0)..."
  RESULT=$(curl -s -X POST "$URL" \
    -H "X-Internal-Secret: $SECRET" \
    -H "Content-Type: application/json")

  OK=$(echo "$RESULT" | jq -r '.data.succeeded // 0')
  FAIL=$(echo "$RESULT" | jq -r '.data.failed // 0')
  REMAIN=$(echo "$RESULT" | jq -r '.data.remaining // 0')
  PROCESSED=$(echo "$RESULT" | jq -r '.data.processed // 0')

  TOTAL_OK=$((TOTAL_OK + OK))
  TOTAL_FAIL=$((TOTAL_FAIL + FAIL))

  echo "  processed=$PROCESSED  ok=$OK  fail=$FAIL  remaining=$REMAIN"

  if [ "$PROCESSED" -eq 0 ] || [ "$REMAIN" -eq 0 ]; then
    break
  fi

  # If all failed in this batch, stop to avoid infinite loop
  if [ "$OK" -eq 0 ]; then
    echo "WARNING: entire batch failed. Stopping to avoid infinite loop."
    break
  fi

  ROUND=$((ROUND + 1))
  sleep 1
done

echo ""
echo "=== Backfill Complete ==="
echo "  Rounds:    $ROUND"
echo "  Succeeded: $TOTAL_OK"
echo "  Failed:    $TOTAL_FAIL"
