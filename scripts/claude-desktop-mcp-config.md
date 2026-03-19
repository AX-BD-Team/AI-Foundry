# Claude Desktop — AI Foundry MCP Server 연결 가이드

## 개요

AI Foundry의 MCP Server (`svc-mcp-server`)는 **Streamable HTTP** 트랜스포트를 사용해요.
각 Skill이 독립적인 MCP 서버 엔드포인트(`/mcp/:skillId`)를 통해 제공되며,
Skill에 포함된 정책(Policy)들이 MCP Tool로 등록돼요.

## 아키텍처

```
Claude Desktop
  ↓ JSON-RPC 2.0 (Streamable HTTP)
svc-mcp-server (Cloudflare Worker)
  ↓ Service Binding
svc-skill
  ├─ GET  /skills/:id/mcp      → MCP tool definitions (projection)
  └─ POST /skills/:id/evaluate → Policy evaluation (LLM call)
```

## 사전 준비

1. **Skill ID 확인** — svc-skill API에서 사용할 Skill의 UUID를 확인해요:

```bash
# Staging
curl -s "https://svc-skill.ktds-axbd.workers.dev/skills?limit=10" \
  -H "X-Internal-Secret: $INTERNAL_API_SECRET" | jq '.data.skills[] | {skillId, domain, policyCount}'

# Production
curl -s "https://svc-skill-production.ktds-axbd.workers.dev/skills?limit=10" \
  -H "X-Internal-Secret: $INTERNAL_API_SECRET" | jq '.data.skills[] | {skillId, domain, policyCount}'
```

2. **인증 토큰** — `INTERNAL_API_SECRET` 값이 필요해요 (Bearer 토큰으로 사용)

## Claude Desktop 설정

### 설정 파일 위치
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

### 설정 예시

```json
{
  "mcpServers": {
    "ai-foundry-lpon": {
      "url": "https://svc-mcp-server.ktds-axbd.workers.dev/mcp/YOUR_SKILL_ID_HERE",
      "transport": "streamable-http",
      "headers": {
        "Authorization": "Bearer YOUR_INTERNAL_API_SECRET_HERE"
      }
    }
  }
}
```

### Production 환경

```json
{
  "mcpServers": {
    "ai-foundry-lpon-prod": {
      "url": "https://svc-mcp-server-production.ktds-axbd.workers.dev/mcp/YOUR_SKILL_ID_HERE",
      "transport": "streamable-http",
      "headers": {
        "Authorization": "Bearer YOUR_INTERNAL_API_SECRET_HERE"
      }
    }
  }
}
```

### 여러 Skill 동시 연결

각 Skill마다 별도의 MCP 서버 엔트리를 추가해요:

```json
{
  "mcpServers": {
    "ai-foundry-lpon": {
      "url": "https://svc-mcp-server.ktds-axbd.workers.dev/mcp/LPON_SKILL_ID",
      "transport": "streamable-http",
      "headers": {
        "Authorization": "Bearer YOUR_SECRET"
      }
    },
    "ai-foundry-pension": {
      "url": "https://svc-mcp-server.ktds-axbd.workers.dev/mcp/PENSION_SKILL_ID",
      "transport": "streamable-http",
      "headers": {
        "Authorization": "Bearer YOUR_SECRET"
      }
    }
  }
}
```

## 사용 가능한 MCP Tool

연결 후 Claude Desktop에서 사용할 수 있는 Tool들:

| Tool Name | 설명 |
|-----------|------|
| `pol-lpon-{type}-{seq}` | LPON 온누리상품권 정책 평가 |
| `pol-pension-{type}-{seq}` | 퇴직연금 정책 평가 |

각 Tool의 입력:
- `context` (필수): 평가할 상황 설명 (최대 10,000자)
- `parameters` (선택): 추가 파라미터 (JSON 문자열)

각 Tool의 출력:
- 정책 코드, 판정(APPLICABLE/NOT_APPLICABLE/PARTIAL), 신뢰도, 모델 정보, 근거

## E2E 테스트

설정 전에 E2E 테스트로 엔드포인트를 검증하세요:

```bash
# Staging
INTERNAL_API_SECRET=xxx ./scripts/test-mcp-e2e.sh staging

# Production
INTERNAL_API_SECRET=xxx ./scripts/test-mcp-e2e.sh production

# 특정 Skill 지정
INTERNAL_API_SECRET=xxx ./scripts/test-mcp-e2e.sh staging YOUR_SKILL_ID
```

## 트러블슈팅

### "Unauthorized" 에러
- `Authorization: Bearer <token>` 헤더가 올바른지 확인
- INTERNAL_API_SECRET 값이 환경(staging/production)에 맞는지 확인

### "Skill not found" 에러
- Skill ID가 정확한지 확인 (`/skills` API로 재확인)
- 해당 환경에 Skill이 배포되어 있는지 확인

### Tool 호출 시 timeout
- Cloudflare Workers 30s timeout 제한
- 복잡한 정책 평가는 LLM 응답 시간에 따라 지연될 수 있음
- Production에서 AI Gateway 캐시가 활성화되면 두 번째 호출부터 빨라짐

### CORS 관련 에러
- 브라우저에서 직접 호출 시 CORS는 자동 처리됨 (`Access-Control-Allow-Origin: *`)
- Claude Desktop은 CORS 제한 없이 직접 HTTP 호출
