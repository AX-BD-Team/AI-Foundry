---
code: AIF-PLAN-026F
title: "반제품 생성 엔진 Sprint 3 — LLM 활성화 + 화면 정의 생성기 + E2E 자동화"
version: "1.0"
status: Active
category: PLAN
created: 2026-03-20
updated: 2026-03-20
author: Sinclair Seo
feature: req-026-phase-2-sprint-3
refs: "[[AIF-REQ-026]] [[AIF-PLAN-026E]] [[AIF-RPRT-026E]] [[AIF-RPRT-027]]"
---

# 반제품 생성 엔진 Sprint 3 — LLM 활성화 + 화면 정의 생성기 + E2E 자동화

> **Summary**: Sprint 2에서 mechanical 모드로 검증된 8개 생성기를 LLM 모드로 활성화하여 품질을 비교하고, 9번째 생성기(화면 정의서)를 추가하며, 생성된 ZIP→Claude Code Working Version 자동 생성 E2E 파이프라인을 구축한다.
>
> **Project**: AI Foundry
> **Version**: v0.6.0
> **Author**: Sinclair Seo
> **Date**: 2026-03-20
> **Status**: Active

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | Sprint 2에서 Production E2E는 `skipLlm=true`(mechanical)로만 검증. LLM 활성화 시 품질/비용/시간 트레이드오프 미검증. 화면 정의서(06-screens.md)가 ZIP에 없어 UI 스펙 수동 작성 필요. 생성된 ZIP→코드 변환이 수동(Claude Code 직접 입력) |
| **Solution** | (1) LLM 활성화 + mechanical 대비 품질 A/B 비교, (2) G9 화면 정의 생성기 추가, (3) ZIP→Working Version 자동 변환 CLI/API 구축 |
| **Function/UX Effect** | `POST /prototype/generate` → 12파일 ZIP (9 spec + 3 meta) + LLM 보강. ZIP을 CLI 한 줄로 Working Version 프로젝트로 변환 |
| **Core Value** | 역공학→스펙→코드 파이프라인의 마지막 수동 구간(스펙→코드)까지 자동화. API 한 번 + CLI 한 줄 = Production-ready 프로젝트 부트스트래핑 |

---

## 1. Overview

### 1.1 Purpose

Sprint 2에서 완성된 "스펙 자동 생성" 엔진을 3가지 방향으로 확장한다:
1. **품질 향상**: LLM 활성화로 생성 문서 품질 비교/검증
2. **커버리지 확장**: 9번째 생성기(화면 정의서) 추가
3. **E2E 자동화**: ZIP→Working Version 코드 생성 파이프라인

### 1.2 Background

- **Sprint 1** (세션 182): collector + G1~G3 + packager. 262 tests, PDCA 93%
- **Sprint 2** (세션 184): G4~G8 + 3-Phase orchestrator. 291 tests, Production E2E 10초
- **AIF-REQ-027 PoC** (세션 183): 수동으로 6 스펙 → Working Version(14파일, 1,610줄, 24 tests). 사람 개입 0회
- **갭**: (a) LLM 미활성화 (b) 화면 정의서 없음 (c) ZIP→코드 수동

### 1.3 Related Documents

- Sprint 2 Plan: [[AIF-PLAN-026E]]
- Sprint 2 Report: [[AIF-RPRT-026E]] (PDCA 100%, E2E 검증 완료)
- 반제품 스펙 PoC Report: [[AIF-RPRT-027]]
- 기존 orchestrator: `services/svc-skill/src/prototype/orchestrator.ts`

---

## 2. Scope

### 2.1 In Scope

#### Task A: LLM 활성화 검증 (P1)
- [ ] **A-1**: `skipLlm=false`로 LPON org 전체 파이프라인 실행
- [ ] **A-2**: Mechanical vs LLM 출력 비교 (문서별 차이점 분석)
- [ ] **A-3**: LLM Router 비용/시간 측정 (tier2 Sonnet 기준)
- [ ] **A-4**: LLM 실패 시 mechanical fallback 동작 검증
- [ ] **A-5**: 비교 결과 docs에 기록 (A/B 리포트)

#### Task B: G9 화면 정의 생성기 (P2)
- [ ] **B-1**: `generators/screen-spec.ts` 구현 — FN(기능) → 화면 목록 + 필드 매핑
- [ ] **B-2**: 화면 유형 분류: 목록(List), 상세(Detail), 폼(Form), 대시보드(Dashboard)
- [ ] **B-3**: 각 화면의 입출력 필드를 FN+DM(데이터 모델)에서 자동 추출
- [ ] **B-4**: LLM 보강: 화면 흐름(Navigation Flow) + 에러 표시 + 접근성 가이드
- [ ] **B-5**: Orchestrator Phase 3에 G9 추가 (G6/G7과 병렬 가능)
- [ ] **B-6**: `includeScreenSpec` 옵션 연동 (이미 API 스키마에 존재)
- [ ] **B-7**: 테스트 ≥ 6건

#### Task C: ZIP→Working Version E2E 자동화 (P1)
- [ ] **C-1**: `scripts/bootstrap-from-zip.ts` CLI 스크립트 — ZIP 해제 → Claude Code 프롬프트 생성
- [ ] **C-2**: CLAUDE.md + specs를 컨텍스트로 조합하여 `/pdca do` 입력 포맷 생성
- [ ] **C-3**: 자동 실행 모드: `claude -p` 비대화형 호출로 Working Version 생성
- [ ] **C-4**: 검증: 생성된 프로젝트의 typecheck + test 자동 실행

#### Task D: collector Service Binding 통합 테스트 보강 (P2)
- [ ] **D-1**: mock Fetcher 기반 통합 테스트 — 실제 API 응답 포맷 반영
- [ ] **D-2**: Service Binding 실패 시나리오별 테스트 (timeout, 500, 인증 오류)
- [ ] **D-3**: 페이지네이션 edge case (0건, 1건, 정확히 200건)

### 2.2 Out of Scope

- collector 구조 변경 (Sprint 1에서 완료)
- 프론트엔드 UI 변경 (poc-report 탭은 Sprint 3 완료 후 별도 갱신)
- LLM 모델 변경 (Sonnet → Opus 전환은 별도 검토)
- Foundry-X 핸드오프 자동화 (별도 REQ)

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Task |
|----|-------------|:--------:|:----:|
| FR-01 | skipLlm=false로 8개 생성기 LLM 경유 실행 | P1 | A |
| FR-02 | Mechanical vs LLM 출력 diff 비교 리포트 | P1 | A |
| FR-03 | LLM 비용 측정 (토큰 수 + AI Gateway 로그) | P1 | A |
| FR-04 | G9: FN → 화면 목록 (List/Detail/Form/Dashboard) | P2 | B |
| FR-05 | G9: 화면별 필드를 FN 입출력 + DM 컬럼에서 자동 추출 | P2 | B |
| FR-06 | G9: LLM 보강 — Navigation Flow + 에러 표시 | P2 | B |
| FR-07 | includeScreenSpec=true 시 ZIP에 specs/06-screens.md 포함 | P2 | B |
| FR-08 | CLI: ZIP → Claude Code 프롬프트 생성 + 자동 실행 | P1 | C |
| FR-09 | CLI 출력 프로젝트에서 typecheck + test 자동 검증 | P1 | C |
| FR-10 | collector mock Fetcher 통합 테스트 5건+ | P2 | D |

### 3.2 Non-Functional Requirements

| Category | Criteria |
|----------|----------|
| LLM 생성 시간 | 전체 9개 파일 < 180초 (skipLlm=false) |
| LLM 비용 | 1회 생성 < $0.50 (Sonnet 기준) |
| ZIP 크기 | < 500KB (텍스트 기반, 기존과 동일) |
| 테스트 추가 | ≥ 20건 (G9: 6 + collector: 5 + CLI: 5 + LLM: 4) |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] LLM 활성화 A/B 비교 완료 + 리포트 작성
- [ ] G9 화면 정의 생성기 구현 + orchestrator 통합
- [ ] ZIP → Working Version CLI 동작 + 검증
- [ ] 테스트 ≥ 20건 추가, 전체 통과
- [ ] Production 배포 + LPON org E2E (skipLlm=false)

### 4.2 Quality Criteria

- [ ] typecheck + lint 0 error
- [ ] LLM fallback 100% 동작 (LLM 실패 → mechanical)
- [ ] 화면↔기능↔API 크로스 레퍼런스 무결성

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|:----------:|------------|
| LLM Router 비용 초과 | Medium | Medium | tier2 Sonnet 기본, maxTokens 제한 (3000~4000). 비용 초과 시 mechanical fallback |
| LLM 생성 품질 불일치 | Medium | Medium | 각 생성기에 system prompt 튜닝 + golden output 비교 |
| Workers 30초 CPU 타임아웃 (LLM 대기) | High | Low | ctx.waitUntil() 이미 적용. LLM 호출은 I/O wait이므로 CPU 시간 미소모 |
| ZIP→WV CLI가 Claude Code 버전에 의존 | Medium | Low | `-p` 비대화형 모드 + `--dangerously-skip-permissions` 표준 패턴 |
| 화면 정의 생성기 FN→화면 매핑 정확도 | Medium | High | 한국어 키워드 기반 + LLM fallback. 매핑 실패 시 generic 화면 생성 |

---

## 6. Implementation Plan

### 6.1 Task 의존 그래프

```
Task A (LLM 활성화)  ─────────┐
                               ├── Task C (ZIP→WV E2E)
Task B (G9 화면 생성기) ───────┘

Task D (collector 통합 테스트)  ── 독립
```

- A와 B는 독립 병렬 가능 (tmux Worker)
- C는 A+B 완료 후 실행 (완전한 ZIP 필요)
- D는 완전 독립

### 6.2 구현 순서

| 순서 | Task | 파일 | 예상 |
|:----:|:----:|------|:----:|
| 1 | A-1~A-3 | orchestrator.ts (skipLlm=false 실행) | 중 |
| 2 | B-1~B-5 | generators/screen-spec.ts + orchestrator.ts | 대 |
| 3 | A-4~A-5 | docs/comparison/ (비교 리포트) | 소 |
| 4 | B-6~B-7 | screen-spec.test.ts + API 옵션 연동 | 중 |
| 5 | D-1~D-3 | collector.test.ts 확장 | 소 |
| 6 | C-1~C-4 | scripts/bootstrap-from-zip.ts | 대 |

### 6.3 G9 화면 정의 생성기 설계

```typescript
// generators/screen-spec.ts
export async function generateScreenSpec(
  env: Env,
  data: CollectedData,
  fsFile: GeneratedFile,    // G5: feature-spec → FN 목록
  dmFile: GeneratedFile,    // G4: data-model → 테이블/컬럼
  options?: { skipLlm?: boolean },
): Promise<GeneratedFile>

// 핵심 로직:
// 1. FN 목록에서 한국어 키워드로 화면 유형 추론
//    - "목록/조회/리스트" → List 화면
//    - "상세/정보" → Detail 화면
//    - "등록/생성/수정" → Form 화면
//    - "통계/현황" → Dashboard 화면
// 2. FN의 입력/출력 필드 → 화면 필드 매핑
// 3. DM의 테이블 컬럼 → 상세 필드 타입/제약
// 4. LLM 보강: 화면 흐름 + 에러 표시 + 접근성
```

### 6.4 Orchestrator 변경

```typescript
// Phase 2 (기존): G5 → G6+G7 병렬
// Phase 2 (변경): G5 → G6+G7+G9 병렬 (G9도 FN+DM 의존)

const [arch, api, screen] = await Promise.all([
  generateArchitecture(env, data, fs, { skipLlm }),
  generateApiSpec(env, fs, { skipLlm }),
  options?.includeScreenSpec !== false
    ? generateScreenSpec(env, data, fs, dm, { skipLlm })
    : null,
]);
if (screen) files.push(screen);
```

### 6.5 ZIP 최종 구조 (Sprint 3)

```
working-prototypes/{prototypeId}.zip
├── .foundry/origin.json              S1 (meta)
├── .foundry/manifest.json            S1 (meta)
├── README.md                         S1 (meta)
├── specs/01-business-logic.md        S1 (G1)
├── rules/business-rules.json         S1 (G2)
├── ontology/terms.jsonld             S1 (G3)
├── specs/02-data-model.md            S2 (G4)
├── specs/03-functions.md             S2 (G5)
├── specs/04-architecture.md          S2 (G6)
├── specs/05-api.md                   S2 (G7)
├── specs/06-screens.md               🆕 S3 (G9)
├── CLAUDE.md                         S2 (G8, S3에서 G9 참조 추가)
```

### 6.6 ZIP→Working Version CLI 설계

```bash
# 사용법
bun run scripts/bootstrap-from-zip.ts \
  --zip working-prototypes/wp-xxxx.zip \
  --output ./my-project \
  --auto  # Claude Code 자동 실행

# 동작:
# 1. ZIP 해제 → specs/ + CLAUDE.md 추출
# 2. CLAUDE.md를 프로젝트 루트에 배치
# 3. --auto 시: claude -p "이 CLAUDE.md와 specs/를 기반으로 Working Version을 생성해" \
#      --allowedTools 'Read,Write,Edit,Bash' --dangerously-skip-permissions
# 4. 생성 후: bun run typecheck && bun run test 자동 실행
```

---

## 7. Architecture Considerations

### 7.1 LLM 비용 모니터링

```
POST /prototype/generate (skipLlm=false)
  → orchestrator가 각 생성기에서 svc-llm-router 호출
  → AI Gateway 로그에서 토큰 수/비용 집계
  → D1 prototypes 테이블에 llm_token_count, llm_cost_usd 컬럼 추가
```

### 7.2 화면 유형 키워드 매핑

| 한국어 키워드 | 화면 유형 | UI 패턴 |
|--------------|----------|---------|
| 목록, 조회, 리스트, 검색 | List | 테이블 + 필터 + 페이지네이션 |
| 상세, 정보, 보기 | Detail | 카드 레이아웃 + 관련 데이터 |
| 등록, 생성, 수정, 편집 | Form | 폼 필드 + 유효성 검증 |
| 통계, 현황, 대시보드, 집계 | Dashboard | 차트 + KPI 카드 |
| 승인, 반려, 검토 | Workflow | 상태 뱃지 + 액션 버튼 |

---

## 8. Worker 병렬화 전략

tmux Agent Team 활용 시:
- **W1**: Task A (LLM 활성화 + 비교)
- **W2**: Task B (G9 화면 생성기)
- **Leader**: Task C (ZIP→WV E2E, W1+W2 완료 후)
- Task D는 Leader 또는 별도 실행

---

## 9. Next Steps

1. [ ] Design 문서 작성 (`/pdca design req-026-phase-2-sprint-3`)
2. [ ] Task A: LPON org `skipLlm=false` 테스트 실행
3. [ ] Task B: `generators/screen-spec.ts` 구현

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-03-20 | 초안 — Sprint 2 잔여항목 4건 → Sprint 3 통합 | Sinclair Seo |
