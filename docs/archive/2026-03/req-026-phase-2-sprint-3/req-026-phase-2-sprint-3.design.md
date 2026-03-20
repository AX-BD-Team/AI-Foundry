---
code: AIF-DSGN-026F
title: "반제품 생성 엔진 Sprint 3 — LLM 활성화 + 화면 정의 + E2E 설계"
version: "1.0"
status: Active
category: DSGN
created: 2026-03-20
updated: 2026-03-20
author: Sinclair Seo
feature: req-026-phase-2-sprint-3
refs: "[[AIF-PLAN-026F]] [[AIF-DSGN-026E]]"
---

# 반제품 생성 엔진 Sprint 3 — LLM 활성화 + 화면 정의 + E2E 설계

> **Summary**: Sprint 2의 8 generators를 LLM 모드로 활성화하고, G9(화면 정의서)를 추가하며, ZIP→Working Version 자동 변환 CLI를 설계한다.
>
> **Project**: AI Foundry
> **Version**: v0.6.0
> **Author**: Sinclair Seo
> **Date**: 2026-03-20
> **Status**: Active
> **Planning Doc**: [req-026-phase-2-sprint-3.plan.md](../01-plan/features/req-026-phase-2-sprint-3.plan.md)

---

## 1. Overview

### 1.1 Design Goals

1. LLM 활성화(skipLlm=false) 시 기존 mechanical 출력 대비 품질 비교
2. G9 화면 정의 생성기를 기존 GeneratedFile 인터페이스 + orchestrator 패턴으로 구현
3. ZIP→Working Version 변환을 `claude -p` 비대화형 CLI로 자동화
4. collector Service Binding 통합 테스트 보강

### 1.2 Design Principles

- Sprint 2 패턴 100% 재활용 (GeneratedFile, skipLlm, mechanical fallback)
- 새 생성기(G9)도 동일한 시그니처: `(env, data, deps, options) → Promise<GeneratedFile>`
- CLI는 독립 스크립트 — svc-skill 코드 변경 없이 ZIP만 소비

---

## 2. Task A: LLM 활성화 검증

### 2.1 실행 방법

```bash
# Production에서 LLM 모드로 생성
curl -X POST https://svc-skill-production.ktds-axbd.workers.dev/prototype/generate \
  -H "X-Internal-Secret: $SECRET" \
  -H "Content-Type: application/json" \
  -d '{"organizationId":"LPON","organizationName":"LPON 온누리상품권","options":{"skipLlm":false}}'
```

### 2.2 비교 항목

| 항목 | Mechanical (S2) | LLM (S3) | 비교 기준 |
|------|:---------------:|:---------:|----------|
| specs/01-business-logic.md | 테이블 형태 | 시나리오 서술 | 가독성, BL 커버리지 |
| specs/02-data-model.md | term_type 기반 | LLM 스키마 설계 | FK 정확도, Enum CHECK |
| specs/03-functions.md | skill 그룹핑 | 상세 플로우 + 에러 | 입출력 완성도 |
| specs/04-architecture.md | 고정 템플릿 | 도메인 맞춤 | 모듈 적절성 |
| specs/05-api.md | 키워드 매핑 | JSON Schema 상세 | 스키마 정확도 |

### 2.3 비용 측정

```typescript
// orchestrator.ts에 비용 추적 추가
interface GenerationMetrics {
  totalTokens: number;
  totalDurationMs: number;
  generatorMetrics: Record<string, { tokens: number; durationMs: number }>;
}
```

D1 prototypes 테이블에 `llm_metrics` TEXT 컬럼 추가 (JSON):

```sql
-- infra/migrations/db-skill/NNNN_add_llm_metrics.sql
ALTER TABLE prototypes ADD COLUMN llm_metrics TEXT;
```

### 2.4 비교 리포트 출력

`docs/03-analysis/req-026-llm-comparison.md` 에 A/B 비교 결과 기록.

---

## 3. Task B: G9 화면 정의 생성기

### 3.1 파일

`services/svc-skill/src/prototype/generators/screen-spec.ts`

### 3.2 시그니처

```typescript
export async function generateScreenSpec(
  env: Env,
  data: CollectedData,
  fsFile: GeneratedFile,    // G5 출력 — FN 목록
  dmFile: GeneratedFile,    // G4 출력 — 테이블/컬럼
  options?: { skipLlm?: boolean },
): Promise<GeneratedFile>
```

**출력**: `specs/06-screens.md`, type: `"spec"`

### 3.3 Mechanical 로직

#### Step 1: FN → 화면 유형 추론

```typescript
const SCREEN_TYPE_KEYWORDS: Record<string, ScreenType> = {
  // List
  목록: "list", 조회: "list", 리스트: "list", 검색: "list",
  // Detail
  상세: "detail", 정보: "detail", 보기: "detail",
  // Form
  등록: "form", 생성: "form", 수정: "form", 편집: "form",
  // Dashboard
  통계: "dashboard", 현황: "dashboard", 대시보드: "dashboard", 집계: "dashboard",
  // Workflow
  승인: "workflow", 반려: "workflow", 검토: "workflow",
};

type ScreenType = "list" | "detail" | "form" | "dashboard" | "workflow";

interface ScreenDef {
  id: string;          // SCR-001
  fnId: string;        // FN-001
  name: string;        // FN title에서 추출
  type: ScreenType;
  fields: ScreenField[];
  relatedApis: string[];  // API-001 등
}
```

#### Step 2: FN 입출력 → 화면 필드

```typescript
interface ScreenField {
  name: string;
  label: string;
  type: "text" | "number" | "date" | "select" | "boolean";
  required: boolean;
  source: "fn-input" | "fn-output" | "dm-column";
}

// DM에서 CREATE TABLE 컬럼 추출
function extractColumnsFromDm(dmContent: string, tableName: string): ScreenField[] {
  // 정규식: CREATE TABLE {name} ( ... ) 내 컬럼 파싱
}

// FN에서 입력 필드 추출
function extractFieldsFromFn(fnContent: string, fnId: string): ScreenField[] {
  // | 필드 | 타입 | 필수 | 설명 | 테이블 파싱
}
```

#### Step 3: 화면 목록 + 상세 Markdown 생성

```markdown
# 화면 정의서

## 목차
- [SCR-001: 상품권 목록](#scr-001) (List)
- [SCR-002: 상품권 상세](#scr-002) (Detail)

---

## SCR-001: 상품권 목록

- **유형**: List
- **관련 기능**: FN-001
- **관련 API**: GET /api/v1/vouchers

### 화면 필드

| # | 필드명 | 라벨 | 타입 | 필수 | 출처 |
|:-:|--------|------|------|:----:|------|
| 1 | voucher_id | 상품권 ID | text | Y | dm-column |
| 2 | balance | 잔액 | number | Y | dm-column |

### 사용자 흐름
1. 목록 화면 진입
2. 필터/검색 적용
3. 행 클릭 → SCR-002 (상세) 이동

### 에러 표시
| 조건 | 메시지 | 위치 |
|------|--------|------|
| 데이터 없음 | "조회 결과가 없습니다" | 테이블 영역 |
```

### 3.4 LLM 프롬프트 (skipLlm=false)

```
System: 너는 화면 설계 전문가야. 기능 정의서와 데이터 모델을 기반으로 화면별 필드/흐름/에러를 정의한다.

User:
## 기능 목록
{fsFile.content 요약 — FN 목록 + 입출력}

## 데이터 모델 (테이블 요약)
{dmFile.content 요약 — CREATE TABLE 목록}

각 기능을 화면(SCR-NNN)으로 변환해줘:
- 화면 유형 (List / Detail / Form / Dashboard / Workflow)
- 화면 필드 (필드명/라벨/타입/필수 여부/데이터 출처)
- 사용자 흐름 (단계별 내비게이션)
- 에러 표시 (조건/메시지/위치)
- 화면 간 연결 (Navigation Flow)
```

maxTokens: 4000, tier: tier2

### 3.5 Orchestrator 통합

```typescript
// orchestrator.ts — Phase 2 변경
// 기존: G6 + G7 병렬
// 변경: G6 + G7 + G9 병렬 (G9도 fs+dm 의존)

const phase2Parallel: Promise<GeneratedFile | null>[] = [
  generateArchitecture(env, data, fs, { skipLlm }),
  generateApiSpec(env, fs, { skipLlm }),
];

// includeScreenSpec 옵션 확인 (기본값 false → 호환성 유지)
if (options?.includeScreenSpec !== false) {
  phase2Parallel.push(
    generateScreenSpec(env, data, fs, dm, { skipLlm }),
  );
}

const phase2Results = await Promise.all(phase2Parallel);
const arch = phase2Results[0]!;
const api = phase2Results[1]!;
files.push(arch, api);

const screen = phase2Results[2];
if (screen) files.push(screen);
```

**주의**: `includeScreenSpec`의 기본값이 `false`이므로 기존 API 호출은 영향 없음. Sprint 3에서는 `true`로 전달해야 G9가 동작.

### 3.6 G8 claude-md 업데이트

G9 출력이 있으면 CLAUDE.md에 화면 정의서 참조 추가:

```typescript
// claude-md.ts — GeneratorOutputs에 screen 추가
export interface GeneratorOutputs {
  bl: GeneratedFile;
  dm: GeneratedFile;
  fs: GeneratedFile;
  arch: GeneratedFile;
  api: GeneratedFile;
  screen?: GeneratedFile;  // G9 (선택)
}

// content에 조건부 추가
if (outputs.screen) {
  content += "\n## 화면 설계\n`specs/06-screens.md` 참조. SCR-001부터 순서대로 구현.\n";
}
```

---

## 4. Task C: ZIP→Working Version CLI

### 4.1 파일

`scripts/bootstrap-from-zip.ts`

### 4.2 동작 흐름

```
1. ZIP 해제 (fflate)
   ├── specs/*.md → {output}/specs/
   ├── CLAUDE.md → {output}/CLAUDE.md
   ├── rules/*.json → {output}/rules/
   └── ontology/*.jsonld → {output}/ontology/

2. 프롬프트 생성
   ├── CLAUDE.md 내용 읽기
   ├── specs/ 파일 목록 + 요약 조합
   └── 최종 프롬프트: "이 스펙을 기반으로 Working Version을 생성해"

3. Claude Code 실행 (--auto 옵션)
   claude -p "{프롬프트}" \
     --cwd {output} \
     --allowedTools 'Read,Write,Edit,Bash,Glob,Grep' \
     --dangerously-skip-permissions

4. 검증
   cd {output}
   bun install
   bun run typecheck
   bun run test
```

### 4.3 CLI 인터페이스

```typescript
// scripts/bootstrap-from-zip.ts
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    zip: { type: "string", short: "z" },      // ZIP 파일 경로 또는 R2 키
    output: { type: "string", short: "o" },    // 출력 디렉토리
    auto: { type: "boolean", default: false },  // Claude Code 자동 실행
    verify: { type: "boolean", default: true }, // 생성 후 typecheck+test
  },
});
```

### 4.4 프롬프트 조합 전략

```typescript
function buildPrompt(claudeMd: string, specFiles: { path: string; content: string }[]): string {
  const specSummary = specFiles
    .map(f => `### ${f.path}\n${f.content.slice(0, 500)}...`)
    .join("\n\n");

  return `아래 CLAUDE.md와 스펙 문서를 기반으로 Working Version 프로젝트를 생성해줘.

## CLAUDE.md
${claudeMd}

## 스펙 요약 (전체는 specs/ 디렉토리 참조)
${specSummary}

## 생성 지시
1. CLAUDE.md의 "구현 순서" 섹션을 따라 순서대로 구현
2. specs/02-data-model.md의 CREATE TABLE SQL을 DB 스키마로 사용
3. specs/03-functions.md의 FN-NNN을 도메인 모듈로 구현
4. specs/05-api.md의 엔드포인트를 라우트 핸들러로 구현
5. 각 도메인 모듈에 BL-NNN 참조 주석 추가
6. FN별 단위 테스트 작성 (최소 3케이스: 정상/에러/경계)
`;
}
```

---

## 5. Task D: collector 통합 테스트 보강

### 5.1 파일

`services/svc-skill/src/prototype/__tests__/collector.test.ts` (기존 확장)

### 5.2 추가 테스트 케이스

```typescript
describe("collector - Service Binding 통합 시나리오", () => {
  // D-1: 실제 API 응답 포맷 반영
  it("should handle policy API with pagination headers", async () => {
    // 200건 정확히 반환 → 두 번째 요청에서 0건 → 종료
  });

  it("should handle ontology terms with null definitions", async () => {
    // definition이 null인 term도 정상 수집
  });

  // D-2: 실패 시나리오
  it("should fallback on SVC_POLICY timeout (5초 초과)", async () => {
    // fetchService에서 timeout → Promise.allSettled가 rejected → policies=[]
  });

  it("should fallback on SVC_ONTOLOGY 500 error", async () => {
    // 500 응답 → throw → allSettled rejected → terms=[]
  });

  it("should fallback on auth failure (401 Unauthorized)", async () => {
    // INTERNAL_API_SECRET 불일치 → 401 → rejected → 해당 서비스=[]
  });

  // D-3: 페이지네이션 edge case
  it("should handle 0 policies (empty org)", async () => {
    // total=0 → 빈 배열 반환
  });

  it("should handle exactly 200 policies (1 page)", async () => {
    // 200건 반환, total=200 → 두 번째 요청 없이 종료
  });
});
```

---

## 6. Implementation Order

| # | Task | 파일 | 의존 | Worker |
|:-:|:----:|------|:----:|:------:|
| 1 | B-1~B-4 | `generators/screen-spec.ts` | G5+G4 타입 | W1 |
| 2 | A-1~A-3 | `orchestrator.ts` + curl 테스트 | Production 배포 | W2 |
| 3 | B-5~B-6 | `orchestrator.ts` G9 통합 | B-1 완료 | Leader |
| 4 | B-7 | `screen-spec.test.ts` | B-1 완료 | W1 |
| 5 | D-1~D-3 | `collector.test.ts` 확장 | 없음 | W2 |
| 6 | A-4~A-5 | 비교 리포트 + fallback 검증 | A-1 완료 | Leader |
| 7 | C-1~C-4 | `scripts/bootstrap-from-zip.ts` | B+A 완료 | Leader |
| 8 | G8 업데이트 | `claude-md.ts` screen 참조 | B 완료 | Leader |

**Worker 병렬화**:
- **W1**: G9 생성기 구현 + 테스트
- **W2**: LLM 활성화 테스트 + collector 통합 테스트
- **Leader**: orchestrator 통합 + CLI + G8 업데이트

---

## 7. Test Plan

### 7.1 새 테스트 (≥ 20건)

| 카테고리 | 파일 | 테스트 수 | 핵심 케이스 |
|----------|------|:---------:|------------|
| G9 screen-spec | `screen-spec.test.ts` | 6 | FN→화면 매핑, 필드 추출, List/Form/Detail/Dashboard, skipLlm, 빈 FN, 크로스레퍼런스 |
| LLM 활성화 | `orchestrator-llm.test.ts` | 4 | skipLlm=false 전체 실행, fallback 동작, 메트릭 기록, 비용 추적 |
| collector 통합 | `collector.test.ts` (확장) | 5 | timeout, 500, 401, 0건, 정확히 limit건 |
| CLI bootstrap | `bootstrap-from-zip.test.ts` | 5 | ZIP 해제, 프롬프트 생성, 디렉토리 구조, 검증 스크립트, 에러 핸들링 |

### 7.2 기존 테스트 영향

- `orchestrator.test.ts`: G9 추가로 파일 수 12건 (기존 11 + screen) 확인 필요
- `packager.test.ts`: manifest에 G9 포함 확인
- `claude-md.test.ts`: screen 참조 조건부 출력 확인

---

## 8. Error Handling

| 상황 | 처리 |
|------|------|
| LLM Router 연결 실패 | mechanical fallback (기존 패턴) |
| LLM 응답이 마크다운이 아닌 경우 | 그대로 사용 (header만 추가) |
| G9에서 FN 0건 추출 | 빈 화면 정의서 반환 + 경고 주석 |
| FN title에서 화면 유형 추론 실패 | 기본값 "form" 할당 |
| CLI ZIP 파일 미존재 | 에러 메시지 + exit 1 |
| CLI Claude Code 실행 실패 | 에러 로그 출력, 수동 실행 가이드 표시 |
| LLM 비용 > $0.50 | 경고 로그 + D1 metrics에 기록 (차단하지 않음) |

---

## 9. Migration

### 9.1 D1 스키마 변경

```sql
-- infra/migrations/db-skill/NNNN_add_llm_metrics.sql
ALTER TABLE prototypes ADD COLUMN llm_metrics TEXT;
```

### 9.2 타입 변경

```typescript
// packages/types/src/prototype.ts — GeneratedFile type enum에 "screen" 추가 (불필요: "spec"으로 충분)
// → 변경 없음. G9는 type: "spec"으로 기존 enum 재사용
```

---

## 10. ZIP 최종 구조 (Sprint 3)

```
working-prototypes/{prototypeId}.zip
├── .foundry/origin.json              meta (S1)
├── .foundry/manifest.json            meta (S1)
├── README.md                         readme (S1)
├── specs/01-business-logic.md        spec (S1, G1)
├── rules/business-rules.json         rules (S1, G2)
├── ontology/terms.jsonld             ontology (S1, G3)
├── specs/02-data-model.md            spec (S2, G4)
├── specs/03-functions.md             spec (S2, G5)
├── specs/04-architecture.md          spec (S2, G6)
├── specs/05-api.md                   spec (S2, G7)
├── specs/06-screens.md               spec (S3, G9) 🆕
└── CLAUDE.md                         meta (S2, G8 — S3에서 screen 참조 추가)
```

파일 수: 12 (9 spec/rules/ontology + 3 meta). includeScreenSpec=false면 11 (S2와 동일).

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-03-20 | Task A~D 상세 설계 | Sinclair Seo |
