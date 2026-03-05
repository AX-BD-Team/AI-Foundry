# LPON 전자식 온누리상품권 — Org 생성 + 소스 업로드 계획

> **Summary**: 새 도메인 "LPON 전자식 온누리상품권 플랫폼" SI 산출물을 AI Foundry에 온보딩한다. 새 Organization(LPON) 생성 후, 2-Wave 전략으로 Core 84건 → Archive 127건 순서로 배치 업로드 → 5-Stage 파이프라인 자동 실행.
>
> **Project**: RES AI Foundry
> **Version**: v2.0 (심층 분석 반영)
> **Author**: Sinclair Seo
> **Date**: 2026-03-05
> **Status**: Draft
> **Duration**: 1~2 세션 (Org 생성 + Wave 1 업로드 + 파이프라인 실행)
> **Depends On**: Phase 4 Sprint 2 완료 (파이프라인 정상 동작 검증 완료)

---

## 0. Key Decisions

| 항목 | 결정 | 근거 |
|------|------|------|
| **Org ID** | `LPON` | 프로젝트 코드. Miraeasset 패턴 동일 |
| **도메인** | 전자식 온누리상품권 플랫폼 | SI 프로젝트 단위 = Org 단위 |
| **업로드 전략** | **2-Wave** (Core 84건 → Archive 127건) | 최종본 우선, 버전 히스토리는 선택적 |
| **버전 중복 제거** | Core에서도 날짜만 다른 동일 문서 dedup | 배포계획서 22건 → 최신 1건 |
| **제외 대상** | 컨설팅산출물예시(30건), 사본(8건), 700 참고자료, 소스백업 | 타 프로젝트/바이너리/복사본은 비대상 |
| **파이프라인** | Queue 자동 전파 (기존 인프라 활용) | Sprint 2에서 검증 완료 |

---

## 1. Source Analysis — 심층 분류

### 1.1 전체 파일 현황

```
총 파일:        1,152개
├─ 업로드 가능 (xlsx/pptx/docx/pdf):  477건
│  ├─ [CORE] 최종본:                    84건  ← Wave 1
│  ├─ [ARCHIVE] 90 Archive/ (구 버전):  127건  ← Wave 2 (선택)
│  ├─ [REF] 70 참고자료/ (섹션 내):       13건  ← 제외 (내부 참고)
│  ├─ [CONSULT] 컨설팅산출물예시/:        30건  ← 제외 (타 프로젝트)
│  ├─ [COPY] 사본 파일:                   8건  ← 제외
│  └─ [OLD] old/ 폴더:                    3건  ← 제외
└─ 비대상 (이미지/zip/소스 등):         675건  ← 제외
```

### 1.2 Core 84건 — 상세 Extraction Map

#### Group A: 핵심 SI 산출물 (루트 7건) — **Tier 1**

| # | 파일명 | 형식 | 추출 대상 | 파이프라인 Stage |
|---|--------|------|-----------|-----------------|
| 1 | LPON-D102_프로젝트 계획서_과업 목록.xlsx | xlsx | 과업 목록, WBS 항목 | S1→S2 (프로세스 추출) |
| 2 | LPON-D103_WBS_2023.xlsx | xlsx | 작업분해구조, 일정, 마일스톤 | S1→S2 (프로세스 그래프) |
| 3 | **LPON-D106_온누리상품권_정책정의서.xlsx** | xlsx | **정책 규칙 (condition-criteria-outcome)** | S1→S2→**S3** (핵심!) |
| 4 | **LPON-D221_요구사항 정의서.xlsx** | xlsx | **기능/비기능 요구사항, 추적 매트릭스** | S1→S2→**S3** (정책 추론) |
| 5 | LPON-S421_문서관리(온누리상품권).xlsx | xlsx | 문서 목록, 분류 체계 | S1→S2 (메타데이터) |
| 6 | LPON-S422_인력관리(온누리상품권).xlsx | xlsx | 팀 구성, 역할 | S1 (참고) |
| 7 | LPON-S424_비상연락망(온누리상품권).xlsx | xlsx | — | S1 (참고, 정책 추출 기대값 낮음) |

> **핵심**: D106(정책정의서)과 D221(요구사항)이 Stage 3 Policy Inference의 1차 입력. Miraeasset 퇴직연금과 다른 **전자상품권 도메인 정책**이 추출될 것.

#### Group B: 설계 문서 (240 설계/) — **Tier 1~2**

| 하위 폴더 | Core 건수 | 형식 | 추출 대상 | Stage |
|-----------|-----------|------|-----------|-------|
| **243 시스템 인터페이스 정의서/** | 10건 | xlsx 2 + pdf 5 + xlsx 1 + pdf 2 | API 연동 규격, 카드사 인터페이스, App/KMC/헥토파이낸셜 연동 | S2 (엔티티/관계 추출) |
| **244 UI 정의서/** | 2건 | pptx 2 | App 사용자 화면(v2.4.1), BO 화면(v1.4.0) | S2 (screen-design-parser) |
| 246 기간계 데이터 정의서/ | 0건 (전부 Archive) | — | — | Wave 2에서 처리 |

> **중요**: UI 정의서 최종본은 **2건뿐** (App v2.4.1 + BO v1.4.0). Archive에 122건의 버전 히스토리가 있음. Core 2건만으로도 전체 화면 설계 추출 가능 (각각 종합 문서).

#### Group C: 보안검토 증적 (280 보안검토/) — **Tier 2**

| Core 건수 | 형식 | 추출 대상 | Stage |
|-----------|------|-----------|-------|
| 22건 | pptx 18 + xlsx 4 | 보안 요구사항 증적 (서버배치, 인증, 접근통제, 로그관리, 개인정보처리, 암호화) | S2→S3 (보안 정책 추출) |

> **도메인 특화**: 온누리상품권 = 금융 서비스 → 보안검토 증적에서 **결제/개인정보/암호화 정책** 추출 가능. Miraeasset(퇴직연금)과 다른 보안 정책 패턴.

#### Group D: 이행/배포 (270 이행/) — **Tier 3** (dedup 필요)

| Core 건수 | 형식 | 추출 대상 | 비고 |
|-----------|------|-----------|------|
| 23건 | xlsx 23 | 배포 작업 계획서 | **22건이 동일 문서의 날짜 변형!** → dedup 후 최신 1건 + CRM 1건 = **2건** |

> **Dedup 대상**: `LPON-S275_*_v1.2_YYYYMMDD.xlsx` 22건 → 최신 `20240326` 1건만 업로드.

#### Group E: 프로젝트 종료/매뉴얼 (300/) — **Tier 2**

| Core 건수 | 형식 | 추출 대상 | Stage |
|-----------|------|-----------|-------|
| 18건 | pptx 14 + pdf 3 + xlsx 1 | 프로세스 흐름도, BO 매뉴얼, 빌드/배포 가이드, 장애대응 시나리오 | S2 (프로세스 그래프) |

> **가치 높음**: QR 결제 프로세스 흐름도, 승인 시퀀스, 외부연동 프로세스 등 — Stage 2에서 프로세스 그래프 추출에 최적.

#### Group F: 기타 — **Tier 3**

| 출처 | Core 건수 | 내용 |
|------|-----------|------|
| 000 표준문서서식/ | 2건 | SW개발표준 개요 (docx + pdf, 동일 내용) |
| 999 임시작성문서/ | 3건 | 배치Job 현황, 품질 점검, VOC 분석 |

---

### 1.3 Dedup 후 실제 업로드 건수

| Group | Raw Core | Dedup 후 | 비고 |
|-------|----------|----------|------|
| A: 핵심 SI (루트) | 7 | **7** | 전량 업로드 |
| B: 인터페이스 정의서 | 10 | **10** | 전량 (중복 없음) |
| B: UI 정의서 | 2 | **2** | App + BO 최종본 |
| C: 보안검토 증적 | 22 | **22** | 전량 (각각 고유 증적) |
| D: 이행/배포 | 23 | **2** | 22건→1건 dedup + CRM 1건 |
| E: 종료/매뉴얼 | 18 | **18** | 전량 |
| F: 기타 | 5 | **4** | docx+pdf 동일 내용 → docx만 |
| **Wave 1 합계** | **87** | **~65건** | |

### 1.4 Wave 2: Archive (선택적)

| 폴더 | Archive 건수 | 가치 | 업로드 여부 |
|------|-------------|------|------------|
| 210 아키텍처정의 Archive | ~25건 | 시스템 구성도 버전 변천 | 선택적 (최종본만) |
| 244 UI 정의서 Archive | ~60건 | 화면설계 변경 히스토리 | **높음** — 요구사항 변경 추적 |
| 243 인터페이스 Archive | ~25건 | API 연동 규격 변경 | 중간 |
| 246 데이터 정의서 Archive | ~6건 | 테이블 정의서 | 높음 (Core에 0건) |
| 260 테스트 Archive | ~20건 | 테스트 시나리오 변경 | 중간 |
| **Wave 2 합계** | **~127건** | | 필요에 따라 선택 |

---

## 2. Extraction Strategy (5-Stage 파이프라인 매핑)

### Stage 1: Document Ingestion (svc-ingestion)

| 파서 | 대상 | 예상 건수 |
|------|------|-----------|
| **Excel parser** (xlsx) | 정책정의서, 요구사항, WBS, 인터페이스, 보안증적(xlsx) | ~25건 |
| **PPTX parser** (pptx) | UI 정의서, 보안증적(pptx), 프로세스 흐름도, 매뉴얼 | ~32건 |
| **PDF parser** (pdf) | 연동규격서, 개발가이드, 구축가이드 | ~8건 |

> **리스크**: pptx 내 이미지 기반 화면설계서 → 텍스트 추출 한계. Claude Vision fallback 필요할 수 있음.

### Stage 2: Structure Extraction (svc-extraction)

| 추출 유형 | 입력 문서 | 기대 산출물 |
|-----------|----------|-------------|
| **프로세스 그래프** | 흐름도 (QR결제, 승인, 외부연동, API_MOBILE), 배포절차 | 결제 프로세스, 승인 시퀀스, 연동 흐름 |
| **엔티티-관계 맵** | 인터페이스 정의서 (카드사, App, KMC, 헥토), 데이터 정의서 | API 엔티티, 전문 구조, 테이블 관계 |
| **화면-기능 매핑** | UI 정의서 2건 (App + BO) | 화면 ID → 기능 → API 매핑 |
| **보안 요구사항 매트릭스** | 보안증적 22건 | 보안 항목별 구현 증적 매핑 |

### Stage 3: Policy Inference (svc-policy) — **도메인 특화 핵심**

| 정책 유형 (예상) | 소스 문서 | 기대 정책 코드 패턴 |
|------------------|----------|---------------------|
| **결제 정책** | 정책정의서, QR결제 프로세스 | `POL-VOUCHER-PAY-*` |
| **상품권 발행/충전** | 요구사항, UI 정의서 | `POL-VOUCHER-ISSUE-*` |
| **카드사 연동 규칙** | 인터페이스 정의서 (카드사) | `POL-VOUCHER-CARD-*` |
| **개인정보 보호** | 보안증적 (개인정보처리) | `POL-VOUCHER-PII-*` |
| **인증/접근통제** | 보안증적 (로그인, OTP, 접근통제) | `POL-VOUCHER-AUTH-*` |
| **법인 구매** | UI 정의서 (법인 메뉴) | `POL-VOUCHER-CORP-*` |

> **Miraeasset 대비 차이**: 퇴직연금은 `POL-PENSION-WD-*` (인출 규칙) 중심이었으나, LPON은 **결제/발행/연동** 중심의 핀테크 정책이 추출될 것.

### Stage 4: Ontology Normalization (svc-ontology)

| 온톨로지 영역 | 기대 용어 예시 |
|---------------|---------------|
| 결제 도메인 | 승인, 취소, 환불, QR결제, MPM, CPM, 가맹점 |
| 상품권 도메인 | 충전, 잔액, 캐시백, 자동충전, 법인선물, 기업전용 |
| 연동 도메인 | 카드사, 헥토파이낸셜, KMC, 본인인증, 펌뱅킹 |
| 보안 도메인 | OTP, SSLVPN, WAF, LAMP, TLS, RSA |

### Stage 5: Skill Packaging (svc-skill)

| 예상 Skill 카테고리 | 수량 (예상) |
|---------------------|-------------|
| 결제 처리 Skill | 10~20 |
| 상품권 관리 Skill | 10~15 |
| 카드사 연동 Skill | 5~10 |
| 보안/인증 Skill | 10~15 |
| BO 관리 Skill | 5~10 |
| **합계** | **40~70** (Core 65건 기준) |

---

## 3. Implementation Plan (Ralph Task List)

### Phase A: Org 생성 + 준비 (세션 102)

```
P1: Production D1에 LPON Organization 등록 (db-security INSERT)
    - org_id: uuid, name: "LPON", display_name: "전자식 온누리상품권 플랫폼"
P2: LPON Analyst 사용자 등록 (db-security INSERT)
    - 최소 1명 analyst, 배치 업로드용 X-User-Id
P3: SCDSA002 암호화 사전 검사
    - 65건 대상 매직 바이트(53 43 44 53) 체크
P4: 업로드 매니페스트 생성 (lpon-upload-manifest.json)
    - Dedup 적용: 배포계획서 22→1, docx+pdf 동일→docx만
    - 각 파일: path, filename, tier, mime_type, group
```

### Phase B: 배치 업로드 스크립트 (세션 102)

```
P5: infra/scripts/batch-upload-lpon.sh 작성
    - Miraeasset 배치 스크립트 기반
    - 특수문자 파일명 symlink 처리
    - WSL curl MIME 명시적 지정
    - 순차 업로드 (Queue 유실 방지 — 1건씩, 2초 간격)
    - JSONL 로그 (결과 추적용)
```

### Phase C: Wave 1 — Core 업로드 + 파이프라인 (세션 102~103)

```
P6: Wave 1 배치 업로드 실행 (~65건)
    - Group A (핵심 SI 7건) → Group B (설계 12건) → Group C (보안 22건)
    → Group E (종료 18건) → Group D (이행 2건) → Group F (기타 4건)
P7: 파이프라인 완료 대기 + Triage 검증
    - 파싱 성공률 확인, 실패 건 원인 분석
P8: Queue 유실 건 수동 재전파 (/analyze POST)
P9: Policy candidate 확인 + bulk-approve (또는 HITL 데모용 선별 reopen)
P10: 최종 메트릭 기록 (policies, terms, skills)
```

### Phase D: Wave 2 — Archive (선택적, 별도 세션)

```
P11: Archive 중 가치 있는 문서 선별 (데이터 정의서, UI 변경 히스토리)
P12: Wave 2 배치 업로드
P13: 파이프라인 검증 + 메트릭 갱신
```

---

## 4. File Handling — 특수 케이스

### 4.1 Dedup 규칙

| 패턴 | 건수 | 처리 |
|------|------|------|
| `LPON-S275_*_v1.2_YYYYMMDD.xlsx` | 22건 | 최신 `20240326`만 업로드 |
| `KTSSP-P000-SW개발표준*.docx` + `.pdf` | 2건 | docx만 업로드 |
| `(헥토파이낸셜)간편현금결제_*_v3.5.pdf.pdf` | 1건 | 확장자 `.pdf.pdf` 주의 — 그대로 업로드 |

### 4.2 특수문자 파일명 (curl 호환성)

| 파일명 패턴 | 문제 | 해결 |
|------------|------|------|
| `(헥토파이낸셜)간편현금결제_*` | 괄호 | symlink |
| `(견적참고)LPON-D211_*` | 괄호 | symlink |
| `[KMC]본인확인서비스_*` | 대괄호 | symlink |
| `[온누리상품권]Backoffice_*` | 대괄호 | symlink |
| `승인_시퀀스 (1)_이나현.pptx` | 괄호+공백 | symlink |

### 4.3 pptx MIME 감지

WSL에서 한글 파일명의 pptx → `application/octet-stream`으로 감지될 수 있음.
배치 스크립트에서 확장자 기반 MIME 강제 지정:

```bash
case "${ext,,}" in
  xlsx) MIME="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ;;
  pptx) MIME="application/vnd.openxmlformats-officedocument.presentationml.presentation" ;;
  docx) MIME="application/vnd.openxmlformats-officedocument.wordprocessingml.document" ;;
  pdf)  MIME="application/pdf" ;;
esac
```

---

## 5. Risk & Mitigation

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Queue 이벤트 유실 (~16%) | 파이프라인 미완료 | High | triage → `/analyze` POST 2단계 보정 |
| pptx 이미지 기반 화면설계 | 텍스트 추출 한계 | Medium | Claude Vision fallback (screen-design-parser) |
| 특수문자 파일명 (괄호/대괄호) | curl exit 26 | High | symlink 패턴 (검증 완료) |
| 보안증적 pptx → 스크린샷 중심 | 정책 추출률 낮음 | Medium | programmatic 분석 모드 병행 |
| LLM 비용 | Core 65건 × $0.05 ≈ $3.25 | Low | Tier 3은 Haiku/programmatic 우선 |

---

## 6. Success Criteria

| 지표 | Wave 1 (Core) 목표 | Wave 2 (Archive) 목표 |
|------|--------------------|-----------------------|
| 업로드 성공 | >= 60/65건 (92%) | >= 110/127건 (87%) |
| Stage 2 추출 완료 | >= 90% | >= 85% |
| Policy 생성 | >= 100건 | 추가 200건+ |
| Skill 패키지 | >= 40건 | 추가 100건+ |
| 파이프라인 E2E | 정상 동작 확인 | — |

---

## 7. Comparison with Miraeasset Pilot

| 항목 | Miraeasset | LPON Wave 1 (예상) |
|------|-----------|---------------------|
| 총 문서 | 948건 | **65건** (Core dedup 후) |
| 주요 형식 | xlsx 중심 | 혼합 (pptx 32, xlsx 25, pdf 8) |
| 도메인 | 퇴직연금 | 전자식 온누리상품권 (핀테크) |
| 핵심 정책 소스 | 정책정의서 + 업무규정 | 정책정의서 + 요구사항 + 보안증적 |
| Policy 유형 | 인출/적립/전환 규칙 | 결제/발행/연동/보안 규칙 |
| 예상 policies | 2,827 | 100~300 (Core) |
| 예상 skills | 3,047 | 40~70 (Core) |
| Archive 활용 | — | Wave 2로 127건 추가 가능 |

> **핵심 차이**: LPON은 문서 수는 적지만, 보안검토 증적(22건)이 풍부하여 **보안/인증/개인정보 보호 정책 추출**에 강점. 카드사/PG 연동 인터페이스 문서가 있어 **외부 시스템 연동 정책**도 추출 가능.
