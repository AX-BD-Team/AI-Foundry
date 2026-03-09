---
code: AIF-PLAN-017
title: FactCheck API 커버리지 개선 로드맵
version: "1.0"
status: Active
category: Plan
created: 2026-03-09
updated: 2026-03-09
author: Sinclair Seo
feature: factcheck-coverage-improvement
---

# FactCheck API 커버리지 개선 로드맵

> 현재 소스코드↔문서 API 매칭률 27.1% (98/362 보정 기준) → 목표 60%+

## Executive Summary

| 항목 | 내용 |
|------|------|
| Feature | LPON FactCheck 커버리지 개선 |
| 현재 | 매칭 98건 / 소스 1,128건 / 문서 109건 (커버리지 27.1%, 노이즈 21건 제외) |
| 목표 | 커버리지 60%+ (1단계), 80%+ (2단계) |
| 소요 세션 | 3~5 세션 (단계별) |

### Value Delivered

| 관점 | 내용 |
|------|------|
| Problem | 소스코드 1,128개 API 중 8.7%만 문서로 커버 → 나머지는 암묵지 |
| Solution | 3단계 복합 접근: 매칭 고도화 → AST 분석 → 문서 보완 제안 |
| Function UX Effect | 도메인별 갭 시각화 + 트렌드 차트로 개선 추이 실시간 확인 |
| Core Value | SI 산출물의 문서 완전성을 정량적으로 측정·개선하는 체계 확립 |

---

## 현황 분석

### 매칭 실패 원인 분류

| 원인 | 비중 (추정) | 설명 |
|------|:-----------:|------|
| 문서 부재 | ~60% | 소스에 API가 있으나 대응 문서가 아예 없음 |
| 매칭 알고리즘 한계 | ~25% | 문서에 정보는 있으나 이름/경로 불일치로 매칭 실패 |
| 노이즈/유틸리티 | ~10% | 테스트/내부용/중복 엔드포인트 (이미 21건 필터링) |
| 데이터 품질 | ~5% | 파싱 누락, 불완전 추출 |

### 도메인별 갭 분포 (세션 152 기준)

| 도메인 | 갭 수 | 비중 |
|--------|:-----:|:----:|
| 회원 관리 | 79 | 1위 |
| 충전/결제 | 49 | 2위 |
| 선물/쿠폰 | 42 | 3위 |
| 거래 내역 | 40 | 4위 |
| 메시지/알림 | 38 | 5위 |
| 기타 12개 도메인 | 나머지 | - |

---

## 3단계 로드맵

### Stage 1: 매칭 알고리즘 고도화 (1~2 세션)

**목표**: 기존 데이터로 매칭률 27% → 40%+ 달성

#### 1-1. source-aggregator class+method path 결합
- **현재**: API path만으로 매칭 (`/gift/sendGift`)
- **개선**: `Controller.method` 정보를 결합 (`GiftController.sendGift → /gift/sendGift`)
- **효과**: doc spec의 interfaceId/description과 fuzzy 매칭 가능성 증가
- **구현**: `source-aggregator.ts`에서 `alternativePaths` 배열 확장

#### 1-2. URL 정규화 강화
- **현재**: `normalizeName()` 기본 정규화
- **개선**:
  - prefix 제거 (`/api/v1/` → `/v1/`)
  - RESTful resource 추출 (`/gift/{id}/send` → `gift.send`)
  - HTTP method 고려한 의미 매칭
- **구현**: `matcher.ts`의 `normalizeName()` 확장

#### 1-3. LLM Semantic Matching 확대
- **현재**: `llm-matcher.ts` 구현 완료, 배치 실행 가능
- **개선**: 미매칭 항목 전량에 대해 LLM 배치 실행 (10건씩)
- **비용**: ~1,000건 × 0.003$/건 ≈ $3 (Haiku 기준)
- **구현**: 기존 `POST /factcheck/results/:id/llm-match` 반복 호출

### Stage 2: 소스코드 AST 분석 (1~2 세션)

**목표**: Java/Spring 소스 직접 분석으로 API 메타데이터 정확도 향상

#### 2-1. Spring Annotation 파서
- **대상**: `@RequestMapping`, `@GetMapping`, `@PostMapping`, `@PutMapping`, `@DeleteMapping`
- **추출**: path, HTTP method, 파라미터 타입, 리턴 타입
- **구현**: 새 모듈 `factcheck/ast-parser.ts` (정규식 기반, 트리시터 불필요)
- **입력**: R2에 저장된 Java 소스 파일 (LPON 소스코드 문서)

#### 2-2. MyBatis XML 파서 고도화
- **현재**: 기본 SQL 추출
- **개선**: `<resultMap>` → VO 클래스 매핑, `<sql>` 프래그먼트 인라인 처리
- **효과**: 테이블↔API 간 간접 매핑 강화

#### 2-3. Service Layer 분석
- **대상**: `@Service`, `@Transactional` 어노테이션
- **추출**: Controller→Service→Mapper 호출 체인
- **효과**: API 엔드포인트의 실제 데이터 접근 경로 파악 → 문서 커버리지 정밀 분석

### Stage 3: 문서 보완 자동 제안 (1 세션)

**목표**: 갭 데이터 기반으로 실행 가능한 문서 작성 가이드 생성

#### 3-1. 도메인별 문서 필요성 보고서
- **입력**: domain-summary API 데이터
- **출력**: "이 도메인에는 N개 API가 문서화되지 않았으며, 인터페이스 정의서가 필요합니다"
- **구현**: `document-suggestions` API 확장 (이번 세션에 기본 구현 완료)

#### 3-2. API 스펙 자동 초안 생성
- **입력**: 소스코드에서 추출한 API 메타데이터 (path, params, return type)
- **출력**: 인터페이스 정의서 초안 (마크다운)
- **LLM 활용**: Sonnet으로 파라미터 설명 + 비즈니스 로직 요약 자동 생성
- **효과**: 리뷰어가 초안을 검증·보완하는 형태로 문서 작성 시간 80% 단축

#### 3-3. Wave 2 투입 연계
- **Archive 127건**: 추가 문서 분석 시 커버리지 자연 증가 예상
- **우선순위**: HIGH 갭이 많은 도메인(회원, 충전, 선물)의 문서부터 투입

---

## 성공 지표

| 지표 | Stage 1 | Stage 2 | Stage 3 |
|------|:-------:|:-------:|:-------:|
| 매칭 커버리지 | 40%+ | 60%+ | 80%+ |
| 노이즈 필터링 | 30건+ | 50건+ | - |
| 문서 제안서 | - | - | 17개 도메인 |
| 자동 초안 | - | - | 100건+ |

## 의존성 & 리스크

| 항목 | 리스크 | 대응 |
|------|--------|------|
| LLM 비용 | Semantic matching 대량 실행 시 비용 | Haiku 사용, 배치 크기 제한 |
| Java 파싱 정확도 | Regex 기반 AST는 복잡한 패턴 누락 가능 | 주요 패턴 커버 후 점진적 확장 |
| 소스코드 접근 | R2에 저장된 소스 파일 의존 | 이미 88건 문서 업로드 완료 |
| Wave 2 일정 | Archive 127건 투입 시점 미정 | Stage 1-2와 독립 진행 가능 |

---

## 관련 문서

- [[AIF-REQ-016]] LPON FactCheck 소스코드↔문서 API 커버리지 분석
- [[AIF-DSGN-011]] FactCheck 아키텍처 설계 (없으면 생략)
- SPEC.md §5 LPON FactCheck 섹션
