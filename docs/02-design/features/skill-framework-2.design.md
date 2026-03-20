# Skill Framework Phase 2 — Design Document

> **Summary**: 팀 배포 스크립트(deploy.mjs) + 사용량 추적 훅(usage-tracker.sh) + 리포트 CLI(usage.mjs) + 분류 정확도 향상 + 에러 핸들링 보강의 기술 설계
>
> **Project**: AI Foundry
> **Version**: v0.6.0
> **Author**: Sinclair Seo
> **Date**: 2026-03-20
> **Status**: Draft
> **Planning Doc**: [skill-framework-2.plan.md](../01-plan/features/skill-framework-2.plan.md)

---

## 1. Overview

### 1.1 Design Goals

1. **팀 배포**: 선택한 스킬을 팀 Git 리포에 패키징·배포하는 CLI 워크플로우 제공
2. **사용량 추적**: PreToolUse 훅으로 스킬 호출 빈도를 JSONL 로그에 기록
3. **폐기 데이터 기반**: 사용량 로그를 집계하여 deprecation-policy.md 기준에 맞는 폐기 후보 자동 식별
4. **분류 정확도 향상**: 키워드 맵 튜닝으로 65%→85% (74→≤32 uncategorized)
5. **에러 핸들링 완성**: Phase 1b 잔여 4건 try-catch 해소

### 1.2 Design Principles

- **외부 의존성 0**: Node.js 표준 모듈(node:fs, node:path, node:util)과 Git CLI만 사용
- **Append-only 로깅**: 사용량 데이터 손실 방지, 간단한 분석 가능
- **기존 인터페이스 확장**: 새 CLI는 기존 scan/lint/catalog와 동일한 parseArgs + JSON 데이터 패턴
- **Graceful 실패**: 모든 외부 I/O(파일, Git)에 try-catch + 경고 출력 후 계속 진행

---

## 2. Architecture

### 2.1 Component Diagram

```
┌─────────────────────────────────────────────────────────┐
│  Skill Framework CLI Layer                              │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐  │
│  │deploy.mjs│  │usage.mjs │  │ scan.mjs │  │lint.mjs│  │
│  │  [NEW]   │  │  [NEW]   │  │[MODIFIED]│  │[MODIF.]│  │
│  └─────┬────┘  └─────┬────┘  └─────┬────┘  └───┬────┘  │
│        │             │             │            │       │
│  ┌─────▼─────────────▼─────────────▼────────────▼────┐  │
│  │              classify.mjs [MODIFIED]               │  │
│  │         (try-catch 보강 + loadKeywordsMap)         │  │
│  └───────────────────┬───────────────────────────────┘  │
│                      │                                   │
│  ┌───────────────────▼───────────────────────────────┐  │
│  │                 Data Layer                         │  │
│  │  skill-catalog.json  classify-keywords.json [MOD]  │  │
│  │  deploy-config.json [NEW]                          │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Hook Layer                                        │  │
│  │  usage-tracker.sh [NEW] → usage.jsonl              │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### 2.2 Data Flow

```
[deploy.mjs 배포 플로우]
  skill-catalog.json → 필터 → deploy-config.json → 패키징 → Git push

[usage-tracker.sh 추적 플로우]
  PreToolUse stdin → skill명 추출 → usage.jsonl (append)

[usage.mjs 리포트 플로우]
  usage.jsonl → 집계 → report.md + deprecation-candidates 출력
```

---

## 3. Data Model

### 3.1 deploy-config.json Schema

```json
{
  "team": {
    "repoUrl": "git@github.com:KTDS-AXBD/shared-skills.git",
    "branch": "main",
    "targetDir": "skills/",
    "commitPrefix": "chore(skills):"
  },
  "local": {
    "targetDir": "~/.claude/skills/"
  },
  "include": ["ax-*"],
  "exclude": ["ax-test-*"],
  "version": "1.0.0"
}
```

| 필드 | 타입 | 필수 | 설명 |
|------|------|:----:|------|
| `team.repoUrl` | string | Y | 팀 Git 리포 URL (SSH 또는 HTTPS) |
| `team.branch` | string | Y | 배포 대상 브랜치 |
| `team.targetDir` | string | Y | 리포 내 스킬 배치 경로 |
| `team.commitPrefix` | string | N | 커밋 메시지 접두사 (default: `chore(skills):`) |
| `local.targetDir` | string | Y | 로컬 배포 경로 |
| `include` | string[] | N | 포함 스킬 ID 패턴 (glob) |
| `exclude` | string[] | N | 제외 스킬 ID 패턴 (glob) |

### 3.2 usage.jsonl Record Schema

```json
{"skill": "ax-session-end", "ts": "2026-03-20T12:30:45.123Z", "tool": "Skill", "event": "PreToolUse"}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `skill` | string | 스킬 ID (Skill tool의 `skill` 파라미터 값) |
| `ts` | string | ISO 8601 타임스탬프 |
| `tool` | string | 도구명 (항상 `"Skill"`) |
| `event` | string | 이벤트 타입 (항상 `"PreToolUse"`) |

### 3.3 SkillEntry 확장 (기존 skill-catalog.json)

Phase 1b에서 추가된 `autoClassified`, `classifyConfidence` 외 추가 필드 없음.
`usageCount`, `lastUsedAt`은 이미 Phase 1a에서 선언됨 (usage.mjs가 집계하여 갱신).

---

## 4. Module Specifications

### 4.1 deploy.mjs — 팀 배포 스크립트

```javascript
#!/usr/bin/env node
/**
 * deploy.mjs — Skill deployment to team repo or local directory
 *
 * Usage:
 *   node skill-framework/scripts/deploy.mjs --target team|local [--skills "pattern"] [--dry-run]
 */

import { parseArgs } from 'node:util';
// CLI options
const options = {
  target:  { type: 'string',  default: 'local' },   // 'team' | 'local'
  skills:  { type: 'string',  default: '*' },        // glob pattern for skill IDs
  'dry-run': { type: 'boolean', default: false },
  config:  { type: 'string',  default: 'skill-framework/data/deploy-config.json' },
  catalog: { type: 'string',  default: 'skill-framework/data/skill-catalog.json' },
};
```

**주요 함수:**

```javascript
/**
 * 1) loadConfig(configPath) → DeployConfig
 *    - deploy-config.json 로드, 없으면 에러 (배포 설정 필수)
 */

/**
 * 2) filterSkills(catalog, pattern, config) → SkillEntry[]
 *    - skill-catalog.json에서 config.include/exclude + --skills 패턴으로 필터
 *    - scope: user + project만 (plugin은 외부이므로 배포 불가)
 *    - deleted: true인 스킬 제외
 */

/**
 * 3) packageSkills(skills, targetDir) → { copied: string[], skipped: string[] }
 *    - 각 스킬의 path에서 파일 트리를 targetDir에 복사
 *    - SKILL.md 기반 스킬: 디렉토리 전체 복사
 *    - command 스킬: 단일 .md 파일 복사
 */

/**
 * 4) deployTeam(config, packageDir) → { success: boolean, commitHash: string }
 *    - git clone --depth 1 → 파일 복사 → git add → commit → push
 *    - execSync('git ...') 사용, try-catch로 각 단계 에러 처리
 *    - --dry-run 시 commit까지만 하고 push 안 함
 */

/**
 * 5) deployLocal(config, packageDir) → { success: boolean, copied: number }
 *    - targetDir로 단순 파일 복사 (cp -r 패턴)
 *    - 기존 파일 존재 시 덮어쓰기 (최신 버전 우선)
 */

/**
 * 6) printReport(result) → void
 *    - 배포된 스킬 목록 + 스킬 수 + 대상 경로 출력
 */
```

**에러 처리:**
- `deploy-config.json` 미존재: 에러 메시지 + 설정 파일 생성 가이드 출력 후 exit(1)
- Git clone/push 실패: 에러 메시지 + 권한/URL 확인 가이드 출력
- 파일 복사 실패: 개별 스킬 건너뛰기 + 경고 출력, 나머지 계속 진행

### 4.2 usage-tracker.sh — PreToolUse 사용량 추적 훅

```bash
#!/usr/bin/env bash
# usage-tracker.sh — PreToolUse hook for skill usage tracking
#
# Hook config (.claude/settings.json):
#   "hooks": {
#     "PreToolUse": [{
#       "type": "command",
#       "command": "bash skill-framework/hooks/usage-tracker.sh",
#       "timeout": 5000
#     }]
#   }
#
# Input: JSON on stdin (PreToolUse event)
# Output: JSON on stdout (pass-through, no blocking)

# Read stdin
INPUT=$(cat)

# Extract tool name — only process "Skill" tool invocations
TOOL_NAME=$(echo "$INPUT" | grep -o '"tool_name":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ "$TOOL_NAME" != "Skill" ]; then
  # Not a skill invocation — pass through immediately
  echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse"}}'
  exit 0
fi

# Extract skill name from tool_input.skill field
SKILL_NAME=$(echo "$INPUT" | grep -o '"skill":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$SKILL_NAME" ]; then
  echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse"}}'
  exit 0
fi

# Determine log path
LOG_DIR="${CLAUDE_PLUGIN_DATA:-$HOME/.claude/plugin-data/skill-framework}"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/usage.jsonl"

# Append usage record (non-blocking)
TS=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
echo "{\"skill\":\"$SKILL_NAME\",\"ts\":\"$TS\",\"tool\":\"Skill\",\"event\":\"PreToolUse\"}" >> "$LOG_FILE"

# Pass through — do not block
echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse"}}'
```

**설계 포인트:**
- `grep + cut` 사용 (`jq` 의존 제거) — 모든 환경에서 동작
- `CLAUDE_PLUGIN_DATA` 환경변수 우선, fallback `~/.claude/plugin-data/skill-framework/`
- append-only (`>>`) — 파일 잠금 불필요 (단일 프로세스)
- stdout으로 pass-through JSON 출력 — 훅이 도구 실행을 차단하지 않음
- timeout: 5000ms 설정 (실제 50ms 이내 완료 예상)

### 4.3 usage.mjs — 사용량 리포트 CLI

```javascript
#!/usr/bin/env node
/**
 * usage.mjs — Skill usage report and deprecation candidate finder
 *
 * Usage:
 *   node skill-framework/scripts/usage.mjs report [--days 30] [--format md|json]
 *   node skill-framework/scripts/usage.mjs deprecation-candidates [--months 3]
 *   node skill-framework/scripts/usage.mjs rotate [--keep 3]
 *   node skill-framework/scripts/usage.mjs sync [--catalog path]
 */
```

**서브커맨드:**

#### 4.3.1 `report` — 사용 빈도 리포트

```javascript
/**
 * report(days, format)
 * 1. usage.jsonl 로드 (줄 단위 JSON.parse)
 * 2. --days 기간 필터 (기본 30일)
 * 3. skill별 호출 수 집계 (Map<skillName, count>)
 * 4. 내림차순 정렬
 * 5. 출력:
 *    - md: Markdown 테이블 (| Rank | Skill | Count | Last Used |)
 *    - json: JSON 배열
 */
```

출력 예시 (Markdown):
```
📊 Skill Usage Report (last 30 days)
─────────────────────────────────────
| # | Skill           | Count | Last Used  |
|---|-----------------|:-----:|------------|
| 1 | ax-session-end  |   42  | 2026-03-20 |
| 2 | ax-session-start|   38  | 2026-03-20 |
| 3 | bkit:pdca       |   15  | 2026-03-20 |
| ...                                       |
─────────────────────────────────────
Total: 210 invocations, 18 unique skills
```

#### 4.3.2 `deprecation-candidates` — 폐기 후보 식별

```javascript
/**
 * deprecationCandidates(months)
 * 1. usage.jsonl 전체 로드
 * 2. skill-catalog.json 로드
 * 3. 각 스킬의 usageCount 계산 (전체 기간)
 * 4. deprecation-policy.md 기준 적용:
 *    - usageCount === 0 (최근 N개월)
 *    - lastModified > N개월 전
 *    - 대체 스킬 존재 여부 (수동 확인 필요 → 플래그만 표시)
 * 5. 후보 목록 출력 + 3-condition 체크 테이블
 */
```

출력 예시:
```
🗑️ Deprecation Candidates (3-month window)
───────────────────────────────────────────
| Skill         | Usage | Last Modified | Alt Exists | Score |
|---------------|:-----:|:------------:|:----------:|:-----:|
| old-deploy    |   0   | 2025-12-01   |     ?      |  2/3  |
| test-runner-v1|   0   | 2025-11-15   |     ?      |  2/3  |
───────────────────────────────────────────
⚠️ "Alt Exists" requires manual review
```

#### 4.3.3 `rotate` — 로그 로테이션

```javascript
/**
 * rotate(keep)
 * 1. usage.jsonl → usage-YYYY-MM.jsonl 로 월별 분리
 * 2. --keep N개월분만 유지 (기본 3)
 * 3. 오래된 파일 삭제
 */
```

#### 4.3.4 `sync` — 카탈로그 usageCount 동기화

```javascript
/**
 * sync(catalogPath)
 * 1. usage.jsonl 전체 로드 → 스킬별 count + lastUsedAt 집계
 * 2. skill-catalog.json 로드
 * 3. 각 스킬의 usageCount, lastUsedAt 갱신
 * 4. catalog 저장
 */
```

### 4.4 classify.mjs — 에러 핸들링 보강

```javascript
// 변경 전:
export function loadKeywordsMap(basePath) {
  const p = resolve(basePath, 'skill-framework/data/classify-keywords.json');
  return JSON.parse(readFileSync(p, 'utf-8'));
}

// 변경 후:
export function loadKeywordsMap(basePath) {
  const p = resolve(basePath, 'skill-framework/data/classify-keywords.json');
  try {
    return JSON.parse(readFileSync(p, 'utf-8'));
  } catch (err) {
    console.warn(`⚠️  Warning: Cannot load classify-keywords.json (${err.message}). Skipping classification.`);
    return {};
  }
}
```

### 4.5 lint.mjs — 에러 핸들링 보강

```javascript
// --fix 모드 변경:
// 1. copyFileSync try-catch 추가
if (values.fix) {
  const backupPath = inputPath.replace(/\.json$/, '.json.bak');
  try {
    copyFileSync(inputPath, backupPath);
    console.log(`\n📋 Backup: ${backupPath}`);
  } catch (err) {
    console.warn(`⚠️  Warning: Cannot create backup (${err.message}). Fix aborted.`);
    process.exit(1);  // backup 실패 시 fix 중단 (데이터 안전)
  }

  // 2. loadKeywordsMap는 classify.mjs의 try-catch로 자동 보호
  const keywordsMap = loadKeywordsMap(process.cwd());
  // keywordsMap이 {} 이면 classification fix 건너뜀
  if (Object.keys(keywordsMap).length === 0) {
    console.warn('⚠️  Keywords map empty — skipping single-category fix.');
  }
  // ...
}
```

### 4.6 scan.mjs — 에러 핸들링 보강

```javascript
// auto-classify 모드에서 loadKeywordsMap 실패 시 graceful skip:
if (autoClassify) {
  const keywordsMap = loadKeywordsMap(projectRoot);
  // loadKeywordsMap은 이제 실패 시 {} 반환
  if (Object.keys(keywordsMap).length === 0) {
    console.warn('⚠️  Auto-classify skipped: keywords map unavailable.');
  } else {
    let classified = 0;
    // ... 기존 로직
  }
}
```

### 4.7 classify-keywords.json — 키워드 튜닝

현재 11 카테고리 × 7~10 키워드. 74개 미분류 플러그인의 주요 패턴 분석 결과:

**추가할 키워드:**

| 카테고리 | 추가 키워드 | 이유 |
|----------|-----------|------|
| `code-quality` | `audit`, `improve`, `clean`, `analyze`, `detect` | bkit code-review, code-analyzer 등 미매칭 |
| `requirements-planning` | `spec`, `design`, `architecture`, `roadmap`, `phase`, `strategy`, `product` | bkit plan/design 관련 스킬 미매칭 |
| `code-scaffolding` | `create`, `new`, `setup`, `project`, `app`, `framework`, `component` | bkit starter/dynamic/enterprise 미매칭 |
| `cicd-deployment` | `wrangler`, `cloudflare`, `pages`, `workers`, `docker`, `container` | deploy 관련 플러그인 미매칭 |
| `business-automation` | `hook`, `cron`, `trigger`, `event`, `notification`, `alert` | 훅/자동화 관련 미매칭 |
| `doc-governance` | `document`, `index`, `archive`, `template`, `guide`, `policy`, `readme` | 문서 관련 스킬 미매칭 |
| `product-verification` | `gap`, `check`, `validate`, `review`, `inspect`, `security`, `scan` | 검증 관련 미매칭 |
| `infra-operations` | `kubernetes`, `k8s`, `terraform`, `aws`, `cloud`, `server`, `network` | 인프라 관련 미매칭 |
| `data-analysis` | `score`, `trend`, `aggregate`, `statistics`, `log`, `observe` | 분석 관련 미매칭 |

**threshold 조정**: 0.3 → 0.2 (더 넓게 매칭, 오분류는 5% 이하 유지 목표)

**예상 효과**: 키워드 ~50개 추가 + threshold 하향 → 미분류 74→≤32 (분류율 85% 이상)

---

## 5. File Structure

### 5.1 신규 파일 (4개)

| 파일 | 줄 수(예상) | 역할 |
|------|:----------:|------|
| `scripts/deploy.mjs` | ~120 | 팀 배포 스크립트 |
| `scripts/usage.mjs` | ~150 | 사용량 리포트 CLI (4 서브커맨드) |
| `hooks/usage-tracker.sh` | ~35 | PreToolUse 사용량 추적 훅 |
| `data/deploy-config.json` | ~15 | 팀 리포 배포 설정 |

### 5.2 변경 파일 (4개)

| 파일 | 변경 내용 |
|------|----------|
| `scripts/classify.mjs` | `loadKeywordsMap` try-catch 추가 (~5줄) |
| `scripts/lint.mjs` | `copyFileSync` try-catch + keywordsMap 빈 맵 체크 (~10줄) |
| `scripts/scan.mjs` | auto-classify 에러 핸들링 + keywordsMap 빈 맵 체크 (~5줄) |
| `data/classify-keywords.json` | ~50 키워드 추가 (11 카테고리에 분산) |

### 5.3 테스트 파일

| 파일 | 변경 내용 |
|------|----------|
| `scripts/scan.test.mjs` | +15건 테스트 추가 (28→43) |

---

## 6. Error Handling

### 6.1 에러 처리 규칙

| 상황 | 동작 | 종료 여부 |
|------|------|:--------:|
| deploy-config.json 미존재 | 에러 메시지 + 생성 가이드 | exit(1) |
| Git clone/push 실패 | 에러 메시지 + 권한 확인 가이드 | exit(1) |
| 개별 스킬 파일 복사 실패 | 경고 + 건너뛰기, 나머지 계속 | 계속 |
| classify-keywords.json 로드 실패 | 경고 + {} 반환 (분류 건너뜀) | 계속 |
| copyFileSync 백업 실패 | 경고 + fix 모드 중단 | exit(1) |
| usage.jsonl 존재하지 않음 | 빈 리포트 출력 ("No usage data") | 계속 |
| usage.jsonl 개별 줄 파싱 실패 | 해당 줄 건너뛰기 + 경고 | 계속 |

---

## 7. Test Plan

### 7.1 테스트 범위

| 모듈 | 테스트 수 | 테스트 대상 |
|------|:--------:|----------|
| deploy.mjs | 3 | filterSkills 패턴 매칭, packageSkills 파일 구조, deployLocal 복사 |
| usage-tracker.sh | 3 | Skill 이벤트 로깅, non-Skill 이벤트 스킵, 빈 입력 처리 |
| usage.mjs | 3 | report 집계 정확도, deprecation-candidates 필터, rotate 파일 분리 |
| 에러 핸들링 | 4 | loadKeywordsMap 실패→{}, copyFileSync 실패→중단, scan 빈맵 스킵, lint 빈맵 스킵 |
| 분류 정확도 | 2 | 튜닝 후 분류율 ≥85%, 오분류율 ≤5% |
| **합계** | **15** | 기존 28 + 15 = **43** |

### 7.2 테스트 케이스 상세

```javascript
// === deploy.mjs ===
test('filterSkills: pattern "ax-*" matches user scope commands', () => { ... });
test('filterSkills: excludes deleted and plugin scope skills', () => { ... });
test('deployLocal: copies skill files to target directory', () => { ... });

// === usage-tracker ===
test('usage-tracker: logs Skill tool invocations to JSONL', () => { ... });
test('usage-tracker: skips non-Skill tool events', () => { ... });
test('usage-tracker: handles empty stdin gracefully', () => { ... });

// === usage.mjs ===
test('report: aggregates usage counts correctly', () => { ... });
test('deprecation-candidates: identifies zero-usage skills', () => { ... });
test('rotate: splits JSONL by month and keeps N months', () => { ... });

// === Error Handling ===
test('loadKeywordsMap: returns {} when file missing', () => { ... });
test('lint --fix: aborts when backup fails', () => { ... });
test('scan --auto-classify: skips when keywords map empty', () => { ... });
test('lint --fix: skips category fix when keywords map empty', () => { ... });

// === Classification Accuracy ===
test('classify-keywords tuning: achieves ≥85% classification rate', () => { ... });
test('classify-keywords tuning: false positive rate ≤5%', () => { ... });
```

---

## 8. Agent Team Work Division

### 8.1 W1: 배포 + 키워드 (3 파일, 파일 충돌 없음)

| 파일 | 작업 |
|------|------|
| `scripts/deploy.mjs` | 신규 생성 (~120줄) |
| `data/deploy-config.json` | 신규 생성 (~15줄) |
| `data/classify-keywords.json` | 키워드 ~50개 추가 |

### 8.2 W2: 추적 + 품질 + 테스트 (6 파일, 파일 충돌 없음)

| 파일 | 작업 |
|------|------|
| `hooks/usage-tracker.sh` | 신규 생성 (~35줄) |
| `scripts/usage.mjs` | 신규 생성 (~150줄) |
| `scripts/classify.mjs` | try-catch 추가 (~5줄 변경) |
| `scripts/lint.mjs` | try-catch + 빈맵 체크 (~10줄 변경) |
| `scripts/scan.mjs` | 빈맵 체크 (~5줄 변경) |
| `scripts/scan.test.mjs` | +15건 테스트 추가 |

### 8.3 구현 순서

```
Phase 1 (병렬): W1 + W2 동시 실행
  W1: deploy.mjs + deploy-config.json + classify-keywords.json
  W2: usage-tracker.sh + usage.mjs + classify.mjs + lint.mjs + scan.mjs + scan.test.mjs

Phase 2 (리더): 검증
  - 테스트 실행 (43/43 PASS 확인)
  - scan --auto-classify 실행 → 분류율 확인
  - File Guard 결과 확인
```

---

## 9. Implementation Checklist

1. [ ] `data/deploy-config.json` 생성 (기본 설정)
2. [ ] `scripts/deploy.mjs` 구현 (parseArgs + 5개 함수)
3. [ ] `hooks/usage-tracker.sh` 구현 (PreToolUse → JSONL)
4. [ ] `scripts/usage.mjs` 구현 (4 서브커맨드)
5. [ ] `scripts/classify.mjs` 에러 핸들링 보강
6. [ ] `scripts/lint.mjs` 에러 핸들링 보강
7. [ ] `scripts/scan.mjs` 에러 핸들링 보강
8. [ ] `data/classify-keywords.json` 키워드 튜닝
9. [ ] `scripts/scan.test.mjs` 15건 테스트 추가
10. [ ] 전체 테스트 실행 (43/43 PASS)
11. [ ] scan --auto-classify 실행 → 분류율 ≥85% 확인

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-20 | Initial Phase 2 design | Sinclair Seo |
