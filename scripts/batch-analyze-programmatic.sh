#!/usr/bin/env bash
#
# batch-analyze-programmatic.sh — LLM-Free programmatic batch analysis
#
# Usage:
#   ./scripts/batch-analyze-programmatic.sh --env production --org Miraeasset
#   ./scripts/batch-analyze-programmatic.sh --env production --org Miraeasset --dry-run
#
# Options:
#   --env ENV         Environment: production or staging (default: production)
#   --secret SECRET   Internal API secret (or set INTERNAL_API_SECRET env var)
#   --org ORG_ID      Organization ID (default: Miraeasset)
#   --rank RANK       Triage rank filter: high, medium, low, all (default: medium)
#   --dry-run         Show triage info without triggering analysis
#   --yes             Skip confirmation prompt
#   -h, --help        Show this help
#
set -euo pipefail

# ── Defaults ─────────────────────────────────────────────────────────

ENV="production"
SECRET="${INTERNAL_API_SECRET:-}"
ORG_ID="Miraeasset"
RANK_FILTER="medium"
DRY_RUN=false
YES=false

EXTRACTION_PRODUCTION="https://svc-extraction.ktds-axbd.workers.dev"
EXTRACTION_STAGING="https://svc-extraction-staging.ktds-axbd.workers.dev"

# ── Parse args ───────────────────────────────────────────────────────

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)      ENV="$2"; shift 2 ;;
    --secret)   SECRET="$2"; shift 2 ;;
    --org)      ORG_ID="$2"; shift 2 ;;
    --rank)     RANK_FILTER="$2"; shift 2 ;;
    --dry-run)  DRY_RUN=true; shift ;;
    --yes)      YES=true; shift ;;
    -h|--help)  head -18 "$0" | tail -16; exit 0 ;;
    *)          echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

# ── Resolve URL ──────────────────────────────────────────────────────

if [[ "$ENV" == "production" ]]; then
  BASE_URL="$EXTRACTION_PRODUCTION"
elif [[ "$ENV" == "staging" ]]; then
  BASE_URL="$EXTRACTION_STAGING"
else
  echo "Invalid --env: $ENV" >&2; exit 1
fi

if [[ -z "$SECRET" ]]; then
  echo "INTERNAL_API_SECRET not set. Use --secret or set env var." >&2; exit 1
fi

HEADERS=(-H "X-Internal-Secret: $SECRET" -H "X-Organization-Id: $ORG_ID" -H "X-User-Id: batch-programmatic")

# ── Step 1: Triage — 미분석 문서 조회 ─────────────────────────────────

echo "=== Programmatic Batch Analysis (LLM-Free) ==="
echo "Environment: $ENV | Org: $ORG_ID | Rank: $RANK_FILTER"
echo ""
echo "Fetching triage data..."

TRIAGE_JSON=$(curl -sf "$BASE_URL/analysis/triage?organizationId=$ORG_ID" "${HEADERS[@]}")

TOTAL=$(echo "$TRIAGE_JSON" | jq '.data.summary.total')
ANALYZED=$(echo "$TRIAGE_JSON" | jq '.data.summary.analyzed')
NOT_ANALYZED=$(echo "$TRIAGE_JSON" | jq '.data.summary.notAnalyzed')

echo "Total: $TOTAL | Analyzed: $ANALYZED | Not analyzed: $NOT_ANALYZED"

# 미분석 + rank 필터
if [[ "$RANK_FILTER" == "all" ]]; then
  DOC_IDS=$(echo "$TRIAGE_JSON" | jq -r '.data.documents[] | select(.analysisStatus == null) | .documentId')
else
  DOC_IDS=$(echo "$TRIAGE_JSON" | jq -r ".data.documents[] | select(.analysisStatus == null and .triageRank == \"$RANK_FILTER\") | .documentId")
fi

FILTERED_COUNT=$(echo "$DOC_IDS" | grep -c . || true)
echo "Documents to analyze ($RANK_FILTER): $FILTERED_COUNT"

if [[ $FILTERED_COUNT -eq 0 ]]; then
  echo "No documents to analyze. Done."
  exit 0
fi

if [[ "$DRY_RUN" == true ]]; then
  echo ""
  echo "[DRY RUN] Would analyze $FILTERED_COUNT documents with programmatic mode."
  echo "$DOC_IDS" | head -10
  [[ $FILTERED_COUNT -gt 10 ]] && echo "  ... and $((FILTERED_COUNT - 10)) more"
  exit 0
fi

# ── Step 2: Confirm ──────────────────────────────────────────────────

if [[ "$YES" != true ]]; then
  echo ""
  read -rp "Analyze $FILTERED_COUNT documents (programmatic, no LLM cost)? [y/N] " CONFIRM
  if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
    echo "Aborted."; exit 0
  fi
fi

# ── Step 3: batch-analyze with mode=programmatic ─────────────────────

echo ""
echo "Sending batch-analyze request (mode: programmatic)..."

# Build JSON array of document IDs
DOC_ARRAY=$(echo "$DOC_IDS" | jq -R . | jq -s .)

RESP=$(curl -sf -w "\n%{http_code}" \
  "$BASE_URL/analysis/batch-analyze" \
  -X POST \
  -H "Content-Type: application/json" \
  "${HEADERS[@]}" \
  -d "{\"documentIds\":$DOC_ARRAY,\"organizationId\":\"$ORG_ID\",\"preferredMode\":\"programmatic\"}" \
  2>/dev/null || echo -e "\n000")

HTTP_CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')

if [[ "$HTTP_CODE" == "200" ]]; then
  COMPLETED=$(echo "$BODY" | jq '.data.completed // 0')
  SKIPPED=$(echo "$BODY" | jq '.data.skipped // 0')
  ERRORS=$(echo "$BODY" | jq '.data.errors | length // 0')
  echo ""
  echo "=== Batch Complete ==="
  echo "Completed: $COMPLETED | Skipped: $SKIPPED | Errors: $ERRORS"
  if [[ "$ERRORS" -gt 0 ]]; then
    echo ""
    echo "Errors:"
    echo "$BODY" | jq -r '.data.errors[]' | head -10
  fi
else
  echo "FAILED (HTTP $HTTP_CODE)"
  echo "$BODY" | jq . 2>/dev/null || echo "$BODY"
  exit 1
fi
