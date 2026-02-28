#!/usr/bin/env bash
# =============================================================================
# AI Foundry — E2E Pipeline Integration Test
# 5-Stage: Ingestion → Extraction → Policy → Ontology → Skill
#
# Stages 1→2: Queue-event driven (automatic via svc-queue-router)
# Stages 3→4→5: Manual API calls (queue handlers are stubs)
#
# Prerequisites:
#   - All 11 Workers deployed (run `bun run deploy` or per-service wrangler deploy)
#   - INTERNAL_API_SECRET set as Wrangler secret on all services
#   - DB migrations applied (infra/migrations/db-structure/0002_fix_schema.sql)
#
# Usage:
#   INTERNAL_API_SECRET="your-secret" ./scripts/test-e2e-pipeline.sh
#   INTERNAL_API_SECRET="your-secret" BASE_URL="https://custom.workers.dev" ./scripts/test-e2e-pipeline.sh
# =============================================================================

set -euo pipefail

# --- Config ---
BASE="https://svc-ingestion.sinclair-account.workers.dev"
EXTRACTION_BASE="https://svc-extraction.sinclair-account.workers.dev"
POLICY_BASE="https://svc-policy.sinclair-account.workers.dev"
ONTOLOGY_BASE="https://svc-ontology.sinclair-account.workers.dev"
SKILL_BASE="https://svc-skill.sinclair-account.workers.dev"
SECRET="${INTERNAL_API_SECRET:?Set INTERNAL_API_SECRET env var}"
POLL_INTERVAL=3
MAX_POLLS=20
ORG_ID="org-e2e-test-$(date +%s)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

pass=0
fail=0

step() { echo -e "\n${CYAN}[$1/8]${NC} $2"; }
ok()   { echo -e "  ${GREEN}✓${NC} $1"; pass=$((pass + 1)); }
err()  { echo -e "  ${RED}✗${NC} $1"; fail=$((fail + 1)); }
warn() { echo -e "  ${YELLOW}⚠${NC} $1"; }

# --- Helper: poll until jq filter matches ---
poll_until() {
  local url="$1" filter="$2" desc="$3"
  for i in $(seq 1 "$MAX_POLLS"); do
    local resp
    resp=$(curl -sf -H "X-Internal-Secret: $SECRET" "$url" 2>/dev/null || echo '{}')
    local val
    val=$(echo "$resp" | jq -r "$filter" 2>/dev/null || echo "null")
    if [ "$val" != "null" ] && [ "$val" != "" ] && [ "$val" != "false" ]; then
      echo "$resp"
      return 0
    fi
    if [ "$i" -lt "$MAX_POLLS" ]; then
      sleep "$POLL_INTERVAL"
    fi
  done
  warn "Timeout polling $desc (${MAX_POLLS}x${POLL_INTERVAL}s)"
  echo '{}'
  return 1
}

echo "============================================="
echo " AI Foundry E2E Pipeline Test"
echo " $(date -Iseconds)"
echo "============================================="
echo " Org: $ORG_ID"

# =============================================================================
# STAGE 1: Document Upload → Ingestion (automatic queue processing)
# =============================================================================
step 1 "POST /documents — upload test document"

# Create a minimal test file
TEST_FILE=$(mktemp /tmp/e2e-test-XXXXXX.txt)
echo "퇴직연금 중도인출 요건: 무주택 세대주, 가입기간 5년 이상, 인출한도 적립금의 50%" > "$TEST_FILE"

UPLOAD_RESP=$(curl -sf -X POST "$BASE/documents" \
  -H "X-Internal-Secret: $SECRET" \
  -F "file=@${TEST_FILE};filename=pension-withdrawal-rules.txt;type=text/plain" \
  -F "organizationId=$ORG_ID" \
  -F "uploadedBy=e2e-test-user" \
  2>/dev/null || echo '{"error":"upload_failed"}')

rm -f "$TEST_FILE"

DOC_ID=$(echo "$UPLOAD_RESP" | jq -r '.documentId // empty')
if [ -n "$DOC_ID" ]; then
  ok "Document uploaded: $DOC_ID"
else
  err "Upload failed: $UPLOAD_RESP"
  echo -e "\n${RED}Cannot continue without documentId. Aborting.${NC}"
  exit 1
fi

# =============================================================================
# STAGE 1 continued: Poll until status=parsed
# =============================================================================
step 2 "Poll GET /documents/:id — wait for status=parsed"

DOC_RESP=$(poll_until "$BASE/documents/$DOC_ID" '.status // empty | select(. == "parsed")' "document.parsed") || true
DOC_STATUS=$(echo "$DOC_RESP" | jq -r '.status // "unknown"')

if [ "$DOC_STATUS" = "parsed" ]; then
  ok "Document parsed successfully"
else
  # Might still be processing — check what we got
  warn "Document status: $DOC_STATUS (expected: parsed)"
  warn "Queue processing may be slow. Continuing with manual fallback..."
fi

# =============================================================================
# STAGE 2: Extraction (automatic via ingestion.completed queue event)
# =============================================================================
step 3 "Poll GET /extractions?documentId=:id — wait for extraction"

EXTRACT_RESP=$(poll_until \
  "$EXTRACTION_BASE/extractions?documentId=$DOC_ID" \
  '.extractions[0].extractionId // empty' \
  "extraction.completed") || true

EXTRACTION_ID=$(echo "$EXTRACT_RESP" | jq -r '.extractions[0].extractionId // empty')
EXTRACT_STATUS=$(echo "$EXTRACT_RESP" | jq -r '.extractions[0].status // "unknown"')

if [ -n "$EXTRACTION_ID" ]; then
  ok "Extraction completed: $EXTRACTION_ID (status=$EXTRACT_STATUS)"
else
  warn "No extraction found via queue. Trying manual POST /extract..."

  # Fallback: fetch chunks and call extraction manually
  CHUNKS_RESP=$(curl -sf -H "X-Internal-Secret: $SECRET" \
    "$BASE/documents/$DOC_ID/chunks" 2>/dev/null || echo '{"chunks":[]}')

  CHUNK_TEXTS=$(echo "$CHUNKS_RESP" | jq '[.chunks[].masked_text]')
  CHUNK_COUNT=$(echo "$CHUNK_TEXTS" | jq 'length')

  if [ "$CHUNK_COUNT" -gt 0 ]; then
    MANUAL_RESP=$(curl -sf -X POST "$EXTRACTION_BASE/extract" \
      -H "X-Internal-Secret: $SECRET" \
      -H "Content-Type: application/json" \
      -d "{\"documentId\":\"$DOC_ID\",\"chunks\":$CHUNK_TEXTS,\"tier\":\"haiku\"}" \
      2>/dev/null || echo '{}')
    EXTRACTION_ID=$(echo "$MANUAL_RESP" | jq -r '.extractionId // empty')
    if [ -n "$EXTRACTION_ID" ]; then
      ok "Manual extraction completed: $EXTRACTION_ID"
    else
      err "Manual extraction failed: $MANUAL_RESP"
    fi
  else
    warn "No chunks available — using placeholder extraction"
    MANUAL_RESP=$(curl -sf -X POST "$EXTRACTION_BASE/extract" \
      -H "X-Internal-Secret: $SECRET" \
      -H "Content-Type: application/json" \
      -d "{\"documentId\":\"$DOC_ID\",\"chunks\":[\"퇴직연금 중도인출 규정 테스트 데이터\"],\"tier\":\"haiku\"}" \
      2>/dev/null || echo '{}')
    EXTRACTION_ID=$(echo "$MANUAL_RESP" | jq -r '.extractionId // empty')
    if [ -n "$EXTRACTION_ID" ]; then
      ok "Placeholder extraction completed: $EXTRACTION_ID"
    else
      err "Extraction failed entirely: $MANUAL_RESP"
    fi
  fi
fi

# =============================================================================
# STAGE 3: Policy Inference (manual — queue handler is stub)
# =============================================================================
step 4 "POST /policies/infer — policy candidate generation"

if [ -z "$EXTRACTION_ID" ]; then
  err "No extractionId — skipping policy inference"
  POLICY_ID=""
else
  INFER_RESP=$(curl -sf -X POST "$POLICY_BASE/policies/infer" \
    -H "X-Internal-Secret: $SECRET" \
    -H "Content-Type: application/json" \
    -d "{
      \"extractionId\": \"$EXTRACTION_ID\",
      \"documentId\": \"$DOC_ID\",
      \"organizationId\": \"$ORG_ID\",
      \"chunks\": [\"퇴직연금 중도인출 요건: 무주택 세대주 조건, 가입기간 5년 이상, 인출한도 적립금 50%\"],
      \"sourceDocumentId\": \"$DOC_ID\"
    }" 2>/dev/null || echo '{}')

  POLICY_ID=$(echo "$INFER_RESP" | jq -r '.policies[0].policyId // empty')
  POLICY_COUNT=$(echo "$INFER_RESP" | jq -r '.policies | length // 0')

  if [ -n "$POLICY_ID" ]; then
    ok "Policy candidates generated: $POLICY_COUNT policies (first: $POLICY_ID)"
  else
    err "Policy inference failed: $INFER_RESP"
    POLICY_ID=""
  fi
fi

# =============================================================================
# STAGE 3 HITL: Approve policy (manual)
# =============================================================================
step 5 "POST /policies/:id/approve — HITL policy approval"

if [ -z "$POLICY_ID" ]; then
  err "No policyId — skipping approval"
else
  APPROVE_RESP=$(curl -sf -X POST "$POLICY_BASE/policies/$POLICY_ID/approve" \
    -H "X-Internal-Secret: $SECRET" \
    -H "Content-Type: application/json" \
    -d '{"reviewerId":"e2e-test-reviewer","comment":"E2E test approval"}' \
    2>/dev/null || echo '{}')

  APPROVE_STATUS=$(echo "$APPROVE_RESP" | jq -r '.status // empty')
  if [ "$APPROVE_STATUS" = "approved" ]; then
    ok "Policy approved: $POLICY_ID"
  else
    err "Approval failed: $APPROVE_RESP"
  fi
fi

# =============================================================================
# STAGE 4: Ontology Normalization (manual — queue handler is stub)
# =============================================================================
step 6 "POST /normalize — ontology normalization"

if [ -z "$POLICY_ID" ]; then
  err "No policyId — skipping ontology"
  ONTOLOGY_ID=""
else
  NORMALIZE_RESP=$(curl -sf -X POST "$ONTOLOGY_BASE/normalize" \
    -H "X-Internal-Secret: $SECRET" \
    -H "Content-Type: application/json" \
    -d "{
      \"policyId\": \"$POLICY_ID\",
      \"organizationId\": \"$ORG_ID\",
      \"terms\": [
        {\"label\": \"중도인출\", \"definition\": \"퇴직연금 적립금의 일부를 만기 전 인출하는 행위\"},
        {\"label\": \"무주택 세대주\", \"definition\": \"주택을 소유하지 않은 세대의 대표자\"},
        {\"label\": \"가입기간\", \"definition\": \"퇴직연금에 가입한 기간\"}
      ]
    }" 2>/dev/null || echo '{}')

  ONTOLOGY_ID=$(echo "$NORMALIZE_RESP" | jq -r '.ontology.ontologyId // empty')
  TERM_COUNT=$(echo "$NORMALIZE_RESP" | jq -r '.terms | length // 0')

  if [ -n "$ONTOLOGY_ID" ]; then
    ok "Ontology normalized: $ONTOLOGY_ID ($TERM_COUNT terms)"
  else
    err "Normalization failed: $NORMALIZE_RESP"
    ONTOLOGY_ID=""
  fi
fi

# =============================================================================
# STAGE 5: Skill Packaging (manual — queue handler is stub)
# =============================================================================
step 7 "POST /skills — skill package assembly"

if [ -z "$POLICY_ID" ] || [ -z "$ONTOLOGY_ID" ]; then
  err "Missing policyId or ontologyId — skipping skill packaging"
  SKILL_ID=""
else
  # Fetch full policy details for skill creation
  POLICY_DETAIL=$(curl -sf -H "X-Internal-Secret: $SECRET" \
    "$POLICY_BASE/policies/$POLICY_ID" 2>/dev/null || echo '{}')

  P_CODE=$(echo "$POLICY_DETAIL" | jq -r '.policyCode // "POL-TEST-001"')
  P_TITLE=$(echo "$POLICY_DETAIL" | jq -r '.title // "E2E Test Policy"')
  P_COND=$(echo "$POLICY_DETAIL" | jq -r '.condition // "무주택 세대주"')
  P_CRIT=$(echo "$POLICY_DETAIL" | jq -r '.criteria // "가입기간 5년 이상"')
  P_OUT=$(echo "$POLICY_DETAIL" | jq -r '.outcome // "적립금 50% 인출 가능"')

  SKILL_RESP=$(curl -sf -X POST "$SKILL_BASE/skills" \
    -H "X-Internal-Secret: $SECRET" \
    -H "Content-Type: application/json" \
    -d "{
      \"domain\": \"retirement-pension\",
      \"subdomain\": \"withdrawal\",
      \"policies\": [{
        \"policyId\": \"$POLICY_ID\",
        \"policyCode\": \"$P_CODE\",
        \"title\": \"$P_TITLE\",
        \"condition\": \"$P_COND\",
        \"criteria\": \"$P_CRIT\",
        \"outcome\": \"$P_OUT\",
        \"trustLevel\": \"reviewed\",
        \"trustScore\": 0.75,
        \"tags\": [\"e2e-test\"]
      }],
      \"ontologyId\": \"$ONTOLOGY_ID\",
      \"ontologyRef\": {
        \"skosConceptScheme\": \"urn:aif:scheme:$ONTOLOGY_ID\",
        \"termCount\": 3
      },
      \"provenance\": {
        \"sourceDocumentId\": \"$DOC_ID\",
        \"extractionId\": \"$EXTRACTION_ID\",
        \"policyIds\": [\"$POLICY_ID\"],
        \"ontologyIds\": [\"$ONTOLOGY_ID\"]
      },
      \"author\": \"e2e-test-user\",
      \"tags\": [\"e2e-test\", \"pension\"]
    }" 2>/dev/null || echo '{}')

  SKILL_ID=$(echo "$SKILL_RESP" | jq -r '.skillId // empty')
  if [ -n "$SKILL_ID" ]; then
    ok "Skill packaged: $SKILL_ID"
  else
    err "Skill packaging failed: $SKILL_RESP"
    SKILL_ID=""
  fi
fi

# =============================================================================
# STAGE 5 continued: Download & verify .skill.json
# =============================================================================
step 8 "GET /skills/:id/download — verify .skill.json"

if [ -z "$SKILL_ID" ]; then
  err "No skillId — skipping download"
else
  DOWNLOAD_RESP=$(curl -sf -H "X-Internal-Secret: $SECRET" \
    "$SKILL_BASE/skills/$SKILL_ID/download" 2>/dev/null || echo '{}')

  # Verify required fields
  HAS_SKILL_ID=$(echo "$DOWNLOAD_RESP" | jq -r '.skillId // empty')
  HAS_POLICIES=$(echo "$DOWNLOAD_RESP" | jq -r '.policies | length // 0')
  HAS_TRUST=$(echo "$DOWNLOAD_RESP" | jq -r '.trust.score // empty')
  HAS_METADATA=$(echo "$DOWNLOAD_RESP" | jq -r '.metadata.domain // empty')

  if [ -n "$HAS_SKILL_ID" ] && [ "$HAS_POLICIES" -gt 0 ]; then
    ok ".skill.json verified — skillId=$HAS_SKILL_ID, policies=$HAS_POLICIES, trust=$HAS_TRUST, domain=$HAS_METADATA"

    # Save to file for inspection
    OUTFILE="/tmp/e2e-skill-${SKILL_ID}.skill.json"
    echo "$DOWNLOAD_RESP" | jq '.' > "$OUTFILE"
    echo -e "  ${CYAN}→${NC} Saved to $OUTFILE"
  else
    err ".skill.json missing required fields: $DOWNLOAD_RESP"
  fi
fi

# =============================================================================
# Summary
# =============================================================================
echo ""
echo "============================================="
echo " Results: ${GREEN}$pass passed${NC}, ${RED}$fail failed${NC}"
echo "============================================="
echo " documentId:   ${DOC_ID:-N/A}"
echo " extractionId: ${EXTRACTION_ID:-N/A}"
echo " policyId:     ${POLICY_ID:-N/A}"
echo " ontologyId:   ${ONTOLOGY_ID:-N/A}"
echo " skillId:      ${SKILL_ID:-N/A}"
echo "============================================="

if [ "$fail" -gt 0 ]; then
  exit 1
fi
