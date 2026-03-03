# Phase 4 Sprint 2 — HITL 대량 승인 + Tier 2-3 문서 확대 투입

> **Summary**: Sprint 1에서 생성된 491건 candidate policy를 HITL 배치 승인하여 Stage 5 Skill 자동 생성을 트리거하고, Tier 2(16건) + Tier 3 샘플(70건)을 추가 투입하여 도메인 커버리지를 확장한다. 퇴직연금 실문서 990건 완파를 향한 두 번째 스프린트.
>
> **Project**: RES AI Foundry
> **Version**: v1.0 (Phase 4 Sprint 2)
> **Author**: Sinclair Seo
> **Date**: 2026-03-04
> **Status**: Draft
> **Duration**: 1주 (Sprint)
> **Depends On**: Phase 4 Sprint 1 완료 (93% match rate)

---

## 0. Key Decisions

| 항목 | 결정 | 근거 |
|------|------|------|
| **Sprint 목표** | HITL 배치 승인 + Tier 2-3 투입 | 491건 candidate → approved 전환이 Stage 5 Skill 생성의 전제조건 |
| **HITL 전략** | 배치 승인 API + bulk approve UI | 491건을 수동 1건씩은 비현실적. 배치 승인 엔드포인트 필수 |
| **Tier 2 투입** | 16건 전량 (화면목록 11건 + 배치JOB목록 5건) | 기능 목록 → 화면-기능 매핑 완성에 필수 |
| **Tier 3 투입** | 샘플 70건 (업무영역별 대표 10건씩 × 7영역) | 462건 전량 투입 전 screen-design-parser 실전 검증 |
| **배치 실행** | batch-upload.sh --tier 자동화 | Sprint 1에서 스크립트 완성. 수동 불필요 |

---

## 1. Problem Statement

### 현황 (Sprint 1 완료 후)
- **파이프라인**: 5-Stage 자동 전파 정상화 (Queue consumer 충돌 해결)
- **문서 처리**: 20/~990건 (2%) — Tier 1 완료
- **Policy**: approved 162 + candidate 491 = 총 653
- **Skill**: 171 (candidate → approved HITL 전환 대기)
- **Terms**: 1,448
- **배포**: Production 12/12 + Staging 12/12 healthy

### Sprint 2에서 해결할 것
1. **HITL 병목 해소**: 491건 candidate를 bulk approve → Stage 5 Skill 자동 생성
2. **Tier 2 전량 투입**: 기능목록 16건 → 화면-기능-배치 매핑 확보
3. **Tier 3 샘플 투입**: 화면설계서 70건 → screen-design-parser 실전 검증
4. **Skill 증분 확인**: approved policy → ontology → skill 자동 전파 검증

---

## 2. Scope

### In Scope
1. **HITL 배치 승인 API** — POST `/policies/bulk-approve` 엔드포인트 (svc-policy)
2. **HITL 배치 승인 실행** — 491건 candidate → approved 전환
3. **Stage 4-5 자동 전파 검증** — policy.approved → ontology.normalized → skill.packaged
4. **Tier 2 문서 16건 업로드** — batch-upload.sh --tier tier2
5. **Tier 3 문서 70건 업로드** — batch-upload.sh --tier tier3 (업무영역별 샘플)
6. **파이프라인 E2E 검증** — Tier 2-3 문서의 5-Stage 자동 처리 확인
7. **품질 메트릭 기록** — policies/terms/skills 증가량 + 추출 품질

### Out of Scope (Sprint 3 이후)
- Tier 3 잔여 392건 투입 (Sprint 3)
- Tier 4 프로그램설계서 153건 (Sprint 3-4)
- Tier 5 단위테스트 129건 (Sprint 4)
- SCDSA002 복호화 (Samsung SDS 도구/키 확보 필요)
- Cross-Org 비교 (현대해상 191건)
- Claude Desktop MCP 실사용 테스트

---

## 3. Tier 2 문서 목록 (16건)

| # | 카테고리 | 건수 | 형식 | 핵심 가치 |
|---|----------|------|------|-----------|
| T2-1 | 화면목록 — 신계약 | 2 | xlsx | 신계약 업무 화면-기능 매핑 |
| T2-2 | 화면목록 — 운용지시 | 1 | xlsx | 운용지시 화면-기능 매핑 |
| T2-3 | 화면목록 — 지급 | 1 | xlsx | 지급 업무 화면-기능 매핑 |
| T2-4 | 화면목록 — 수수료 | 1 | xlsx | 수수료 화면-기능 매핑 |
| T2-5 | 화면목록 — 공통 | 2 | xlsx | 공통 화면-기능 매핑 |
| T2-6 | 화면목록 — 상품제공 | 2 | xlsx | 상품제공 화면-기능 매핑 |
| T2-7 | 화면목록 — 법인영업 | 2 | xlsx | 법인영업 화면-기능 매핑 |
| T2-8 | 배치JOB목록 | 5 | xlsx | 배치 처리 스케줄 + 의존성 |

**기대 효과**: 화면-기능-배치 관계 그래프 완성

---

## 4. Tier 3 문서 샘플 (70건)

| # | 업무영역 | 전체 | 샘플 | 선정 기준 |
|---|----------|------|------|-----------|
| T3-1 | 신계약 | 112 | 10 | 핵심 가입/심사/계약 화면 |
| T3-2 | 운용지시 | 51 | 10 | 자산배분/매매/리밸런싱 |
| T3-3 | 지급 | 59 | 10 | 퇴직급여/중도인출/이전 |
| T3-4 | 수수료 | 45 | 10 | 수수료산정/청구/조정 |
| T3-5 | 공통 | 86 | 10 | 고객관리/계좌/코드 |
| T3-6 | 상품제공 | 24 | 10 | 펀드/보험/예금 상품 |
| T3-7 | 법인영업 | 79 | 10 | 법인계약/관리/보고 |

**기대 효과**: screen-design-parser 실전 검증 + Policy 후보 300+ 추가

---

## 5. Implementation Tasks

### Phase A: HITL 배치 승인 (Day 1)

#### Task 1: bulk-approve API 구현
- **파일**: `services/svc-policy/src/routes/hitl.ts`
- **엔드포인트**: `POST /policies/bulk-approve`
- **요청**: `{ policyIds: string[], reviewerId: string, comment?: string }`
- **동작**:
  - D1에서 status='candidate' 확인
  - status → 'approved' 일괄 변경
  - 각 policy에 대해 `policy.approved` Queue 이벤트 발행
  - DO 세션 일괄 완료 처리
- **RBAC**: `policy:approve` (Reviewer 이상)
- **테스트**: 5+ 케이스 (성공, 빈 목록, 이미 approved, 존재하지 않는 ID, 권한 부족)

#### Task 2: bulk-approve 프론트엔드 (선택)
- **파일**: `apps/app-web/src/pages/ReviewDashboard.tsx`
- **기능**: 체크박스 전체 선택 → "일괄 승인" 버튼
- **참고**: Out of Scope로 분류 가능 (curl/API 직접 호출로 대체)

### Phase B: HITL 실행 + 파이프라인 검증 (Day 2)

#### Task 3: 491건 candidate bulk approve 실행
- Production에서 bulk-approve API 호출
- 배치 크기: 50건씩 (Queue 부하 분산)
- 예상 소요: ~10분 (50건 × 10배치)

#### Task 4: Stage 4-5 자동 전파 검증
- **Stage 4 (Ontology)**: policy.approved → ontology.normalized 이벤트 확인
  - terms 증가량 확인 (현재 1,448)
  - Neo4j 그래프 노드 증가 확인
- **Stage 5 (Skill)**: ontology.normalized → skill.packaged 이벤트 확인
  - skills 증가량 확인 (현재 171)
  - R2에 .skill.json 저장 확인

#### Task 5: Skill 품질 검증
- GET `/skills` — 신규 Skill 목록 확인
- GET `/skills/:id` — 대표 Skill 상세 확인
- GET `/skills/:id/download` — .skill.json 다운로드 + 스키마 검증

### Phase C: Tier 2 문서 투입 (Day 3)

#### Task 6: Tier 2 문서 16건 업로드
```bash
./scripts/batch-upload.sh /path/to/tier2-docs --tier tier2 --env production --batch-size 5
```
- 화면목록 11건 + 배치JOB목록 5건
- 파이프라인 자동 실행 대기

#### Task 7: Tier 2 결과 검증
- Stage 1: 파싱 성공률 확인 (목표 16/16)
- Stage 2: extraction 결과 (processes, entities 수)
- Stage 3: 신규 policy candidates 확인
- Stage 4-5: 자동 전파 확인

### Phase D: Tier 3 문서 투입 (Day 4-5)

#### Task 8: Tier 3 문서 70건 업로드
```bash
./scripts/batch-upload.sh /path/to/tier3-docs --tier tier3 --env production --batch-size 10 --delay 200
```
- 업무영역별 10건 × 7영역
- screen-design-parser 실전 검증
- 배치 사이즈 10, 딜레이 200ms (부하 분산)

#### Task 9: Tier 3 결과 검증
- screen-design-parser 파싱 성공률 (목표 >= 90%)
- XlScreenMeta / XlScreenLogic 추출 품질 확인
- Policy candidates 신규 생성 수 확인

### Phase E: 품질 메트릭 + 보고 (Day 5)

#### Task 10: 품질 메트릭 기록
- policies 증가량 (현재 653 → 목표 1,000+)
- terms 증가량 (현재 1,448 → 목표 2,000+)
- skills 증가량 (현재 171 → 목표 500+)
- screen-design-parser 파싱 성공률
- 업무영역별 extraction 품질 비교

---

## 6. Success Criteria

| 지표 | 목표 |
|------|------|
| bulk-approve API | 테스트 5+ PASS, Production 배포 |
| HITL 배치 승인 | 491건 → approved 전환 완료 |
| Stage 5 Skill 자동 생성 | skills >= 300 (현재 171 → +129) |
| Tier 2 파싱 성공률 | 16/16 (100%) |
| Tier 3 파싱 성공률 | >= 63/70 (90%) |
| Policy candidates 신규 | >= 300 (Tier 2-3 합산) |
| Terms 증가 | >= 2,000 총 |
| 전체 테스트 | >= 1,300 (현재 1,291 + 신규) |
| typecheck + lint | PASS |

---

## 7. Risk & Mitigation

| 리스크 | 영향 | 대응 |
|--------|------|------|
| bulk approve 시 Queue 폭주 | Stage 4-5 처리 지연 | 배치 크기 50건씩 + 딜레이 |
| Tier 3 화면설계서 비표준 레이아웃 | 파싱 실패율 증가 | screen-design-parser fallback + 수동 확인 |
| SCDSA002 추가 발견 | 파싱 실패 | validator.ts 탐지 로직 이미 구현. encrypted 상태 분류 |
| LLM 크레딧 소진 | Stage 3 Policy 추론 실패 | OpenAI/Google fallback 사용 |
| Neo4j Aura Free tier 제한 | Stage 4 Ontology 저장 실패 | graceful fallback (D1만 저장) |
| Skill 패키지 R2 용량 | 대량 .skill.json 저장 | R2 무제한 (Cloudflare Free tier) |

---

## 8. Sprint 3 Preview

Sprint 2 결과에 따라:
- Tier 3 잔여 392건 투입 (화면설계서 전량)
- Tier 4 프로그램설계서 153건 투입
- Cross-Org 비교 (현대해상 191건)
- MCP Server 실사용 테스트 (Claude Desktop)
- Skill Quality 대시보드 강화
