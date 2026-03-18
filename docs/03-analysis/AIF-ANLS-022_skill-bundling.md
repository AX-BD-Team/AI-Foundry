---
code: AIF-ANLS-025
title: "Skill 번들링 — Gap Analysis"
version: "1.0"
status: Active
category: ANLS
created: 2026-03-18
updated: 2026-03-18
author: Sinclair Seo
feature: skill-bundling
matchRate: 95
---

# Skill 번들링 — Gap Analysis

> Design (AIF-DSGN-025) vs Implementation 비교 분석

## Match Rate: 95% (Phase 1-2 범위)

| Category | Score | Status |
|----------|:-----:|:------:|
| Design Match (Phase 1-2) | 95% | OK |
| Architecture Compliance | 100% | OK |
| Convention Compliance | 98% | OK |
| Phase 3 (UX + Adapter) | 0% | NOT STARTED |

---

## 구현 완료 항목 (Phase 1-2)

| 파일 | Design 항목 | 상태 | 테스트 |
|------|------------|:----:|:------:|
| `bundler/categories.ts` | Section 3.1 | OK | - |
| `bundler/classifier.ts` | Section 3.2 | OK | 8 tests |
| `bundler/classifier.test.ts` | Section 6 | OK | - |
| `bundler/bundler.ts` | Section 3.3 | OK | 6 tests |
| `bundler/bundler.test.ts` | Section 6 | OK | - |
| `bundler/description-generator.ts` | Section 3.4 | OK | - |
| `bundler/rebundle-orchestrator.ts` | Section 3.5 | OK | - |
| `routes/admin.ts` (rebundle) | Section 3.6 | OK | - |
| `index.ts` (route registration) | Section 3.6 | OK | - |
| `migrations/0003_policy_classifications.sql` | Section 3.7 | OK | - |

## 변경 사항 (Design != Implementation, minor)

| 항목 | Design | Implementation | Impact |
|------|--------|----------------|--------|
| categories.ts 필드 | `{ ko, desc }` | `{ id, label, keywords }` | Low |
| descriptions Map value | 4-field | 2-field in bundler | Low |
| description-generator | Single batch | Per-category sequential | Medium |
| Policy title cap | 30 | 10 | Low |
| Policy fetch limit | 1000 | 2000 | Low |
| pipeline.stages | "skill-bundle" | "skill" | Low |
| System prompt 언어 | Korean | English | Low |

## 개선 사항 (Design에 없지만 구현됨)

- `CATEGORY_IDS` export, `keywords` 배열 (분류 품질 향상)
- Unknown category → "other" fallback
- Empty input guard, LLM success 체크
- condition/criteria 200자 truncation (토큰 절약)
- description-generator 에러 fallback (기본 설명 반환)
- rebundle-orchestrator 5개 헬퍼 함수 분리
- RebundleResult에 `domain` 필드 추가

## 미구현 (Phase 3 — 별도 세션)

| 항목 | Design Section | 설명 |
|------|---------------|------|
| evaluate-auto API | 3.9 | POST /skills/:id/evaluate-auto |
| Mock-up UX | 3.8 | SkillInvokerDemo 번들 스킬 지원 |
| CC Skill Export | 4.1-4.2 | .skill.md 포맷 export 스크립트 |

## 검증 결과

- typecheck: PASS (svc-skill 전체)
- tests: 202 tests, 16 files (신규 14 tests 포함)
- lint: PASS
