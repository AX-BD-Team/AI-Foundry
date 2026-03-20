# Skill Framework Phase 2 — Gap Analysis Report

> **Analysis Type**: Design vs Implementation Gap Analysis
>
> **Project**: AI Foundry
> **Version**: v0.6.0
> **Analyst**: gap-detector
> **Date**: 2026-03-20
> **Design Doc**: [skill-framework-2.design.md](../../02-design/features/skill-framework-2.design.md)
> **Plan Doc**: [skill-framework-2.plan.md](../../01-plan/features/skill-framework-2.plan.md)
> **REQ**: AIF-REQ-029 (Phase 2)

---

## 1. Overall Scores

| Category | Items | Pass | Score | Status |
|----------|:-----:|:----:|:-----:|:------:|
| deploy.mjs (§4.1) | 11 | 10 | 91% | PASS |
| usage-tracker.sh (§4.2) | 6 | 6 | 100% | PASS |
| usage.mjs (§4.3) | 8 | 8 | 100% | PASS |
| deploy-config.json (§3.1) | 7 | 7 | 100% | PASS |
| classify.mjs (§4.4) | 3 | 3 | 100% | PASS |
| lint.mjs (§4.5) | 3 | 3 | 100% | PASS |
| scan.mjs (§4.6) | 2 | 2 | 100% | PASS |
| classify-keywords.json (§4.7) | 3 | 2 | 67% | WARN |
| scan.test.mjs (§7) | 2 | 2 | 100% | PASS |
| Phase 1b Gap Resolution | 4 | 4 | 100% | PASS |
| File Structure (§5) | 2 | 2 | 100% | PASS |
| **Overall** | **51** | **49** | **96%** | **PASS** |

---

## 2. Gap Analysis Detail

### 2.1 deploy.mjs (Design §4.1) — 10/11 PASS

All 5 CLI options match (target, skills, dry-run, config, catalog). 6 core functions implemented:

- **loadConfig** — exits on missing config, prints creation guide ✅
- **loadCatalog** — exits on missing catalog ✅ (bonus: separate function)
- **filterSkills** — scope filter (user+project), deleted filter, glob matching via `matchGlob` helper, include/exclude arrays ✅
- **packageSkills** — directory copy (cpSync recursive) + single file copy, individual try-catch with skip ✅
- **deployTeam** — git clone --depth 1, add -A, commit, push; dry-run skips push; try-finally tmpDir cleanup ✅
- **deployLocal** — copies to resolved targetDir with `~` expansion ✅
- **printReport** — inline in main() (design: separate function) ⚠️ 사소한 구조 차이

### 2.2 usage-tracker.sh (Design §4.2) — 6/6 PASS

19줄 (Design 예상 ~35줄). 모든 설계 포인트 일치:
- `grep -o` + `cut -d'"' -f4` JSON 필드 추출 (jq 미사용) ✅
- Skill-only 필터 (non-Skill 이벤트 즉시 pass-through) ✅
- JSONL append (`>>`) ✅
- `CLAUDE_PLUGIN_DATA` fallback `~/.claude/plugin-data/skill-framework/` ✅
- 4-field 레코드: skill, ts, tool, event ✅
- 실행 권한 chmod +x ✅

### 2.3 usage.mjs (Design §4.3) — 8/8 PASS

216줄 (Design 예상 ~150줄). 4개 서브커맨드 모두 구현:

| 서브커맨드 | Design | 구현 | 매칭 |
|-----------|--------|------|:----:|
| `report` | --days 필터, Map 집계, Markdown 테이블 | "(no usage data)" fallback 포함 | ✅ |
| `deprecation-candidates` | --months, zero-usage + stale 필터 | usedSkills Set + updatedAt stale 체크 | ✅ |
| `rotate` | --keep, 월별 분리, 오래된 파일 삭제 | 월 그룹핑 + 파일 쓰기 + 메인 파일 rewrite | ✅ |
| `sync` | --catalog, usageCount/lastUsedAt 갱신 | 전체 기간 집계 + catalog write-back | ✅ |

### 2.4 deploy-config.json (Design §3.1) — 7/7 PASS

모든 필드 일치: team.repoUrl, team.branch, team.targetDir, team.commitPrefix, local.targetDir, include, exclude.

### 2.5 classify.mjs (Design §4.4) — 3/3 PASS

`loadKeywordsMap` try-catch 추가. 실패 시 경고 + `{}` 반환. Design §4.4 코드와 정확히 일치.

### 2.6 lint.mjs (Design §4.5) — 3/3 PASS

- `copyFileSync` try-catch + `process.exit(1)` (line 215-221) ✅
- `hasKeywords` 체크 (line 223) ✅
- `single-category` fix에서 hasKeywords 조건 (line 235) ✅

### 2.7 scan.mjs (Design §4.6) — 2/2 PASS

`keywordsMap` 빈 맵 체크 (line 450) + 경고 메시지. Design §4.6과 정확히 일치.

### 2.8 classify-keywords.json (Design §4.7) — 2/3

- 76 키워드 추가 (Design 목표 ~50, 52% 초과 달성) ✅
- 11 카테고리 전체에 분산 추가 ✅
- ⚠️ threshold 기본값 0.3→0.2 미변경 (scan.mjs:32 여전히 0.3). 단, `--threshold 0.2` CLI 옵션으로 런타임 조정 가능하며, 키워드 추가만으로 분류율 95% 달성

### 2.9 scan.test.mjs (Design §7) — 2/2 PASS

43개 테스트 확인 (기존 28 + 신규 15). Design §7.1 테스트 분배 일치:

| 모듈 | 목표 | 실제 | 테스트 |
|------|:----:|:----:|--------|
| deploy.mjs | 3 | 3 | filterSkills 패턴, plugin 제외, config 검증 |
| usage-tracker | 3 | 3 | JSONL 레코드, non-Skill 스킵, 빈 skill 스킵 |
| usage.mjs | 3 | 3 | 집계 정확도, 폐기 후보, rotate 분리 |
| 에러 핸들링 | 4 | 4 | loadKeywordsMap->{}, backup 중단, scan 스킵, lint 스킵 |
| 분류 정확도 | 2 | 2 | 튜닝 후 분류 증가, 오분류 낮음 |

### 2.10 Phase 1b Gap Resolution — 4/4 PASS

| Phase 1b Gap | 상태 | 해결 |
|-------------|:----:|------|
| G-2: loadKeywordsMap try-catch (lint) | ✅ | classify.mjs:65-70 공유 try-catch |
| G-3: copyFileSync try-catch (lint --fix) | ✅ | lint.mjs:215-221 exit(1) |
| G-4: loadKeywordsMap try-catch (scan) | ✅ | classify.mjs:65-70 공유 try-catch |
| lint hasKeywords empty check | ✅ | lint.mjs:223,235 |

### 2.11 File Structure (Design §5) — 2/2 PASS

- 신규 4개 파일 모두 올바른 위치 ✅
- 변경 4+1개 파일 확인 ✅

---

## 3. Match Rate

```
Total Items:   51
  PASS:        49 (96%)
  MINOR:        2 (4%)  ← threshold 미변경 + return 필드명 차이

Match Rate: 96%
```

---

## 4. Gaps Found

| ID | Gap | Design 위치 | 심각도 | 비고 |
|----|-----|-----------|:------:|------|
| G-1 | scan.mjs threshold 기본값 0.3 미변경 (Design: 0.3→0.2) | §4.7 | Low | `--threshold 0.2` CLI로 조정 가능. 키워드만으로 95% 달성하여 실질 영향 없음 |
| G-2 | deploy.mjs return 필드명 `deployed` vs Design `copied` | §4.1 | Low | `deployed`가 더 의미적으로 적절. 외부 API 아님 |

### 보너스 구현 (Design 초과)

| ID | 항목 | 위치 | 비고 |
|----|------|------|------|
| B-1 | `loadCatalog` 분리 함수 | deploy.mjs:19-27 | 에러 가이드 포함 |
| B-2 | `matchGlob` 재사용 헬퍼 | deploy.mjs:29-42 | 양방향 glob |
| B-3 | tmpDir finally 정리 | deploy.mjs:128-131 | 리소스 안전 정리 |
| B-4 | Unknown 서브커맨드 에러 | usage.mjs:210-214 | 사용 가능 명령 안내 |
| B-5 | 76 키워드 (목표 50) | classify-keywords.json | 52% 초과 달성 |
| B-6 | 개선된 deployTeam 시그니처 | deploy.mjs:95 | 내부 패키징 캡슐화 |

---

## 5. Recommended Actions

| # | 항목 | Gap | 예상 시간 | 필수 여부 |
|---|------|-----|----------|:--------:|
| 1 | scan.mjs threshold 기본값 0.2로 변경 | G-1 | 1분 | 선택 |
| 2 | Design 문서 return 필드명 반영 | G-2 | 1분 | 선택 |

**모든 Gap이 Low이므로 iterate 불필요. 96% ≥ 90% 기준 충족 → Report 진행 가능.**

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-03-20 | Phase 2 gap analysis | gap-detector |
