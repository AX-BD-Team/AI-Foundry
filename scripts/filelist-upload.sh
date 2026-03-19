#!/usr/bin/env bash
#
# filelist-upload.sh — Upload files from a filelist to svc-ingestion
#
# Usage:
#   ./scripts/filelist-upload.sh --filelist scripts/tier2-3-filelist.txt --env production
#   ./scripts/filelist-upload.sh --filelist scripts/tier2-3-filelist.txt --dry-run
#
set -euo pipefail

# ── Defaults ─────────────────────────────────────────────
FILELIST=""
ENV="production"
SECRET="${INTERNAL_API_SECRET:-}"
ORG_ID="org-mirae-pension"
USER_ID="batch-upload-system"
DRY_RUN=false
DELAY=1
RESUME_FROM=0

BASE_URL_PRODUCTION="https://svc-ingestion.ktds-axbd.workers.dev"
BASE_URL_STAGING="https://svc-ingestion-staging.ktds-axbd.workers.dev"

# ── Parse args ───────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --filelist)   FILELIST="$2"; shift 2 ;;
    --env)        ENV="$2"; shift 2 ;;
    --secret)     SECRET="$2"; shift 2 ;;
    --org-id)     ORG_ID="$2"; shift 2 ;;
    --user-id)    USER_ID="$2"; shift 2 ;;
    --delay)      DELAY="$2"; shift 2 ;;
    --resume)     RESUME_FROM="$2"; shift 2 ;;
    --dry-run)    DRY_RUN=true; shift ;;
    -h|--help)    head -9 "$0" | tail -7; exit 0 ;;
    *)            echo "Unknown: $1" >&2; exit 1 ;;
  esac
done

# ── Resolve ──────────────────────────────────────────────
if [[ -z "$FILELIST" ]]; then
  echo "ERROR: --filelist required" >&2; exit 1
fi
if [[ ! -f "$FILELIST" ]]; then
  echo "ERROR: File not found: $FILELIST" >&2; exit 1
fi
if [[ -z "$SECRET" ]]; then
  echo "ERROR: INTERNAL_API_SECRET not set" >&2; exit 1
fi

if [[ "$ENV" == "production" ]]; then
  BASE_URL="$BASE_URL_PRODUCTION"
elif [[ "$ENV" == "staging" ]]; then
  BASE_URL="$BASE_URL_STAGING"
else
  echo "ERROR: --env must be production or staging" >&2; exit 1
fi

# ── Build file array ─────────────────────────────────────
mapfile -t FILES < <(grep -v '^#' "$FILELIST" | grep -v '^$')
TOTAL=${#FILES[@]}

echo "═══════════════════════════════════════════════"
echo "  Filelist Upload — AI Foundry Ingestion"
echo "═══════════════════════════════════════════════"
echo "  Environment : $ENV"
echo "  Base URL    : $BASE_URL"
echo "  Org ID      : $ORG_ID"
echo "  Total Files : $TOTAL"
echo "  Resume From : $RESUME_FROM"
echo "  Dry Run     : $DRY_RUN"
echo "═══════════════════════════════════════════════"

if [[ "$DRY_RUN" == "true" ]]; then
  echo ""
  echo "[DRY RUN] Would upload $TOTAL files:"
  for ((i = 0; i < TOTAL; i++)); do
    echo "  $((i+1)). $(basename "${FILES[$i]}")"
  done
  exit 0
fi

# ── MIME type helper ─────────────────────────────────────
get_mime() {
  local ext="${1##*.}"
  case "${ext,,}" in
    xlsx) echo "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ;;
    xls)  echo "application/vnd.ms-excel" ;;
    pptx) echo "application/vnd.openxmlformats-officedocument.presentationml.presentation" ;;
    ppt)  echo "application/vnd.ms-powerpoint" ;;
    docx) echo "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ;;
    pdf)  echo "application/pdf" ;;
    txt)  echo "text/plain" ;;
    *)    echo "application/octet-stream" ;;
  esac
}

# ── Upload loop ──────────────────────────────────────────
LOGFILE="scripts/upload-log-$(date +%Y%m%d-%H%M%S).jsonl"
SUCCESS=0
FAIL=0

echo ""
echo "Uploading... (log: $LOGFILE)"
echo ""

for ((i = RESUME_FROM; i < TOTAL; i++)); do
  FILE="${FILES[$i]}"
  BASENAME=$(basename "$FILE")
  MIME=$(get_mime "$FILE")
  IDX=$((i + 1))

  echo -n "  [$IDX/$TOTAL] $BASENAME ... "

  # Use temp symlink to avoid curl -F issues with parentheses/commas in filenames
  EXT="${FILE##*.}"
  TMPLINK="/tmp/upload-tmp-$$.$EXT"
  ln -sf "$FILE" "$TMPLINK"

  RESPONSE=$(curl -s -w "\n%{http_code}" \
    --max-time 60 \
    -X POST \
    -H "X-Internal-Secret: $SECRET" \
    -H "X-Organization-Id: $ORG_ID" \
    -H "X-User-Id: $USER_ID" \
    -F "file=@${TMPLINK};type=${MIME}" \
    "$BASE_URL/documents" 2>&1)

  rm -f "$TMPLINK"

  HTTP_CODE=$(echo "$RESPONSE" | tail -1)
  RESP_BODY=$(echo "$RESPONSE" | sed '$d')

  if [[ "$HTTP_CODE" == "200" || "$HTTP_CODE" == "201" ]]; then
    DOC_ID=$(echo "$RESP_BODY" | jq -r '.data.documentId // .data.document.documentId // "?"' 2>/dev/null || echo "?")
    echo "OK (docId=$DOC_ID)"
    SUCCESS=$((SUCCESS + 1))
    echo "{\"idx\":$IDX,\"file\":\"$BASENAME\",\"status\":\"ok\",\"docId\":\"$DOC_ID\",\"http\":$HTTP_CODE}" >> "$LOGFILE"
  else
    echo "FAIL (HTTP $HTTP_CODE)"
    FAIL=$((FAIL + 1))
    # Truncate body for log
    SHORT_BODY=$(echo "$RESP_BODY" | head -c 200)
    echo "{\"idx\":$IDX,\"file\":\"$BASENAME\",\"status\":\"fail\",\"http\":$HTTP_CODE,\"error\":\"$SHORT_BODY\"}" >> "$LOGFILE"
  fi

  # Delay between uploads
  if [[ "$i" -lt $((TOTAL - 1)) ]]; then
    sleep "$DELAY"
  fi
done

# ── Summary ──────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════"
echo "  Upload Complete"
echo "═══════════════════════════════════════════════"
echo "  Total    : $TOTAL"
echo "  Success  : $SUCCESS"
echo "  Failed   : $FAIL"
echo "  Log      : $LOGFILE"
echo "═══════════════════════════════════════════════"

if [[ "$FAIL" -gt 0 ]]; then
  echo "WARNING: $FAIL files failed. Check $LOGFILE" >&2
  exit 1
fi

echo "Done."
