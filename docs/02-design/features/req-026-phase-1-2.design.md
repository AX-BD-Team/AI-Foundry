---
code: AIF-DSGN-026B
title: "Foundry-X MCP 통합 Phase 1-2 — 상세 설계"
version: "1.0"
status: Active
category: DSGN
created: 2026-03-19
updated: 2026-03-19
author: Sinclair Seo
feature: req-026-phase-1-2
refs: "[[AIF-PLAN-026B]] [[AIF-RPRT-028]]"
---

# Foundry-X MCP 통합 Phase 1-2 — 상세 설계

> **Plan**: [[AIF-PLAN-026B]]
> **REQ**: AIF-REQ-026 (P1, IN_PROGRESS)

---

## 0. 설계 근거 (Key Design Rationale)

### Skill당 1서버 → Org당 1서버 전환

현재 `POST /mcp/:skillId` 방식은 **12개 bundled skills × org 수**만큼 Foundry-X McpServerRegistry에 개별 등록해야 한다. 2-org(LPON + Miraeasset) 기준 24건, 향후 org 추가 시 선형 증가. `POST /mcp/org/:orgId`로 전환하면 **org당 1개** 등록으로 전체 848개 도구에 접근 가능하여 관리 복잡도가 O(N)→O(1)로 감소한다.

기존 `/mcp/:skillId` 엔드포인트는 **삭제하지 않고 유지** — 개별 skill MCP 접근이 필요한 Claude Desktop 등 기존 사용처와의 하위 호환성 보장.

### R2 gap의 근본 원인과 해결

`wrangler r2 object put`은 기본적으로 로컬 miniflare에 저장한다 (`--remote` 플래그 없으면). D1은 `--env production`으로 원격 DB에 접근하지만, R2는 **`--remote`** 플래그가 별도로 필요하다는 비대칭적 인터페이스가 버그의 근본 원인이었다. 이미 커밋 84d31d0에서 `rebundle-production.ts`에 `--remote` 플래그를 추가하여 수정 완료. 그러나 수정 전에 생성된 기존 12개 bundled skills는 R2에 파일이 없으므로 **재업로드가 필요**하다.

---

## 1. 설계 범위

4개 Task를 구현 순서대로 설계한다.

| Task | 변경 대상 | 유형 |
|------|-----------|------|
| T1 | `scripts/upload-bundled-r2.ts` | 신규 스크립트 |
| T2-A | `services/svc-skill/src/routes/mcp.ts` | 기존 확장 |
| T2-B | `services/svc-skill/src/index.ts` | 라우트 추가 |
| T2-C | `services/svc-mcp-server/src/index.ts` | 라우트 추가 |
| T3 | Foundry-X API 호출 (curl) | 운영 작업 |
| T4 | E2E 검증 (curl) | 운영 작업 |

---

## 2. Task 1: Bundled Skills R2 재업로드

### 2.1 스크립트 설계

**파일**: `scripts/upload-bundled-r2.ts`

```typescript
// Input: CF_TOKEN 환경변수, orgId 인자
// Process:
//   1. D1 remote에서 bundled skills 조회
//   2. 각 skill의 r2_key에서 .skill.json 내용을 D1에서 복원하거나
//      rebundle-production.ts의 로직을 재실행하여 R2 업로드
//   3. 업로드 후 검증 (R2 HEAD 요청)

// 단계:
// Step 1: D1 쿼리 — SELECT skill_id, r2_key FROM skills WHERE status='bundled' AND organization_id=?
// Step 2: 각 skill의 .skill.json을 svc-skill production API에서 다운로드
//         GET /skills/:id/download (X-Internal-Secret 헤더)
// Step 3: wrangler r2 object put --remote 으로 R2에 업로드
// Step 4: KV 캐시 무효화 (wrangler kv:key delete)
```

**핵심 결정**: bundled skill의 .skill.json 내용 소스
- 옵션 A: rebundle 재실행 → 시간 소요 (LLM 재호출)
- **옵션 B (채택)**: `scripts/rebundle-production.ts`가 이미 D1에 skill 메타데이터와 R2에 업로드하는 로직을 포함. 84d31d0 fix 이후 `--remote` 플래그 적용됨. **rebundle을 재실행**하면 분류 결과가 `policy_classifications` 테이블에 캐시되어 있으므로 LLM 재호출 없이 bundler 단계만 실행 가능
- **옵션 C (최종 채택)**: svc-skill production API에서 skill 다운로드 시도 → 실패(R2 없음)이므로, rebundle-production.ts의 `storeBundledSkill()` 로직만 추출하여 별도 업로드 스크립트 작성

**실제 접근**: rebundle-production.ts 재실행이 가장 단순. 이미 `--remote` 수정 완료.

### 2.2 KV 캐시 무효화

bundled skills 12개의 KV 캐시 키를 삭제:
```bash
# production KV namespace: 916333bc...
for SKILL_ID in $(wrangler d1 execute db-skill --remote --env production \
  --command "SELECT skill_id FROM skills WHERE status='bundled' AND organization_id='LPON'" \
  --json | jq -r '.[0].results[].skill_id'); do
  wrangler kv:key delete "mcp-adapter:${SKILL_ID}" \
    --namespace-id 916333bc... --remote
done
```

### 2.3 검증

```bash
# bundled skill 1개의 MCP adapter 200 확인
SKILL_ID=$(wrangler d1 execute db-skill --remote --env production \
  --command "SELECT skill_id FROM skills WHERE status='bundled' AND organization_id='LPON' LIMIT 1" \
  --json | jq -r '.[0].results[0].skill_id')

curl -s -o /dev/null -w "%{http_code}" \
  -H "X-Internal-Secret: ${SECRET}" \
  "https://svc-skill-production.ktds-axbd.workers.dev/skills/${SKILL_ID}/mcp"
# Expected: 200
```

---

## 3. Task 2-A: Org 단위 MCP Adapter (svc-skill)

### 3.1 신규 핸들러

**파일**: `services/svc-skill/src/routes/mcp.ts` (기존 파일에 추가)

```typescript
// GET /skills/org/:orgId/mcp — org 전체 bundled skills MCP adapter 합산
export async function handleGetOrgMcpAdapter(
  request: Request,
  env: Env,
  orgId: string,
  ctx: ExecutionContext,
): Promise<Response>
```

**로직**:

1. **KV 캐시 확인**: `mcp-org-adapter:{orgId}` 키 조회 (TTL 1h)
2. **D1 쿼리**: `SELECT skill_id, r2_key, domain, subdomain FROM skills WHERE organization_id = ? AND status = 'bundled'`
3. **R2 병렬 fetch**: 각 skill의 `.skill.json`을 R2에서 읽기 (`Promise.all`)
4. **도구 합산**: 모든 skill의 policies를 하나의 tools[] 배열로 합산
5. **policyCode→skillId 매핑 테이블** 구축 (tools/call 라우팅용)
6. **KV 캐시 저장**: 합산 결과 + 매핑 테이블을 `mcp-org-adapter:{orgId}` 키에 저장

**반환 형태**:
```typescript
interface OrgMcpAdapter {
  serverInfo: { name: string; version: string };  // "ai-foundry-{orgId}"
  instructions: string;  // "{orgId} organization — {N} skills, {M} policy tools"
  tools: McpTool[];  // 전체 합산
  metadata: {
    organizationId: string;
    skillCount: number;
    totalTools: number;
    generatedAt: string;
  };
  // 내부 전용 — MCP 서버에서 tools/call 라우팅에 사용
  _toolSkillMap: Record<string, string>;  // toolName → skillId
}
```

### 3.2 기존 코드 재사용

- `toMcpAdapter(pkg)` 함수를 재사용하여 각 skill의 도구를 변환
- 합산 시 도구 이름 중복 체크 (동일 policyCode가 다른 skill에 존재할 수 없음 — bundling이 category별 분리를 보장)

### 3.3 성능 고려

- 12개 R2 fetch를 `Promise.all`로 병렬 처리 → ~200ms
- KV 캐시 1h TTL로 반복 요청 최소화
- 합산 결과 JSON 크기: ~200KB (848 tools)
- KV value 최대 크기 25MB → 충분

---

## 4. Task 2-B: 라우트 등록 (svc-skill)

**파일**: `services/svc-skill/src/index.ts`

기존 `skillMatch` 라우터 **앞에** org 라우트를 추가:

```typescript
// GET /skills/org/:orgId/mcp — org-level MCP adapter
const orgMcpMatch = path.match(/^\/skills\/org\/([^/]+)\/mcp$/);
if (method === "GET" && orgMcpMatch) {
  const orgId = orgMcpMatch[1];
  if (!orgId) return new Response("Not Found", { status: 404 });
  // RBAC: skill:download
  const rbacCtx = extractRbacContext(request);
  if (rbacCtx) {
    const denied = await checkPermission(env, rbacCtx.role, "skill", "download");
    if (denied) return denied;
    ctx.waitUntil(logAudit(env, {
      userId: rbacCtx.userId,
      organizationId: rbacCtx.organizationId,
      action: "download",
      resource: "skill",
      details: { adapter_type: "mcp-org", orgId },
    }));
  }
  return await handleGetOrgMcpAdapter(request, env, orgId, ctx);
}
```

**위치**: `POST /admin/rebundle` 블록과 `POST /skills` 블록 사이 (admin 라우트 다음, CRUD 라우트 전)

---

## 5. Task 2-C: Org MCP 엔드포인트 (svc-mcp-server)

### 5.1 라우트 추가

**파일**: `services/svc-mcp-server/src/index.ts`

```typescript
// POST /mcp/org/:orgId — org-level MCP server
const orgMcpMatch = path.match(/^\/mcp\/org\/([^/]+)$/);
```

### 5.2 Org MCP 서버 팩토리

```typescript
async function fetchOrgMcpAdapter(
  env: Env,
  orgId: string,
): Promise<OrgMcpAdapterResponse | null> {
  const res = await env.SVC_SKILL.fetch(
    `https://svc-skill.internal/skills/org/${orgId}/mcp`,
    { headers: { "X-Internal-Secret": env.INTERNAL_API_SECRET } },
  );
  if (!res.ok) return null;
  return (await res.json()) as OrgMcpAdapterResponse;
}

function createOrgMcpServer(
  adapter: OrgMcpAdapterResponse,
  orgId: string,
  env: Env,
): McpServer {
  const server = new McpServer({
    name: adapter.serverInfo.name,
    version: adapter.serverInfo.version,
  });

  for (const tool of adapter.tools) {
    server.tool(
      tool.name,
      tool.description,
      {
        context: z.string().min(1).max(10_000).describe("적용 대상의 상황 설명"),
        parameters: z.string().optional().describe("추가 파라미터 (JSON 문자열)"),
      },
      async ({ context, parameters }) => {
        const policyCode = tool.name.toUpperCase();
        // _toolSkillMap에서 해당 policy의 skillId 역매핑
        const skillId = adapter._toolSkillMap[tool.name];
        if (!skillId) {
          return {
            content: [{ type: "text" as const, text: `Error: Unknown tool ${tool.name}` }],
            isError: true,
          };
        }

        // 기존 evaluatePolicy() 재사용
        let parsedParams: Record<string, unknown> | undefined;
        if (parameters) {
          try { parsedParams = JSON.parse(parameters) as Record<string, unknown>; }
          catch { return { content: [{ type: "text" as const, text: "Error: invalid JSON" }], isError: true }; }
        }

        const result = await evaluatePolicy(env, skillId, policyCode, context, parsedParams);
        // ... 기존 결과 포맷팅 재사용
      },
    );
  }

  return server;
}
```

### 5.3 핵심 설계 포인트: _toolSkillMap 전달

**문제**: svc-mcp-server가 tools/call 시 어떤 skillId로 evaluate를 호출할지 알아야 함
**해결**: svc-skill의 org MCP adapter 응답에 `_toolSkillMap` 필드 포함 (toolName → skillId 매핑)

이 필드는 MCP 클라이언트에는 노출되지 않고, svc-mcp-server 내부에서만 사용:
- `McpServer.tool()` 콜백에서 `adapter._toolSkillMap[tool.name]`으로 skillId 조회
- tools/list에는 표준 MCP tool 스키마만 반환

### 5.4 라우트 처리 흐름

```
POST /mcp/org/:orgId
  ├─ Auth check (Bearer or X-Internal-Secret)
  ├─ Rate limit check
  ├─ fetchOrgMcpAdapter(env, orgId)
  │    └─ svc-skill GET /skills/org/:orgId/mcp
  ├─ createOrgMcpServer(adapter, orgId, env)
  │    └─ 848개 tool 등록 (policy 1:1)
  ├─ WebStandardStreamableHTTPServerTransport
  └─ transport.handleRequest(request)
```

---

## 6. 테스트 설계

### 6.1 svc-skill 테스트

**파일**: `services/svc-skill/tests/mcp.test.ts` (기존 확장)

| # | 테스트 | 검증 |
|---|--------|------|
| 1 | `handleGetOrgMcpAdapter` — bundled skills 2개 → 도구 합산 | tools.length === skill1.policies.length + skill2.policies.length |
| 2 | `handleGetOrgMcpAdapter` — KV 캐시 HIT | X-Cache: HIT 헤더 |
| 3 | `handleGetOrgMcpAdapter` — bundled skills 없는 org | 빈 tools[] + 200 |
| 4 | `_toolSkillMap` 정확성 | 각 tool name → 올바른 skillId 매핑 |
| 5 | 도구 이름 중복 없음 | Set(tools.map(t => t.name)).size === tools.length |

### 6.2 svc-mcp-server 테스트

**파일**: `services/svc-mcp-server/tests/org-mcp.test.ts` (신규)

| # | 테스트 | 검증 |
|---|--------|------|
| 1 | `POST /mcp/org/LPON` initialize | serverInfo.name === "ai-foundry-lpon" |
| 2 | `POST /mcp/org/LPON` tools/list | tools[] 합산 개수 정확 |
| 3 | `POST /mcp/org/LPON` tools/call | evaluatePolicy 호출 + 결과 반환 |
| 4 | 인증 없이 접근 | 401 반환 |
| 5 | 존재하지 않는 org | 빈 도구 목록 또는 적절한 에러 |

---

## 7. 배포 순서

```
1. scripts/rebundle-production.ts 재실행 (R2 업로드)
   └─ KV 캐시 무효화
   └─ 검증: curl /skills/:id/mcp → 200

2. svc-skill 코드 변경 + 테스트
   └─ handleGetOrgMcpAdapter 구현
   └─ index.ts 라우트 등록
   └─ bun run test (svc-skill)

3. svc-mcp-server 코드 변경 + 테스트
   └─ /mcp/org/:orgId 라우트 구현
   └─ bun run test (svc-mcp-server)

4. typecheck + lint
   └─ bun run typecheck && bun run lint

5. 배포
   └─ cd services/svc-skill && wrangler deploy --env production
   └─ cd services/svc-mcp-server && wrangler deploy --env production

6. Foundry-X 등록 + E2E 검증
   └─ curl POST /mcp-servers (Foundry-X)
   └─ curl POST /mcp/org/LPON (tools/list + tools/call)
```

---

## 8. 변경 파일 최종 목록

| # | 파일 | 변경 | LOC 예상 |
|---|------|------|----------|
| 1 | `services/svc-skill/src/routes/mcp.ts` | 수정 — handleGetOrgMcpAdapter 추가 | +80 |
| 2 | `services/svc-skill/src/index.ts` | 수정 — org MCP 라우트 등록 | +15 |
| 3 | `services/svc-mcp-server/src/index.ts` | 수정 — /mcp/org/:orgId 라우트 + 팩토리 | +80 |
| 4 | `services/svc-skill/tests/mcp.test.ts` | 수정 — org adapter 테스트 5건 | +60 |
| 5 | `services/svc-mcp-server/tests/org-mcp.test.ts` | 신규 — org MCP 테스트 5건 | +80 |
| | **합계** | | **~315** |
