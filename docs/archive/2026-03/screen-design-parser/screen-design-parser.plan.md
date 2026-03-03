# Screen Design Parser — 화면설계서 전용 파서 + XLSX 파싱 강화

> **Summary**: 퇴직연금 실문서 775건 파싱 최적화. 화면설계서(450건) 전용 폼 파서, 노이즈 시트 스킵, 프로그램설계서 메타데이터 강화를 포함한 svc-ingestion XLSX 파싱 파이프라인 개선.
>
> **Project**: RES AI Foundry
> **Version**: v0.9 (Phase 3 Sprint 4)
> **Author**: Sinclair Seo
> **Date**: 2026-03-04
> **Status**: Draft
> **Analysis**: [retirement-pension-doc-analysis.md](../../03-analysis/retirement-pension-doc-analysis.md)

---

## 0. Key Decisions

| 항목 | 결정 | 근거 |
|------|------|------|
| **화면설계서 파서** | `parseScreenDesign()` 신규 함수 | 78컬럼 폼 레이아웃을 섹션 분할 + key-value 추출 — 기존 Markdown 테이블 변환은 의미 손실 극심 |
| **라우팅 방식** | SiSubtype 기반 파서 분기 | `화면설계` → `parseScreenDesign()`, 나머지 → 기존 `parseXlsx()` |
| **시트 스킵** | 시트명 패턴 매칭 | `표지`, `제개정이력`, `*샘플*`, `*작성가이드*` — 전 문서 공통 노이즈 |
| **출력 포맷** | 기존 `UnstructuredElement[]` 유지 | 파이프라인 하류(Stage 2~5) 호환성 유지, element type만 확장 |
| **SCDSA002 대응** | v1에서는 `format_invalid` 유지 | 복호화 라이브러리 조사는 별도 태스크, 원본 확보 우선 |

---

## 1. Problem Statement

### 현황
- 기존 `parseXlsx()`는 모든 xlsx를 동일 방식(시트→Markdown 테이블→40행 청킹)으로 처리
- **화면설계서** (450건, 58%): 78컬럼 폼 레이아웃 → 239+ 셀 병합 → Markdown 변환 시 가독성 극히 낮음
- **노이즈 시트**: 표지/제개정이력/샘플/작성가이드가 모든 문서에 포함 → 불필요한 청크 생성
- **프로그램설계서**: R1~R5 메타데이터가 데이터 행으로 혼입

### 영향
- Stage 2 Extraction: LLM에 전달되는 텍스트 품질 저하 → 구조 추출 정확도 하락
- Stage 3 Policy Inference: 화면설계서 "처리로직" 섹션이 최대 900개 비즈니스 규칙 포함 → 현재 추출 불가
- 비용: 노이즈 시트가 LLM 토큰 낭비

---

## 2. Scope

### In Scope (이번 구현)
1. **화면설계서 전용 파서** (`parseScreenDesign`)
   - 메타데이터 추출 (화면명, 화면ID, 서비스클래스ID, 대분류/중분류)
   - 5개 섹션 분할 (레이아웃/기존시스템/데이터구성/처리로직/현업설명)
   - 데이터 구성항목 → 정형 테이블
   - 처리로직 → 정형 테이블
   - UI 필드 → key-value 추출

2. **노이즈 시트 스킵**
   - 시트명 기반 필터링 (표지, 제개정이력, 샘플, 작성가이드, 명명규칙)
   - `parseXlsx()` + `parseScreenDesign()` 모두 적용

3. **프로그램설계서 메타데이터 강화**
   - R3~R4 메타데이터(프로그램ID, 프로그램명, 담당자) → 별도 element
   - R6 이후 데이터 테이블만 Markdown 변환

### Out of Scope (향후)
- SCDSA002 복호화 (원본 확보 우선)
- 배치설계서 전용 파서 (17건, 낮은 우선순위)
- 단위테스트케이스 전용 파서 (129건, 후속)

---

## 3. Architecture

### 파서 라우팅 흐름
```
Queue Event (document.uploaded, fileType=xlsx)
  │
  ├─ detectSiSubtype(fileName)
  │    ├─ "화면설계" → parseScreenDesign(fileBytes, fileName)
  │    └─ 기타       → parseXlsx(fileBytes, fileName)  [기존]
  │
  ├─ 공통: skipNoiseSheets(workbook)
  │
  └─ classifyXlsxElements(elements) → DocumentClassification
```

### 화면설계서 파서 출력 구조
```
parseScreenDesign() → UnstructuredElement[]
  │
  ├─ [0] XlScreenMeta  — 화면 메타데이터 (화면명, ID, 분류, 서비스클래스)
  │
  ├─ [1] XlScreenLayout — UI 필드 key-value 쌍 (§1 레이아웃 섹션)
  │
  ├─ [2] XlScreenData   — 데이터 구성항목 테이블 (§3)
  │      Markdown: | 항목명 | 컨트롤유형 | 필수 | I/O/H | 타입 |
  │
  ├─ [3] XlScreenLogic  — 처리로직 테이블 (§4)
  │      Markdown: | 이벤트명 | 파라미터 | 처리내용 |
  │
  └─ [4] XlScreenNote   — 현업 추가 설명 (§5)
```

---

## 4. Implementation Tasks

### Task 1: 노이즈 시트 스킵 (공통)
- **파일**: `services/svc-ingestion/src/parsing/xlsx.ts`
- **변경**: `parseXlsx()` 시작부에 시트 필터 추가
- **스킵 대상**: `표지`, `제개정이력`, `*샘플*`, `*작성가이드*`, `*명명규칙*`
- **예상 효과**: 문서당 평균 2~3개 노이즈 시트 제거

### Task 2: 화면설계서 전용 파서
- **파일**: `services/svc-ingestion/src/parsing/screen-design.ts` (신규)
- **핵심 로직**:
  - `extractScreenMeta(sheet)`: 셀 좌표 기반 메타데이터 추출 (B2→화면명, H2→값 등)
  - `detectSections(sheet)`: "1.", "2.", "3.", "4.", "5." 패턴으로 섹션 경계 감지
  - `parseDataFields(sheet, sectionRange)`: §3 데이터구성항목 → 정형 테이블
  - `parseProcessingLogic(sheet, sectionRange)`: §4 처리로직 → 정형 테이블
  - `extractKeyValuePairs(sheet, sectionRange)`: §1 UI 레이아웃 → KV 쌍
- **셀 병합 활용**: `sheet['!merges']`에서 label 영역과 value 영역 구분

### Task 3: 파서 라우팅 연결
- **파일**: `services/svc-ingestion/src/routes/queue.ts` (기존)
- **변경**: `detectSiSubtype() === "화면설계"` 일 때 `parseScreenDesign()` 호출

### Task 4: 프로그램설계서 메타데이터 강화
- **파일**: `services/svc-ingestion/src/parsing/xlsx.ts`
- **변경**: `프로그램설계` subtype일 때 R3~R4를 별도 `XlProgramMeta` element로 분리
- **R6+ 데이터만** Markdown 테이블 변환

### Task 5: 테스트 작성
- 화면설계서 파서 단위 테스트 (실문서 기반 fixture 3~5개)
- 시트 스킵 테스트
- 프로그램설계서 메타 추출 테스트
- 기존 xlsx.test.ts 32개 회귀 테스트 통과 확인

### Task 6: 검증 — 실문서 샘플 파싱
- 도메인별 화면설계서 각 1건 (7건) 파싱 후 출력 확인
- Stage 2 Extraction에 전달 시 구조 추출 품질 비교

---

## 5. Element Type 확장

| Type | 용도 | 적용 문서 |
|------|------|-----------|
| `XlWorkbook` | 워크북 요약 (기존) | 전체 |
| `XlSheet:<subtype>` | 시트 Markdown 청크 (기존) | 테이블형 문서 |
| `XlScreenMeta` | 화면 메타데이터 (신규) | 화면설계서 |
| `XlScreenLayout` | UI 필드 KV 쌍 (신규) | 화면설계서 |
| `XlScreenData` | 데이터구성항목 테이블 (신규) | 화면설계서 |
| `XlScreenLogic` | 처리로직 테이블 (신규) | 화면설계서 |
| `XlScreenNote` | 현업 설명 (신규) | 화면설계서 |
| `XlProgramMeta` | 프로그램 메타데이터 (신규) | 프로그램설계서 |

**Stage 2 호환**: element type 접두사가 `Xl`로 시작하면 xlsx 파싱 출력으로 인식 — 기존 classifier.ts의 `classifyXlsxElements()`가 처리.

---

## 6. 화면설계서 섹션 감지 전략

실문서 분석 결과, 화면설계서는 다음 패턴의 섹션 마커를 사용:

```
셀 내용에 "1." 또는 "1. " 시작 → §1 매뉴 레이아웃
셀 내용에 "2." 시작           → §2 기존 시스템 레이아웃 (참고)
셀 내용에 "3." 시작           → §3 데이터 구성항목
셀 내용에 "4." 시작           → §4 처리로직
셀 내용에 "5." 시작           → §5 현업 추가 설명
```

**감지 알고리즘**:
1. A~B열의 모든 행을 순회
2. 셀 값이 `/^\d+\.\s/` 패턴에 매치되면 섹션 경계로 마킹
3. 마킹된 행 범위로 섹션별 파싱 함수 호출
4. §1~§2는 UI 레이아웃 (key-value 추출 또는 스킵)
5. §3은 테이블 감지 (항목명/컨트롤유형/필수/I/O/H/타입 헤더 탐색)
6. §4는 테이블 감지 (이벤트명/파라미터/처리내용 헤더 탐색)
7. §5는 자유 텍스트 추출

---

## 7. Risk & Mitigation

| 리스크 | 영향 | 대응 |
|--------|------|------|
| 화면설계서 레이아웃 변형 | 일부 문서가 다른 섹션 구조 | 섹션 감지 실패 시 fallback으로 기존 parseXlsx 사용 |
| 셀 병합 패턴 비일관 | KV 추출 정확도 저하 | 병합 정보 없으면 인접 셀 heuristic 적용 |
| 대량 파일 처리 시간 | 450건 × 평균 3시트 | Queue 처리이므로 병렬 자동 분산, 단건 파싱은 <1초 |
| Stage 2 호환성 | 새 element type 미인식 | element.text는 Markdown이므로 LLM이 자연어로 처리 가능 |

---

## 8. Success Criteria

| 지표 | 목표 |
|------|------|
| 화면설계서 메타데이터 추출율 | >= 95% (화면명, 화면ID 정상 추출) |
| 처리로직 테이블 추출율 | >= 90% (§4 섹션이 있는 문서 중) |
| 노이즈 시트 제거율 | 100% (표지/제개정이력/샘플/가이드) |
| 기존 테스트 회귀 | 32/32 xlsx.test.ts PASS |
| 신규 테스트 추가 | >= 20개 (화면설계서 + 시트스킵 + 프로그램메타) |

---

## 9. Dependencies

| 의존성 | 상태 | 비고 |
|--------|------|------|
| SheetJS (xlsx) | ✅ 설치됨 | svc-ingestion devDependency |
| 실문서 접근 | ✅ 확보 | `docs/retirement-pension-source/` |
| svc-ingestion 배포 | ✅ 정상 | Production + Staging healthy |

---

## 10. Milestones

| # | 마일스톤 | 예상 결과물 |
|---|----------|------------|
| M1 | 시트 스킵 + 기존 테스트 통과 | xlsx.ts 수정, 테스트 PASS |
| M2 | 화면설계서 파서 코어 | screen-design.ts, 단위 테스트 |
| M3 | 파서 라우팅 + 프로그램 메타 | queue.ts 수정, xlsx.ts 수정 |
| M4 | 실문서 샘플 검증 | 7개 도메인 × 1건 파싱 결과 확인 |
| M5 | Staging 배포 + E2E | 배포 후 실문서 업로드 테스트 |
