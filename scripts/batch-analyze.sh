#!/usr/bin/env bash
#
# batch-analyze.sh — Batch analysis trigger for documents missing analysis data
#
# Usage:
#   ./scripts/batch-analyze.sh --env production --batch-size 5
#   ./scripts/batch-analyze.sh --env staging --dry-run
#   ./scripts/batch-analyze.sh --env production --org ORG_ID --batch-size 10
#
# Options:
#   --env ENV         Environment: production or staging (default: production)
#   --secret SECRET   Internal API secret (or set INTERNAL_API_SECRET env var)
#   --org ORG_ID      Organization ID (default: org-ktds-axbd)
#   --batch-size N    Documents per batch (default: 10)
#   --delay MS        Delay between API calls in ms (default: 5000)
#   --dry-run         List documents without triggering analysis
#   --yes             Skip confirmation prompt
#   -h, --help        Show this help
#
set -euo pipefail

# ── Defaults ─────────────────────────────────────────────────────────

ENV="production"
SECRET="${INTERNAL_API_SECRET:-}"
ORG_ID="org-ktds-axbd"
BATCH_SIZE=10
DELAY_MS=5000
DRY_RUN=false
YES=false

# ── Base URLs ────────────────────────────────────────────────────────

INGESTION_PRODUCTION="https://svc-ingestion.ktds-axbd.workers.dev"
INGESTION_STAGING="https://svc-ingestion-staging.ktds-axbd.workers.dev"
EXTRACTION_PRODUCTION="https://svc-extraction.ktds-axbd.workers.dev"
EXTRACTION_STAGING="https://svc-extraction-staging.ktds-axbd.workers.dev"

# ── Parse args ───────────────────────────────────────────────────────

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)        ENV="$2"; shift 2 ;;
    --secret)     SECRET="$2"; shift 2 ;;
    --org)        ORG_ID="$2"; shift 2 ;;
    --batch-size) BATCH_SIZE="$2"; shift 2 ;;
    --delay)      DELAY_MS="$2"; shift 2 ;;
    --dry-run)    DRY_RUN=true; shift ;;
    --yes)        YES=true; shift ;;
    -h|--help)
      head -20 "$0" | tail -18
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

# ── Resolve URLs ─────────────────────────────────────────────────────

if [[ "$ENV" == "production" ]]; then
  INGESTION_URL="$INGESTION_PRODUCTION"
  EXTRACTION_URL="$EXTRACTION_PRODUCTION"
elif [[ "$ENV" == "staging" ]]; then
  INGESTION_URL="$INGESTION_STAGING"
  EXTRACTION_URL="$EXTRACTION_STAGING"
else
  echo "Invalid --env: $ENV (must be production or staging)" >&2
  exit 1
fi

if [[ -z "$SECRET" ]]; then
  echo "INTERNAL_API_SECRET not set. Use --secret or set the env var." >&2
  exit 1
fi

# ── Step 1: Get all documents ────────────────────────────────────────

echo "=== Batch Analyze ==="
echo "Environment: $ENV"
echo "Organization: $ORG_ID"
echo ""
echo "Fetching document list..."

DOCS_JSON=$(curl -sf "$INGESTION_URL/documents?limit=2000" \
  -H "X-Internal-Secret: $SECRET" \
  -H "X-Organization-Id: $ORG_ID" \
  -H "X-User-Id: batch-analyze-system")

DOC_COUNT=$(echo "$DOCS_JSON" | jq '.data.documents | length')
echo "Total documents: $DOC_COUNT"

# ── Step 2: Find documents missing analysis ──────────────────────────

echo "Checking for documents without analysis data..."

NEED_ANALYSIS=()

for i in $(seq 0 $((DOC_COUNT - 1))); do
  DOC_ID=$(echo "$DOCS_JSON" | jq -r ".data.documents[$i].document_id")
  DOC_NAME=$(echo "$DOCS_JSON" | jq -r ".data.documents[$i].original_name")
  DOC_STATUS=$(echo "$DOCS_JSON" | jq -r ".data.documents[$i].status")

  # Skip documents not in parsed/completed state
  if [[ "$DOC_STATUS" != "parsed" && "$DOC_STATUS" != "completed" ]]; then
    continue
  fi

  # Check if extraction exists
  EXT_JSON=$(curl -sf "$EXTRACTION_URL/extractions?documentId=$DOC_ID" \
    -H "X-Internal-Secret: $SECRET" \
    -H "X-Organization-Id: $ORG_ID" 2>/dev/null || echo '{"data":{"extractions":[]}}')

  EXT_ID=$(echo "$EXT_JSON" | jq -r '.data.extractions[] | select(.status == "completed") | .extractionId' 2>/dev/null | head -1)

  if [[ -z "$EXT_ID" ]]; then
    continue
  fi

  # Check if analysis already exists
  SUMMARY_RESP=$(curl -sf -o /dev/null -w "%{http_code}" \
    "$EXTRACTION_URL/analysis/$DOC_ID/summary" \
    -H "X-Internal-Secret: $SECRET" \
    -H "X-Organization-Id: $ORG_ID" 2>/dev/null || echo "000")

  if [[ "$SUMMARY_RESP" == "200" ]]; then
    # Verify that the response actually has data (not just success:true with empty data)
    SUMMARY_DATA=$(curl -sf "$EXTRACTION_URL/analysis/$DOC_ID/summary" \
      -H "X-Internal-Secret: $SECRET" \
      -H "X-Organization-Id: $ORG_ID" 2>/dev/null || echo '{"success":false}')
    HAS_DATA=$(echo "$SUMMARY_DATA" | jq -r '.success // false')
    if [[ "$HAS_DATA" == "true" ]]; then
      continue
    fi
  fi

  NEED_ANALYSIS+=("$DOC_ID|$EXT_ID|$DOC_NAME")
done

TOTAL_NEED=${#NEED_ANALYSIS[@]}
echo ""
echo "Documents needing analysis: $TOTAL_NEED"

if [[ $TOTAL_NEED -eq 0 ]]; then
  echo "All documents already have analysis data. Nothing to do."
  exit 0
fi

# ── Step 3: Show list ────────────────────────────────────────────────

echo ""
echo "Documents to analyze:"
for entry in "${NEED_ANALYSIS[@]}"; do
  IFS='|' read -r doc_id ext_id doc_name <<< "$entry"
  echo "  $doc_name ($doc_id)"
done

if [[ "$DRY_RUN" == true ]]; then
  echo ""
  echo "[DRY RUN] Would trigger analysis for $TOTAL_NEED documents."
  exit 0
fi

# ── Step 4: Confirm ──────────────────────────────────────────────────

if [[ "$YES" != true ]]; then
  echo ""
  read -rp "Proceed with analysis for $TOTAL_NEED documents? [y/N] " CONFIRM
  if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
    echo "Aborted."
    exit 0
  fi
fi

# ── Step 5: Trigger analysis ─────────────────────────────────────────

echo ""
echo "Starting batch analysis (batch-size: $BATCH_SIZE, delay: ${DELAY_MS}ms)..."

SUCCESS=0
FAILED=0
SKIPPED=0

for idx in "${!NEED_ANALYSIS[@]}"; do
  entry="${NEED_ANALYSIS[$idx]}"
  IFS='|' read -r doc_id ext_id doc_name <<< "$entry"

  progress="[$((idx + 1))/$TOTAL_NEED]"

  RESP=$(curl -sf -w "\n%{http_code}" \
    "$EXTRACTION_URL/analyze" \
    -X POST \
    -H "Content-Type: application/json" \
    -H "X-Internal-Secret: $SECRET" \
    -H "X-Organization-Id: $ORG_ID" \
    -H "X-User-Id: batch-analyze-system" \
    -d "{\"documentId\":\"$doc_id\",\"extractionId\":\"$ext_id\",\"organizationId\":\"$ORG_ID\",\"mode\":\"diagnosis-sync\"}" \
    2>/dev/null || echo -e "\n000")

  HTTP_CODE=$(echo "$RESP" | tail -1)
  BODY=$(echo "$RESP" | sed '$d')

  if [[ "$HTTP_CODE" == "200" ]]; then
    ANALYSIS_ID=$(echo "$BODY" | jq -r '.data.analysisId // "unknown"' 2>/dev/null || echo "unknown")
    echo "$progress OK  $doc_name → $ANALYSIS_ID"
    SUCCESS=$((SUCCESS + 1))
  else
    ERROR_MSG=$(echo "$BODY" | jq -r '.error.message // "unknown error"' 2>/dev/null || echo "HTTP $HTTP_CODE")
    echo "$progress FAIL $doc_name → $ERROR_MSG"
    FAILED=$((FAILED + 1))
  fi

  # Delay between calls (LLM-heavy, need throttling)
  if [[ $((idx + 1)) -lt $TOTAL_NEED ]]; then
    sleep "$(echo "scale=1; $DELAY_MS / 1000" | bc)"
  fi
done

# ── Summary ──────────────────────────────────────────────────────────

echo ""
echo "=== Batch Analysis Complete ==="
echo "Total: $TOTAL_NEED | Success: $SUCCESS | Failed: $FAILED | Skipped: $SKIPPED"
