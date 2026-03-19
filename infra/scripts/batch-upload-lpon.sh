#!/usr/bin/env bash
#
# batch-upload-lpon.sh — Manifest-based LPON document upload to AI Foundry
#
# Usage:
#   ./infra/scripts/batch-upload-lpon.sh
#   ./infra/scripts/batch-upload-lpon.sh --dry-run
#   ./infra/scripts/batch-upload-lpon.sh --tier 1        # Tier 1 only
#   ./infra/scripts/batch-upload-lpon.sh --group A       # Group A only
#   ./infra/scripts/batch-upload-lpon.sh --resume --yes
#
# Options:
#   --env ENV         production or staging (default: production)
#   --secret SECRET   API secret (or INTERNAL_API_SECRET env var)
#   --delay MS        Delay between uploads in ms (default: 2000)
#   --dry-run         List files without uploading
#   --resume          Skip already uploaded files (from previous log)
#   --yes             Skip confirmation
#   --tier N          Filter by tier (1, 2, or 3)
#   --group G         Filter by group (A, B-interface, B-ui, C, D, E, F)
#   --batch-size N    Pause after N uploads (default: 0 = no pause)
#   -h, --help        Show this help
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
MANIFEST="$SCRIPT_DIR/lpon-upload-manifest.json"

# ── Defaults ──────────────────────────────────────────────────────────
ORG_ID="LPON"
USER_ID="batch-upload"
ENVIRONMENT="production"
SECRET="${INTERNAL_API_SECRET:-}"
DELAY_MS=2000
DRY_RUN=false
RESUME=false
AUTO_YES=false
TIER_FILTER=""
GROUP_FILTER=""
BATCH_SIZE=0

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

# ── SCDSA002 encrypted files to exclude ──────────────────────────────
SCDSA002_FILES=(
  "05시트_4.6 인프라 접근통제_WEB40601-01_요청번호_운영계 관리자페이지 적용.xlsx"
  "05시트_4.6 인프라 접근통제_WEB40601-01_요청번호_운영계WAF적용.xlsx"
)

# ── Symlink tracking ─────────────────────────────────────────────────
declare -a SYMLINKS_CREATED=()
SYMLINK_TMPDIR=""

# ── Argument parsing ──────────────────────────────────────────────────
show_help() {
  sed -n '3,22p' "$0" | sed 's/^# \?//'
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)            ENVIRONMENT="$2";     shift 2 ;;
    --secret)         SECRET="$2";          shift 2 ;;
    --delay)          DELAY_MS="$2";        shift 2 ;;
    --dry-run)        DRY_RUN=true;         shift ;;
    --resume)         RESUME=true;          shift ;;
    --yes)            AUTO_YES=true;        shift ;;
    --tier)           TIER_FILTER="$2";     shift 2 ;;
    --group)          GROUP_FILTER="$2";    shift 2 ;;
    --batch-size)     BATCH_SIZE="$2";      shift 2 ;;
    -h|--help)        show_help ;;
    -*)
      echo "ERROR: Unknown option: $1"
      echo "Use --help for usage."
      exit 1
      ;;
    *)
      echo "ERROR: Unexpected argument: $1"
      exit 1
      ;;
  esac
done

# ── Validate ──────────────────────────────────────────────────────────
if [[ ! -f "$MANIFEST" ]]; then
  echo "ERROR: Manifest not found: $MANIFEST"
  exit 1
fi

if [[ -n "$TIER_FILTER" && "$TIER_FILTER" != "1" && "$TIER_FILTER" != "2" && "$TIER_FILTER" != "3" ]]; then
  echo "ERROR: --tier must be 1, 2, or 3 (got: $TIER_FILTER)"
  exit 1
fi

if [[ -n "$GROUP_FILTER" ]]; then
  case "$GROUP_FILTER" in
    A|B-interface|B-ui|C|D|E|F) ;;
    *)
      echo "ERROR: --group must be one of: A, B-interface, B-ui, C, D, E, F (got: $GROUP_FILTER)"
      exit 1
      ;;
  esac
fi

if ! [[ "$BATCH_SIZE" =~ ^[0-9]+$ ]]; then
  echo "ERROR: --batch-size must be a non-negative integer (got: $BATCH_SIZE)"
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
LOG_DIR="$REPO_ROOT/scripts/ralph"
mkdir -p "$LOG_DIR"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
LOG_FILE="$LOG_DIR/lpon-upload-${TIMESTAMP}.log"
JSON_LOG_FILE="$LOG_DIR/lpon-upload-${TIMESTAMP}.json"

# Initialize JSON log array
echo '[' > "$JSON_LOG_FILE"

# ── Read manifest with python3 ───────────────────────────────────────
# Output: tab-separated lines: path \t filename \t group \t tier \t mimeType \t needsSymlink \t sizeBytes
read_manifest() {
  python3 -c "
import json, sys
with open('$MANIFEST') as f:
    data = json.load(f)
for entry in data['files']:
    print('\t'.join([
        entry['path'],
        entry['filename'],
        entry['group'],
        str(entry['tier']),
        entry['mimeType'],
        str(entry['needsSymlink']).lower(),
        str(entry['sizeBytes'])
    ]))
"
}

# ── Check SCDSA002 exclusion ─────────────────────────────────────────
is_scdsa002() {
  local fname="$1"
  for excluded in "${SCDSA002_FILES[@]}"; do
    if [[ "$fname" == "$excluded" ]]; then
      return 0
    fi
  done
  return 1
}

# ── Load manifest entries ─────────────────────────────────────────────
declare -a FILE_PATHS=()
declare -a FILE_NAMES=()
declare -a FILE_GROUPS=()
declare -a FILE_TIERS=()
declare -a FILE_MIMES=()
declare -a FILE_SYMLINKS=()
declare -a FILE_SIZES=()

while IFS=$'\t' read -r fpath fname fgroup ftier fmime fsymlink fsize; do
  # Apply SCDSA002 exclusion
  if is_scdsa002 "$fname"; then
    echo "EXCLUDE (SCDSA002 encrypted): $fname"
    continue
  fi

  # Apply tier filter
  if [[ -n "$TIER_FILTER" && "$ftier" != "$TIER_FILTER" ]]; then
    continue
  fi

  # Apply group filter
  if [[ -n "$GROUP_FILTER" && "$fgroup" != "$GROUP_FILTER" ]]; then
    continue
  fi

  FILE_PATHS+=("$fpath")
  FILE_NAMES+=("$fname")
  FILE_GROUPS+=("$fgroup")
  FILE_TIERS+=("$ftier")
  FILE_MIMES+=("$fmime")
  FILE_SYMLINKS+=("$fsymlink")
  FILE_SIZES+=("$fsize")
done < <(read_manifest)

TOTAL=${#FILE_PATHS[@]}

if [[ "$TOTAL" -eq 0 ]]; then
  echo "No files match the given filters."
  [[ -n "$TIER_FILTER" ]] && echo "  Tier filter: $TIER_FILTER"
  [[ -n "$GROUP_FILTER" ]] && echo "  Group filter: $GROUP_FILTER"
  echo ']' >> "$JSON_LOG_FILE"
  exit 0
fi

# ── Resume: load already-uploaded filenames ───────────────────────────
declare -A UPLOADED_MAP

if [[ "$RESUME" == "true" ]]; then
  RESUME_LOG=$(ls -t "$LOG_DIR"/lpon-upload-*.log 2>/dev/null | head -1 || true)
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

# ── Create symlink temp directory ─────────────────────────────────────
setup_symlinks() {
  SYMLINK_TMPDIR=$(mktemp -d /tmp/lpon-upload-XXXX)
  local idx=0
  for i in "${!FILE_PATHS[@]}"; do
    if [[ "${FILE_SYMLINKS[$i]}" == "true" ]]; then
      local src_path="$REPO_ROOT/${FILE_PATHS[$i]}"
      local ext="${FILE_NAMES[$i]##*.}"
      local safe_name="lpon-symlink-${idx}.${ext}"
      local link_path="$SYMLINK_TMPDIR/$safe_name"

      if [[ -f "$src_path" ]]; then
        ln -sf "$src_path" "$link_path"
        SYMLINKS_CREATED+=("$link_path")
        # Store the symlink path back (we'll use an associative array)
        SYMLINK_MAP[$i]="$link_path"
        idx=$((idx + 1))
      else
        echo "WARNING: Source file not found for symlink: $src_path"
      fi
    fi
  done
}

declare -A SYMLINK_MAP

# ── Display plan ──────────────────────────────────────────────────────
echo "================================================================"
echo "  AI Foundry LPON Batch Upload (manifest-based)"
echo "  Manifest:     $(basename "$MANIFEST") ($(python3 -c "import json; print(json.load(open('$MANIFEST'))['stats']['total'])" 2>/dev/null || echo '?') total, 2 SCDSA002 excluded)"
echo "  Environment:  $ENVIRONMENT"
echo "  Base URL:     $BASE_URL"
echo "  Organization: $ORG_ID"
echo "  User:         $USER_ID"
echo "  Files:        $TOTAL (after filters)"
if [[ -n "$TIER_FILTER" ]]; then
  echo "  Tier filter:  $TIER_FILTER"
fi
if [[ -n "$GROUP_FILTER" ]]; then
  echo "  Group filter: $GROUP_FILTER"
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
  for i in "${!FILE_PATHS[@]}"; do
    fname="${FILE_NAMES[$i]}"
    fgroup="${FILE_GROUPS[$i]}"
    ftier="${FILE_TIERS[$i]}"
    fmime="${FILE_MIMES[$i]}"
    fsize="${FILE_SIZES[$i]}"
    fsymlink="${FILE_SYMLINKS[$i]}"
    size_kb=$(( fsize / 1024 ))

    skip_marker=""
    if [[ "$RESUME" == "true" && -n "${UPLOADED_MAP["$fname"]+_}" ]]; then
      skip_marker=" [SKIP]"
    fi

    symlink_marker=""
    if [[ "$fsymlink" == "true" ]]; then
      symlink_marker=" [SYM]"
    fi

    printf "  [%d/%d] T%s %-6s %-60s %6dKB%s%s\n" \
      "$((i + 1))" "$TOTAL" "$ftier" "$fgroup" "$fname" "$size_kb" "$symlink_marker" "$skip_marker"
  done
  echo ""
  echo "Dry run complete. $TOTAL files listed."
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

# ── Setup symlinks ────────────────────────────────────────────────────
setup_symlinks

# ── Graceful Ctrl+C handling ──────────────────────────────────────────
close_json_log() {
  echo '' >> "$JSON_LOG_FILE"
  echo ']' >> "$JSON_LOG_FILE"
}

cleanup_symlinks() {
  if [[ -n "$SYMLINK_TMPDIR" && -d "$SYMLINK_TMPDIR" ]]; then
    rm -rf "$SYMLINK_TMPDIR"
  fi
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
  cleanup_symlinks
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

# ── Log helpers ──────────────────────────────────────────────────────
log_entry() {
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

# ── Convert delay from ms to fractional seconds ──────────────────────
DELAY_SEC=$(awk "BEGIN { printf \"%.3f\", $DELAY_MS / 1000 }")

# ── Upload loop ──────────────────────────────────────────────────────
START_TIME=$(date +%s)

for i in "${!FILE_PATHS[@]}"; do
  CURRENT=$((i + 1))
  filepath="${FILE_PATHS[$i]}"
  filename="${FILE_NAMES[$i]}"
  mime="${FILE_MIMES[$i]}"
  needs_symlink="${FILE_SYMLINKS[$i]}"

  # Determine upload path
  upload_path="$REPO_ROOT/$filepath"
  if [[ "$needs_symlink" == "true" && -n "${SYMLINK_MAP[$i]+_}" ]]; then
    upload_path="${SYMLINK_MAP[$i]}"
  fi

  # Skip if already uploaded (resume mode)
  if [[ "$RESUME" == "true" && -n "${UPLOADED_MAP["$filename"]+_}" ]]; then
    SKIPPED=$((SKIPPED + 1))
    log_entry "SKIP" "---" "$filename" "---" "already uploaded"
    json_log_entry "$filepath" "SKIP" "" "already uploaded"
    printf "[%d/%d] SKIP %s (already uploaded)\n" "$CURRENT" "$TOTAL" "$filename"
    continue
  fi

  # Verify file exists
  if [[ ! -f "$upload_path" ]]; then
    SKIPPED=$((SKIPPED + 1))
    log_entry "SKIP" "---" "$filename" "---" "file not found"
    json_log_entry "$filepath" "SKIP" "" "file not found"
    printf "[%d/%d] SKIP %s (file not found)\n" "$CURRENT" "$TOTAL" "$filename"
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
    response=$(curl -s --max-time 120 --connect-timeout 10 \
      -w "\n__HTTP_CODE__%{http_code}" \
      -X POST "${BASE_URL}/documents" \
      -H "X-Organization-Id: ${ORG_ID}" \
      -H "X-User-Id: ${USER_ID}" \
      -H "X-Internal-Secret: ${SECRET}" \
      -F "file=@${upload_path};type=${mime};filename=${filename}" \
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
      # 4xx or other non-retryable error
      break
    fi
  done

  UPLOADS_DONE=$((UPLOADS_DONE + 1))

  if [[ "$success" == "true" ]]; then
    doc_id=$(echo "$last_body" | grep -o '"documentId":"[^"]*"' | head -1 | cut -d'"' -f4 || true)
    if [[ -z "$doc_id" ]]; then
      doc_id="(no-id-in-response)"
    fi

    COMPLETED=$((COMPLETED + 1))
    log_entry "OK" "$last_code" "$filename" "$doc_id" ""
    json_log_entry "$filepath" "OK" "$doc_id" ""
    printf " OK (%s) -- documentId=%s\n" "$last_code" "$doc_id"
  else
    error_msg=$(echo "$last_body" | grep -o '"error":"[^"]*"' | head -1 | cut -d'"' -f4 || true)
    if [[ -z "$error_msg" ]]; then
      error_msg="HTTP $last_code"
    fi

    FAILED=$((FAILED + 1))
    log_entry "FAIL" "$last_code" "$filename" "" "$error_msg"
    json_log_entry "$filepath" "FAIL" "" "$error_msg"
    printf " FAIL (%s) -- %s\n" "$last_code" "$error_msg"
  fi

  # Batch pause
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
          cleanup_symlinks
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

# ── Cleanup symlinks ─────────────────────────────────────────────────
cleanup_symlinks

# ── Summary ──────────────────────────────────────────────────────────
print_summary
