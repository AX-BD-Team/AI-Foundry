---
name: e2e-pipeline
user-invocable: true
description: 5-Stage Core Engine 파이프라인 E2E 테스트 실행. 전체 또는 특정 Stage 선택 가능.
---

# E2E Pipeline — 5-Stage 파이프라인 통합 테스트

Core Engine 파이프라인 (Stage 1→5)과 Platform 서비스의 테스트를 실행하고 결과를 요약한다.

## Arguments

- `$ARGUMENTS` 없음: 전체 서비스 테스트 실행
- `stage N`: 특정 Stage만 실행 (예: `stage 3`)
- `--coverage`: 커버리지 리포트 포함
- `--verbose`: 상세 출력

## Stage → Service Mapping

| Stage | Service | 역할 |
|-------|---------|------|
| 1 | svc-ingestion | Document Ingestion (R2, Queue) |
| 2 | svc-extraction | Structure Extraction (Claude, Neo4j) |
| 3 | svc-policy | Policy Inference (Opus, DO, Queue) |
| 4 | svc-ontology | Ontology Normalization (Neo4j, Workers AI) |
| 5 | svc-skill | Skill Packaging (Sonnet, R2) |

Platform 서비스:

| Service | 역할 |
|---------|------|
| svc-llm-router | LLM Gateway (tier routing) |
| svc-security | Auth, RBAC, masking |
| svc-queue-router | Queue event bus (fan-out) |
| svc-governance | Prompt Registry, cost |
| svc-notification | Review alerts |
| svc-analytics | KPI dashboards |

## Steps

### 1. 테스트 실행

전체 실행:
```bash
bun run test
```

특정 Stage만:
```bash
bun run test --filter=svc-ingestion    # Stage 1
bun run test --filter=svc-extraction   # Stage 2
bun run test --filter=svc-policy       # Stage 3
bun run test --filter=svc-ontology     # Stage 4
bun run test --filter=svc-skill        # Stage 5
```

### 2. 실패 분석

실패한 테스트가 있으면:
1. 실패 서비스와 테스트 파일 식별
2. 실패 원인 분석 (타입 에러, 로직 에러, 환경 의존성)
3. Pipeline stage 순서에서 downstream 영향 판단
   - Stage 1 실패 → Stage 2~5 모두 영향
   - Stage 3 실패 → Stage 4~5 영향
   - Platform 서비스 실패 → 해당 의존 Stage에 영향

### 3. 결과 요약

```
═══════════════════════════════════════
  E2E Pipeline Test Results
═══════════════════════════════════════
  Stage 1 (Ingestion):    ✅ N/N passed
  Stage 2 (Extraction):   ✅ N/N passed
  Stage 3 (Policy+HITL):  ✅ N/N passed
  Stage 4 (Ontology):     ✅ N/N passed
  Stage 5 (Skill):        ✅ N/N passed
  ─────────────────────────────────────
  Platform Services:      ✅ N/N passed
  ─────────────────────────────────────
  Total:                  ✅ N/N passed
═══════════════════════════════════════
```

### 4. Coverage (선택)

`--coverage` 옵션 시:
```bash
bun run test -- --coverage
```

서비스별 커버리지 요약 추가 출력:

| Service | Statements | Branches | Functions | Lines |
|---------|-----------|----------|-----------|-------|
| svc-ingestion | 85% | 78% | 90% | 85% |
| ... | ... | ... | ... | ... |
