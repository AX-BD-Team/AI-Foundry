# Skill Framework Phase 2 — Planning Document

> **Summary**: Phase 1a+1b 인프라(CLI 4종 + 가이드라인 + 템플릿 + 자동분류 65%) 위에 팀 배포 파이프라인 + 사용량 추적 훅 + 자동분류 정확도 향상 + 에러 핸들링 보강을 추가하여 팀 Adoption 준비를 완성
>
> **Project**: AI Foundry
> **Version**: v0.6.0
> **Author**: Sinclair Seo
> **Date**: 2026-03-20
> **Status**: Draft
> **REQ**: AIF-REQ-029 (Phase 2)
> **Predecessor**: [skill-framework-1b.plan.md](skill-framework-1b.plan.md) (Phase 1b, 90% PASS)

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | Phase 1a+1b에서 210 스킬 인프라를 구축했지만, ① 팀원이 스킬을 설치·공유하는 배포 경로가 없고, ② 스킬 사용 빈도를 측정할 수 없어 폐기 정책 실행 불가, ③ 74개 플러그인이 미분류(35%)로 카탈로그 활용 제한, ④ Phase 1b 에러 핸들링 4건 미해소 |
| **Solution** | Git 기반 팀 배포 스크립트(deploy.mjs) + PreToolUse 사용량 추적 훅(usage-tracker) + 키워드 맵 튜닝으로 분류율 65%→85% + try-catch 에러 핸들링 4건 해소 |
| **Function/UX Effect** | `node deploy.mjs --target team` 1회로 팀 Git 리포에 배포. 사용량 리포트(`node usage.mjs report`)로 미사용 스킬 즉시 식별. 분류율 85%로 카탈로그 탐색 커버리지 확대 |
| **Core Value** | Phase 1a "가시성" → 1b "실용성" → Phase 2 **"운용성 확보"**: 스킬이 팀 단위로 배포·추적·정리되는 운영 사이클 완성. 폐기 정책의 데이터 기반 실행 가능 |

---

## 1. Overview

### 1.1 Purpose

Phase 1a+1b가 스킬 인벤토리·분류·작성 표준·자동교정을 완성했지만, 아래 갭이 팀 Adoption을 가로막고 있다:

| Gap ID | 미완 항목 | 영향 | Phase 1b 준비도 |
|--------|----------|------|:--------------:|
| P2-G1 | 팀 배포 파이프라인 | 팀원이 스킬을 받을 수 없음 | 75% |
| P2-G2 | 사용량 추적 훅 | 폐기 정책 기준 데이터 없음 | 50% |
| P2-G3 | 자동분류 정확도 61% | 74개 미분류, 카탈로그 35% 사각지대 | — |
| P2-G4 | 에러 핸들링 4건 | loadKeywordsMap/copyFileSync try-catch 없음 | — |

### 1.2 Background

- **PRD §4.2-6** (팀 배포): Git 기반 스킬 공유 + 플러그인 패키징. sandbox → traction → marketplace 승격
- **PRD §4.2-7** (사용량 추적): PreToolUse 훅으로 트리거 빈도 로깅. `${CLAUDE_PLUGIN_DATA}`에 저장
- **Phase 1b 잔여 이슈**: 에러 핸들링 G-2/G-3/G-4 (Low, 비차단), 분류 정확도 61% (목표 85% 미달)

### 1.3 Phase 1a+1b 성과 (선행 조건)

| 항목 | Phase 1a | Phase 1b | 합계 |
|------|:--------:|:--------:|:----:|
| CLI 도구 | 4종 (scan, catalog, lint, search) | +2 확장 (--fix, --auto-classify) | 4+2 |
| 데이터 파일 | 3개 | +1 (classify-keywords.json) | 4 |
| 문서 | 1 (catalog.md) | +2 (guide, policy) | 3 |
| 템플릿 | 0 | 3종 | 3 |
| 공유 유틸 | 0 | 1 (classify.mjs) | 1 |
| 테스트 | 17 | +11 | 28 |
| 분류율 | 10% (22/210) | 65% (136/210) | 6.5배 |

### 1.4 Related Documents

- Phase 1a: Plan/Design/Analysis/Report (`skill-framework.*.md`)
- Phase 1b: Plan/Design/Analysis/Report (`skill-framework-1b.*.md`)
- PRD: `skill-framework/prd-final.md` (§4.2-6, §4.2-7)
- 폐기 정책: `skill-framework/docs/deprecation-policy.md`
- 가이드라인: `skill-framework/docs/skill-writing-guide.md`

---

## 2. Scope

### 2.1 In Scope (Phase 2)

- [ ] **FR-01**: 팀 배포 스크립트 (`deploy.mjs`) — Git 리포 기반 스킬 패키징 + 배포
- [ ] **FR-02**: 사용량 추적 훅 (`usage-tracker.sh`) — PreToolUse 훅으로 스킬 트리거 로깅
- [ ] **FR-03**: 사용량 리포트 (`usage.mjs`) — 로그 집계 + 미사용 스킬 식별 + 폐기 후보 리스트
- [ ] **FR-04**: 자동분류 정확도 향상 — 키워드 맵 튜닝 + threshold 조정 (61%→85% 목표)
- [ ] **FR-05**: Phase 1b 에러 핸들링 해소 — try-catch 4건 (G-2, G-3, G-4)
- [ ] **FR-06**: 테스트 확장 — 신규 기능 + 에러 핸들링 테스트 추가

### 2.2 Out of Scope (Phase 3 이연)

- **On Demand Hooks** (`/careful`, `/freeze`): 별도 훅 시스템 설계 필요 (PRD §4.2-11)
- **스킬 조합/의존성 그래프**: dependencies 필드 준비됨, 그래프 시각화/순환 검출은 Phase 3 (PRD §4.2-12)
- **메모리/데이터 저장 표준**: 스킬별 상태 저장 패턴 (PRD §4.2-13)
- **기존 스킬 리팩토링**: ax-*/프로젝트 스킬 가이드라인 적용 (PRD §4.2-9)
- **Claude Code Plugin Marketplace**: 사내 마켓플레이스 인프라

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | **팀 배포 스크립트** (`deploy.mjs`): 선택한 스킬을 Git 리포 구조로 패키징하고 push. `--target team\|local` 옵션. 팀 리포 경로는 `deploy-config.json`에서 관리 | High | Pending |
| FR-02 | **사용량 추적 훅** (`usage-tracker.sh`): PreToolUse 이벤트에서 스킬명 + 타임스탬프를 JSONL 파일에 append. `${CLAUDE_PLUGIN_DATA}/usage.jsonl` 경로 사용 | High | Pending |
| FR-03 | **사용량 리포트** (`usage.mjs`): `report` 서브커맨드로 기간별 사용 빈도 집계. `deprecation-candidates` 서브커맨드로 usageCount=0 + 3개월 미사용 스킬 리스트 | High | Pending |
| FR-04 | **자동분류 정확도**: classify-keywords.json 키워드 추가/조정 + threshold 0.3→0.2 조정으로 분류율 85% 달성. 오분류율 5% 이하 유지 | Medium | Pending |
| FR-05 | **에러 핸들링**: loadKeywordsMap try-catch (lint, scan), copyFileSync try-catch (lint). 실패 시 graceful skip + 경고 출력 | Medium | Pending |
| FR-06 | **테스트 확장**: deploy.mjs 3건, usage-tracker 3건, usage.mjs 3건, 에러 핸들링 4건, 분류 정확도 2건 = 15건 추가 (28→43 목표) | Medium | Pending |

### 3.2 Non-Functional Requirements

| ID | Category | Criteria | Measurement |
|----|----------|----------|-------------|
| NFR-01 | 호환성 | deploy.mjs는 Git CLI만 의존 (추가 npm 패키지 없음) | 외부 의존성 0 |
| NFR-02 | 성능 | usage-tracker.sh는 PreToolUse당 10ms 이내 완료 | 체감 지연 없음 |
| NFR-03 | 데이터 안전 | usage.jsonl은 append-only, 스킬명/타임스탬프만 저장 (PII 없음) | 로그 필드 검증 |
| NFR-04 | 이식성 | 모든 스크립트 Node.js ESM 표준 (node:fs, node:path만) | import 검증 |
| NFR-05 | 테스트 | 기존 28 + 신규 15 = 43 테스트 전체 PASS | `bun run test` |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] `deploy.mjs` 동작 확인 (--target local 모드로 로컬 배포 검증)
- [ ] usage-tracker.sh가 PreToolUse 훅으로 등록 가능
- [ ] `usage.mjs report` 출력 확인
- [ ] 분류율 85% 이상 달성 (scan --auto-classify 재실행)
- [ ] 에러 핸들링 4건 해소 (try-catch 추가)
- [ ] 43 테스트 전체 PASS

### 4.2 Quality Criteria

- [ ] lint 에러 0
- [ ] 기존 28 테스트 regression 없음
- [ ] 오분류율 5% 이하 (수동 검증 10건 샘플링)
- [ ] PDCA Match Rate ≥ 90%

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| 키워드 튜닝으로 85% 미달 | Medium | Medium | threshold 0.15까지 추가 조정, fallback으로 description 길이 기반 휴리스틱 |
| PreToolUse 훅 성능 오버헤드 | Low | Low | 파일 append만 사용 (DB/API 호출 없음), 10ms 이내 보장 |
| 팀 리포 권한/접근 이슈 | Medium | Low | deploy-config.json에 SSH/HTTPS 선택 옵션, 권한 실패 시 에러 메시지 가이드 |
| usage.jsonl 파일 크기 증가 | Low | Medium | 월별 rotation 로직 (usage.mjs에 `rotate` 서브커맨드) |

---

## 6. Architecture Considerations

### 6.1 파일 구조 (Phase 2 추가분)

```
skill-framework/
├── scripts/
│   ├── deploy.mjs          ← NEW: 팀 배포 스크립트
│   ├── usage.mjs           ← NEW: 사용량 리포트 CLI
│   ├── scan.mjs            ← MODIFIED: 에러 핸들링 추가
│   ├── lint.mjs            ← MODIFIED: 에러 핸들링 추가
│   ├── classify.mjs        ← MODIFIED: try-catch 추가
│   ├── catalog.mjs         (기존 유지)
│   └── search.mjs          (기존 유지)
├── hooks/
│   └── usage-tracker.sh    ← NEW: PreToolUse 사용량 추적 훅
├── data/
│   ├── deploy-config.json  ← NEW: 팀 리포 설정
│   ├── classify-keywords.json  ← MODIFIED: 키워드 튜닝
│   ├── skill-catalog.json  (기존 유지)
│   ├── categories.json     (기존 유지)
│   └── lint-rules.json     (기존 유지)
├── scripts/scan.test.mjs   ← MODIFIED: 15건 테스트 추가
└── ...                     (기존 docs/, templates/ 유지)
```

### 6.2 주요 설계 결정

| Decision | Options | Selected | Rationale |
|----------|---------|----------|-----------|
| 배포 방식 | npm publish / Git push / 파일 복사 | **Git push** | 팀 리포가 이미 Git 기반, npm registry 불필요 |
| 사용량 저장 | SQLite / JSONL / KV | **JSONL** | append-only 단순성, 외부 의존성 0, grep 가능 |
| 훅 언어 | Node.js / Bash | **Bash** | PreToolUse 훅 최소 지연 (프로세스 오버헤드 없음) |
| 분류 개선 | LLM 2-pass / TF-IDF / 키워드 튜닝 | **키워드 튜닝** | 외부 의존성 0 원칙 유지, 빠른 반복 |
| 리포트 출력 | HTML / Markdown / JSON | **Markdown + JSON** | CLI 친화적, 카탈로그와 일관성 |

### 6.3 deploy.mjs 워크플로우

```
[사용자] node deploy.mjs --target team --skills "ax-*"
  ↓
[1] skill-catalog.json에서 대상 스킬 필터링
  ↓
[2] deploy-config.json에서 팀 리포 경로 로드
  ↓
[3] 스킬 파일 복사 → 임시 디렉토리에 패키징
  ↓
[4] git add + commit + push (팀 리포)
  ↓
[5] 결과 리포트 출력 (배포된 스킬 목록 + 버전)
```

### 6.4 usage-tracker.sh 데이터 플로우

```
[PreToolUse 이벤트] → stdin JSON 수신
  ↓
[jq로 tool_name 추출] → 스킬명 매칭
  ↓
[JSONL append] → ${CLAUDE_PLUGIN_DATA}/usage.jsonl
  형식: {"skill":"ax-session-end","ts":"2026-03-20T12:00:00Z","tool":"Skill"}
```

---

## 7. Sprint Plan

### Sprint 2-1: 팀 배포 + 사용량 추적 (주 작업)

| # | 작업 | 예상 파일 | Worker 배정 |
|---|------|----------|:-----------:|
| 1 | deploy.mjs 구현 | scripts/deploy.mjs | W1 |
| 2 | deploy-config.json 스키마 | data/deploy-config.json | W1 |
| 3 | usage-tracker.sh 구현 | hooks/usage-tracker.sh | W2 |
| 4 | usage.mjs 구현 (report + deprecation-candidates + rotate) | scripts/usage.mjs | W2 |

### Sprint 2-2: 품질 보강 (보조 작업)

| # | 작업 | 예상 파일 | Worker 배정 |
|---|------|----------|:-----------:|
| 5 | classify-keywords.json 키워드 튜닝 | data/classify-keywords.json | W1 |
| 6 | 에러 핸들링 4건 해소 | scripts/classify.mjs, lint.mjs, scan.mjs | W2 |
| 7 | 테스트 15건 추가 | scripts/scan.test.mjs | W2 |

### Agent Team 전략

```
Team: sf-2 (2 Workers, 예상 7분)
├── W1: 배포 관련 (deploy.mjs + deploy-config.json + 키워드 튜닝)
│   허용 파일: scripts/deploy.mjs, data/deploy-config.json, data/classify-keywords.json
└── W2: 추적 + 품질 (usage-tracker.sh + usage.mjs + 에러 핸들링 + 테스트)
    허용 파일: hooks/usage-tracker.sh, scripts/usage.mjs, scripts/classify.mjs,
              scripts/lint.mjs, scripts/scan.mjs, scripts/scan.test.mjs
```

파일 충돌 없음 (W1: deploy+config+keywords, W2: hooks+usage+기존 스크립트+테스트).

---

## 8. Next Steps

1. [ ] Design 문서 작성 (`skill-framework-2.design.md`)
2. [ ] Agent Team sf-2 실행 (2 Workers)
3. [ ] Gap Analysis → Match Rate ≥ 90%
4. [ ] Completion Report

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-20 | Initial Phase 2 plan | Sinclair Seo |
