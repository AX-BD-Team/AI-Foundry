#!/usr/bin/env bash
# LPON 308건 candidate policies 벌크 승인 스크립트
# Usage: INTERNAL_API_SECRET=xxx bash scripts/bulk-approve-lpon.sh

set -euo pipefail

API_BASE="${API_BASE:-https://svc-policy.ktds-axbd.workers.dev}"
SECRET="${INTERNAL_API_SECRET:?INTERNAL_API_SECRET 환경변수를 설정하세요}"
REVIEWER_ID="${REVIEWER_ID:-system-bulk-approve}"
COMMENT="LPON 파일럿 벌크 승인 — 세션 134"
CHUNK_SIZE=50

# Policy IDs (308건)
POLICY_IDS_FILE=$(mktemp)
cat > "$POLICY_IDS_FILE" << 'IDS'
PLACEHOLDER
IDS

echo "=== LPON Bulk Approve ==="
echo "API: $API_BASE"
echo "Reviewer: $REVIEWER_ID"

TOTAL=0
APPROVED=0
FAILED=0

# Read IDs into array
mapfile -t ALL_IDS < "$POLICY_IDS_FILE"
TOTAL=${#ALL_IDS[@]}
echo "Total policies: $TOTAL"
echo ""

# Process in chunks
for ((i=0; i<TOTAL; i+=CHUNK_SIZE)); do
  CHUNK=("${ALL_IDS[@]:i:CHUNK_SIZE}")
  CHUNK_NUM=$(( i/CHUNK_SIZE + 1 ))
  CHUNK_TOTAL=$(( (TOTAL + CHUNK_SIZE - 1) / CHUNK_SIZE ))
  
  # Build JSON array
  JSON_ARRAY=$(printf '"%s",' "${CHUNK[@]}")
  JSON_ARRAY="[${JSON_ARRAY%,}]"
  
  BODY=$(printf '{"policyIds":%s,"reviewerId":"%s","comment":"%s"}' "$JSON_ARRAY" "$REVIEWER_ID" "$COMMENT")
  
  echo "Batch $CHUNK_NUM/$CHUNK_TOTAL (${#CHUNK[@]} policies)..."
  
  RESPONSE=$(curl -s -w "\n%{http_code}" \
    -X POST "$API_BASE/policies/bulk-approve" \
    -H "Content-Type: application/json" \
    -H "X-Internal-Secret: $SECRET" \
    -H "X-Organization-Id: LPON" \
    -H "X-User-Role: Reviewer" \
    -H "X-User-Id: $REVIEWER_ID" \
    -d "$BODY" \
    --max-time 120)
  
  HTTP_CODE=$(echo "$RESPONSE" | tail -1)
  BODY_RESP=$(echo "$RESPONSE" | sed '$d')
  
  if [ "$HTTP_CODE" = "200" ]; then
    BATCH_APPROVED=$(echo "$BODY_RESP" | grep -o '"approved":\[' | wc -l)
    echo "  ✅ HTTP $HTTP_CODE — $BODY_RESP" | head -c 200
    echo ""
  else
    echo "  ❌ HTTP $HTTP_CODE — $BODY_RESP" | head -c 300
    echo ""
    FAILED=$((FAILED + ${#CHUNK[@]}))
  fi
  
  # Rate limit: 2초 대기
  sleep 2
done

rm -f "$POLICY_IDS_FILE"
echo ""
echo "=== Done ==="
