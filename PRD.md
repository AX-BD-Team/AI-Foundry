# AI Foundry — PRD (Product Requirements Document)

> 이 파일은 Ralph Loop의 태스크 소스입니다.
> - `- [ ]` : 미완료 태스크 (Ralph가 순서대로 처리)
> - `- [x]` : 완료된 태스크
> 태스크는 **하나의 컨텍스트 윈도우**에서 완료 가능한 크기로 분리하세요.

---

## 🎯 Goal
퇴직연금 프로세스 정밀분석 시스템 (Phase 2-E) — 3-Layer 분석 출력물 + 조직 간 비교 기능의 백엔드 API 구현

## 📦 Scope
- 대상: `packages/types`, `services/svc-extraction`, `services/svc-ontology`, `services/svc-policy`
- 설계 문서: `docs/02-design/features/process-diagnosis.design.md` (**모든 태스크의 상세 스펙 참조**)
- 완료 기준: 전체 API 구현 + `bun run typecheck` + `bun run lint` + `bun test` 통과

---

## 📋 Tasks

### Phase 1: 타입 정의
- [ ] [P1-1] `packages/types/src/analysis.ts` 신규 생성 — 분석 출력물 타입. ScoredProcessSchema, ScoredEntitySchema, ExtractionSummarySchema (Layer 1), CoreJudgmentSchema, ProcessTreeNodeSchema, CoreIdentificationSchema (Layer 2), ServiceGroupSchema, ComparisonItemSchema, CrossOrgComparisonSchema (Cross-Org) 총 9개 Zod 스키마 + 타입 export. `packages/types/src/index.ts`에 `export * from "./analysis.js"` 추가. Design §3.1, §3.2, §4.2의 전체 스키마 코드를 참조하여 구현.
- [ ] [P1-2] `packages/types/src/diagnosis.ts` 신규 생성 — 진단 소견 타입. DiagnosisTypeSchema (missing/duplicate/overspec/inconsistency), SeveritySchema, DiagnosisFindingSchema (finding-evidence-recommendation 트리플 + HITL 상태), DiagnosisResultSchema (소견 목록 + byType/bySeverity 요약 통계) 총 4개 Zod 스키마 + 타입 export. `packages/types/src/index.ts`에 `export * from "./diagnosis.js"` 추가. Design §3.3의 전체 스키마 코드를 참조하여 구현.
- [ ] [P1-3] `packages/types/src/events.ts` 수정 — 신규 이벤트 2종 추가. (1) `AnalysisCompletedEventSchema`: type `"analysis.completed"`, payload에 documentId, analysisId, organizationId, findingCount, coreProcessCount. (2) `DiagnosisCompletedEventSchema`: type `"diagnosis.completed"`, payload에 analysisId, documentId, organizationId, findingCount. 두 스키마를 기존 `PipelineEventSchema` discriminatedUnion 배열에 추가. 대응하는 타입 export도 추가.

### Phase 2: D1 마이그레이션
- [ ] [P2-1] `infra/migrations/db-structure/0003_analysis.sql` 신규 생성 — 4개 테이블: `analyses` (analysis_id PK, document_id, extraction_id, organization_id, process_count, entity_count, rule_count, relationship_count, core_process_count, mega_process_count, summary_json TEXT, core_identification_json TEXT, status, created_at), `diagnosis_findings` (finding_id PK, analysis_id, document_id, organization_id, type, severity, finding, evidence, recommendation, related_processes JSON, related_entities JSON, source_document_ids JSON, confidence REAL, hitl_status DEFAULT 'pending', reviewer_id, reviewer_comment, reviewed_at, created_at), `comparisons` (comparison_id PK, organization_ids JSON, domain DEFAULT '퇴직연금', 4개 그룹별 카운트, result_json TEXT, created_at), `comparison_items` (item_id PK, comparison_id, name, type, service_group, present_in_orgs JSON, classification_reason, standardization_score, standardization_note, tacit_knowledge_evidence, created_at). 인덱스 6개: findings(analysis_id), findings(organization_id), findings(severity), findings(hitl_status), comparisons(organization_ids), comparison_items(service_group). Design §7.1의 SQL을 참조.

### Phase 3: LLM 프롬프트
- [ ] [P3-1] `services/svc-extraction/src/prompts/scoring.ts` 신규 생성 — Pass 1: 중요도 스코어링 + 핵심 프로세스 판정 프롬프트 빌더. (1) `buildScoringPrompt(extractionResult)` 함수: 기존 extraction result JSON을 받아 시스템 프롬프트 + 사용자 프롬프트 구성. 출력 형식: `{ scoredProcesses: ScoredProcess[], coreJudgments: CoreJudgment[], processTree: ProcessTreeNode[] }`. (2) `parseScoringResult(rawJson: string)` 함수: LLM 응답을 JSON 파싱 + Zod 검증. 마크다운 펜스 제거 포함. LLM 지시사항: 각 프로세스에 importanceScore(0-1), category(mega/core/supporting/peripheral), isCore 판정, 판정 근거를 빈도/의존성/도메인/중심성 4요인으로 분해. Design §8.1 Pass 1 참조.
- [ ] [P3-2] `services/svc-extraction/src/prompts/diagnosis.ts` 신규 생성 — Pass 2: 4대 진단 프롬프트 빌더. (1) `buildDiagnosisPrompt(scoringResult, extractionResult)` 함수: Pass 1 결과 + 원본 추출 데이터를 받아 프롬프트 구성. (2) `parseDiagnosisResult(rawJson: string)` 함수: DiagnosisFinding[] 파싱. LLM 지시사항: missing(있어야 하는데 없음), duplicate(같은 기능 2곳+), overspec(불필요 존재), inconsistency(문서 간 불일치) 4개 유형별 소견. 각 소견에 finding/evidence/recommendation 트리플 + severity(critical/warning/info) + confidence(0-1). Design §8.1 Pass 2 참조.
- [ ] [P3-3] `services/svc-extraction/src/prompts/comparison.ts` 신규 생성 — Pass 3: 조직 간 비교 프롬프트 빌더. (1) `buildComparisonPrompt(orgAResult, orgBResult)` 함수: 2개 조직의 Pass 1+2 결과를 받아 프롬프트 구성. (2) `parseComparisonResult(rawJson: string)` 함수: ComparisonItem[] + standardizationCandidates[] 파싱. LLM 지시사항: 이름/의미 기반 매칭 → 서비스 그룹 4종 분류(common_standard, org_specific, tacit_knowledge, core_differentiator). 암묵지 탐지: 화면 흐름 중간 단계 생략, 생산자 없는 소비 데이터, 규칙 참조 미정의 프로세스 등. Design §8.1 Pass 3 + §8.2 참조.

### Phase 4: API 라우트
- [ ] [P4-1] `services/svc-extraction/src/routes/analysis.ts` 신규 생성 — 분석 리포트 조회 API 4개. (1) `GET /analysis/:documentId/summary` → D1 analyses에서 summary_json 조회, ExtractionSummary 반환. (2) `GET /analysis/:documentId/core-processes` → core_identification_json 조회, CoreIdentification 반환. (3) `GET /analysis/:documentId/findings` → D1 diagnosis_findings JOIN, DiagnosisResult 반환 (byType/bySeverity 집계 포함). (4) `GET /analysis/:documentId/findings/:findingId` → 단일 소견 상세. 모든 라우트에 X-Internal-Secret 인증 + 선택적 RBAC (extraction:read). `handleAnalysisRoutes(request, env, ctx)` 함수로 export. Design §5.1 참조. 기존 `routes/extract.ts` 패턴 따르기.
- [ ] [P4-2] `services/svc-extraction/src/routes/analysis.ts`에 HITL + 분석 트리거 라우트 추가. (1) `POST /analysis/:documentId/findings/:findingId/review` — body: `{ action: "accept"|"reject"|"modify", comment?, reviewerId }`. D1 diagnosis_findings UPDATE (hitl_status, reviewer_id, reviewer_comment, reviewed_at). (2) `POST /analyze` — body: `{ documentId, extractionId, organizationId, mode: "standard"|"diagnosis" }`. mode="diagnosis"일 때 3-Pass 순차 실행: Pass 1 scoring(LLM_ROUTER Sonnet) → D1 analyses INSERT → Pass 2 diagnosis(LLM_ROUTER) → D1 diagnosis_findings INSERT → analysis.completed 이벤트 발행. RBAC: extraction:execute. Design §5.1 참조.
- [ ] [P4-3] `services/svc-extraction/src/routes/compare.ts` 신규 생성 — 조직 비교 API 3개. (1) `POST /analysis/compare` — body: `{ organizationIds: string[], domain: string }`. 두 조직의 analyses 결과를 D1에서 조회 → Pass 3 comparison 프롬프트 실행 → D1 comparisons + comparison_items INSERT → CrossOrgComparison 반환. (2) `GET /analysis/:organizationId/service-groups` → comparison_items에서 서비스 그룹별 조회 + groupSummary 집계. (3) `GET /analysis/compare/:comparisonId/standardization` → standardization_score 기준 정렬된 표준화 후보 목록. `handleCompareRoutes(request, env, ctx)` 함수로 export. Design §5.2 참조.
- [ ] [P4-4] `services/svc-extraction/src/index.ts` 수정 — 신규 라우트 등록. `handleAnalysisRoutes`와 `handleCompareRoutes`를 import. `/analysis/` 경로를 기존 라우팅 분기 앞에 추가 (path.startsWith("/analysis") 체크). 기존 /extract, /extractions 라우트는 변경하지 않음.

### Phase 5: 파이프라인 통합
- [ ] [P5-1] `services/svc-extraction/src/queue/handler.ts` 수정 — extraction.completed 이벤트 후 자동 분석 연계. `runExtraction()` 함수 끝에서 extraction.completed 이벤트 발행 직후, 동일 extraction 결과로 Pass 1+2 분석을 자동 실행하는 `runAnalysis()` 내부 함수 추가. (1) Pass 1: `buildScoringPrompt` → `callLlm` (Sonnet) → `parseScoringResult` → D1 analyses INSERT. (2) Pass 2: `buildDiagnosisPrompt` → `callLlm` → `parseDiagnosisResult` → D1 diagnosis_findings INSERT. (3) analysis.completed 이벤트 발행. 실패 시 status='partial' + warning 로그 (기존 파이프라인 중단하지 않음). Design §9 Error Handling 참조.

### Phase 6: 온톨로지 확장
- [ ] [P6-1] `services/svc-ontology/src/neo4j/client.ts` 수정 — 6개 신규 노드 타입의 Cypher 쿼리 추가. SubProcess `(Process)-[:HAS_SUBPROCESS]->(SubProcess)`, Method `(Process)-[:HAS_METHOD]->(Method)`, Condition `(Method)-[:TRIGGERED_BY]->(Condition)`, Actor `(Actor)-[:PARTICIPATES_IN]->(Process)`, Requirement `(Requirement)-[:SATISFIED_BY]->(Process)`, DiagnosisFinding `(DiagnosisFinding)-[:RELATES_TO]->(Process|Entity)`. 기존 `upsertTermGraph()` 패턴을 따라 `upsertAnalysisGraph()` 함수 신규 추가. Design §7.2 참조.

### Phase 7: 테스트
- [ ] [P7-1] `packages/types/src/__tests__/analysis.test.ts` + `diagnosis.test.ts` 신규 생성 — 타입 스키마 검증 테스트 12+ 케이스. 정상 입력 파싱, 필수 필드 누락 에러, enum 유효성, 숫자 범위 (importanceScore 0-1), 재귀 타입 (ProcessTreeNode), 빈 배열 허용 여부 등.
- [ ] [P7-2] `services/svc-extraction/src/__tests__/analysis-routes.test.ts` 신규 생성 — 분석 API 라우트 테스트 10+ 케이스. GET summary/core/findings 정상 응답, 404 없는 문서, HITL review 상태 변경, POST /analyze 트리거 (LLM mock), 인증 없는 요청 401. 기존 `svc-extraction/src/__tests__/` 디렉토리의 테스트 패턴을 따르기.
- [ ] [P7-3] `services/svc-extraction/src/__tests__/prompts.test.ts` 신규 생성 — 프롬프트 빌더 + 파서 테스트 8+ 케이스. buildScoringPrompt 프롬프트 생성 검증, parseScoringResult 정상 JSON 파싱, parseScoringResult 마크다운 펜스 제거, parseDiagnosisResult 유효한 DiagnosisFinding[] 반환, parseComparisonResult ComparisonItem[] 검증, 빈 입력 처리, 잘못된 JSON 에러 핸들링.

### Phase 8: 최종 검증
- [ ] [P8-1] 전체 품질 검증 실행: `bun run typecheck && bun run lint && bun test`. 기존 847+ tests + 신규 30+ tests 전체 GREEN 확인. 실패 시 에러 수정. lint 경고도 0개로 정리.

---

## 📝 Notes
- 설계 문서: `docs/02-design/features/process-diagnosis.design.md` — 전체 Zod 스키마, SQL, API 명세, 프롬프트 전략 포함
- 계획 문서: `docs/01-plan/features/process-diagnosis.plan.md` — 요구사항, 성공 기준, 리스크
- 기존 svc-extraction 패턴 (index.ts 라우팅, queue/handler.ts 이벤트 처리, prompts/ 프롬프트 빌더) 일관성 유지
- D1 마이그레이션 경로: `infra/migrations/db-structure/` (현재 0001, 0002 존재)
- LLM 호출: 직접 Anthropic API 아닌 `env.LLM_ROUTER` service binding 경유 (svc-llm-router)
- 모든 API에 `X-Internal-Secret` 인증 필수 (기존 패턴)
