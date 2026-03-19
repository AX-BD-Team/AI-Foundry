#!/usr/bin/env bash
#
# batch-upload.sh — Bulk document upload to AI Foundry svc-ingestion
#
# Usage:
#   ./scripts/batch-upload.sh /path/to/docs
#   ./scripts/batch-upload.sh /path/to/docs --org Miraeasset --env staging
#   ./scripts/batch-upload.sh /path/to/docs --dry-run
#   ./scripts/batch-upload.sh /path/to/docs --resume --yes
#   ./scripts/batch-upload.sh /path/to/docs --tier tier2 --batch-size 10
#   ./scripts/batch-upload.sh --retry-failed scripts/ralph/batch-upload-20260304-120000.json
#
# Options:
#   $1                Directory path (required, unless --retry-failed)
#   --org ID          Organization ID (default: Miraeasset)
#   --user ID         User ID (default: batch-upload)
#   --env ENV         Environment: production or staging (default: production)
#   --secret SECRET   Internal API secret (or set INTERNAL_API_SECRET env var)
#   --delay MS        Delay between uploads in ms (default: 100)
#   --dry-run         List files without uploading
#   --resume          Skip files already in the log
#   --yes             Skip confirmation prompt
#   --tier TIER       Filter by tier: tier1, tier2, tier3 (dir/filename pattern match)
#   --batch-size N    Pause after every N uploads for confirmation (0 = no pause)
#   --retry-failed F  Re-upload failed files from a previous JSON log file
#   -h, --help        Show this help
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Defaults ──────────────────────────────────────────────────────────
DIR_PATH=""
ORG_ID="Miraeasset"
USER_ID="batch-upload"
ENVIRONMENT="production"
SECRET="${INTERNAL_API_SECRET:-}"
DELAY_MS=100
DRY_RUN=false
RESUME=false
AUTO_YES=false
TIER_FILTER=""
BATCH_SIZE=0
RETRY_FAILED=false
RETRY_LOG_FILE=""

# ── Counters (global for trap) ────────────────────────────────────────
COMPLETED=0
FAILED=0
SKIPPED=0
TOTAL=0
CURRENT=0
INTERRUPTED=false
START_TIME=0
UPLOADS_DONE=0
BATCH_COUNTER=0
JSON_LOG_FIRST=true

# ── Argument parsing ──────────────────────────────────────────────────
show_help() {
  sed -n '3,27p' "$0" | sed 's/^# \?//'
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --org)            ORG_ID="$2";          shift 2 ;;
    --user)           USER_ID="$2";         shift 2 ;;
    --env)            ENVIRONMENT="$2";     shift 2 ;;
    --secret)         SECRET="$2";          shift 2 ;;
    --delay)          DELAY_MS="$2";        shift 2 ;;
    --dry-run)        DRY_RUN=true;         shift ;;
    --resume)         RESUME=true;          shift ;;
    --yes)            AUTO_YES=true;        shift ;;
    --tier)           TIER_FILTER="$2";     shift 2 ;;
    --batch-size)     BATCH_SIZE="$2";      shift 2 ;;
    --retry-failed)   RETRY_FAILED=true; RETRY_LOG_FILE="$2"; shift 2 ;;
    -h|--help)        show_help ;;
    -*)
      echo "ERROR: Unknown option: $1"
      echo "Use --help for usage."
      exit 1
      ;;
    *)
      if [[ -z "$DIR_PATH" ]]; then
        DIR_PATH="$1"
      else
        echo "ERROR: Unexpected argument: $1"
        exit 1
      fi
      shift
      ;;
  esac
done

# ── Validate tier filter ────────────────────────────────────────────
if [[ -n "$TIER_FILTER" && "$TIER_FILTER" != "tier1" && "$TIER_FILTER" != "tier2" && "$TIER_FILTER" != "tier3" ]]; then
  echo "ERROR: --tier must be 'tier1', 'tier2', or 'tier3' (got: $TIER_FILTER)"
  exit 1
fi

# ── Validate batch-size ─────────────────────────────────────────────
if ! [[ "$BATCH_SIZE" =~ ^[0-9]+$ ]]; then
  echo "ERROR: --batch-size must be a non-negative integer (got: $BATCH_SIZE)"
  exit 1
fi

# ── Retry-failed mode: load file list from previous JSON log ────────
declare -a RETRY_FILE_PATHS=()

if [[ "$RETRY_FAILED" == "true" ]]; then
  if [[ -z "$RETRY_LOG_FILE" ]]; then
    echo "ERROR: --retry-failed requires a JSON log file path."
    exit 1
  fi
  if [[ ! -f "$RETRY_LOG_FILE" ]]; then
    echo "ERROR: Retry log file not found: $RETRY_LOG_FILE"
    exit 1
  fi

  # Parse JSON log: extract paths where status == "FAIL"
  # JSON format: [{"path":"...","status":"FAIL",...}, ...]
  while IFS= read -r fpath; do
    [[ -n "$fpath" ]] && RETRY_FILE_PATHS+=("$fpath")
  done < <(
    grep -o '"path":"[^"]*","status":"FAIL"' "$RETRY_LOG_FILE" | \
    sed 's/"path":"//;s/","status":"FAIL"//'
  )

  if [[ ${#RETRY_FILE_PATHS[@]} -eq 0 ]]; then
    echo "No failed files found in: $RETRY_LOG_FILE"
    exit 0
  fi

  echo "Retry mode: found ${#RETRY_FILE_PATHS[@]} failed file(s) from $(basename "$RETRY_LOG_FILE")"
fi

# ── Validation ────────────────────────────────────────────────────────
if [[ "$RETRY_FAILED" == "false" && -z "$DIR_PATH" ]]; then
  echo "ERROR: Directory path is required."
  echo "Usage: $0 /path/to/documents [OPTIONS]"
  exit 1
fi

if [[ "$RETRY_FAILED" == "false" && -n "$DIR_PATH" && ! -d "$DIR_PATH" ]]; then
  echo "ERROR: Directory not found: $DIR_PATH"
  exit 1
fi

if [[ "$DRY_RUN" == "false" && -z "$SECRET" ]]; then
  echo "ERROR: API secret is required."
  echo "  Set INTERNAL_API_SECRET env var or use --secret VALUE"
  exit 1
fi

if [[ "$ENVIRONMENT" != "production" && "$ENVIRONMENT" != "staging" ]]; then
  echo "ERROR: --env must be 'production' or 'staging' (got: $ENVIRONMENT)"
  exit 1
fi

# ── Base URL ──────────────────────────────────────────────────────────
if [[ "$ENVIRONMENT" == "production" ]]; then
  BASE_URL="https://svc-ingestion-production.ktds-axbd.workers.dev"
else
  BASE_URL="https://svc-ingestion-staging.ktds-axbd.workers.dev"
fi

# ── Log file setup ────────────────────────────────────────────────────
LOG_DIR="$SCRIPT_DIR/ralph"
mkdir -p "$LOG_DIR"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
LOG_FILE="$LOG_DIR/batch-upload-${TIMESTAMP}.log"
JSON_LOG_FILE="$LOG_DIR/batch-upload-${TIMESTAMP}.json"

# Initialize JSON log array
echo '[' > "$JSON_LOG_FILE"

# ── MIME type mapping ─────────────────────────────────────────────────
get_mime_type() {
  local ext="${1,,}"  # lowercase
  case "$ext" in
    xlsx)  echo "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ;;
    xls)   echo "application/vnd.ms-excel" ;;
    docx)  echo "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ;;
    doc)   echo "application/msword" ;;
    pptx)  echo "application/vnd.openxmlformats-officedocument.presentationml.presentation" ;;
    ppt)   echo "application/vnd.ms-powerpoint" ;;
    pdf)   echo "application/pdf" ;;
    png)   echo "image/png" ;;
    jpg)   echo "image/jpeg" ;;
    jpeg)  echo "image/jpeg" ;;
    txt)   echo "text/plain" ;;
    *)     echo "" ;;
  esac
}

# ── Tier filter function ─────────────────────────────────────────────
matches_tier() {
  local filepath="$1"
  local tier="$2"

  if [[ -z "$tier" ]]; then
    return 0  # no filter — match all
  fi

  # Check if the file path (directory name or filename) contains the tier string
  # Case-insensitive match
  local lower_path="${filepath,,}"
  if [[ "$lower_path" == *"$tier"* ]]; then
    return 0
  fi

  return 1
}

# ── File discovery ────────────────────────────────────────────────────
if [[ "$RETRY_FAILED" == "true" ]]; then
  # In retry mode, use the file paths from the failed log
  FILES=()
  for fpath in "${RETRY_FILE_PATHS[@]}"; do
    if [[ -f "$fpath" ]]; then
      if matches_tier "$fpath" "$TIER_FILTER"; then
        FILES+=("$fpath")
      fi
    else
      echo "WARNING: File not found (skipping): $fpath"
    fi
  done
else
  # Build find expression for supported extensions
  FIND_EXTENSIONS=(
    -name '*.xlsx' -o -name '*.xls'
    -o -name '*.docx' -o -name '*.doc'
    -o -name '*.pptx' -o -name '*.ppt'
    -o -name '*.pdf'
    -o -name '*.png' -o -name '*.jpg' -o -name '*.jpeg'
    -o -name '*.txt'
  )

  # Find files, exclude temp files, sort by path
  mapfile -t ALL_FILES < <(
    find "$DIR_PATH" -type f \( "${FIND_EXTENSIONS[@]}" \) \
      ! -name '~\$*' \
      ! -name '*.zip' \
      ! -name '*.mp4' \
      ! -name '*.erwin' \
      2>/dev/null \
    | sort
  )

  # Apply tier filter
  FILES=()
  for fpath in "${ALL_FILES[@]}"; do
    if matches_tier "$fpath" "$TIER_FILTER"; then
      FILES+=("$fpath")
    fi
  done
fi

TOTAL=${#FILES[@]}

if [[ "$TOTAL" -eq 0 ]]; then
  echo "No supported files found."
  if [[ -n "$TIER_FILTER" ]]; then
    echo "Tier filter: $TIER_FILTER (path/filename must contain '$TIER_FILTER')"
  fi
  if [[ "$RETRY_FAILED" == "false" ]]; then
    echo "Directory: ${DIR_PATH:-<none>}"
    echo "Supported extensions: xlsx, xls, docx, doc, pptx, ppt, pdf, png, jpg, jpeg, txt"
  fi
  echo ']' >> "$JSON_LOG_FILE"
  exit 0
fi

# ── Resume: load already-uploaded filenames ───────────────────────────
declare -A UPLOADED_MAP
RESUME_LOG=""

if [[ "$RESUME" == "true" ]]; then
  # Find the most recent log file in the ralph directory
  RESUME_LOG=$(ls -t "$LOG_DIR"/batch-upload-*.log 2>/dev/null | head -1 || true)
  if [[ -n "$RESUME_LOG" && -f "$RESUME_LOG" ]]; then
    while IFS=$'\t' read -r _ts status _code filename _docid _err; do
      if [[ "$status" == "OK" ]]; then
        UPLOADED_MAP["$filename"]=1
      fi
    done < "$RESUME_LOG"
    echo "Resume: loaded ${#UPLOADED_MAP[@]} already-uploaded files from $(basename "$RESUME_LOG")"
  else
    echo "Resume: no previous log found, starting fresh"
  fi
fi

# ── Display plan ──────────────────────────────────────────────────────
echo "================================================================"
echo "  AI Foundry Batch Upload"
if [[ "$RETRY_FAILED" == "true" ]]; then
  echo "  Mode:         RETRY FAILED from $(basename "$RETRY_LOG_FILE")"
else
  echo "  Directory:    $DIR_PATH"
fi
echo "  Environment:  $ENVIRONMENT"
echo "  Base URL:     $BASE_URL"
echo "  Organization: $ORG_ID"
echo "  User:         $USER_ID"
echo "  Total files:  $TOTAL"
if [[ -n "$TIER_FILTER" ]]; then
  echo "  Tier filter:  $TIER_FILTER"
fi
if [[ "$BATCH_SIZE" -gt 0 ]]; then
  echo "  Batch size:   $BATCH_SIZE (pause after each batch)"
fi
if [[ "$RESUME" == "true" && ${#UPLOADED_MAP[@]} -gt 0 ]]; then
  echo "  Resume skip:  ${#UPLOADED_MAP[@]} already uploaded"
fi
echo "  Delay:        ${DELAY_MS}ms"
if [[ "$DRY_RUN" == "true" ]]; then
  echo "  Mode:         DRY RUN (no uploads)"
fi
echo "  Log (TSV):    $LOG_FILE"
echo "  Log (JSON):   $JSON_LOG_FILE"
echo "================================================================"
echo ""

# ── Dry-run: list files and exit ──────────────────────────────────────
if [[ "$DRY_RUN" == "true" ]]; then
  for i in "${!FILES[@]}"; do
    filepath="${FILES[$i]}"
    filename=$(basename "$filepath")
    ext="${filename##*.}"
    mime=$(get_mime_type "$ext")
    size=$(stat -c%s "$filepath" 2>/dev/null || stat -f%z "$filepath" 2>/dev/null || echo 0)
    size_kb=$(( size / 1024 ))

    skip_marker=""
    if [[ "$RESUME" == "true" && -n "${UPLOADED_MAP["$filename"]+_}" ]]; then
      skip_marker=" [SKIP]"
    fi

    printf "  [%d/%d] %-50s %6dKB  %s%s\n" \
      "$((i + 1))" "$TOTAL" "$filename" "$size_kb" "$mime" "$skip_marker"
  done
  echo ""
  echo "Dry run complete. $TOTAL files found."
  echo ']' >> "$JSON_LOG_FILE"
  exit 0
fi

# ── Confirmation ──────────────────────────────────────────────────────
if [[ "$AUTO_YES" == "false" ]]; then
  echo -n "Proceed with uploading $TOTAL files? [y/N] "
  read -r CONFIRM
  if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
    echo "Aborted."
    echo ']' >> "$JSON_LOG_FILE"
    exit 0
  fi
  echo ""
fi

# ── Graceful Ctrl+C handling ──────────────────────────────────────────
close_json_log() {
  echo '' >> "$JSON_LOG_FILE"
  echo ']' >> "$JSON_LOG_FILE"
}

print_summary() {
  echo ""
  echo "================================================================"
  if [[ "$INTERRUPTED" == "true" ]]; then
    echo "  INTERRUPTED at [$CURRENT/$TOTAL]"
  fi
  echo "  Completed: $COMPLETED"
  echo "  Failed:    $FAILED"
  echo "  Skipped:   $SKIPPED"
  echo "  Total:     $TOTAL"
  echo "  Log (TSV):  $LOG_FILE"
  echo "  Log (JSON): $JSON_LOG_FILE"
  echo "================================================================"
}

handle_interrupt() {
  INTERRUPTED=true
  echo ""
  echo "  Caught Ctrl+C, stopping..."
  close_json_log
  print_summary
  exit 130
}
trap handle_interrupt INT TERM

# ── Time estimation helper ───────────────────────────────────────────
format_eta() {
  local remaining_secs="$1"
  if [[ "$remaining_secs" -lt 0 ]]; then
    remaining_secs=0
  fi
  local mins=$((remaining_secs / 60))
  local secs=$((remaining_secs % 60))
  if [[ $mins -gt 0 ]]; then
    printf "%dm %02ds" "$mins" "$secs"
  else
    printf "%ds" "$secs"
  fi
}

# ── Upload loop ───────────────────────────────────────────────────────
log_entry() {
  # Format: timestamp\tstatus\thttp_code\tfilename\tdocumentId\terror
  local ts status http_code filename doc_id error_msg
  ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  status="$1"
  http_code="$2"
  filename="$3"
  doc_id="$4"
  error_msg="$5"
  printf '%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$ts" "$status" "$http_code" "$filename" "$doc_id" "$error_msg" \
    >> "$LOG_FILE"
}

json_log_entry() {
  # JSON log entry: {"path":"...","status":"...","documentId":"...","error":"...","timestamp":"..."}
  local fpath="$1" status="$2" doc_id="$3" error_msg="$4"
  local ts
  ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  # Escape backslashes and double quotes for JSON
  fpath="${fpath//\\/\\\\}"
  fpath="${fpath//\"/\\\"}"
  error_msg="${error_msg//\\/\\\\}"
  error_msg="${error_msg//\"/\\\"}"

  local comma=""
  if [[ "$JSON_LOG_FIRST" == "true" ]]; then
    JSON_LOG_FIRST=false
  else
    comma=","
  fi

  printf '%s{"path":"%s","status":"%s","documentId":"%s","error":"%s","timestamp":"%s"}\n' \
    "$comma" "$fpath" "$status" "$doc_id" "$error_msg" "$ts" \
    >> "$JSON_LOG_FILE"
}

# Convert delay from ms to fractional seconds for sleep
DELAY_SEC=$(awk "BEGIN { printf \"%.3f\", $DELAY_MS / 1000 }")

# Track time for ETA
START_TIME=$(date +%s)

for i in "${!FILES[@]}"; do
  CURRENT=$((i + 1))
  filepath="${FILES[$i]}"
  filename=$(basename "$filepath")
  ext="${filename##*.}"
  mime=$(get_mime_type "$ext")

  # Skip if already uploaded (resume mode)
  if [[ "$RESUME" == "true" && -n "${UPLOADED_MAP["$filename"]+_}" ]]; then
    SKIPPED=$((SKIPPED + 1))
    log_entry "SKIP" "---" "$filename" "---" "already uploaded"
    json_log_entry "$filepath" "SKIP" "" "already uploaded"
    printf "[%d/%d] SKIP %s (already uploaded)\n" "$CURRENT" "$TOTAL" "$filename"
    continue
  fi

  # Validate MIME type
  if [[ -z "$mime" ]]; then
    SKIPPED=$((SKIPPED + 1))
    log_entry "SKIP" "---" "$filename" "---" "unsupported extension: $ext"
    json_log_entry "$filepath" "SKIP" "" "unsupported extension: $ext"
    printf "[%d/%d] SKIP %s (unsupported extension: %s)\n" "$CURRENT" "$TOTAL" "$filename" "$ext"
    continue
  fi

  # Progress with ETA
  eta_str=""
  if [[ $UPLOADS_DONE -gt 0 ]]; then
    now=$(date +%s)
    elapsed=$((now - START_TIME))
    if [[ $elapsed -gt 0 ]]; then
      remaining_files=$((TOTAL - CURRENT))
      avg_per_file=$(awk "BEGIN { printf \"%.2f\", $elapsed / $UPLOADS_DONE }")
      remaining_secs=$(awk "BEGIN { printf \"%d\", $avg_per_file * $remaining_files }")
      eta_str=" -- ETA: $(format_eta "$remaining_secs")"
    fi
  fi

  pct=$(awk "BEGIN { printf \"%d\", ($CURRENT / $TOTAL) * 100 }")
  printf "[%d/%d] (%d%%) %s%s..." "$CURRENT" "$TOTAL" "$pct" "$filename" "$eta_str"

  # Retry loop (up to 3 attempts)
  MAX_RETRIES=3
  attempt=0
  success=false
  last_code="000"
  last_body=""

  while [[ $attempt -lt $MAX_RETRIES ]]; do
    attempt=$((attempt + 1))

    # curl: capture both body and HTTP status code
    # Using -w to append status code after a delimiter
    response=$(curl -s --max-time 120 --connect-timeout 10 \
      -w "\n__HTTP_CODE__%{http_code}" \
      -X POST "${BASE_URL}/documents" \
      -H "X-Organization-Id: ${ORG_ID}" \
      -H "X-User-Id: ${USER_ID}" \
      -H "X-Internal-Secret: ${SECRET}" \
      -F "file=@${filepath};type=${mime};filename=${filename}" \
      2>/dev/null || echo -e "\n__HTTP_CODE__000")

    # Split response body and HTTP code
    last_body=$(echo "$response" | sed '/__HTTP_CODE__/d')
    last_code=$(echo "$response" | grep '__HTTP_CODE__' | sed 's/.*__HTTP_CODE__//')

    # Success: 2xx
    if [[ "$last_code" =~ ^2[0-9][0-9]$ ]]; then
      success=true
      break
    fi

    # Retry only on 5xx or timeout (000)
    if [[ "$last_code" =~ ^5[0-9][0-9]$ || "$last_code" == "000" ]]; then
      if [[ $attempt -lt $MAX_RETRIES ]]; then
        printf "\n[%d/%d] FAIL (%s) -- retrying %d/%d..." \
          "$CURRENT" "$TOTAL" "$last_code" "$attempt" "$MAX_RETRIES"
        sleep 2
      fi
    else
      # 4xx or other non-retryable error — don't retry
      break
    fi
  done

  UPLOADS_DONE=$((UPLOADS_DONE + 1))

  if [[ "$success" == "true" ]]; then
    # Extract documentId from response JSON
    doc_id=$(echo "$last_body" | grep -o '"documentId":"[^"]*"' | head -1 | cut -d'"' -f4 || true)
    if [[ -z "$doc_id" ]]; then
      doc_id="(no-id-in-response)"
    fi

    COMPLETED=$((COMPLETED + 1))
    log_entry "OK" "$last_code" "$filename" "$doc_id" ""
    json_log_entry "$filepath" "OK" "$doc_id" ""
    printf " OK (%s) -- documentId=%s\n" "$last_code" "$doc_id"
  else
    # Extract error message from response
    error_msg=$(echo "$last_body" | grep -o '"error":"[^"]*"' | head -1 | cut -d'"' -f4 || true)
    if [[ -z "$error_msg" ]]; then
      error_msg="HTTP $last_code"
    fi

    FAILED=$((FAILED + 1))
    log_entry "FAIL" "$last_code" "$filename" "" "$error_msg"
    json_log_entry "$filepath" "FAIL" "" "$error_msg"
    printf " FAIL (%s) -- %s\n" "$last_code" "$error_msg"
  fi

  # Batch pause: after every N uploads (completed+failed, not skips)
  if [[ "$BATCH_SIZE" -gt 0 ]]; then
    BATCH_COUNTER=$((BATCH_COUNTER + 1))
    if [[ "$BATCH_COUNTER" -ge "$BATCH_SIZE" && "$CURRENT" -lt "$TOTAL" ]]; then
      BATCH_COUNTER=0
      echo ""
      echo "  --- Batch complete ($BATCH_SIZE files). Progress: $COMPLETED OK, $FAILED failed ---"
      if [[ "$AUTO_YES" == "false" ]]; then
        echo -n "  Continue? [Y/n] "
        read -r BATCH_CONFIRM
        if [[ "$BATCH_CONFIRM" == "n" || "$BATCH_CONFIRM" == "N" ]]; then
          echo "  Stopped by user."
          close_json_log
          print_summary
          exit 0
        fi
      else
        echo "  (--yes: auto-continuing)"
      fi
      echo ""
    fi
  fi

  # Delay between uploads (skip after last file)
  if [[ $CURRENT -lt $TOTAL && "$DELAY_MS" -gt 0 ]]; then
    sleep "$DELAY_SEC"
  fi
done

# ── Close JSON log ───────────────────────────────────────────────────
close_json_log

# ── Summary ───────────────────────────────────────────────────────────
print_summary
