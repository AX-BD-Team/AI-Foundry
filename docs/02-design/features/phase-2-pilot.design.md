# Phase 2 Pilot — Design Document

> **Summary**: Phase 1 파이프라인의 실제 문서 투입을 위한 코드 변경 상세 설계
>
> **Project**: RES AI Foundry
> **Version**: v0.7 (Phase 2)
> **Author**: Sinclair Seo
> **Date**: 2026-03-01
> **Status**: Draft
> **Planning Doc**: [phase-2-pilot.plan.md](../01-plan/features/phase-2-pilot.plan.md)

---

## 1. Overview

### 1.1 Design Goals

1. Unstructured.io 실제 연동으로 합성 데이터 의존을 제거
2. 청크 처리량 상향으로 대용량 퇴직연금 문서(50+ 페이지) 처리 가능
3. organizationId를 이벤트 체인 전체에 일관 전파하여 다중 조직 대응
4. policy code SEQ 충돌 방지로 반복 실행 안정성 확보
5. 기존 709 tests 무결성 유지 (zero regression)

### 1.2 Design Principles

- **최소 변경**: 6개 파일에 집중, 나머지 서비스는 변경하지 않음
- **하위 호환성**: 기존 E2E 스크립트 및 합성 데이터 플로우가 깨지지 않도록
- **점진 투입**: 상수를 환경변수화하여 staging/production 별도 조정 가능

---

## 2. Architecture

### 2.1 변경 영향 데이터 플로우

```
[변경 전]
Upload (orgId ✅) → Ingestion Queue (orgId ✅) → ingestion.completed (orgId ✅)
  → Extraction (orgId ✅ read) → extraction.completed (orgId ❌ 누락!)
    → Policy (orgId ❌ → "system" 하드코딩) → policy.approved (orgId ❌)
      → Ontology (orgId ❌) → Skill (orgId ❌)

[변경 후]
Upload (orgId ✅) → Ingestion Queue (orgId ✅) → ingestion.completed (orgId ✅)
  → Extraction (orgId ✅ read) → extraction.completed (orgId ✅ 추가!)
    → Policy (orgId ✅ from event) → policy.approved (orgId ✅)
      → Ontology (orgId ✅) → Skill (orgId ✅)
```

### 2.2 변경 대상 파일 목록

| # | File | Service | Change Type | FR |
|---|------|---------|-------------|-----|
| 1 | `packages/types/src/events.ts` | shared | 스키마 확장 | FR-06 |
| 2 | `services/svc-ingestion/src/queue.ts` | SVC-01 | 상수 변경 | FR-02 |
| 3 | `services/svc-extraction/src/prompts/structure.ts` | SVC-02 | 상수 변경 | FR-02 |
| 4 | `services/svc-extraction/src/queue/handler.ts` | SVC-02 | orgId 전파 | FR-06 |
| 5 | `services/svc-extraction/src/routes/extract.ts` | SVC-02 | orgId 전파 | FR-06 |
| 6 | `services/svc-policy/src/queue/handler.ts` | SVC-03 | orgId 수신 + SEQ | FR-06, FR-07 |

변경 없음: svc-llm-router, svc-security, svc-governance, svc-notification, svc-analytics, svc-queue-router, svc-ontology, svc-skill, app-web

> **Note**: svc-ontology/svc-skill queue handler는 이미 `policy.approved` payload에서 orgId를 읽는 구조.
> svc-policy가 올바르게 orgId를 전파하면 자동으로 해결됨.

---

## 3. Detailed Changes

### 3.1 Change #1 — `packages/types/src/events.ts`

**목적**: `extraction.completed` 이벤트에 `organizationId` 필드 추가

**현재 코드** (L38~47):
```typescript
export const ExtractionCompletedEventSchema = BaseEventSchema.extend({
  type: z.literal("extraction.completed"),
  payload: z.object({
    documentId: z.string(),
    extractionId: z.string(),
    processNodeCount: z.number().int(),
    entityCount: z.number().int(),
    neo4jGraphId: z.string().optional(),
  }),
});
```

**변경 후**:
```typescript
export const ExtractionCompletedEventSchema = BaseEventSchema.extend({
  type: z.literal("extraction.completed"),
  payload: z.object({
    documentId: z.string(),
    extractionId: z.string(),
    organizationId: z.string(),           // ← 추가
    processNodeCount: z.number().int(),
    entityCount: z.number().int(),
    neo4jGraphId: z.string().optional(),
  }),
});
```

**영향 범위**: 이 스키마를 import하는 곳에서 `organizationId`가 필수 필드가 됨. `svc-extraction`의 이벤트 발행부도 반드시 함께 수정해야 typecheck 통과.

---

### 3.2 Change #2 — `services/svc-ingestion/src/queue.ts`

**목적**: 문서당 청크 한도 50→200 상향

**현재 코드** (L20):
```typescript
const MAX_ELEMENTS = 50;
```

**변경 후**:
```typescript
const MAX_ELEMENTS = 200;
```

**설계 고려사항**:
- D1 single transaction 제한: SQLite는 단일 트랜잭션에서 수백 INSERT 가능 (문제 없음)
- 각 청크 INSERT가 개별 `prepare().bind().run()` 호출 (L93~109). 200회 반복 시 Workers CPU 시간 주의
- 대안: batch INSERT (`INSERT INTO ... VALUES (...), (...), ...`) 적용은 Phase 2-C에서 필요 시 검토
- `ctx.waitUntil()` 내에서 실행되므로 HTTP 응답에는 영향 없음

---

### 3.3 Change #3 — `services/svc-extraction/src/prompts/structure.ts`

**목적**: LLM 투입 청크 수 5→20 상향, 청크당 문자 한도 조정

**현재 코드** (L6~7):
```typescript
const MAX_CHUNK_CHARS = 3000;
const MAX_CHUNKS = 5;
```

**변경 후**:
```typescript
const MAX_CHUNK_CHARS = 4000;
const MAX_CHUNKS = 20;
```

**설계 고려사항**:

| 항목 | 5×3000 (현재) | 20×4000 (변경) | 비고 |
|------|-------------|-------------|------|
| 최대 입력 토큰 | ~5K tokens | ~27K tokens | Haiku 200K context 내 |
| LLM 비용/호출 | ~$0.003 | ~$0.016 | Haiku 기준 |
| 정보 커버리지 | ~3% (200 중 5) | ~10% (200 중 20) | 여전히 일부만 |

- Haiku의 200K context window 대비 27K tokens는 충분히 안전
- 분류별 샘플링 (classifier.ts 결과 기반)은 Phase 2-B 실증 후 필요 여부 결정
- `buildExtractionPrompt()` 함수의 시그니처는 변경 없음 (`chunks: string[]` → 내부 slicing)

---

### 3.4 Change #4 — `services/svc-extraction/src/queue/handler.ts`

**목적**: `extraction.completed` 이벤트 발행 시 `organizationId` 포함

**현재 코드** (이벤트 발행 부분, ~L104~116):
```typescript
payload: {
  documentId,
  extractionId,
  processNodeCount,
  entityCount,
}
```

**변경 후**:
```typescript
payload: {
  documentId,
  extractionId,
  organizationId,    // ← ingestion.completed에서 수신한 값 전달
  processNodeCount,
  entityCount,
}
```

**organizationId 수신 경로**: `ingestion.completed` 이벤트 payload에 `organizationId`가 이미 포함됨 (events.ts `IngestionCompletedEventSchema` 확인).
- handler 함수 시작부에서 `const { organizationId } = event.payload;` 로 추출
- 변수를 이벤트 발행까지 전달

---

### 3.5 Change #5 — `services/svc-extraction/src/routes/extract.ts`

**목적**: 수동 추출 API (`POST /extract`)에서도 `extraction.completed` 발행 시 `organizationId` 포함

**변경 내용**: `extract.ts`의 이벤트 발행부에도 `organizationId` 추가. 수동 호출 시에는 요청 바디 또는 헤더에서 `organizationId`를 받아야 함.

**설계 결정**: E2E 테스트 스크립트(`test-e2e-pipeline.sh`)에서 수동 호출 시 `X-Organization-Id` 헤더를 전달하도록 수정 필요.

---

### 3.6 Change #6 — `services/svc-policy/src/queue/handler.ts`

**목적**: (A) orgId 하드코딩 제거, (B) policy code SEQ 충돌 방지

#### 3.6-A: organizationId 하드코딩 제거

**현재 코드** (L77):
```typescript
let organizationId = "system";
```

**변경 후**:
```typescript
const organizationId = event.payload.organizationId ?? "system";
```

- `extraction.completed` 이벤트에 `organizationId`가 추가되면 (#1, #4 변경) 자동으로 실제 값 사용
- fallback `"system"`은 하위 호환을 위해 유지 (이벤트 스키마 migration 중 기존 이벤트 대응)

#### 3.6-B: policy code SEQ 충돌 방지

**현재 방식**: LLM(Opus)이 SEQ를 001부터 순서대로 생성 → 동일 문서 재처리 시 충돌

**변경 설계**:
```typescript
// queue/handler.ts — inferPolicies() 내부, LLM 호출 전
const maxSeqResult = await env.DB_POLICY.prepare(
  `SELECT MAX(CAST(SUBSTR(policy_code, -3) AS INTEGER)) as max_seq
   FROM policies WHERE organization_id = ?`
).bind(organizationId).first<{ max_seq: number | null }>();

const startingSeq = (maxSeqResult?.max_seq ?? 0) + 1;
```

프롬프트에 `startingSeq` 전달:
```typescript
// prompts/policy.ts — buildPolicyPrompt() 수정
export function buildPolicyPrompt(chunks: string[], startingSeq: number): string {
  // ...
  // SEQ is a 3-digit number starting from ${String(startingSeq).padStart(3, '0')}.
}
```

**대안 검토**:
| 방식 | 장점 | 단점 | 선택 |
|------|------|------|:----:|
| D1 MAX(seq)+1 → 프롬프트 주입 | 확실한 중복 방지 | LLM이 시작번호를 무시할 수 있음 | ☑ |
| UUID suffix (POL-...-abc123) | 절대 충돌 없음 | 코드 가독성 저하, PRD 코드 형식 위반 | ☐ |
| INSERT 후 충돌 시 retry | 구현 간단 | UNIQUE 제약 이미 제거됨 | ☐ |

→ D1 시퀀스 방식 선택. LLM이 무시할 경우의 안전장치로 INSERT 전 중복 체크 추가.

---

## 4. Data Model Changes

### 4.1 스키마 변경 없음

D1 테이블 스키마 변경은 필요 없음. `organization_id` 컬럼은 이미 존재하고, 값만 `"system"` → 실제 값으로 바뀜.

### 4.2 이벤트 스키마 변경

| Event | Before | After |
|-------|--------|-------|
| `extraction.completed` | `{ documentId, extractionId, processNodeCount, entityCount }` | `+ organizationId: string` |

---

## 5. Environment Configuration

### 5.1 Secrets 설정

| Secret | Service | Env | Action |
|--------|---------|-----|--------|
| `UNSTRUCTURED_API_KEY` | svc-ingestion | staging | `printf 'KEY' \| wrangler secret put UNSTRUCTURED_API_KEY --env staging` |
| `UNSTRUCTURED_API_KEY` | svc-ingestion | production | `printf 'KEY' \| wrangler secret put UNSTRUCTURED_API_KEY` |

> `UNSTRUCTURED_API_URL`은 이미 `wrangler.toml`에 `https://api.unstructuredapp.io`로 설정됨.

### 5.2 Unstructured.io API Key 취득

- 가입: https://unstructured.io → Free tier (1,000 pages/month)
- 또는: Self-hosted (`unstructured-api` Docker) 사용 시 `UNSTRUCTURED_API_URL`을 로컬 주소로 변경

---

## 6. Error Handling

### 6.1 Unstructured.io 파싱 실패

**현재**: HTTP 에러 시 즉시 throw → 큐 핸들러에서 catch → 상태 `'failed'`로 업데이트

**변경 없음**: 현재 에러 핸들링이 적절함. 단, Phase 2-B 실증 시 파싱 실패 패턴을 수집하여 Phase 3에서 재시도 로직 추가 여부 결정.

### 6.2 LLM JSON 파싱 실패

**현재**: svc-extraction에서 JSON 파싱 실패 시 빈 결과 (`{ processes: [], entities: [], ... }`) 반환 → svc-policy에서 "No extractable content" 스킵

**변경 없음**: Phase 2에서는 이 동작을 유지하되, 로깅을 강화하여 실패 빈도 모니터링.

---

## 7. Security Considerations

- [x] PII 마스킹: svc-security `POST /mask` 파이프라인 기존 그대로 유지
- [x] Unstructured.io API 키: wrangler secrets로 관리 (코드에 하드코딩 금지)
- [x] 실제 문서는 staging 환경에서만 투입 (production은 Phase 2 완료 후)
- [ ] organizationId 검증: 현재 헤더 존재 확인만 → Phase 3에서 JWT claim 기반 검증 고려

---

## 8. Test Plan

### 8.1 Test Scope

| Type | Target | Tool | 변경 여부 |
|------|--------|------|----------|
| Unit Test | events.ts 스키마 변경 | vitest | 기존 테스트 수정 |
| Unit Test | queue.ts MAX_ELEMENTS | vitest | 기존 테스트 수정 |
| Unit Test | structure.ts MAX_CHUNKS | vitest | 기존 테스트 수정 |
| Unit Test | policy handler orgId | vitest | 기존 테스트 수정 |
| E2E Test | 5-Stage 파이프라인 | shell script | 실제 문서 모드 추가 |

### 8.2 Test Cases

- [ ] `events.ts` — `ExtractionCompletedEventSchema.parse()` 시 `organizationId` 필수 검증
- [ ] `svc-ingestion` — MAX_ELEMENTS=200으로 201개 요소 입력 시 200개만 저장 확인
- [ ] `svc-extraction` — 20개 청크로 프롬프트 생성 시 올바른 포맷 확인
- [ ] `svc-extraction` — `extraction.completed` 이벤트에 `organizationId` 포함 검증
- [ ] `svc-policy` — `organizationId`가 event payload에서 올바르게 읽히는지 검증
- [ ] `svc-policy` — SEQ 시작 번호가 기존 최대값+1인지 검증
- [ ] E2E — 실제 PDF 업로드 → 파싱 → 추출 → 정책 추론 → HITL → 스킬 생성

### 8.3 기존 테스트 영향 분석

| Service | Tests | 영향 |
|---------|-------|------|
| svc-ingestion | 53 tests | MAX_ELEMENTS 참조 테스트 수정 |
| svc-extraction | 52 tests | 이벤트 payload mock에 orgId 추가 |
| svc-policy | queue handler tests | orgId mock 수정, SEQ 테스트 추가 |
| packages/types | 스키마 테스트 | ExtractionCompleted 테스트 수정 |
| 기타 서비스 | ~604 tests | **변경 없음** |

---

## 9. Implementation Order

```
순서 의존성:

  ① packages/types/src/events.ts          ← 가장 먼저 (스키마가 기준)
      │
      ├──② svc-extraction handler.ts       ← events.ts에 의존
      │   └──③ svc-extraction extract.ts   ← 같은 서비스, 동시 수정
      │
      ├──④ svc-policy handler.ts           ← events.ts + extraction 변경에 의존
      │
      └──⑤ svc-ingestion queue.ts          ← 독립 (orgId와 무관)
          └──⑥ svc-extraction structure.ts ← 독립 (orgId와 무관)

  ⑦ typecheck + lint + test 전체 통과 확인
  ⑧ staging 배포 (svc-ingestion, svc-extraction, svc-policy)
  ⑨ UNSTRUCTURED_API_KEY secret 설정
  ⑩ 실제 문서 투입 E2E 실증
```

### Implementation Checklist

- [ ] **Step 1**: `packages/types/src/events.ts` — ExtractionCompletedEventSchema에 organizationId 추가
- [ ] **Step 2**: `svc-extraction/src/queue/handler.ts` — extraction.completed 이벤트에 organizationId 포함
- [ ] **Step 3**: `svc-extraction/src/routes/extract.ts` — 수동 API에서도 organizationId 전파
- [ ] **Step 4**: `svc-policy/src/queue/handler.ts` — orgId 하드코딩 제거 + SEQ 중복 방지
- [ ] **Step 5**: `svc-ingestion/src/queue.ts` — MAX_ELEMENTS 50→200
- [ ] **Step 6**: `svc-extraction/src/prompts/structure.ts` — MAX_CHUNKS 5→20, MAX_CHUNK_CHARS 3000→4000
- [ ] **Step 7**: Unit test 수정 — 영향받는 mock/assertion 업데이트
- [ ] **Step 8**: `bun run typecheck && bun run lint && bun run test` 전체 통과
- [ ] **Step 9**: Staging 배포 (`svc-ingestion`, `svc-extraction`, `svc-policy`)
- [ ] **Step 10**: `UNSTRUCTURED_API_KEY` secret 설정 (staging)
- [ ] **Step 11**: 퇴직연금 샘플 문서 투입 E2E 실증

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-01 | Initial draft — 코드 탐색 기반 상세 설계 | Sinclair Seo |
