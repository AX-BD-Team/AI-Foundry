#!/usr/bin/env bash
set -euo pipefail

# Batch E2E Pipeline Test
# Usage: INTERNAL_API_SECRET='...' ./scripts/test-e2e-batch.sh [OPTIONS]
#
# Options:
#   --staging        Use staging environment (default)
#   --production     Use production environment
#   --phase PHASE    Phase identifier (default: phase-2c)
#   --dir DIR        Override document directory
#   --auto-approve   Auto-approve candidate policies
#   --json           Print JSON summary to stdout
#   --dry-run        Validate manifest without calling APIs
#   --help           Show this help

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

ENV="staging"
PHASE="phase-2c"
DOC_DIR=""
AUTO_APPROVE=false
JSON_OUTPUT=false
DRY_RUN=false

show_help() {
  sed -n '3,15p' "$0" | sed 's/^# \?//'
  exit 0
}

while [[ $# -gt 0 ]]; do
  case $1 in
    --staging) ENV="staging"; shift ;;
    --production) ENV="production"; shift ;;
    --phase) PHASE="$2"; shift 2 ;;
    --dir) DOC_DIR="$2"; shift 2 ;;
    --auto-approve) AUTO_APPROVE=true; shift ;;
    --json) JSON_OUTPUT=true; shift ;;
    --dry-run) DRY_RUN=true; shift ;;
    --help|-h) show_help ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# Default DOC_DIR based on --phase unless --dir overrides
if [[ -z "$DOC_DIR" ]]; then
  DOC_DIR="$PROJECT_DIR/test-docs/$PHASE"
fi

BATCH_ID="batch-${PHASE}-$(date +%Y%m%d-%H%M%S)"
RESULTS_FILE="$DOC_DIR/results-${BATCH_ID}.json"

# Validate environment
if [[ "$DRY_RUN" == "false" && -z "${INTERNAL_API_SECRET:-}" ]]; then
  echo "ERROR: INTERNAL_API_SECRET environment variable is required"
  exit 1
fi

if [[ ! -f "$DOC_DIR/documents.json" ]]; then
  echo "ERROR: documents.json not found in $DOC_DIR"
  exit 1
fi

# Environment URLs
if [[ "$ENV" == "staging" ]]; then
  INGESTION_URL="https://svc-ingestion-staging.ktds-axbd.workers.dev"
  POLICY_URL="https://svc-policy-staging.ktds-axbd.workers.dev"
  ANALYTICS_URL="https://svc-analytics-staging.ktds-axbd.workers.dev"
else
  INGESTION_URL="https://svc-ingestion.ktds-axbd.workers.dev"
  POLICY_URL="https://svc-policy.ktds-axbd.workers.dev"
  ANALYTICS_URL="https://svc-analytics.ktds-axbd.workers.dev"
fi

SECRET_HEADER="X-Internal-Secret: ${INTERNAL_API_SECRET:-}"
JSON_HEADER="Content-Type: application/json"
ORG_ID="org-batch-$(date +%s)"

# MIME type mapping
mime_type() {
  case "$1" in
    pdf)  echo "application/pdf" ;;
    docx) echo "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ;;
    xlsx) echo "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ;;
    pptx) echo "application/vnd.openxmlformats-officedocument.presentationml.presentation" ;;
    txt)  echo "text/plain" ;;
    *)    echo "application/octet-stream" ;;
  esac
}

# Temp dir for synthetic files
TMPDIR_BATCH=$(mktemp -d /tmp/batch-e2e-XXXXXX)
trap 'rm -rf "$TMPDIR_BATCH"' EXIT

echo "================================================================"
echo "  Batch E2E Test"
echo "  Phase:        $PHASE"
echo "  Environment:  $ENV"
echo "  Documents:    $DOC_DIR"
echo "  Auto-approve: $AUTO_APPROVE"
echo "  Org ID:       $ORG_ID"
echo "  Batch ID:     $BATCH_ID"
if [[ "$DRY_RUN" == "true" ]]; then
  echo "  Mode:         DRY RUN (no API calls)"
fi
echo "================================================================"
echo ""

DOCS=$(cat "$DOC_DIR/documents.json")
DOC_COUNT=$(echo "$DOCS" | jq '.documents | length')
echo "Found $DOC_COUNT documents in manifest"

# --- Dry-run: validate manifest and exit ---
if [[ "$DRY_RUN" == "true" ]]; then
  echo ""
  echo "Validating manifest..."
  ERRORS=0
  for i in $(seq 0 $((DOC_COUNT - 1))); do
    DOC=$(echo "$DOCS" | jq -r ".documents[$i]")
    NAME=$(echo "$DOC" | jq -r '.name // empty')
    TYPE=$(echo "$DOC" | jq -r '.fileType // empty')
    CONTENT=$(echo "$DOC" | jq -r '.content // empty')

    FILEPATH=$(echo "$DOC" | jq -r '.filePath // empty')

    if [[ -z "$NAME" ]]; then
      echo "  [ERROR] Document $((i+1)): missing 'name'"
      ERRORS=$((ERRORS + 1))
    elif [[ -z "$TYPE" ]]; then
      echo "  [ERROR] Document $((i+1)) ($NAME): missing 'fileType'"
      ERRORS=$((ERRORS + 1))
    elif [[ -n "$FILEPATH" ]]; then
      # Real file mode — validate filePath existence
      if [[ "$FILEPATH" != /* ]]; then
        FILEPATH="$DOC_DIR/$FILEPATH"
      fi
      if [[ -f "$FILEPATH" ]]; then
        FILE_SIZE=$(stat -c%s "$FILEPATH" 2>/dev/null || stat -f%z "$FILEPATH" 2>/dev/null || echo 0)
        echo "  [OK] $NAME ($TYPE, real file: $(( FILE_SIZE / 1024 )) KB)"
      else
        echo "  [ERROR] Document $((i+1)) ($NAME): file not found: $FILEPATH"
        ERRORS=$((ERRORS + 1))
      fi
    elif [[ -z "$CONTENT" ]]; then
      echo "  [ERROR] Document $((i+1)) ($NAME): missing 'content' (and no 'filePath')"
      ERRORS=$((ERRORS + 1))
    else
      echo "  [OK] $NAME ($TYPE, synthetic)"
    fi
  done
  echo ""
  if [[ "$ERRORS" -gt 0 ]]; then
    echo "Manifest validation FAILED: $ERRORS error(s)"
    exit 1
  fi
  echo "Manifest validation OK: $DOC_COUNT documents ready"
  exit 0
fi

# --- Live run ---
RESULTS_JSON="[]"
PASSED=0
FAILED=0

for i in $(seq 0 $((DOC_COUNT - 1))); do
  DOC=$(echo "$DOCS" | jq -r ".documents[$i]")
  DOC_NAME=$(echo "$DOC" | jq -r '.name')
  DOC_TYPE=$(echo "$DOC" | jq -r '.fileType')
  DOC_CONTENT=$(echo "$DOC" | jq -r '.content // empty')
  DOC_FILEPATH=$(echo "$DOC" | jq -r '.filePath // empty')

  echo "--- Document $((i+1))/$DOC_COUNT: $DOC_NAME ---"

  # Stage 1: Upload (multipart/form-data — matches svc-ingestion API)
  echo "  [1/5] Uploading..."

  if [[ -n "$DOC_FILEPATH" ]]; then
    # Real binary file upload — resolve relative paths against DOC_DIR
    if [[ "$DOC_FILEPATH" != /* ]]; then
      DOC_FILEPATH="$DOC_DIR/$DOC_FILEPATH"
    fi
    if [[ ! -f "$DOC_FILEPATH" ]]; then
      echo "  FAILED: File not found: $DOC_FILEPATH"
      FAILED=$((FAILED + 1))
      RESULTS_JSON=$(echo "$RESULTS_JSON" | jq \
        --arg name "$DOC_NAME" \
        '. + [{"name":$name,"status":"failed","stage":"upload","documentId":null,"policies":0}]')
      continue
    fi
    UPLOAD_MIME=$(mime_type "$DOC_TYPE")
    FILE_SIZE=$(stat -c%s "$DOC_FILEPATH" 2>/dev/null || stat -f%z "$DOC_FILEPATH" 2>/dev/null || echo 0)
    echo "  Real file: $DOC_FILEPATH ($(( FILE_SIZE / 1024 )) KB, $UPLOAD_MIME)"
    UPLOAD_RESP=$(curl -s --max-time 120 -X POST "$INGESTION_URL/documents" \
      -H "$SECRET_HEADER" \
      -H "X-Organization-Id: $ORG_ID" \
      -H "X-User-Id: batch-test" \
      -F "file=@${DOC_FILEPATH};filename=${DOC_NAME};type=${UPLOAD_MIME}" \
      2>/dev/null || echo '{"success":false}')
  else
    # Synthetic text upload (legacy behavior)
    TMPFILE="$TMPDIR_BATCH/${DOC_NAME%.${DOC_TYPE}}.txt"
    echo "$DOC_CONTENT" > "$TMPFILE"
    UPLOAD_RESP=$(curl -s --max-time 30 -X POST "$INGESTION_URL/documents" \
      -H "$SECRET_HEADER" \
      -H "X-Organization-Id: $ORG_ID" \
      -H "X-User-Id: batch-test" \
      -F "file=@${TMPFILE};filename=${DOC_NAME%.${DOC_TYPE}}.txt;type=text/plain" \
      2>/dev/null || echo '{"success":false}')
  fi

  DOC_ID=$(echo "$UPLOAD_RESP" | jq -r '.data.documentId // empty')
  if [[ -z "$DOC_ID" ]]; then
    echo "  FAILED: Upload failed"
    FAILED=$((FAILED + 1))
    RESULTS_JSON=$(echo "$RESULTS_JSON" | jq \
      --arg name "$DOC_NAME" \
      '. + [{"name":$name,"status":"failed","stage":"upload","documentId":null,"policies":0}]')
    continue
  fi
  echo "  OK: documentId=$DOC_ID"

  # Poll document status until parsed/failed (real files can take 30-90s via Unstructured.io)
  if [[ -n "$DOC_FILEPATH" ]]; then
    MAX_PARSE_POLLS=18
    PARSE_INTERVAL=5
  else
    MAX_PARSE_POLLS=6
    PARSE_INTERVAL=3
  fi
  echo "  [2/5] Waiting for document parsing..."
  DOC_PARSE_STATUS="pending"
  CHUNK_COUNT=0
  for poll in $(seq 1 "$MAX_PARSE_POLLS"); do
    STATUS_RESP=$(curl -s --max-time 10 "$INGESTION_URL/documents/$DOC_ID" \
      -H "$SECRET_HEADER" 2>/dev/null || echo '{}')
    DOC_PARSE_STATUS=$(echo "$STATUS_RESP" | jq -r '.data.status // .status // "pending"')
    if [[ "$DOC_PARSE_STATUS" == "parsed" || "$DOC_PARSE_STATUS" == "completed" ]]; then
      echo "  Document parsed successfully"
      # Fetch chunk count
      CHUNKS_RESP=$(curl -s --max-time 10 "$INGESTION_URL/documents/$DOC_ID/chunks" \
        -H "$SECRET_HEADER" 2>/dev/null || echo '{}')
      CHUNK_COUNT=$(echo "$CHUNKS_RESP" | jq '.data.chunks | length // 0' 2>/dev/null || echo 0)
      echo "  Chunks: $CHUNK_COUNT"
      break
    elif [[ "$DOC_PARSE_STATUS" == "failed" ]]; then
      ERROR_MSG=$(echo "$STATUS_RESP" | jq -r '.data.error_message // "unknown"')
      echo "  WARN: Document parsing failed: $ERROR_MSG"
      break
    fi
    if [[ "$poll" -lt "$MAX_PARSE_POLLS" ]]; then
      sleep "$PARSE_INTERVAL"
    fi
  done
  if [[ "$DOC_PARSE_STATUS" == "pending" ]]; then
    echo "  WARN: Document still pending after polling (queue may be delayed)"
  fi

  # Wait for downstream pipeline (extraction → policy)
  echo "  [3-4/5] Waiting for extraction + policy pipeline (15s)..."
  sleep 15

  # Check policies (poll a few times — async pipeline may still be running)
  POLICY_COUNT=0
  POLICIES_RESP='{"success":false}'
  for attempt in 1 2 3 4 5; do
    POLICIES_RESP=$(curl -s --max-time 15 "$POLICY_URL/policies?documentId=$DOC_ID" \
      -H "$SECRET_HEADER" 2>/dev/null || echo '{"success":false}')
    POLICY_COUNT=$(echo "$POLICIES_RESP" | jq '.data.policies | length // 0' 2>/dev/null || echo 0)
    if [[ "$POLICY_COUNT" -gt 0 ]]; then
      break
    fi
    sleep 5
  done
  echo "  Policies generated: $POLICY_COUNT"

  # Auto-approve
  if [[ "$AUTO_APPROVE" == "true" && "$POLICY_COUNT" -gt 0 ]]; then
    echo "  [4/5] Auto-approving..."
    for j in $(seq 0 $((POLICY_COUNT - 1))); do
      POLICY_ID=$(echo "$POLICIES_RESP" | jq -r ".data.policies[$j].policyId // empty")
      POLICY_STATUS=$(echo "$POLICIES_RESP" | jq -r ".data.policies[$j].status // empty")
      if [[ "$POLICY_STATUS" == "candidate" || "$POLICY_STATUS" == "in_review" ]]; then
        curl -s --max-time 10 -X POST "$POLICY_URL/policies/$POLICY_ID/approve" \
          -H "$SECRET_HEADER" \
          -H "$JSON_HEADER" \
          -d '{"reviewerId":"batch-auto","comment":"Auto-approved by batch E2E"}' \
          > /dev/null 2>&1 || true
        echo "    Approved: $POLICY_ID"
      fi
    done
    # Wait for Stage 4→5 after approval
    sleep 8
  fi

  echo "  [5/5] Done"
  PASSED=$((PASSED + 1))
  RESULTS_JSON=$(echo "$RESULTS_JSON" | jq \
    --arg name "$DOC_NAME" \
    --arg docId "$DOC_ID" \
    --arg parseStatus "$DOC_PARSE_STATUS" \
    --argjson chunks "$CHUNK_COUNT" \
    --argjson policies "$POLICY_COUNT" \
    '. + [{"name":$name,"status":"passed","stage":"complete","documentId":$docId,"parseStatus":$parseStatus,"chunks":$chunks,"policies":$policies}]')
  echo ""
done

# --- Quality metrics ---
echo "================================================================"
echo "Fetching quality metrics..."
QUALITY=$(curl -s --max-time 15 "$ANALYTICS_URL/quality?organizationId=$ORG_ID" \
  -H "$SECRET_HEADER" 2>/dev/null || echo '{"success":false}')

QUALITY_SUCCESS=$(echo "$QUALITY" | jq -r '.success // false')
if [[ "$QUALITY_SUCCESS" == "true" ]]; then
  echo ""
  echo "  Quality Metrics Summary:"
  # Extract and display available metrics
  PARSING=$(echo "$QUALITY" | jq -r '.data.parsing // empty')
  EXTRACTION=$(echo "$QUALITY" | jq -r '.data.extraction // empty')
  POLICY=$(echo "$QUALITY" | jq -r '.data.policy // empty')
  SKILL=$(echo "$QUALITY" | jq -r '.data.skill // empty')
  if [[ -n "$PARSING" && "$PARSING" != "null" ]]; then
    echo "    Parsing:    $(echo "$PARSING" | jq -c '.')"
  fi
  if [[ -n "$EXTRACTION" && "$EXTRACTION" != "null" ]]; then
    echo "    Extraction: $(echo "$EXTRACTION" | jq -c '.')"
  fi
  if [[ -n "$POLICY" && "$POLICY" != "null" ]]; then
    echo "    Policy:     $(echo "$POLICY" | jq -c '.')"
  fi
  if [[ -n "$SKILL" && "$SKILL" != "null" ]]; then
    echo "    Skill:      $(echo "$SKILL" | jq -c '.')"
  fi
else
  echo "  WARNING: Failed to fetch quality metrics"
fi

# --- Summary ---
PASS_RATE=0
if [[ "$DOC_COUNT" -gt 0 ]]; then
  PASS_RATE=$((PASSED * 100 / DOC_COUNT))
fi

echo ""
echo "================================================================"
echo "  Batch E2E Results"
echo "  Phase:    $PHASE"
echo "  Total:    $DOC_COUNT"
echo "  Passed:   $PASSED"
echo "  Failed:   $FAILED"
echo "  Pass Rate: ${PASS_RATE}%"
echo "  Batch ID: $BATCH_ID"
echo "================================================================"

# --- Generate results JSON file ---
QUALITY_DATA=$(echo "$QUALITY" | jq '.data // {}')
REPORT=$(jq -n \
  --arg batchId "$BATCH_ID" \
  --arg phase "$PHASE" \
  --arg env "$ENV" \
  --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --argjson total "$DOC_COUNT" \
  --argjson passed "$PASSED" \
  --argjson failed "$FAILED" \
  --argjson passRate "$PASS_RATE" \
  --argjson documents "$RESULTS_JSON" \
  --argjson qualityMetrics "$QUALITY_DATA" \
  '{
    batchId: $batchId,
    phase: $phase,
    environment: $env,
    timestamp: $ts,
    summary: {total: $total, passed: $passed, failed: $failed, passRate: $passRate},
    documents: $documents,
    qualityMetrics: $qualityMetrics
  }')

mkdir -p "$(dirname "$RESULTS_FILE")"
echo "$REPORT" > "$RESULTS_FILE"
echo ""
echo "Results saved: $RESULTS_FILE"

# --- JSON stdout output ---
if [[ "$JSON_OUTPUT" == "true" ]]; then
  echo ""
  echo "$REPORT"
fi

if [[ "$FAILED" -gt 0 ]]; then
  exit 1
fi
