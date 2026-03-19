#!/bin/bash
# ─────────────────────────────────────────────────────────────────────
# MCP E2E Test Script — AI Foundry Skill MCP Server
#
# Validates the full MCP lifecycle:
#   1. Health check
#   2. Skill discovery (via svc-skill API)
#   3. MCP adapter projection (svc-skill /skills/:id/mcp)
#   4. MCP Initialize (JSON-RPC)
#   5. MCP tools/list (JSON-RPC)
#   6. MCP tools/call — evaluate_policy (JSON-RPC)
#
# Usage:
#   INTERNAL_API_SECRET=xxx ./scripts/test-mcp-e2e.sh [staging|production] [skill_id] [org_id]
#
# Dependencies: curl, jq
# ─────────────────────────────────────────────────────────────────────

set -euo pipefail

ENV="${1:-staging}"
SKILL_ID="${2:-}"
ORG_ID="${3:-LPON}"

# ── Endpoint resolution ────────────────────────────────────────────

if [ "$ENV" = "production" ]; then
  MCP_BASE="https://svc-mcp-server-production.ktds-axbd.workers.dev"
  SKILL_BASE="https://svc-skill-production.ktds-axbd.workers.dev"
else
  MCP_BASE="https://svc-mcp-server.ktds-axbd.workers.dev"
  SKILL_BASE="https://svc-skill.ktds-axbd.workers.dev"
fi

# ── Auth ────────────────────────────────────────────────────────────

SECRET="${INTERNAL_API_SECRET:-}"
if [ -z "$SECRET" ]; then
  echo "ERROR: INTERNAL_API_SECRET 환경변수를 설정하세요"
  echo "  export INTERNAL_API_SECRET=<your-secret>"
  exit 1
fi

PASS=0
FAIL=0
SKIP=0

pass() { echo "  ✅ PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  ❌ FAIL: $1 — $2"; FAIL=$((FAIL + 1)); }
skip() { echo "  ⏭️  SKIP: $1 — $2"; SKIP=$((SKIP + 1)); }

echo "═══════════════════════════════════════════════════════════════"
echo "  MCP E2E Test — env=$ENV, org=$ORG_ID"
echo "  MCP:   $MCP_BASE"
echo "  Skill: $SKILL_BASE"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# ── Step 1: Health Check ────────────────────────────────────────────

echo "── Step 1: Health Check ──────────────────────────────────────"

HEALTH=$(curl -sf "$MCP_BASE/health" 2>/dev/null || echo '{"status":"error"}')
HEALTH_STATUS=$(echo "$HEALTH" | jq -r '.status // "error"')

if [ "$HEALTH_STATUS" = "ok" ]; then
  pass "MCP server health check"
else
  fail "MCP server health check" "status=$HEALTH_STATUS"
fi

echo "  Response: $HEALTH"
echo ""

# ── Step 2: Skill Discovery ────────────────────────────────────────

echo "── Step 2: Skill Discovery ───────────────────────────────────"

if [ -z "$SKILL_ID" ]; then
  SKILLS_RESP=$(curl -sf "$SKILL_BASE/skills?limit=5&status=published" \
    -H "X-Internal-Secret: $SECRET" \
    -H "X-Organization-Id: $ORG_ID" 2>/dev/null || echo '{}')

  SKILL_COUNT=$(echo "$SKILLS_RESP" | jq -r '.data.skills | length // 0')

  if [ "$SKILL_COUNT" -gt 0 ]; then
    SKILL_ID=$(echo "$SKILLS_RESP" | jq -r '.data.skills[0].skillId // empty')
    SKILL_DOMAIN=$(echo "$SKILLS_RESP" | jq -r '.data.skills[0].domain // "unknown"')
    SKILL_POLICY_COUNT=$(echo "$SKILLS_RESP" | jq -r '.data.skills[0].policyCount // 0')
    pass "Found $SKILL_COUNT skill(s) — using: $SKILL_ID (domain=$SKILL_DOMAIN, policies=$SKILL_POLICY_COUNT)"
  else
    fail "No skills found" "svc-skill returned 0 skills"
    echo "  Full response: $SKILLS_RESP"
    echo ""
    echo "═══════════════════════════════════════════════════════════════"
    echo "  Results: $PASS passed, $FAIL failed, $SKIP skipped"
    echo "═══════════════════════════════════════════════════════════════"
    exit 1
  fi
else
  pass "Using provided skill ID: $SKILL_ID"
fi

echo ""

# ── Step 3: MCP Adapter Projection ─────────────────────────────────

echo "── Step 3: MCP Adapter Projection (svc-skill) ────────────────"

MCP_ADAPTER=$(curl -sf "$SKILL_BASE/skills/$SKILL_ID/mcp" \
  -H "X-Internal-Secret: $SECRET" \
  -H "X-Organization-Id: $ORG_ID" 2>/dev/null || echo '{}')

ADAPTER_SERVER_NAME=$(echo "$MCP_ADAPTER" | jq -r '.serverInfo.name // empty')
ADAPTER_TOOL_COUNT=$(echo "$MCP_ADAPTER" | jq -r '.tools | length // 0')

if [ -n "$ADAPTER_SERVER_NAME" ] && [ "$ADAPTER_TOOL_COUNT" -gt 0 ]; then
  pass "MCP adapter: server=$ADAPTER_SERVER_NAME, tools=$ADAPTER_TOOL_COUNT"
  # Show first 3 tool names
  echo "  Tools (first 3):"
  echo "$MCP_ADAPTER" | jq -r '.tools[:3][] | "    - \(.name): \(.description[:60])..."'
else
  fail "MCP adapter projection" "serverName=$ADAPTER_SERVER_NAME, toolCount=$ADAPTER_TOOL_COUNT"
  echo "  Full response: $(echo "$MCP_ADAPTER" | jq -c . 2>/dev/null || echo "$MCP_ADAPTER")"
fi

echo ""

# ── Step 4: MCP Initialize (JSON-RPC) ──────────────────────────────

echo "── Step 4: MCP Initialize (JSON-RPC) ─────────────────────────"

INIT_RESP=$(curl -sf -X POST "$MCP_BASE/mcp/$SKILL_ID" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer $SECRET" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": {"name": "e2e-test-client", "version": "1.0.0"}
    }
  }' 2>/dev/null || echo '{"error":"connection failed"}')

INIT_PROTO=$(echo "$INIT_RESP" | jq -r '.result.protocolVersion // empty')
INIT_SERVER=$(echo "$INIT_RESP" | jq -r '.result.serverInfo.name // empty')
INIT_ERROR=$(echo "$INIT_RESP" | jq -r '.error.message // empty')

if [ -n "$INIT_PROTO" ] && [ -n "$INIT_SERVER" ]; then
  pass "MCP initialize: protocol=$INIT_PROTO, server=$INIT_SERVER"
elif [ -n "$INIT_ERROR" ]; then
  fail "MCP initialize" "$INIT_ERROR"
else
  fail "MCP initialize" "unexpected response"
  echo "  Response: $(echo "$INIT_RESP" | jq -c . 2>/dev/null || echo "$INIT_RESP")"
fi

echo ""

# ── Step 5: MCP tools/list (JSON-RPC) ──────────────────────────────

echo "── Step 5: MCP tools/list (JSON-RPC) ─────────────────────────"

TOOLS_RESP=$(curl -sf -X POST "$MCP_BASE/mcp/$SKILL_ID" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer $SECRET" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/list",
    "params": {}
  }' 2>/dev/null || echo '{"error":"connection failed"}')

TOOLS_COUNT=$(echo "$TOOLS_RESP" | jq -r '.result.tools | length // 0')
TOOLS_ERROR=$(echo "$TOOLS_RESP" | jq -r '.error.message // empty')

if [ "$TOOLS_COUNT" -gt 0 ]; then
  pass "MCP tools/list: $TOOLS_COUNT tool(s) registered"
  # Show first 3 tool names
  echo "  Tools (first 3):"
  echo "$TOOLS_RESP" | jq -r '.result.tools[:3][] | "    - \(.name)"'
elif [ -n "$TOOLS_ERROR" ]; then
  fail "MCP tools/list" "$TOOLS_ERROR"
else
  fail "MCP tools/list" "no tools returned"
  echo "  Response: $(echo "$TOOLS_RESP" | jq -c . 2>/dev/null || echo "$TOOLS_RESP")"
fi

echo ""

# ── Step 6: MCP tools/call (JSON-RPC) ──────────────────────────────

echo "── Step 6: MCP tools/call (JSON-RPC) ─────────────────────────"

# Get first tool name from the adapter
FIRST_TOOL=$(echo "$MCP_ADAPTER" | jq -r '.tools[0].name // empty')

if [ -z "$FIRST_TOOL" ]; then
  skip "MCP tools/call" "no tool available to call"
else
  echo "  Calling tool: $FIRST_TOOL"
  echo "  Context: 온누리상품권 가맹점 등록 절차에 대해 알려주세요"

  CALL_RESP=$(curl -sf -X POST "$MCP_BASE/mcp/$SKILL_ID" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -H "Authorization: Bearer $SECRET" \
    --max-time 60 \
    -d "$(jq -n --arg tool "$FIRST_TOOL" '{
      "jsonrpc": "2.0",
      "id": 3,
      "method": "tools/call",
      "params": {
        "name": $tool,
        "arguments": {
          "context": "온누리상품권 가맹점 등록 절차에 대해 알려주세요"
        }
      }
    }')" 2>/dev/null || echo '{"error":"timeout or connection failed"}')

  CALL_TEXT=$(echo "$CALL_RESP" | jq -r '.result.content[0].text // empty')
  CALL_IS_ERROR=$(echo "$CALL_RESP" | jq -r '.result.isError // false')
  CALL_ERROR=$(echo "$CALL_RESP" | jq -r '.error.message // empty')

  if [ -n "$CALL_TEXT" ] && [ "$CALL_IS_ERROR" != "true" ]; then
    pass "MCP tools/call: got evaluation result"
    echo "  Result (first 200 chars):"
    echo "    $(echo "$CALL_TEXT" | head -c 200)..."
  elif [ -n "$CALL_ERROR" ]; then
    fail "MCP tools/call" "JSON-RPC error: $CALL_ERROR"
  elif [ "$CALL_IS_ERROR" = "true" ]; then
    fail "MCP tools/call" "tool returned isError=true: $(echo "$CALL_TEXT" | head -c 100)"
  else
    fail "MCP tools/call" "unexpected response"
    echo "  Response: $(echo "$CALL_RESP" | jq -c . 2>/dev/null || echo "$CALL_RESP")"
  fi
fi

echo ""

# ── Step 7: Auth rejection test ────────────────────────────────────

echo "── Step 7: Auth Rejection Test ───────────────────────────────"

AUTH_RESP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$MCP_BASE/mcp/$SKILL_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 99,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": {"name": "unauthorized", "version": "1.0.0"}
    }
  }' 2>/dev/null || echo "000")

if [ "$AUTH_RESP" = "401" ]; then
  pass "Unauthenticated request correctly rejected (401)"
else
  fail "Auth rejection" "expected 401, got $AUTH_RESP"
fi

echo ""

# ── Summary ─────────────────────────────────────────────────────────

echo "═══════════════════════════════════════════════════════════════"
echo "  Results: $PASS passed, $FAIL failed, $SKIP skipped"
echo "═══════════════════════════════════════════════════════════════"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
