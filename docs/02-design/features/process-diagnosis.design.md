# 퇴직연금 프로세스 정밀분석 — Design Document

> **Summary**: 업로드 문서에서 추출한 데이터의 핵심 식별 → 진단 → 조직 간 비교 → 서비스 분석 그룹 분류까지, UI에서 의사결정 가능한 분석 출력물을 설계
>
> **Project**: RES AI Foundry
> **Version**: v0.8 (Phase 2-E)
> **Author**: Sinclair Seo
> **Date**: 2026-03-03
> **Status**: Draft
> **Source PRD**: `docs/AI_Foundry_퇴직연금_프로세스_정밀분석_PRD_v0.1.md`

---

## 1. Overview

### 1.1 핵심 목표

이 설계의 핵심은 **UI/UX에서 의사결정 가능한 분석 출력물**을 만드는 것이다:

1. **무엇을 추출했는가** — 문서에서 뽑아낸 프로세스/엔티티/규칙의 전체 목록
2. **무엇이 핵심이고 왜인가** — Core 판정 이유(빈도, 의존성, 도메인 중요도)
3. **무엇이 빠져있고/중복되고/삭제해야 하는가** — 진단 소견 + 근거 + 개선 제안
4. **조직 간 무엇이 공통이고 무엇이 고유한가** — 미래에셋 vs 현대증권 비교 분석
5. **서비스 분석 그룹 분류** — 표준화 대상 / 조직 고유 / 암묵지 / 핵심 차별 요소

### 1.2 사용자 시나리오

```
Analyst가 미래에셋 퇴직연금 프로젝트 산출물 15건을 업로드한다.
    ↓
시스템이 자동으로 파싱 → 구조 추출 → 핵심 식별 → 진단을 수행한다.
    ↓
UI "분석 리포트" 화면에서:
  ├── [추출 요약] 프로세스 47건, 엔티티 82건, 규칙 23건, 관계 156건
  ├── [핵심 프로세스] "중도인출 프로세스"가 핵심 — 이유: 6개 문서에서 참조, 12개 규칙 연관
  ├── [진단 소견] "퇴직급여 산정" 프로세스 누락 — 근거: 프로세스정의서에는 있으나 화면설계서에 없음
  └── [검토 액션] Reviewer가 소견별로 수락/거절/수정
    ↓
이후 현대증권 퇴직연금 산출물도 동일하게 분석한다.
    ↓
UI "조직 비교" 화면에서:
  ├── [공통 모듈] 중도인출, 가입자격 확인 — 표준화 후보
  ├── [미래에셋 고유] 퇴직연금 자동이체 프로세스 — 차별 요소
  ├── [현대증권 고유] 위험등급 재평가 프로세스 — 차별 요소
  └── [암묵지] 미래에셋의 "긴급인출 승인 규칙"이 문서에 명시되지 않았으나 화면 흐름에서 추론됨
```

### 1.3 Design Principles

- **UI-First**: 데이터 모델과 API를 화면 출력물 기준으로 설계
- **기존 인프라 재활용**: Stage 1-2 그대로 사용, Stage 2 이후에 분석 레이어 추가
- **조직(Organization) 단위 분석**: 모든 추출/진단/비교가 orgId 경계를 존중
- **점진 확장**: 단일 문서 분석 → 조직 내 교차 문서 분석 → 조직 간 비교 순서로 구현

---

## 2. 분석 출력물 모델 (Analysis Report)

### 2.1 3-Layer 분석 구조

```
┌─────────────────────────────────────────────────────────┐
│  Layer 1: Extraction Summary (추출 요약)                  │
│  "문서에서 무엇을 뽑았는가"                                │
│  ├── 프로세스 목록 + 각각의 중요도 스코어                   │
│  ├── 엔티티 목록 + 타입 분류                               │
│  ├── 규칙 목록 + 관련 프로세스 매핑                         │
│  └── 관계 그래프 (from → to, type)                        │
├─────────────────────────────────────────────────────────┤
│  Layer 2: Core Identification (핵심 식별)                 │
│  "무엇이 핵심이고, 왜 핵심인가"                             │
│  ├── Core Process 목록 + 판정 이유 (빈도/의존성/도메인)     │
│  ├── Mega Process vs Core Process 분류                   │
│  ├── 프로세스 계층 트리 (Process → SubProcess → Method)    │
│  └── 데이터 흐름 맵 (어떤 데이터가 어디서 소비/생산)         │
├─────────────────────────────────────────────────────────┤
│  Layer 3: Diagnosis (진단 소견)                           │
│  "무엇이 빠졌고/중복되고/과잉이고/불일치하는가"              │
│  ├── Finding (소견) + Evidence (근거) + Recommendation    │
│  ├── Severity 분류 (critical / warning / info)           │
│  └── HITL 리뷰 상태 (pending / accepted / rejected)      │
└─────────────────────────────────────────────────────────┘
```

### 2.2 UI 화면 ↔ 데이터 매핑

| UI 화면 | 데이터 소스 | API Endpoint |
|---------|-----------|-------------|
| **추출 요약 대시보드** | Layer 1 | `GET /analysis/{docId}/summary` |
| **핵심 프로세스 트리** | Layer 2 | `GET /analysis/{docId}/core-processes` |
| **진단 소견 목록** | Layer 3 | `GET /analysis/{docId}/findings` |
| **진단 소견 상세** | Layer 3 single | `GET /analysis/{docId}/findings/{findingId}` |
| **HITL 리뷰 패널** | Layer 3 + 리뷰 상태 | `POST /analysis/{docId}/findings/{findingId}/review` |
| **조직 비교 대시보드** | Cross-Org Layer | `GET /analysis/compare?orgs=org1,org2` |
| **서비스 분석 그룹** | Classification Layer | `GET /analysis/{orgId}/service-groups` |

---

## 3. 타입 설계

### 3.1 Layer 1 — Extraction Summary

기존 `ExtractionResult`를 확장하여 **중요도 스코어**와 **핵심 판정 태그**를 추가한다.

```typescript
// packages/types/src/analysis.ts (신규)

import { z } from "zod";

// ── 추출 항목에 중요도 스코어 부여 ──

export const ScoredProcessSchema = z.object({
  name: z.string(),
  description: z.string(),
  steps: z.array(z.string()),
  // 신규: 분석 메타데이터
  importanceScore: z.number().min(0).max(1),  // 0=trivial, 1=critical
  importanceReason: z.string(),                // "6개 문서에서 참조, 12개 규칙 연관"
  referenceCount: z.number().int(),            // 다른 문서/규칙에서 참조된 횟수
  dependencyCount: z.number().int(),           // 이 프로세스에 의존하는 항목 수
  isCore: z.boolean(),                         // 핵심 프로세스 판정
  category: z.enum([
    "mega",       // 메가 프로세스 (최상위 업무 흐름)
    "core",       // 핵심 프로세스 (도메인 필수)
    "supporting", // 지원 프로세스 (CRUD, 조회 등)
    "peripheral", // 주변 프로세스 (로깅, 알림 등)
  ]),
});

export const ScoredEntitySchema = z.object({
  name: z.string(),
  type: z.enum(["account", "person", "product", "rule", "system", "interface", "table"]),
  attributes: z.array(z.string()),
  // 신규
  usageCount: z.number().int(),        // 프로세스/규칙에서 사용된 횟수
  isOrphan: z.boolean(),               // 아무 관계도 없는 고립 엔티티
});

// ── Layer 1 전체 ──

export const ExtractionSummarySchema = z.object({
  documentId: z.string(),
  organizationId: z.string(),
  extractionId: z.string(),
  // 수치 요약
  counts: z.object({
    processes: z.number().int(),
    entities: z.number().int(),
    rules: z.number().int(),
    relationships: z.number().int(),
  }),
  // 스코어링된 항목
  processes: z.array(ScoredProcessSchema),
  entities: z.array(ScoredEntitySchema),
  // 문서 분류 정보
  documentClassification: z.string(),
  analysisTimestamp: z.string().datetime(),
});
```

`★ Insight ─────────────────────────────────────`
기존 `ExtractionResult`는 "무엇을 뽑았는가"만 답했습니다. `ScoredProcess`는 **"왜 이것이 중요한가"**까지 답하는 확장입니다. `importanceReason`이 UI에서 사용자가 핵심 판정을 이해하고 의사결정하는 근거가 됩니다.
`─────────────────────────────────────────────────`

### 3.2 Layer 2 — Core Identification

```typescript
// packages/types/src/analysis.ts (계속)

// ── 핵심 프로세스 판정 근거 ──

export const CoreJudgmentSchema = z.object({
  processName: z.string(),
  isCore: z.boolean(),
  score: z.number().min(0).max(1),
  // 판정 근거 — UI에서 "왜 핵심인가" 표시
  factors: z.object({
    frequencyScore: z.number(),       // 문서 내 출현 빈도
    dependencyScore: z.number(),      // 다른 프로세스/규칙의 의존도
    domainRelevanceScore: z.number(), // 퇴직연금 도메인 핵심 업무 해당 여부
    dataFlowCentrality: z.number(),   // 데이터 흐름 그래프 중심성
  }),
  reasoning: z.string(),  // LLM이 생성한 판정 이유 (한국어 서술)
});

// ── 프로세스 계층 트리 ──

export const ProcessTreeNodeSchema: z.ZodType<ProcessTreeNode> = z.lazy(() =>
  z.object({
    name: z.string(),
    type: z.enum(["mega", "core", "supporting", "peripheral"]),
    children: z.array(ProcessTreeNodeSchema),
    methods: z.array(z.object({
      name: z.string(),
      triggerCondition: z.string(),
    })),
    actors: z.array(z.string()),
    dataInputs: z.array(z.string()),  // 소비하는 데이터
    dataOutputs: z.array(z.string()), // 생산하는 데이터
  })
);

interface ProcessTreeNode {
  name: string;
  type: "mega" | "core" | "supporting" | "peripheral";
  children: ProcessTreeNode[];
  methods: Array<{ name: string; triggerCondition: string }>;
  actors: string[];
  dataInputs: string[];
  dataOutputs: string[];
}

// ── Layer 2 전체 ──

export const CoreIdentificationSchema = z.object({
  documentId: z.string(),
  organizationId: z.string(),
  // 핵심 판정 결과
  coreProcesses: z.array(CoreJudgmentSchema),
  // 프로세스 계층 트리 (UI에서 트리 시각화)
  processTree: z.array(ProcessTreeNodeSchema),
  // 요약 통계
  summary: z.object({
    megaProcessCount: z.number().int(),
    coreProcessCount: z.number().int(),
    supportingProcessCount: z.number().int(),
    peripheralProcessCount: z.number().int(),
  }),
});
```

### 3.3 Layer 3 — Diagnosis Findings

```typescript
// packages/types/src/diagnosis.ts (신규)

import { z } from "zod";

export const DiagnosisTypeSchema = z.enum([
  "missing",          // 누락 — 있어야 하는데 없음
  "duplicate",        // 중복 — 같은 기능이 2곳 이상
  "overspec",         // 오버스펙 — 불필요하게 존재
  "inconsistency",    // 정합성 위반 — 문서 간 불일치
]);

export const SeveritySchema = z.enum(["critical", "warning", "info"]);

// 단일 진단 소견 — finding-evidence-recommendation 트리플
export const DiagnosisFindingSchema = z.object({
  findingId: z.string().uuid(),
  type: DiagnosisTypeSchema,
  severity: SeveritySchema,

  // ── 핵심 트리플 (UI 리스트에서 바로 표시) ──
  finding: z.string(),          // "중도인출 프로세스에 퇴직급여 산정 단계가 누락"
  evidence: z.string(),         // "프로세스정의서 §3.2에 명시되어 있으나 화면설계서 SC-045에 없음"
  recommendation: z.string(),   // "화면 SC-045에 퇴직급여 산정 단계를 추가하세요"

  // ── 연관 맥락 (UI 상세 패널에서 표시) ──
  sourceDocumentIds: z.array(z.string()),
  relatedProcesses: z.array(z.string()),
  relatedEntities: z.array(z.string()).optional(),
  confidence: z.number().min(0).max(1),

  // ── HITL 리뷰 상태 (Reviewer가 갱신) ──
  hitlStatus: z.enum(["pending", "accepted", "rejected", "modified"]).default("pending"),
  reviewerComment: z.string().optional(),
  reviewedBy: z.string().optional(),
  reviewedAt: z.string().datetime().optional(),
});

// 진단 결과 전체
export const DiagnosisResultSchema = z.object({
  diagnosisId: z.string().uuid(),
  documentId: z.string(),
  extractionId: z.string(),
  organizationId: z.string(),
  findings: z.array(DiagnosisFindingSchema),
  summary: z.object({
    totalFindings: z.number().int(),
    byType: z.object({
      missing: z.number().int(),
      duplicate: z.number().int(),
      overspec: z.number().int(),
      inconsistency: z.number().int(),
    }),
    bySeverity: z.object({
      critical: z.number().int(),
      warning: z.number().int(),
      info: z.number().int(),
    }),
  }),
  createdAt: z.string().datetime(),
});

export type DiagnosisType = z.infer<typeof DiagnosisTypeSchema>;
export type Severity = z.infer<typeof SeveritySchema>;
export type DiagnosisFinding = z.infer<typeof DiagnosisFindingSchema>;
export type DiagnosisResult = z.infer<typeof DiagnosisResultSchema>;
```

---

## 4. 조직 간 비교 모델 (Cross-Organization Comparison)

### 4.1 비교 개념

```
 미래에셋 퇴직연금                    현대증권 퇴직연금
 ┌──────────────────┐                ┌──────────────────┐
 │ 중도인출 ─────────┼───── 공통 ─────┼─ 중도인출         │
 │ 가입자격 확인 ────┼───── 공통 ─────┼─ 가입자격 확인     │
 │ 자동이체 프로세스 ─┼── 미래에셋고유 │                    │
 │                    │               │ 위험등급 재평가 ──┼── 현대증권고유
 │ [암묵지] 긴급인출  │               │ [암묵지] 연기금   │
 │  승인 규칙         │               │  배분 로직        │
 └──────────────────┘                └──────────────────┘
         │                                     │
         └───────── 표준화 후보 ──────────────────┘
                 (중도인출, 가입자격)
```

### 4.2 Cross-Organization 타입

```typescript
// packages/types/src/analysis.ts (계속)

// ── 서비스 분석 그룹 분류 ──

export const ServiceGroupSchema = z.enum([
  "common_standard",     // 공통/표준화 대상 — 복수 조직에 존재, 표준화 후보
  "org_specific",        // 조직 고유 — 한 조직에만 존재하는 프로세스/정책
  "tacit_knowledge",     // 암묵지 — 문서에 명시되지 않았지만 흐름에서 추론됨
  "core_differentiator", // 핵심 차별 요소 — 해당 조직의 경쟁 우위
]);

// ── 프로세스/정책 비교 단위 ──

export const ComparisonItemSchema = z.object({
  name: z.string(),                    // 프로세스/정책 이름
  type: z.enum(["process", "policy", "entity", "rule"]),
  serviceGroup: ServiceGroupSchema,    // 서비스 분석 그룹

  // 어떤 조직에 존재하는가
  presentIn: z.array(z.object({
    organizationId: z.string(),
    organizationName: z.string(),
    documentIds: z.array(z.string()),   // 해당 조직의 어떤 문서에서 발견
    variant: z.string().optional(),     // 조직별 변형 설명 (e.g., "미래에셋은 3단계, 현대는 5단계")
  })),

  // 그룹 분류 근거
  classificationReason: z.string(),    // "2개 조직 모두에서 발견되어 공통 표준화 후보로 분류"

  // 표준화 가능성
  standardizationScore: z.number().min(0).max(1).optional(),  // 1에 가까울수록 표준화 적합
  standardizationNote: z.string().optional(),                  // "프로세스 단계는 유사하나 승인 권한이 다름"

  // 암묵지 탐지 시
  tacitKnowledgeEvidence: z.string().optional(),  // "화면 흐름에서 추론됨 — 문서에 명시 없음"
});

// ── 조직 간 비교 결과 전체 ──

export const CrossOrgComparisonSchema = z.object({
  comparisonId: z.string().uuid(),
  organizations: z.array(z.object({
    organizationId: z.string(),
    organizationName: z.string(),
    documentCount: z.number().int(),
    processCount: z.number().int(),
    policyCount: z.number().int(),
  })),
  items: z.array(ComparisonItemSchema),

  // 그룹별 요약 통계 (UI 대시보드용)
  groupSummary: z.object({
    commonStandard: z.number().int(),      // 공통/표준화 대상 수
    orgSpecific: z.number().int(),         // 조직 고유 수
    tacitKnowledge: z.number().int(),      // 암묵지 수
    coreDifferentiator: z.number().int(),  // 핵심 차별 요소 수
  }),

  // 표준화 권고 (UI "표준화 후보" 탭)
  standardizationCandidates: z.array(z.object({
    name: z.string(),
    score: z.number(),
    orgsInvolved: z.array(z.string()),
    note: z.string(),
  })),

  createdAt: z.string().datetime(),
});

export type ServiceGroup = z.infer<typeof ServiceGroupSchema>;
export type ComparisonItem = z.infer<typeof ComparisonItemSchema>;
export type CrossOrgComparison = z.infer<typeof CrossOrgComparisonSchema>;
```

### 4.3 서비스 분석 그룹 판정 로직

```
[판정 알고리즘]

입력: 조직 A의 분석 결과 + 조직 B의 분석 결과

Step 1 — 이름/의미 기반 매칭
  • 동일 이름 프로세스 → 공통 후보
  • LLM 유사도 비교 (이름 다르지만 동일 기능) → 공통 후보

Step 2 — 공통/표준화 판정
  • 2+ 조직에 존재 → common_standard
  • 프로세스 단계가 80%+ 유사 → standardizationScore ≥ 0.8
  • 변형이 있으면 variant에 차이점 기록

Step 3 — 고유 항목 분류
  • 1개 조직에만 존재 → org_specific
  • 도메인 핵심 업무이면 → core_differentiator
  • 그 외 → org_specific

Step 4 — 암묵지 탐지
  • 문서에 명시적 정의 없음 + 화면 흐름 / 데이터 흐름에서 존재 추론 → tacit_knowledge
  • 규칙이 참조하지만 프로세스 정의 없음 → tacit_knowledge
  • 프로세스 간 연결에 빠진 중간 단계 → tacit_knowledge
```

---

## 5. API 설계

### 5.1 분석 리포트 API (svc-extraction 확장)

```
# ── Layer 1: 추출 요약 ──
GET /analysis/{documentId}/summary
→ ExtractionSummary (프로세스/엔티티/규칙 카운트 + 스코어링된 목록)

# ── Layer 2: 핵심 프로세스 ──
GET /analysis/{documentId}/core-processes
→ CoreIdentification (핵심 판정 + 프로세스 트리 + 판정 근거)

# ── Layer 3: 진단 소견 ──
GET /analysis/{documentId}/findings
→ DiagnosisResult (소견 목록 + 요약 통계)

GET /analysis/{documentId}/findings/{findingId}
→ DiagnosisFinding (단일 소견 상세)

# ── HITL 리뷰 ──
POST /analysis/{documentId}/findings/{findingId}/review
Body: { action: "accept" | "reject" | "modify", comment?: string, reviewerId: string }
→ { findingId, hitlStatus, reviewedAt }

# ── 전체 분석 트리거 (파이프라인 연동) ──
POST /analyze
Body: { documentId, extractionId, organizationId, mode: "standard" | "diagnosis" }
→ { analysisId, layers: { summary, coreProcesses, findings } }
```

### 5.2 조직 간 비교 API (svc-extraction 확장)

```
# ── 조직 비교 실행 ──
POST /analysis/compare
Body: { organizationIds: ["org-mirae", "org-hyundai"], domain: "퇴직연금" }
→ CrossOrgComparison

# ── 서비스 분석 그룹 조회 ──
GET /analysis/{organizationId}/service-groups
→ { groups: ComparisonItem[], groupSummary }

# ── 표준화 후보 조회 ──
GET /analysis/compare/{comparisonId}/standardization
→ { candidates: [{ name, score, orgs, note }] }
```

### 5.3 API ↔ UI 화면 매핑

```
┌──────────────────────────────────────────────────────────────┐
│ 분석 리포트 화면 (단일 문서)                                    │
│                                                              │
│  ┌─── 추출 요약 탭 ───────────────────────────────────────┐  │
│  │ GET /analysis/{docId}/summary                          │  │
│  │ • 프로세스 47건 | 엔티티 82건 | 규칙 23건 | 관계 156건  │  │
│  │ • 각 항목에 importanceScore 바 차트                     │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌─── 핵심 프로세스 탭 ───────────────────────────────────┐  │
│  │ GET /analysis/{docId}/core-processes                   │  │
│  │ • 프로세스 트리 시각화 (Mega → Core → Supporting)       │  │
│  │ • 각 Core에 "왜 핵심인가" 말풍선 (reasoning 필드)       │  │
│  │ • 판정 요인 레이더 차트 (빈도/의존성/도메인/중심성)      │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌─── 진단 소견 탭 ──────────────────────────────────────┐  │
│  │ GET /analysis/{docId}/findings                        │  │
│  │ • 소견 카드 리스트 (severity 아이콘 + finding 요약)     │  │
│  │ • 펼치면: evidence + recommendation + 관련 프로세스     │  │
│  │ • 리뷰 버튼: [수락] [거절] [수정] + 코멘트 입력         │  │
│  └────────────────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────────────────┤
│ 조직 비교 화면 (2+ 조직)                                      │
│                                                              │
│  ┌─── 비교 대시보드 ─────────────────────────────────────┐  │
│  │ POST /analysis/compare → CrossOrgComparison            │  │
│  │ • 벤 다이어그램: 공통 모듈 / 조직A 고유 / 조직B 고유    │  │
│  │ • 서비스 그룹 파이차트: 공통 | 고유 | 암묵지 | 차별요소  │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌─── 서비스 분석 그룹 탭 ───────────────────────────────┐  │
│  │ GET /analysis/{orgId}/service-groups                   │  │
│  │ • 4개 그룹별 아코디언 리스트                             │  │
│  │   ├── 🟢 공통/표준: 중도인출, 가입자격 (표준화 스코어)   │  │
│  │   ├── 🔵 조직 고유: 자동이체 (미래에셋만)               │  │
│  │   ├── 🟡 암묵지: 긴급인출 규칙 (문서 미명시, 추론)      │  │
│  │   └── 🔴 핵심 차별: 위험등급 재평가 (현대증권만)        │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌─── 표준화 후보 탭 ───────────────────────────────────┐  │
│  │ GET /analysis/compare/{id}/standardization             │  │
│  │ • 표준화 적합도 순 정렬 리스트                          │  │
│  │ • 각 후보에 조직별 변형 차이점 표시                      │  │
│  │ • [표준화 승인] HITL 버튼                               │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

---

## 6. Architecture

### 6.1 확장 파이프라인

```
[기존 파이프라인]
Stage 1 → Stage 2 → Stage 3 (Policy+HITL) → Stage 4 → Stage 5

[확장 파이프라인 — 프로세스 정밀분석 모드]
Stage 1: Ingestion (변경 없음)
    ↓
Stage 2: Extraction + Scoring (프롬프트 확장)
    │  추출 결과에 importanceScore, isCore, category 추가
    ↓
Stage 2A: Core Identification (신규)
    │  핵심 프로세스 판정 + 프로세스 트리 구성 + 판정 근거 생성
    ↓
Stage 2B: Diagnosis (신규)
    │  누락/중복/오버스펙/정합성 진단 + finding-evidence-recommendation
    ↓
Stage 3: HITL Review (확장)
    │  기존 Policy 리뷰 + 진단 소견 리뷰 통합
    ↓
Stage 4: Ontology (확장)
    │  확장 노드 타입 (SubProcess, Method, Actor, Condition)
    ↓
Stage 5: Skill + Analysis Report (확장)
    │  .skill.json + .analysis-report.json 패키징

[교차 조직 비교 — 별도 트리거]
POST /analysis/compare
    │  조직 A 분석 결과 + 조직 B 분석 결과
    ↓
Cross-Org Comparison Engine
    │  이름/의미 매칭 → 서비스 그룹 분류 → 표준화 후보 도출
    ↓
UI: 비교 대시보드 + 서비스 분석 그룹 + 표준화 후보
```

### 6.2 변경 대상 파일

| # | File | Service | Change | 설명 |
|---|------|---------|--------|------|
| 1 | `packages/types/src/analysis.ts` | shared | **신규** | ExtractionSummary, CoreIdentification, CrossOrgComparison |
| 2 | `packages/types/src/diagnosis.ts` | shared | **신규** | DiagnosisFinding, DiagnosisResult |
| 3 | `packages/types/src/events.ts` | shared | 수정 | diagnosis 이벤트 2종 추가 |
| 4 | `svc-extraction/src/prompts/scoring.ts` | SVC-02 | **신규** | 중요도 스코어링 + 핵심 판정 프롬프트 |
| 5 | `svc-extraction/src/prompts/diagnosis.ts` | SVC-02 | **신규** | 4대 진단 프롬프트 |
| 6 | `svc-extraction/src/prompts/comparison.ts` | SVC-02 | **신규** | 조직 간 비교 프롬프트 |
| 7 | `svc-extraction/src/routes/analysis.ts` | SVC-02 | **신규** | 분석 리포트 API 라우트 |
| 8 | `svc-extraction/src/routes/compare.ts` | SVC-02 | **신규** | 조직 비교 API 라우트 |
| 9 | `svc-extraction/src/queue/handler.ts` | SVC-02 | 수정 | analysisMode 분기 + scoring |
| 10 | `svc-policy/src/queue/handler.ts` | SVC-03 | 수정 | diagnosis HITL 통합 |
| 11 | `svc-ontology/src/neo4j/schema.ts` | SVC-04 | 수정 | 확장 노드 6종 |
| 12 | D1 migration | SVC-02 | **신규** | analyses, diagnosis_findings, comparisons 테이블 |

변경 없음: svc-ingestion, svc-skill, svc-llm-router, svc-security, svc-governance, svc-notification, svc-analytics, svc-queue-router

---

## 7. Data Model

### 7.1 D1 신규 테이블 — `db-extraction`

```sql
-- ── 분석 리포트 (Layer 1+2) ──
CREATE TABLE IF NOT EXISTS analyses (
  analysis_id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  extraction_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  -- Layer 1 요약
  process_count INTEGER NOT NULL DEFAULT 0,
  entity_count INTEGER NOT NULL DEFAULT 0,
  rule_count INTEGER NOT NULL DEFAULT 0,
  relationship_count INTEGER NOT NULL DEFAULT 0,
  -- Layer 2 핵심 식별
  core_process_count INTEGER NOT NULL DEFAULT 0,
  mega_process_count INTEGER NOT NULL DEFAULT 0,
  -- JSON: 전체 분석 결과 (ExtractionSummary + CoreIdentification)
  summary_json TEXT NOT NULL,
  core_identification_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── 진단 소견 (Layer 3) ──
CREATE TABLE IF NOT EXISTS diagnosis_findings (
  finding_id TEXT PRIMARY KEY,
  analysis_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  type TEXT NOT NULL,              -- missing | duplicate | overspec | inconsistency
  severity TEXT NOT NULL,          -- critical | warning | info
  finding TEXT NOT NULL,           -- 소견
  evidence TEXT NOT NULL,          -- 근거
  recommendation TEXT NOT NULL,    -- 제안
  related_processes TEXT,          -- JSON array
  related_entities TEXT,           -- JSON array
  source_document_ids TEXT,        -- JSON array
  confidence REAL NOT NULL DEFAULT 0.0,
  hitl_status TEXT NOT NULL DEFAULT 'pending',
  reviewer_id TEXT,
  reviewer_comment TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── 조직 간 비교 ──
CREATE TABLE IF NOT EXISTS comparisons (
  comparison_id TEXT PRIMARY KEY,
  organization_ids TEXT NOT NULL,   -- JSON array
  domain TEXT NOT NULL DEFAULT '퇴직연금',
  -- 그룹별 카운트
  common_standard_count INTEGER NOT NULL DEFAULT 0,
  org_specific_count INTEGER NOT NULL DEFAULT 0,
  tacit_knowledge_count INTEGER NOT NULL DEFAULT 0,
  core_differentiator_count INTEGER NOT NULL DEFAULT 0,
  -- JSON: 전체 비교 결과
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── 비교 항목 (조직 간 매칭 단위) ──
CREATE TABLE IF NOT EXISTS comparison_items (
  item_id TEXT PRIMARY KEY,
  comparison_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,               -- process | policy | entity | rule
  service_group TEXT NOT NULL,      -- common_standard | org_specific | tacit_knowledge | core_differentiator
  present_in_orgs TEXT NOT NULL,    -- JSON array of org IDs
  classification_reason TEXT NOT NULL,
  standardization_score REAL,
  standardization_note TEXT,
  tacit_knowledge_evidence TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_findings_analysis ON diagnosis_findings(analysis_id);
CREATE INDEX idx_findings_org ON diagnosis_findings(organization_id);
CREATE INDEX idx_findings_severity ON diagnosis_findings(severity);
CREATE INDEX idx_findings_hitl ON diagnosis_findings(hitl_status);
CREATE INDEX idx_comparisons_orgs ON comparisons(organization_ids);
CREATE INDEX idx_comparison_items_group ON comparison_items(service_group);
```

### 7.2 Neo4j 확장 노드

기존 12 node types + 신규 6 node types:

| 신규 노드 | 관계 | 설명 |
|----------|------|------|
| SubProcess | `(Process)-[:HAS_SUBPROCESS]->(SubProcess)` | 프로세스 하위 단계 |
| Method | `(Process)-[:HAS_METHOD]->(Method)` | 프로세스 내 메서드/기능 |
| Condition | `(Method)-[:TRIGGERED_BY]->(Condition)` | 메서드 트리거 조건 |
| Actor | `(Actor)-[:PARTICIPATES_IN]->(Process)` | 수행 역할/시스템 |
| Requirement | `(Requirement)-[:SATISFIED_BY]->(Process)` | 요구사항-프로세스 매핑 |
| DiagnosisFinding | `(DiagnosisFinding)-[:RELATES_TO]->(Process\|Entity)` | 진단 소견-대상 연결 |

---

## 8. LLM 프롬프트 전략

### 8.1 3-Pass 분석 접근

단일 거대 프롬프트 대신 **3-Pass 순차 분석**으로 품질을 확보한다:

```
Pass 1 — Scoring & Core Identification (Sonnet)
  입력: 기존 extraction 결과 (processes, entities, rules, relationships)
  출력: ScoredProcess[], CoreJudgment[], ProcessTreeNode[]
  목적: "무엇이 핵심이고 왜인가" 답변

Pass 2 — Diagnosis (Sonnet/Opus)
  입력: Pass 1 결과 (스코어링된 추출 데이터 + 핵심 판정)
  출력: DiagnosisFinding[]
  목적: "무엇이 빠졌고/중복되고/과잉인가" 답변

Pass 3 — Cross-Org Comparison (Sonnet)
  입력: 조직 A의 Pass 1+2 결과 + 조직 B의 Pass 1+2 결과
  출력: ComparisonItem[], standardizationCandidates[]
  목적: "공통/고유/암묵지/차별요소" 분류
```

**비용 예측** (문서 1건 기준):
| Pass | Tier | Input tokens | Output tokens | 예상 비용 |
|------|------|-------------|--------------|----------|
| 1 | Sonnet | ~15K | ~5K | ~$0.09 |
| 2 | Sonnet | ~20K | ~5K | ~$0.11 |
| 3 | Sonnet | ~30K (2조직) | ~8K | ~$0.16 |
| **합계** | | | | **~$0.36/문서** |

### 8.2 암묵지 탐지 프롬프트 전략

암묵지는 "문서에 없지만 있어야 하는 것"이므로, LLM에게 다음을 요청한다:

```
아래 추출 데이터를 분석하여 "문서에 명시되지 않았지만 흐름상 존재해야 하는" 로직을 찾으세요:

1. 화면 흐름에서 중간 단계가 생략된 경우
   (예: 신청 화면 → 완료 화면 사이에 승인 프로세스가 빠져 있음)
2. 데이터 흐름에서 생산자가 없는 소비 데이터
   (예: 보고서에서 "위험등급"을 사용하지만 어디서 산출하는지 정의 없음)
3. 규칙이 참조하는 프로세스가 프로세스 정의에 없는 경우
4. 업계 표준에서 기대되는 프로세스가 문서에 전혀 언급되지 않는 경우

각 항목에 대해:
- tacitKnowledgeEvidence: 어떤 흐름에서 추론되었는가
- confidence: 추론의 확실성 (0.0~1.0)
- recommendation: 명문화 제안
```

---

## 9. Error Handling

| 상황 | 처리 |
|------|------|
| LLM JSON 파싱 실패 (Pass 1~3) | 빈 결과 반환 + warning 로그 + status='partial' |
| 추출 결과가 너무 빈약 (< 3 processes) | "추출 결과 부족" info finding 자동 생성, 진단 스킵 |
| Neo4j 신규 노드 생성 실패 | graceful degradation — D1만으로 진행 |
| 비교 시 한 조직의 분석 결과 없음 | 해당 조직 "분석 미완료" 표시, 비교 가능한 항목만 처리 |
| HITL 리뷰 세션 만료 | 기존 pipeline-hardening의 DO 알람 만료 로직 재활용 |

---

## 10. Security Considerations

- [x] 진단 입력은 이미 마스킹된 extraction 결과 → 추가 PII 마스킹 불필요
- [x] 조직 간 비교 시 각 조직의 데이터는 해당 orgId 권한으로만 접근
- [x] 모든 분석 API에 `X-Internal-Secret` 인증 필수
- [ ] 조직 비교 결과는 양쪽 조직 모두의 접근 권한이 있는 사용자만 조회 가능 (Phase 3 RBAC)

---

## 11. Implementation Order

```
Phase 2-E 구현 순서:

  ① packages/types/src/analysis.ts          ← 분석 타입 (ExtractionSummary, CoreIdentification)
  ② packages/types/src/diagnosis.ts         ← 진단 타입 (DiagnosisFinding)
  ③ packages/types/src/events.ts            ← 이벤트 2종 추가
      │
      ├──④ svc-extraction/prompts/scoring.ts    ← Pass 1: 스코어링 프롬프트
      ├──⑤ svc-extraction/prompts/diagnosis.ts  ← Pass 2: 진단 프롬프트
      ├──⑥ svc-extraction/prompts/comparison.ts ← Pass 3: 비교 프롬프트
      │
      ├──⑦ svc-extraction/routes/analysis.ts    ← 분석 API
      ├──⑧ svc-extraction/routes/compare.ts     ← 비교 API
      │
      ├──⑨ D1 migration                         ← analyses, findings, comparisons 테이블
      │
      └──⑩ svc-ontology/neo4j/schema.ts         ← 확장 노드 6종
          └──⑪ svc-ontology/routes/normalize.ts  ← 확장 Term 처리

  ⑫ svc-extraction/queue/handler.ts         ← analysisMode 분기
  ⑬ svc-policy/queue/handler.ts             ← diagnosis HITL 통합
  ⑭ Unit tests (20+ 케이스)
  ⑮ typecheck + lint + test 전체 통과
  ⑯ Staging 배포 + 실증
```

---

## 12. Success Metrics

| 지표 | 목표 | 측정 |
|------|------|------|
| 추출 요약 정확도 | ≥ 85% | 도메인 전문가 대비 |
| 핵심 프로세스 식별 정확도 | ≥ 80% | Core 판정 precision |
| 진단 소견 유의미율 | ≥ 60% | HITL에서 accept 비율 |
| 조직 간 공통 모듈 식별 정확도 | ≥ 70% | 수동 비교 대비 |
| 암묵지 탐지 건수 | ≥ 3건/조직 | 파일럿 기준 |
| 분석 리포트 생성 시간 | < 2분/문서 | E2E 측정 |

---

## 13. Future Considerations (Phase 3+)

| 항목 | Phase | 설명 |
|------|-------|------|
| D3.js 프로세스 트리 시각화 | 3 | ProcessTreeNode를 인터랙티브 트리로 렌더링 |
| 벤 다이어그램 비교 시각화 | 3 | CrossOrgComparison을 시각적으로 표현 |
| 재분석 자동 루프 | 3 | HITL 리뷰 → 자동 재추출 → 재진단 → 재비교 |
| 3+ 조직 동시 비교 | 3 | 현재 2조직 → N조직 비교 확장 |
| 표준화 자동 제안 | 4 | 공통 모듈에서 표준 프로세스 자동 생성 |
| 다중 도메인 확장 | 4 | 퇴직연금 외 (보험, 카드, 증권 등) |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-03 | Initial draft — 기술 파이프라인 중심 | Sinclair Seo |
| 0.2 | 2026-03-03 | UI/UX 중심 재설계: 3-Layer 분석 출력물 + 조직 간 비교 + 서비스 분석 그룹 | Sinclair Seo |
