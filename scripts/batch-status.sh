#!/usr/bin/env bash
#
# batch-status.sh — Query upload status and aggregation for AI Foundry svc-ingestion
#
# Usage:
#   ./scripts/batch-status.sh
#   ./scripts/batch-status.sh --org Miraeasset --env staging
#   ./scripts/batch-status.sh --format detail
#   ./scripts/batch-status.sh --format csv > documents.csv
#   ./scripts/batch-status.sh --wait
#   ./scripts/batch-status.sh --tier tier2 --failed-only
#   ./scripts/batch-status.sh --encrypted-only --json
#
# Options:
#   --org ID          Organization ID (default: Miraeasset)
#   --env ENV         Environment: production or staging (default: production)
#   --secret SECRET   Internal API secret (or set INTERNAL_API_SECRET env var)
#   --format FMT      Output format: summary (default), detail, csv
#   --wait            Poll until all documents are parsed (check every 10s)
#   --tier TIER       Filter by tier: tier1, tier2, tier3 (filename pattern match)
#   --failed-only     Show only documents with status=failed
#   --encrypted-only  Show only encrypted documents (SCDSA002, format_invalid)
#   --json            Output results in JSON format
#   -h, --help        Show this help
#
set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────────────
ORG_ID="Miraeasset"
ENVIRONMENT="production"
SECRET="${INTERNAL_API_SECRET:-}"
FORMAT="summary"
WAIT_MODE=false
TIER_FILTER=""
FAILED_ONLY=false
ENCRYPTED_ONLY=false
JSON_OUTPUT=false

# ── Argument parsing ──────────────────────────────────────────────────
show_help() {
  sed -n '3,24p' "$0" | sed 's/^# \?//'
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --org)             ORG_ID="$2";        shift 2 ;;
    --env)             ENVIRONMENT="$2";   shift 2 ;;
    --secret)          SECRET="$2";        shift 2 ;;
    --format)          FORMAT="$2";        shift 2 ;;
    --wait)            WAIT_MODE=true;     shift ;;
    --tier)            TIER_FILTER="$2";   shift 2 ;;
    --failed-only)     FAILED_ONLY=true;   shift ;;
    --encrypted-only)  ENCRYPTED_ONLY=true; shift ;;
    --json)            JSON_OUTPUT=true;   shift ;;
    -h|--help)         show_help ;;
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

# ── Validation ────────────────────────────────────────────────────────
if [[ -z "$SECRET" ]]; then
  echo "ERROR: API secret is required."
  echo "  Set INTERNAL_API_SECRET env var or use --secret VALUE"
  exit 1
fi

if [[ "$ENVIRONMENT" != "production" && "$ENVIRONMENT" != "staging" ]]; then
  echo "ERROR: --env must be 'production' or 'staging' (got: $ENVIRONMENT)"
  exit 1
fi

if [[ "$FORMAT" != "summary" && "$FORMAT" != "detail" && "$FORMAT" != "csv" ]]; then
  echo "ERROR: --format must be 'summary', 'detail', or 'csv' (got: $FORMAT)"
  exit 1
fi

if [[ -n "$TIER_FILTER" && "$TIER_FILTER" != "tier1" && "$TIER_FILTER" != "tier2" && "$TIER_FILTER" != "tier3" ]]; then
  echo "ERROR: --tier must be 'tier1', 'tier2', or 'tier3' (got: $TIER_FILTER)"
  exit 1
fi

# ── Base URL (same convention as batch-upload.sh) ─────────────────────
if [[ "$ENVIRONMENT" == "production" ]]; then
  BASE_URL="https://svc-ingestion-production.ktds-axbd.workers.dev"
else
  BASE_URL="https://svc-ingestion-staging.ktds-axbd.workers.dev"
fi

# ── Fetch all documents (paginate) ────────────────────────────────────
fetch_all_documents() {
  local all_docs=""
  local offset=0
  local limit=50
  local page_count=0

  while true; do
    local response
    response=$(curl -s --max-time 30 --connect-timeout 10 \
      -X GET "${BASE_URL}/documents?limit=${limit}&offset=${offset}" \
      -H "X-Organization-Id: ${ORG_ID}" \
      -H "X-Internal-Secret: ${SECRET}" \
      2>/dev/null || echo '{"success":false}')

    # Check for API success
    local success
    success=$(echo "$response" | grep -o '"success":true' || true)
    if [[ -z "$success" ]]; then
      if [[ $page_count -eq 0 ]]; then
        echo "ERROR: Failed to fetch documents from ${BASE_URL}" >&2
        echo "  Response: $(echo "$response" | head -c 200)" >&2
        exit 1
      fi
      break
    fi

    # Extract documents array as line-delimited JSON objects.
    # The document objects are flat (no nested arrays/objects), so we can
    # safely split on },{ boundaries after extracting the array content.
    local page_docs
    page_docs=$(echo "$response" | \
      sed 's/.*"documents":\[//;s/\].*$//' | \
      sed 's/},{/}\n{/g')

    if [[ -z "$page_docs" || "$page_docs" == "" ]]; then
      break
    fi

    # Count items on this page by counting document_id occurrences
    local page_item_count
    page_item_count=$(echo "$page_docs" | grep -c '"document_id"' || true)

    if [[ "$page_item_count" -eq 0 ]]; then
      break
    fi

    if [[ -n "$all_docs" ]]; then
      all_docs="${all_docs}
${page_docs}"
    else
      all_docs="$page_docs"
    fi

    page_count=$((page_count + 1))

    # If we got fewer than limit, we've reached the end
    if [[ "$page_item_count" -lt "$limit" ]]; then
      break
    fi

    offset=$((offset + limit))
  done

  echo "$all_docs"
}

# ── Extract field from a JSON object (no jq dependency) ───────────────
# Usage: extract_field '{"key":"val"}' 'key'
extract_field() {
  local json="$1"
  local field="$2"
  echo "$json" | grep -o "\"${field}\":\"[^\"]*\"" | head -1 | sed "s/\"${field}\":\"//;s/\"$//"
}

extract_field_num() {
  local json="$1"
  local field="$2"
  echo "$json" | grep -o "\"${field}\":[0-9]*" | head -1 | sed "s/\"${field}\"://"
}

# ── Tier filter function ─────────────────────────────────────────────
matches_tier() {
  local name="$1"
  local tier="$2"

  if [[ -z "$tier" ]]; then
    return 0
  fi

  local lower_name="${name,,}"
  if [[ "$lower_name" == *"$tier"* ]]; then
    return 0
  fi

  return 1
}

# ── Check if document is encrypted (SCDSA002 pattern) ────────────────
is_encrypted_doc() {
  local status="$1"
  local name="$2"

  # Status "failed" with common encrypted document indicators
  if [[ "$status" == "failed" ]]; then
    # Known encrypted format patterns — name doesn't always tell us,
    # but "format_invalid" status is a strong signal. We also check the API
    # error field if available. For now, rely on explicit status or naming.
    return 0
  fi

  return 1
}

# ── Parse documents into arrays ───────────────────────────────────────
parse_documents() {
  local raw_docs="$1"

  DOC_COUNT=0
  COUNT_PARSED=0
  COUNT_PENDING=0
  COUNT_PROCESSING=0
  COUNT_FAILED=0
  COUNT_ENCRYPTED=0

  # Associative arrays for aggregation
  declare -gA FILE_TYPE_COUNTS
  declare -gA CLASSIFICATION_COUNTS

  # Arrays for detail/csv output
  declare -ga DOC_IDS=()
  declare -ga DOC_STATUSES=()
  declare -ga DOC_FILE_TYPES=()
  declare -ga DOC_NAMES=()
  declare -ga DOC_SIZES=()
  declare -ga DOC_DATES=()
  declare -ga DOC_ERRORS=()

  if [[ -z "$raw_docs" ]]; then
    return
  fi

  while IFS= read -r line; do
    [[ -z "$line" ]] && continue

    local doc_id status file_type original_name file_size uploaded_at error_msg
    doc_id=$(extract_field "$line" "document_id")
    status=$(extract_field "$line" "status")
    file_type=$(extract_field "$line" "file_type")
    original_name=$(extract_field "$line" "original_name")
    file_size=$(extract_field_num "$line" "file_size_byte")
    uploaded_at=$(extract_field "$line" "uploaded_at")
    error_msg=$(extract_field "$line" "error")

    [[ -z "$doc_id" ]] && continue

    # Tier filter: match on original_name
    if ! matches_tier "$original_name" "$TIER_FILTER"; then
      continue
    fi

    # Detect encrypted documents (SCDSA002 magic bytes result in format_invalid)
    local is_encrypted=false
    if [[ "$status" == "failed" ]]; then
      if [[ "$error_msg" == *"SCDSA"* || "$error_msg" == *"format_invalid"* || "$error_msg" == *"encrypted"* || "$error_msg" == *"magic"* ]]; then
        is_encrypted=true
      fi
    fi

    # Filter: --failed-only
    if [[ "$FAILED_ONLY" == "true" && "$status" != "failed" ]]; then
      continue
    fi

    # Filter: --encrypted-only
    if [[ "$ENCRYPTED_ONLY" == "true" && "$is_encrypted" != "true" ]]; then
      continue
    fi

    DOC_IDS+=("$doc_id")
    DOC_STATUSES+=("$status")
    DOC_FILE_TYPES+=("$file_type")
    DOC_NAMES+=("$original_name")
    DOC_SIZES+=("${file_size:-0}")
    DOC_DATES+=("$uploaded_at")
    DOC_ERRORS+=("$error_msg")

    DOC_COUNT=$((DOC_COUNT + 1))

    case "$status" in
      parsed)     COUNT_PARSED=$((COUNT_PARSED + 1)) ;;
      pending)    COUNT_PENDING=$((COUNT_PENDING + 1)) ;;
      processing) COUNT_PROCESSING=$((COUNT_PROCESSING + 1)) ;;
      failed)
        COUNT_FAILED=$((COUNT_FAILED + 1))
        if [[ "$is_encrypted" == "true" ]]; then
          COUNT_ENCRYPTED=$((COUNT_ENCRYPTED + 1))
        fi
        ;;
      *)          COUNT_FAILED=$((COUNT_FAILED + 1)) ;;
    esac

    # File type aggregation
    if [[ -n "$file_type" ]]; then
      local current="${FILE_TYPE_COUNTS["$file_type"]:-0}"
      FILE_TYPE_COUNTS["$file_type"]=$((current + 1))
    fi
  done <<< "$raw_docs"
}

# ── Fetch classification counts (sample from chunks) ─────────────────
fetch_classifications() {
  # To avoid fetching chunks for every document, we sample up to 20 parsed documents
  declare -gA CLASSIFICATION_COUNTS

  local sampled=0
  local max_sample=20

  for i in "${!DOC_IDS[@]}"; do
    [[ "${DOC_STATUSES[$i]}" != "parsed" ]] && continue
    [[ $sampled -ge $max_sample ]] && break

    local doc_id="${DOC_IDS[$i]}"
    local chunks_resp
    chunks_resp=$(curl -s --max-time 15 --connect-timeout 10 \
      -X GET "${BASE_URL}/documents/${doc_id}/chunks" \
      -H "X-Internal-Secret: ${SECRET}" \
      2>/dev/null || echo '')

    if [[ -n "$chunks_resp" ]]; then
      # Extract classification values from chunks
      local classifications
      classifications=$(echo "$chunks_resp" | grep -o '"classification":"[^"]*"' | \
        sed 's/"classification":"//;s/"$//' | sort -u)

      while IFS= read -r cls; do
        [[ -z "$cls" ]] && continue
        local current="${CLASSIFICATION_COUNTS["$cls"]:-0}"
        CLASSIFICATION_COUNTS["$cls"]=$((current + 1))
      done <<< "$classifications"
    fi

    sampled=$((sampled + 1))
  done

  # If we sampled less than total, extrapolate note
  if [[ $sampled -lt $COUNT_PARSED && $COUNT_PARSED -gt 0 ]]; then
    CLASSIFICATION_SAMPLED=$sampled
  else
    CLASSIFICATION_SAMPLED=0
  fi
}

# ── Percentage helper ─────────────────────────────────────────────────
pct() {
  local count="$1"
  local total="$2"
  if [[ "$total" -eq 0 ]]; then
    echo " 0.0"
    return
  fi
  # Use awk for floating point
  awk "BEGIN { printf \"%4.1f\", ($count / $total) * 100 }"
}

# ── Sort keys by value descending ─────────────────────────────────────
# Input: associative array name. Output: sorted keys to stdout, one per line
sort_assoc_desc() {
  local -n _arr=$1
  for key in "${!_arr[@]}"; do
    echo "${_arr[$key]} $key"
  done | sort -rn | awk '{print $2}'
}

# ── Output: JSON ──────────────────────────────────────────────────────
print_json() {
  echo '{'
  echo '  "organization": "'"${ORG_ID}"'",'
  echo '  "environment": "'"${ENVIRONMENT}"'",'

  # Filters applied
  local filters=""
  if [[ -n "$TIER_FILTER" ]]; then
    filters="${filters}\"tier\":\"${TIER_FILTER}\","
  fi
  if [[ "$FAILED_ONLY" == "true" ]]; then
    filters="${filters}\"failedOnly\":true,"
  fi
  if [[ "$ENCRYPTED_ONLY" == "true" ]]; then
    filters="${filters}\"encryptedOnly\":true,"
  fi
  if [[ -n "$filters" ]]; then
    echo "  \"filters\": {${filters%,}},"
  fi

  echo '  "summary": {'
  echo "    \"total\": ${DOC_COUNT},"
  echo "    \"parsed\": ${COUNT_PARSED},"
  echo "    \"pending\": ${COUNT_PENDING},"
  echo "    \"processing\": ${COUNT_PROCESSING},"
  echo "    \"failed\": ${COUNT_FAILED},"
  echo "    \"encrypted\": ${COUNT_ENCRYPTED}"
  echo '  },'
  echo '  "documents": ['

  local first=true
  for i in "${!DOC_IDS[@]}"; do
    local comma=""
    if [[ "$first" == "true" ]]; then
      first=false
    else
      comma=","
    fi

    # Escape special chars in name/error
    local name="${DOC_NAMES[$i]}"
    name="${name//\\/\\\\}"
    name="${name//\"/\\\"}"
    local err="${DOC_ERRORS[$i]}"
    err="${err//\\/\\\\}"
    err="${err//\"/\\\"}"

    echo "${comma}    {"
    echo "      \"documentId\": \"${DOC_IDS[$i]}\","
    echo "      \"status\": \"${DOC_STATUSES[$i]}\","
    echo "      \"fileType\": \"${DOC_FILE_TYPES[$i]}\","
    echo "      \"originalName\": \"${name}\","
    echo "      \"uploadedAt\": \"${DOC_DATES[$i]}\","
    echo "      \"error\": \"${err}\""
    echo "    }"
  done

  echo '  ]'
  echo '}'
}

# ── Output: Summary ──────────────────────────────────────────────────
print_summary() {
  local pct_parsed pct_pending pct_processing pct_failed
  pct_parsed=$(pct "$COUNT_PARSED" "$DOC_COUNT")
  pct_pending=$(pct "$COUNT_PENDING" "$DOC_COUNT")
  pct_processing=$(pct "$COUNT_PROCESSING" "$DOC_COUNT")
  pct_failed=$(pct "$COUNT_FAILED" "$DOC_COUNT")

  echo ""
  printf '%0.s═' {1..55}; echo ""
  echo " AI Foundry Batch Status — ${ORG_ID} (${ENVIRONMENT})"
  if [[ -n "$TIER_FILTER" || "$FAILED_ONLY" == "true" || "$ENCRYPTED_ONLY" == "true" ]]; then
    local filter_desc=""
    [[ -n "$TIER_FILTER" ]] && filter_desc="${filter_desc} tier=${TIER_FILTER}"
    [[ "$FAILED_ONLY" == "true" ]] && filter_desc="${filter_desc} failed-only"
    [[ "$ENCRYPTED_ONLY" == "true" ]] && filter_desc="${filter_desc} encrypted-only"
    echo " Filters:${filter_desc}"
  fi
  printf '%0.s═' {1..55}; echo ""
  printf " Total documents:  %d\n" "$DOC_COUNT"
  printf " ├─ Parsed:        %4d (%s%%)\n" "$COUNT_PARSED" "$pct_parsed"
  printf " ├─ Pending:       %4d (%s%%)\n" "$COUNT_PENDING" "$pct_pending"
  if [[ "$COUNT_PROCESSING" -gt 0 ]]; then
    printf " ├─ Processing:    %4d (%s%%)\n" "$COUNT_PROCESSING" "$pct_processing"
  fi
  printf " ├─ Failed:        %4d (%s%%)\n" "$COUNT_FAILED" "$pct_failed"
  if [[ "$COUNT_ENCRYPTED" -gt 0 ]]; then
    printf " │  (encrypted):   %4d\n" "$COUNT_ENCRYPTED"
  fi
  printf " └─ ─────────────────────\n"

  # File type breakdown
  if [[ ${#FILE_TYPE_COUNTS[@]} -gt 0 ]]; then
    echo ""
    echo " By file type:"
    local sorted_types
    sorted_types=$(sort_assoc_desc FILE_TYPE_COUNTS)
    local type_keys=()
    while IFS= read -r k; do
      [[ -n "$k" ]] && type_keys+=("$k")
    done <<< "$sorted_types"

    local last_idx=$(( ${#type_keys[@]} - 1 ))
    for i in "${!type_keys[@]}"; do
      local ft="${type_keys[$i]}"
      if [[ $i -lt $last_idx ]]; then
        printf " ├─ %-12s %d\n" "${ft}:" "${FILE_TYPE_COUNTS[$ft]}"
      else
        printf " └─ %-12s %d\n" "${ft}:" "${FILE_TYPE_COUNTS[$ft]}"
      fi
    done
  fi

  # Classification breakdown
  if [[ ${#CLASSIFICATION_COUNTS[@]} -gt 0 ]]; then
    echo ""
    if [[ ${CLASSIFICATION_SAMPLED:-0} -gt 0 ]]; then
      echo " By classification (sampled ${CLASSIFICATION_SAMPLED}/${COUNT_PARSED} parsed docs):"
    else
      echo " By classification:"
    fi
    local sorted_cls
    sorted_cls=$(sort_assoc_desc CLASSIFICATION_COUNTS)
    local cls_keys=()
    while IFS= read -r k; do
      [[ -n "$k" ]] && cls_keys+=("$k")
    done <<< "$sorted_cls"

    local last_idx=$(( ${#cls_keys[@]} - 1 ))
    for i in "${!cls_keys[@]}"; do
      local cl="${cls_keys[$i]}"
      if [[ $i -lt $last_idx ]]; then
        printf " ├─ %-18s %d\n" "${cl}:" "${CLASSIFICATION_COUNTS[$cl]}"
      else
        printf " └─ %-18s %d\n" "${cl}:" "${CLASSIFICATION_COUNTS[$cl]}"
      fi
    done
  fi

  printf '%0.s═' {1..55}; echo ""
  echo ""
}

# ── Output: Detail ────────────────────────────────────────────────────
print_detail() {
  echo ""
  printf '%0.s═' {1..80}; echo ""
  echo " AI Foundry Batch Status — ${ORG_ID} (${ENVIRONMENT}) [detail]"
  if [[ -n "$TIER_FILTER" || "$FAILED_ONLY" == "true" || "$ENCRYPTED_ONLY" == "true" ]]; then
    local filter_desc=""
    [[ -n "$TIER_FILTER" ]] && filter_desc="${filter_desc} tier=${TIER_FILTER}"
    [[ "$FAILED_ONLY" == "true" ]] && filter_desc="${filter_desc} failed-only"
    [[ "$ENCRYPTED_ONLY" == "true" ]] && filter_desc="${filter_desc} encrypted-only"
    echo " Filters:${filter_desc}"
  fi
  printf '%0.s═' {1..80}; echo ""
  printf " Total: %d (parsed: %d, pending: %d, processing: %d, failed: %d" \
    "$DOC_COUNT" "$COUNT_PARSED" "$COUNT_PENDING" "$COUNT_PROCESSING" "$COUNT_FAILED"
  if [[ "$COUNT_ENCRYPTED" -gt 0 ]]; then
    printf ", encrypted: %d" "$COUNT_ENCRYPTED"
  fi
  echo ")"
  printf '%0.s─' {1..80}; echo ""

  # Group by status: failed first, then pending, then processing, then parsed
  for target_status in "failed" "pending" "processing" "parsed"; do
    local group_count=0
    for i in "${!DOC_STATUSES[@]}"; do
      [[ "${DOC_STATUSES[$i]}" == "$target_status" ]] && group_count=$((group_count + 1))
    done

    [[ $group_count -eq 0 ]] && continue

    local label
    case "$target_status" in
      failed)     label="FAILED" ;;
      pending)    label="PENDING" ;;
      processing) label="PROCESSING" ;;
      parsed)     label="PARSED" ;;
      *)          label="$target_status" ;;
    esac

    echo ""
    echo " [$label] ($group_count)"
    printf "  %-8s │ %-6s │ %-50s\n" "STATUS" "TYPE" "FILENAME"
    printf '  %0.s─' {1..72}; echo ""

    for i in "${!DOC_STATUSES[@]}"; do
      [[ "${DOC_STATUSES[$i]}" != "$target_status" ]] && continue
      printf "  %-8s │ %-6s │ %s\n" \
        "${DOC_STATUSES[$i]}" \
        "${DOC_FILE_TYPES[$i]}" \
        "${DOC_NAMES[$i]}"
    done
  done

  echo ""
  printf '%0.s═' {1..80}; echo ""
  echo ""
}

# ── Output: CSV ───────────────────────────────────────────────────────
print_csv() {
  echo "document_id,status,file_type,original_name,uploaded_at,error"
  for i in "${!DOC_IDS[@]}"; do
    # Escape commas in original_name by quoting
    local name="${DOC_NAMES[$i]}"
    if [[ "$name" == *","* || "$name" == *'"'* ]]; then
      name="\"${name//\"/\"\"}\""
    fi
    local err="${DOC_ERRORS[$i]}"
    if [[ "$err" == *","* || "$err" == *'"'* ]]; then
      err="\"${err//\"/\"\"}\""
    fi
    echo "${DOC_IDS[$i]},${DOC_STATUSES[$i]},${DOC_FILE_TYPES[$i]},${name},${DOC_DATES[$i]},${err}"
  done
}

# ── Wait mode loop ────────────────────────────────────────────────────
run_wait_mode() {
  local elapsed=0
  local interval=10

  echo "Waiting for all documents to be processed..."
  echo "Press Ctrl+C to stop waiting and show current status."
  echo ""

  # Graceful Ctrl+C in wait mode
  local interrupted=false
  trap 'interrupted=true' INT

  while true; do
    local raw_docs
    raw_docs=$(fetch_all_documents)
    parse_documents "$raw_docs"

    printf "\r  [%ds] %d/%d parsed, %d pending, %d processing, %d failed..." \
      "$elapsed" "$COUNT_PARSED" "$DOC_COUNT" "$COUNT_PENDING" "$COUNT_PROCESSING" "$COUNT_FAILED"

    # Exit conditions: no pending/processing left, or interrupted
    if [[ "$COUNT_PENDING" -eq 0 && "$COUNT_PROCESSING" -eq 0 ]]; then
      echo ""
      echo ""
      echo "All documents processed."
      break
    fi

    if [[ "$interrupted" == "true" ]]; then
      echo ""
      echo ""
      echo "Interrupted. Showing current status..."
      break
    fi

    sleep "$interval"
    elapsed=$((elapsed + interval))
  done

  # Reset trap
  trap - INT

  # Fetch classifications for final summary
  if [[ "$COUNT_PARSED" -gt 0 ]]; then
    fetch_classifications
  fi

  if [[ "$JSON_OUTPUT" == "true" ]]; then
    print_json
  else
    print_summary
  fi
}

# ── Main ──────────────────────────────────────────────────────────────
if [[ "$WAIT_MODE" == "true" ]]; then
  run_wait_mode
  exit 0
fi

# Non-wait mode: single fetch
if [[ "$FORMAT" != "csv" && "$JSON_OUTPUT" != "true" ]]; then
  echo "Fetching documents from ${BASE_URL}..."
fi

RAW_DOCS=$(fetch_all_documents)
parse_documents "$RAW_DOCS"

if [[ "$DOC_COUNT" -eq 0 ]]; then
  if [[ "$JSON_OUTPUT" == "true" ]]; then
    echo '{"organization":"'"${ORG_ID}"'","environment":"'"${ENVIRONMENT}"'","summary":{"total":0},"documents":[]}'
  elif [[ "$FORMAT" == "csv" ]]; then
    echo "document_id,status,file_type,original_name,uploaded_at,error"
  else
    echo "No documents found for organization: ${ORG_ID}"
    if [[ -n "$TIER_FILTER" ]]; then
      echo "  (tier filter: $TIER_FILTER)"
    fi
    if [[ "$FAILED_ONLY" == "true" ]]; then
      echo "  (filter: failed-only)"
    fi
    if [[ "$ENCRYPTED_ONLY" == "true" ]]; then
      echo "  (filter: encrypted-only)"
    fi
  fi
  exit 0
fi

# JSON output takes precedence over FORMAT
if [[ "$JSON_OUTPUT" == "true" ]]; then
  print_json
  exit 0
fi

case "$FORMAT" in
  summary)
    # Fetch classifications for summary
    if [[ "$COUNT_PARSED" -gt 0 ]]; then
      fetch_classifications
    fi
    print_summary
    ;;
  detail)
    print_detail
    ;;
  csv)
    print_csv
    ;;
esac
