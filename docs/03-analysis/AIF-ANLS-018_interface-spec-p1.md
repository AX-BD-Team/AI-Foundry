---
code: AIF-ANLS-018-P1
title: LPON 미문서화 P1 API 인터페이스 명세
version: "1.0"
status: Active
category: Analysis
created: 2026-03-09
updated: 2026-03-09
author: AI Foundry FactCheck Engine (자동 역공학)
---

# P1 미문서화 API 인터페이스 명세

> AI Foundry FactCheck 엔진이 소스코드에서 역공학으로 추출한 인터페이스 명세.
> 원본 참조: [[AIF-ANLS-018]]
>
> **소스 프로젝트**: `lpon-src-api-mobile-master.zip`
> **패키지**: `com.kt.onnuripay.mobile.controller`

---

## 1. 카드 관리 (CardController)

> **소스**: `CardController.java` — basePath: `/onnuripay/v1.0/card`
> 동일 경로에 4개 메서드가 `@PostMapping("/")` 으로 매핑됨.
> 실제 라우팅은 요청 Body의 내용 또는 서비스 레이어에서 메서드를 분기하는 것으로 추정.

### IF-LPON-CARD-001: 카드 목록 조회

| 항목 | 내용 |
|------|------|
| **인터페이스 ID** | IF-LPON-CARD-001 |
| **API Path** | `/onnuripay/v1.0/card` |
| **HTTP Method** | POST |
| **소스 메서드** | `CardController.selectCardList` (line 51) |
| **인증** | `@RequestHeader("Auth") String Auth` — 토큰 기반 인증 |
| **요청 Body** | `@RequestBody CardInfoVO cardInfoVO` |
| **응답 형식** | `ApiResponseMessage` |
| **비고** | AI Foundry FactCheck 자동 탐지 — 인터페이스 설계서 누락 |

**요청 파라미터 (CardInfoVO)**:

| 필드명 | 타입 | 필수 | 설명 |
|--------|------|:----:|------|
| `mbrPartcpntId` | Long | O | 회원관계자 ID (조회 대상) |
| `partcpntId` | Long | — | 회원관계자 ID (인증 주체) |
| `cardSttsCd` | String | — | 카드 상태 코드 (필터링용) |
| `startDate` | String | — | 조회 시작일자 |
| `endDate` | String | — | 조회 종료일자 |
| `encPwd` | EncPwdVO | — | 암호화 비밀번호 (보안 키보드) |

**응답 예상 필드** (CardVO 기반):

| 필드명 | 타입 | 설명 |
|--------|------|------|
| `cardId` | Long | 카드 ID |
| `maskngCardNo` | String | 마스킹 카드번호 (예: `****-****-****-1234`) |
| `cardGdsNm` | String | 카드 상품명 |
| `cardRegYmd` | String | 카드 등록일자 |
| `cardImgUrl` | String | 카드 이미지 URL |
| `cardSttsCd` | String | 카드 상태 코드 |
| `waletNo` | Long | 연결 지갑번호 |
| `cccomFultxtId` | Long | 카드사 전문 ID |
| `mediaVldSeCd` | String | 매체 유효 구분코드 |

---

### IF-LPON-CARD-002: 카드별 금액 조회

| 항목 | 내용 |
|------|------|
| **인터페이스 ID** | IF-LPON-CARD-002 |
| **API Path** | `/onnuripay/v1.0/card` |
| **HTTP Method** | POST |
| **소스 메서드** | `CardController.selectCardAmountList` (line 78) |
| **인증** | `@RequestHeader("Auth") String Auth` — 토큰 기반 인증 |
| **요청 Body** | `@RequestBody CardInfoVO cardInfoVO` |
| **응답 형식** | `ApiResponseMessage` |
| **비고** | AI Foundry FactCheck 자동 탐지 — 인터페이스 설계서 누락 |

**요청 파라미터 (CardInfoVO)**:

| 필드명 | 타입 | 필수 | 설명 |
|--------|------|:----:|------|
| `mbrPartcpntId` | Long | O | 회원관계자 ID |
| `partcpntId` | Long | — | 회원관계자 ID (인증 주체) |
| `cardId` | Long | — | 특정 카드 ID (단건 조회 시) |
| `srchMonth` | String | — | 조회 월 (YYYYMM 형식) [추정] |
| `startDate` | String | — | 조회 시작일자 |
| `endDate` | String | — | 조회 종료일자 |

**응답 예상 필드** (CardInfoVO.amount + CardVO 기반):

| 필드명 | 타입 | 설명 |
|--------|------|------|
| `cardId` | Long | 카드 ID |
| `maskngCardNo` | String | 마스킹 카드번호 |
| `cardGdsNm` | String | 카드 상품명 |
| `amount` | Long | 카드별 누적/잔여 금액 |
| `cccomEntrpsCd` | String | 카드사 코드 |
| `cccomEntrpsNm` | String | 카드사 명 |
| `fnncInstCd` | String | 금융기관 코드 |
| `fnncInstNm` | String | 금융기관 명 |

---

### IF-LPON-CARD-003: 카드 등록

| 항목 | 내용 |
|------|------|
| **인터페이스 ID** | IF-LPON-CARD-003 |
| **API Path** | `/onnuripay/v1.0/card` |
| **HTTP Method** | POST |
| **소스 메서드** | `CardController.registCard` (line 108) |
| **인증** | `@RequestHeader("Auth") String Auth` — 토큰 기반 인증 |
| **요청 Body** | `@RequestBody CardInfoVO param` |
| **응답 형식** | `ApiResponseMessage` |
| **비고** | AI Foundry FactCheck 자동 탐지 — 인터페이스 설계서 누락 |

**요청 파라미터 (CardInfoVO)**:

| 필드명 | 타입 | 필수 | 설명 |
|--------|------|:----:|------|
| `mbrPartcpntId` | Long | O | 회원관계자 ID |
| `partcpntId` | Long | O | 인증 주체 관계자 ID |
| `cardNo` | String | O | 카드번호 (평문, 서버에서 암호화) |
| `cardVld` | String | O | 카드 유효기간 (YYMM) |
| `cardCvcNo` | Long | O | 카드 CVC 번호 |
| `cardNcnm` | String | — | 카드 별명 |
| `bankPartcpntId` | Long | — | 은행 관계자 ID |
| `cccomEntrpsCd` | String | — | 카드사 코드 |
| `fnncInstCd` | String | — | 금융기관 코드 |
| `encPwd` | EncPwdVO | O | 암호화 비밀번호 (보안 키보드 입력값) |
| `authType` | String | — | 인증 타입 (`pwd` 또는 `ocr`) |
| `trmsGroupCd` | String | — | 약관 그룹코드 (카드 등록 약관 동의) |
| `trmsNo` | Long | — | 약관 번호 |

**외부 연동** (소스 추정):
- 카드사 전문 연동: `CardRequestParamDto` → `ci`, `issureCode`, `cardNo`
- 머니플랫폼 카드 등록: `CeRegisterParamVO` → 전문 길이 기반 프로토콜

**응답 예상 필드**:

| 필드명 | 타입 | 설명 |
|--------|------|------|
| `cardId` | Long | 신규 등록된 카드 ID |
| `maskngCardNo` | String | 마스킹 처리된 카드번호 |
| `cardRegYmd` | String | 등록 일자 |
| `waletNo` | Long | 연결된 지갑번호 |

---

### IF-LPON-CARD-004: 카드 해지

| 항목 | 내용 |
|------|------|
| **인터페이스 ID** | IF-LPON-CARD-004 |
| **API Path** | `/onnuripay/v1.0/card` |
| **HTTP Method** | POST |
| **소스 메서드** | `CardController.unregistCard` (line 160) |
| **인증** | `@RequestHeader("Auth") String Auth` — 토큰 기반 인증 |
| **요청 Body** | `@RequestBody CardInfoVO cardInfoVO` |
| **응답 형식** | `ApiResponseMessage` |
| **비고** | AI Foundry FactCheck 자동 탐지 — 인터페이스 설계서 누락 |

**요청 파라미터 (CardInfoVO)**:

| 필드명 | 타입 | 필수 | 설명 |
|--------|------|:----:|------|
| `mbrPartcpntId` | Long | O | 회원관계자 ID |
| `partcpntId` | Long | O | 인증 주체 관계자 ID |
| `cardId` | Long | O | 해지 대상 카드 ID |
| `encPwd` | EncPwdVO | O | 암호화 비밀번호 (보안 키보드 입력값) |
| `withdrawalType` | String | O | 해지 타입 코드 |
| `withdrawalArray` | List\<Long\> | — | 복수 카드 일괄 해지 시 카드 ID 목록 |
| `dbEncrypt` | String | — | DB 암호화 플래그 |

**외부 연동** (소스 추정):
- 카드사 전문 연동: `CeDeleteParamVO` → `ci`, `issureCode`, 카드 삭제 전문
- 머니플랫폼 카드 해지: `CeDeleteRequestParamVO` → 전문 프로토콜

**응답 예상 필드**:

| 필드명 | 타입 | 설명 |
|--------|------|------|
| 성공/실패 | — | `ApiResponseMessage` 표준 응답 (code, msg) |

---

## 2. 캐시백 (DealController)

> **소스**: `DealController.java` — basePath: `/onnuripay/v1.0/deal`
> 캐시백 관련 3개 엔드포인트. 기존 거래 목록(`dealList`, `dealDetail`)은 인터페이스 설계서에 존재하나, 캐시백 전용 API는 누락.

### IF-LPON-DEAL-001: 캐시백 내역 목록

| 항목 | 내용 |
|------|------|
| **인터페이스 ID** | IF-LPON-DEAL-001 |
| **API Path** | `/onnuripay/v1.0/deal/cashBackList` |
| **HTTP Method** | POST |
| **소스 메서드** | `DealController.cashBackList` (line 141) |
| **인증** | `@RequestHeader("Auth") String Auth` — 토큰 기반 인증 |
| **요청 Body** | `@RequestBody CashBackVO cbVO` |
| **응답 형식** | `ApiResponseMessage` |
| **비고** | AI Foundry FactCheck 자동 탐지 — 인터페이스 설계서 누락 |

**요청 파라미터 (CashBackVO)**:

| 필드명 | 타입 | 필수 | 설명 |
|--------|------|:----:|------|
| `partcpntId` | Long | O | 관계자 ID (조회 대상 사용자) |
| `srchMonth` | String | — | 조회 월 (YYYYMM 형식) |
| `paging` | PagingDTO | — | 페이징 정보 |
| `paging.currentPage` | int | — | 현재 페이지 |
| `paging.pageSize` | int | — | 페이지 크기 |

**응답 예상 필드** (CashBackResVO 기반):

| 필드명 | 타입 | 설명 |
|--------|------|------|
| `dlngNo` | String | 거래 번호 |
| `dlngSeCd` | String | 거래 구분 코드 |
| `dlngSeNm` | String | 거래 구분 코드명 |
| `dlngIdntyYmd` | String | 거래 확인 일자 |
| `dlngIdntyHr` | String | 거래 확인 시간 |
| `cancelDlngIdntyYmd` | String | 취소 거래 확인 일자 |
| `cancelDlngIdntyHr` | String | 취소 거래 확인 시간 |
| `frcsNm` | String | 가맹점명 |
| `sumPntDlngAmt` | Long | 포인트 거래 합계 금액 |
| `crrncyPolicyNm` | String | 화폐 정책명 |
| `accmlRate` | String | 적립률 |
| `totalCount` | int | 전체 건수 |

---

### IF-LPON-DEAL-002: 캐시백 설정

| 항목 | 내용 |
|------|------|
| **인터페이스 ID** | IF-LPON-DEAL-002 |
| **API Path** | `/onnuripay/v1.0/deal/cashBackSetting` |
| **HTTP Method** | POST |
| **소스 메서드** | `DealController.cashBackSetting` (line 176) |
| **인증** | `@RequestHeader("Auth") String Auth` — 토큰 기반 인증 |
| **요청 Body** | `@RequestBody CashBackSettingVO cbVO` |
| **응답 형식** | `ApiResponseMessage` |
| **비고** | AI Foundry FactCheck 자동 탐지 — 인터페이스 설계서 누락 |

**요청 파라미터 (CashBackSettingVO)**:

| 필드명 | 타입 | 필수 | 설명 |
|--------|------|:----:|------|
| `partcpntId` | Long | O | 관계자 ID |
| `partcpntLgnNm` | String | — | 관계자 로그인명 |
| `activeYn` | String | O | 캐시백 활성 여부 (`Y`/`N`) |

**응답 예상 필드**:

| 필드명 | 타입 | 설명 |
|--------|------|------|
| 성공/실패 | — | `ApiResponseMessage` 표준 응답 (code, msg) |

---

### IF-LPON-DEAL-003: 캐시백 상세

| 항목 | 내용 |
|------|------|
| **인터페이스 ID** | IF-LPON-DEAL-003 |
| **API Path** | `/onnuripay/v1.0/deal/cashBackDetail` |
| **HTTP Method** | POST |
| **소스 메서드** | `DealController.cashBackDetail` (line 211) |
| **인증** | `@RequestHeader("Auth") String Auth` — 토큰 기반 인증 |
| **요청 Body** | `@RequestBody CashBackVO cashBackVO` |
| **응답 형식** | `ApiResponseMessage` |
| **비고** | AI Foundry FactCheck 자동 탐지 — 인터페이스 설계서 누락 |

**요청 파라미터 (CashBackVO)**:

| 필드명 | 타입 | 필수 | 설명 |
|--------|------|:----:|------|
| `dlngNo` | String | O | 거래 번호 (조회 대상) |
| `cbDlngNo` | String | — | 캐시백 거래 번호 |
| `partcpntId` | Long | O | 관계자 ID |

**응답 예상 필드** (CashBackResVO 기반):

| 필드명 | 타입 | 설명 |
|--------|------|------|
| `dlngNo` | String | 거래 번호 |
| `dlngSeCd` | String | 거래 구분 코드 |
| `dlngSeNm` | String | 거래 구분명 |
| `dlngIdntyYmd` | String | 거래 일자 |
| `dlngIdntyHr` | String | 거래 시간 |
| `frcsNm` | String | 가맹점명 |
| `sumPntDlngAmt` | Long | 포인트 거래 합계 금액 |
| `crrncyPolicyNm` | String | 화폐 정책명 |
| `accmlRate` | String | 적립률 |

---

## 3. 지갑/잔액 (WalletController)

> **소스**: `WalletController.java` — basePath: `/onnuripay/v1.0/wallet`
> 동일 경로에 2개 메서드가 `@PostMapping("/")` 으로 매핑됨.
> `getBalance`는 잔액 조회, `getBalanceCheck`는 잔액 유효성/충분성 확인으로 추정.

### IF-LPON-WALLET-001: 잔액 조회

| 항목 | 내용 |
|------|------|
| **인터페이스 ID** | IF-LPON-WALLET-001 |
| **API Path** | `/onnuripay/v1.0/wallet` |
| **HTTP Method** | POST |
| **소스 메서드** | `WalletController.getBalance` (line 47) |
| **인증** | `@RequestHeader("Auth") String Auth` — 토큰 기반 인증 |
| **요청 Body** | `@RequestBody PartiesVO partiesVO` |
| **응답 형식** | `ApiResponseMessage` |
| **비고** | AI Foundry FactCheck 자동 탐지 — 인터페이스 설계서 누락 |

**요청 파라미터 (PartiesVO — 잔액 조회에 사용되는 필드)**:

| 필드명 | 타입 | 필수 | 설명 |
|--------|------|:----:|------|
| `partcpntId` | Long | O | 관계자 ID (조회 대상 사용자) |
| `waletNo` | Long | — | 지갑번호 (특정 지갑 조회 시) |
| `entPartcpntId` | Long | — | 기업 관계자 ID |

**응답 예상 필드** (WalletVO 기반):

| 필드명 | 타입 | 설명 |
|--------|------|------|
| `waletNo` | Long | 지갑 번호 |
| `pntBlce` | Long | 포인트 잔액 (원) |
| `cbackBlce` | Long | 캐시백 잔액 (원) |
| `ownrSeCd` | String | 소유자 구분 코드 |
| `waletIssuYmd` | String | 지갑 발급 일자 |
| `nowVldYn` | String | 현재 유효 여부 (`Y`/`N`) |

---

### IF-LPON-WALLET-002: 잔액 확인 (유효성 검증)

| 항목 | 내용 |
|------|------|
| **인터페이스 ID** | IF-LPON-WALLET-002 |
| **API Path** | `/onnuripay/v1.0/wallet` |
| **HTTP Method** | POST |
| **소스 메서드** | `WalletController.getBalanceCheck` (line 76) |
| **인증** | `@RequestHeader("Auth") String Auth` — 토큰 기반 인증 |
| **요청 Body** | `@RequestBody PartiesVO partiesVO` |
| **응답 형식** | `ApiResponseMessage` |
| **비고** | AI Foundry FactCheck 자동 탐지 — 인터페이스 설계서 누락 |

**요청 파라미터 (PartiesVO — 잔액 확인에 사용되는 필드)**:

| 필드명 | 타입 | 필수 | 설명 |
|--------|------|:----:|------|
| `partcpntId` | Long | O | 관계자 ID |
| `waletNo` | Long | — | 지갑번호 |

**응답 예상 필드** (WalletVO 기반):

| 필드명 | 타입 | 설명 |
|--------|------|------|
| `pntBlce` | Long | 포인트 잔액 |
| `pntBlceCheck` | String | 잔액 충분 여부 플래그 [추정] |
| `nowVldYn` | String | 현재 유효 여부 |

---

## 4. 결제 게이트웨이 (ApprovalController)

> **소스**: `ApprovalController.java` — basePath: `/onnuripay/v1.0/approval`
> PG사 결제 게이트웨이 연동 엔드포인트. 범용 `Map<String, String>` 파라미터 사용.

### IF-LPON-APRV-001: PG 결제 게이트웨이

| 항목 | 내용 |
|------|------|
| **인터페이스 ID** | IF-LPON-APRV-001 |
| **API Path** | `/onnuripay/v1.0/approval/gateway` |
| **HTTP Method** | POST |
| **소스 메서드** | `ApprovalController.gateway` (line 36) |
| **인증** | 없음 (Auth 헤더 미사용) |
| **요청 Body** | `@RequestBody Map<String, String> inputMap` |
| **응답 형식** | `Map<String, Object>` |
| **비고** | AI Foundry FactCheck 자동 탐지 — 인터페이스 설계서 누락 |

**요청 파라미터 (Map\<String, String\> — PG 전문 기반 추정)**:

| 키 | 타입 | 필수 | 설명 |
|----|------|:----:|------|
| `pgCode` | String | O | PG사 코드 [추정] |
| `merchantId` | String | O | 가맹점 ID [추정] |
| `orderNo` | String | O | 주문번호 [추정] |
| `amount` | String | O | 결제 금액 [추정] |
| `payMethod` | String | O | 결제 수단 (카드/계좌이체 등) [추정] |
| `buyerName` | String | — | 구매자명 [추정] |
| `returnUrl` | String | — | 결제 완료 후 리턴 URL [추정] |

> ⚠️ **주의**: 이 엔드포인트는 `Map<String, String>`을 파라미터로 받아 구체적 필드를 소스코드만으로 확정할 수 없음.
> PG사(결제 게이트웨이) 연동 전문 규격은 별도 PG 연동 가이드 문서를 참조해야 함.
> 위 필드명은 일반적인 PG 결제 API 패턴에서 **추정**한 것임.

**응답 예상 필드 (Map\<String, Object\>)**:

| 키 | 타입 | 설명 |
|----|------|------|
| `resultCode` | String | 결과 코드 [추정] |
| `resultMsg` | String | 결과 메시지 [추정] |
| `approvalNo` | String | 승인번호 [추정] |
| `transactionId` | String | PG 거래 ID [추정] |

---

## 부록 A. 공통 타입 정의

### A.1 ApiResponseMessage (표준 응답 래퍼)

모든 API의 응답은 `ApiResponseMessage`로 래핑되며, 아래 구조를 따른다:

```json
{
  "code": "0000",
  "msg": "성공",
  "data": { ... }
}
```

### A.2 EncPwdVO (보안 키보드 입력값)

카드 등록/해지 등 보안이 필요한 API에서 비밀번호 전달에 사용:

| 필드명 | 타입 | 설명 |
|--------|------|------|
| `id` | String | 보안 키보드 세션 ID |
| `fieldType` | String | 필드 타입 |
| `seedKey` | String | 암호화 시드 키 |
| `initTime` | String | 초기화 시간 |
| `keyIndex` | String | 키 인덱스 |
| `keyboardType` | String | 키보드 타입 |
| `encode` | String | 암호화된 값 |
| `hmac` | String | HMAC 검증값 |

### A.3 PagingDTO (페이징)

| 필드명 | 타입 | 설명 |
|--------|------|------|
| `currentPage` | int | 현재 페이지 (1-based) |
| `pageSize` | int | 페이지 크기 |
| `totalCount` | int | 전체 건수 (응답 시) |
| `totalPage` | int | 전체 페이지 수 (응답 시) |

---

## 부록 B. 인터페이스 명세 요약표

| # | 인터페이스 ID | API Path | Method | 소스 메서드 | 요청 VO | 인증 | 비고 |
|---|---------------|----------|--------|------------|---------|:----:|------|
| 1 | IF-LPON-CARD-001 | `/onnuripay/v1.0/card` | POST | `selectCardList` | CardInfoVO | O | 카드 목록 조회 |
| 2 | IF-LPON-CARD-002 | `/onnuripay/v1.0/card` | POST | `selectCardAmountList` | CardInfoVO | O | 카드별 금액 조회 |
| 3 | IF-LPON-CARD-003 | `/onnuripay/v1.0/card` | POST | `registCard` | CardInfoVO | O | 카드 등록 |
| 4 | IF-LPON-CARD-004 | `/onnuripay/v1.0/card` | POST | `unregistCard` | CardInfoVO | O | 카드 해지 |
| 5 | IF-LPON-DEAL-001 | `/onnuripay/v1.0/deal/cashBackList` | POST | `cashBackList` | CashBackVO | O | 캐시백 내역 목록 |
| 6 | IF-LPON-DEAL-002 | `/onnuripay/v1.0/deal/cashBackSetting` | POST | `cashBackSetting` | CashBackSettingVO | O | 캐시백 설정 |
| 7 | IF-LPON-DEAL-003 | `/onnuripay/v1.0/deal/cashBackDetail` | POST | `cashBackDetail` | CashBackVO | O | 캐시백 상세 |
| 8 | IF-LPON-WALLET-001 | `/onnuripay/v1.0/wallet` | POST | `getBalance` | PartiesVO | O | 잔액 조회 |
| 9 | IF-LPON-WALLET-002 | `/onnuripay/v1.0/wallet` | POST | `getBalanceCheck` | PartiesVO | O | 잔액 확인 |
| 10 | IF-LPON-APRV-001 | `/onnuripay/v1.0/approval/gateway` | POST | `gateway` | Map\<String,String\> | — | PG 결제 게이트웨이 |

---

## 부록 C. 추정 표기 ([추정]) 기준

소스코드에서 직접 확인할 수 없는 정보에 `[추정]` 표기를 사용했다:

1. **VO 필드 중 실제 사용 여부 불확실** — VO에 정의된 모든 필드가 특정 API에서 사용되는 것은 아님. 서비스 레이어에서 실제로 참조하는 필드만 필수로 표기
2. **Map\<String, String\> 파라미터** — ApprovalController.gateway는 범용 Map을 사용하므로 PG 연동 일반 패턴에서 추정
3. **응답 필드** — 반환 타입이 `ApiResponseMessage`인 경우 내부 data 필드의 구체적 구조는 서비스 레이어 분석이 필요

---

*Generated by AI Foundry FactCheck Engine — 소스코드 역공학 기반 자동 인터페이스 명세 v1.0*
*소스 문서: lpon-src-api-mobile-master.zip (document_id: 406c9baf-73e6-4d9a-a3c2-71ba99268741)*
