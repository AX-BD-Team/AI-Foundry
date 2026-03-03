#!/usr/bin/env bash
#
# batch-approve.sh — Bulk HITL approval of candidate policies
#
# Usage:
#   ./scripts/batch-approve.sh --env production --batch-size 50
#   ./scripts/batch-approve.sh --env staging --dry-run
#   ./scripts/batch-approve.sh --env production --status candidate --batch-size 100
#
# Options:
#   --env ENV         Environment: production or staging (default: production)
#   --secret SECRET   Internal API secret (or set INTERNAL_API_SECRET env var)
#   --reviewer ID     Reviewer ID (default: batch-approve-system)
#   --comment TEXT     Comment for approval (default: "Bulk approved via batch-approve.sh")
#   --status STATUS   Filter: candidate, in_review, or all (default: candidate)
#   --batch-size N    Policies per API call (max 100, default: 50)
#   --delay MS        Delay between batches in ms (default: 1000)
#   --dry-run         List candidates without approving
#   --yes             Skip confirmation prompt
#   -h, --help        Show this help
#
set -euo pipefail

# ── Defaults ─────────────────────────────────────────────────────────

ENV="production"
SECRET="${INTERNAL_API_SECRET:-}"
REVIEWER="batch-approve-system"
COMMENT="Bulk approved via batch-approve.sh"
STATUS="candidate"
BATCH_SIZE=50
DELAY_MS=1000
DRY_RUN=false
YES=false

# ── Base URLs ────────────────────────────────────────────────────────

BASE_URL_PRODUCTION="https://svc-policy.sinclair-account.workers.dev"
BASE_URL_STAGING="https://svc-policy-staging.sinclair-account.workers.dev"

# ── Parse args ───────────────────────────────────────────────────────

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)        ENV="$2"; shift 2 ;;
    --secret)     SECRET="$2"; shift 2 ;;
    --reviewer)   REVIEWER="$2"; shift 2 ;;
    --comment)    COMMENT="$2"; shift 2 ;;
    --status)     STATUS="$2"; shift 2 ;;
    --batch-size) BATCH_SIZE="$2"; shift 2 ;;
    --delay)      DELAY_MS="$2"; shift 2 ;;
    --dry-run)    DRY_RUN=true; shift ;;
    --yes)        YES=true; shift ;;
    -h|--help)
      head -22 "$0" | tail -20
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

# ── Resolve base URL ────────────────────────────────────────────────

if [[ "$ENV" == "production" ]]; then
  BASE_URL="$BASE_URL_PRODUCTION"
elif [[ "$ENV" == "staging" ]]; then
  BASE_URL="$BASE_URL_STAGING"
else
  echo "ERROR: --env must be 'production' or 'staging'" >&2
  exit 1
fi

# ── Validate secret ─────────────────────────────────────────────────

if [[ -z "$SECRET" ]]; then
  echo "ERROR: INTERNAL_API_SECRET not set. Use --secret or export INTERNAL_API_SECRET" >&2
  exit 1
fi

if [[ "$BATCH_SIZE" -gt 100 ]]; then
  echo "ERROR: --batch-size max is 100" >&2
  exit 1
fi

echo "═══════════════════════════════════════════════"
echo "  Batch Approve — AI Foundry Policy HITL"
echo "═══════════════════════════════════════════════"
echo "  Environment : $ENV"
echo "  Base URL    : $BASE_URL"
echo "  Reviewer    : $REVIEWER"
echo "  Status      : $STATUS"
echo "  Batch Size  : $BATCH_SIZE"
echo "  Delay       : ${DELAY_MS}ms"
echo "  Dry Run     : $DRY_RUN"
echo "═══════════════════════════════════════════════"

# ── Step 1: Fetch candidate policies ─────────────────────────────────

echo ""
echo "[1/3] Fetching policies with status='$STATUS'..."

POLICIES_URL="$BASE_URL/policies?status=$STATUS&limit=1000"
POLICIES_RESPONSE=$(curl -s -w "\n%{http_code}" \
  -H "X-Internal-Secret: $SECRET" \
  "$POLICIES_URL")

HTTP_CODE=$(echo "$POLICIES_RESPONSE" | tail -1)
POLICIES_BODY=$(echo "$POLICIES_RESPONSE" | sed '$d')

if [[ "$HTTP_CODE" != "200" ]]; then
  echo "ERROR: Failed to fetch policies (HTTP $HTTP_CODE)" >&2
  echo "$POLICIES_BODY" >&2
  exit 1
fi

# Extract policy IDs (using jq if available, fallback to grep)
if command -v jq &>/dev/null; then
  POLICY_IDS=$(echo "$POLICIES_BODY" | jq -r '.data.policies[]?.policy_id // empty' 2>/dev/null || echo "$POLICIES_BODY" | jq -r '.data[]?.policy_id // empty' 2>/dev/null || echo "")
  TOTAL_COUNT=$(echo "$POLICY_IDS" | grep -c . || echo "0")
else
  echo "WARNING: jq not found. Using grep fallback (may be less reliable)" >&2
  POLICY_IDS=$(echo "$POLICIES_BODY" | grep -oP '"policy_id"\s*:\s*"\K[^"]+' || echo "")
  TOTAL_COUNT=$(echo "$POLICY_IDS" | grep -c . || echo "0")
fi

echo "  Found: $TOTAL_COUNT policies with status='$STATUS'"

if [[ "$TOTAL_COUNT" -eq 0 ]]; then
  echo "No policies to approve. Done."
  exit 0
fi

# ── Step 2: Confirmation ─────────────────────────────────────────────

if [[ "$DRY_RUN" == "true" ]]; then
  echo ""
  echo "[DRY RUN] Would approve $TOTAL_COUNT policies:"
  echo "$POLICY_IDS" | head -20
  if [[ "$TOTAL_COUNT" -gt 20 ]]; then
    echo "  ... and $((TOTAL_COUNT - 20)) more"
  fi
  exit 0
fi

if [[ "$YES" != "true" ]]; then
  echo ""
  read -rp "Approve $TOTAL_COUNT policies? [y/N] " confirm
  if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
    echo "Aborted."
    exit 0
  fi
fi

# ── Step 3: Batch approve ────────────────────────────────────────────

echo ""
echo "[2/3] Approving in batches of $BATCH_SIZE..."

# Convert to array
IFS=$'\n' read -r -d '' -a IDS_ARRAY <<< "$POLICY_IDS" || true

TOTAL_APPROVED=0
TOTAL_FAILED=0
BATCH_NUM=0

for ((i = 0; i < ${#IDS_ARRAY[@]}; i += BATCH_SIZE)); do
  BATCH_NUM=$((BATCH_NUM + 1))
  BATCH_IDS=("${IDS_ARRAY[@]:i:BATCH_SIZE}")
  BATCH_COUNT=${#BATCH_IDS[@]}

  # Build JSON array of IDs
  JSON_IDS=$(printf '"%s",' "${BATCH_IDS[@]}")
  JSON_IDS="[${JSON_IDS%,}]"

  PAYLOAD=$(cat <<EOF
{
  "policyIds": $JSON_IDS,
  "reviewerId": "$REVIEWER",
  "comment": "$COMMENT — batch $BATCH_NUM"
}
EOF
)

  echo -n "  Batch $BATCH_NUM ($BATCH_COUNT policies)... "

  RESPONSE=$(curl -s -w "\n%{http_code}" \
    -X POST \
    -H "Content-Type: application/json" \
    -H "X-Internal-Secret: $SECRET" \
    -d "$PAYLOAD" \
    "$BASE_URL/policies/bulk-approve")

  RESP_CODE=$(echo "$RESPONSE" | tail -1)
  RESP_BODY=$(echo "$RESPONSE" | sed '$d')

  if [[ "$RESP_CODE" == "200" ]]; then
    if command -v jq &>/dev/null; then
      BATCH_APPROVED=$(echo "$RESP_BODY" | jq -r '.data.approved | length' 2>/dev/null || echo "?")
      BATCH_FAILED=$(echo "$RESP_BODY" | jq -r '.data.failed | length' 2>/dev/null || echo "?")
    else
      BATCH_APPROVED="$BATCH_COUNT"
      BATCH_FAILED="0"
    fi
    TOTAL_APPROVED=$((TOTAL_APPROVED + BATCH_APPROVED))
    TOTAL_FAILED=$((TOTAL_FAILED + BATCH_FAILED))
    echo "OK (approved=$BATCH_APPROVED, failed=$BATCH_FAILED)"
  else
    echo "FAIL (HTTP $RESP_CODE)"
    echo "  Response: $RESP_BODY" >&2
    TOTAL_FAILED=$((TOTAL_FAILED + BATCH_COUNT))
  fi

  # Delay between batches
  if [[ "$i" -lt $((${#IDS_ARRAY[@]} - BATCH_SIZE)) ]]; then
    sleep "$(echo "scale=3; $DELAY_MS / 1000" | bc)"
  fi
done

# ── Step 4: Summary ──────────────────────────────────────────────────

echo ""
echo "[3/3] Summary"
echo "═══════════════════════════════════════════════"
echo "  Total policies : $TOTAL_COUNT"
echo "  Approved       : $TOTAL_APPROVED"
echo "  Failed         : $TOTAL_FAILED"
echo "  Batches        : $BATCH_NUM"
echo "═══════════════════════════════════════════════"

if [[ "$TOTAL_FAILED" -gt 0 ]]; then
  echo "WARNING: $TOTAL_FAILED policies failed to approve. Check logs above." >&2
  exit 1
fi

echo "Done."
