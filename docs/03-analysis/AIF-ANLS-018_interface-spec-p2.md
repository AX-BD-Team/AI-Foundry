---
code: AIF-ANLS-018-P2
title: LPON 미문서화 P2/P3 API 인터페이스 명세
version: "1.0"
status: Active
category: Analysis
created: 2026-03-09
updated: 2026-03-09
author: AI Foundry FactCheck Engine (자동 역공학)
---

# P2/P3 미문서화 API 인터페이스 명세

> AI Foundry FactCheck 엔진이 소스코드에서 역공학으로 추출한 인터페이스 명세.
> 원본 참조: [[AIF-ANLS-018]]

## 역공학 소스

| 항목 | 값 |
|------|------|
| 소스 문서 | `lpon-src-api-mobile-master.zip` (document_id: `406c9baf`) |
| 청크 유형 | CodeController (19), CodeDataModel (121) |
| 패키지 | `com.kt.onnuripay.mobile.controller` |
| 추출 시점 | 2026-03-09 |

---

## 1. 가맹점 검색 (PartiesController)

### IF-LPON-PARTIES-001: 카테고리별 가맹점 검색

| 항목 | 내용 |
|------|------|
| 인터페이스 ID | IF-LPON-PARTIES-001 |
| API Path | `/onnuripay/v1.0/parties/companySearchCategoryList` |
| HTTP Method | POST |
| 소스 메서드 | `PartiesController.companySearchCategoryList` (line 138) |
| 소스 파일 | `PartiesController.java` |
| 인증 | Bearer Token (`@RequestHeader("Auth")`) |
| 요청 VO | `PartiesFranTypeVO` (`@RequestBody`) |
| 응답 타입 | `ApiResponseMessage` |
| 비고 | AI Foundry FactCheck 자동 탐지 — P2 |

#### 요청 파라미터 (PartiesFranTypeVO)

> 소스: `com.kt.onnuripay.mobile.vo.PartiesFranTypeVO`

| 필드명 | 타입 | 필수 | 설명 |
|--------|------|:----:|------|
| `locgovCd` | String | N | 지자체 코드 |
| `locgovNm` | String | N | 지자체 명 |
| `sggCd` | String | N | 시군구 코드 |
| `sggNm` | String | N | 시군구 명 |
| `mrktCd` | String | N | 시장 코드 |
| `mrktNm` | String | N | 시장 명 |
| `searchType` | String | N | 검색 유형 [추정: "CATEGORY" / "LOCATION" / "KEYWORD"] |
| `emdNm` | String | N | 읍면동 명 |
| `frcsCnt` | String | N | 가맹점 카운트 (응답용) |

#### 응답 형식

```json
{
  "resultCode": "0000",
  "resultMessage": "success",
  "data": [
    {
      "locgovCd": "11",
      "locgovNm": "서울특별시",
      "sggCd": "11010",
      "sggNm": "종로구",
      "mrktCd": "M001",
      "mrktNm": "광장시장",
      "emdNm": "예지동",
      "frcsCnt": "42"
    }
  ]
}
```

#### 기능 설명

카테고리(지자체/시군구/시장) 기준으로 가맹점을 검색하는 API. 기존 `companyLocgovList`(지자체별)과 `companyMrktList`(시장별)의 통합 검색 버전으로, `searchType` 파라미터로 검색 범위를 지정할 수 있다.

---

### IF-LPON-PARTIES-002: 그룹별 가맹점 위치

| 항목 | 내용 |
|------|------|
| 인터페이스 ID | IF-LPON-PARTIES-002 |
| API Path | `/onnuripay/v1.0/parties/companyLocationByGroup` |
| HTTP Method | POST |
| 소스 메서드 | `PartiesController.companyLocationByGroup` (line 241) |
| 소스 파일 | `PartiesController.java` |
| 인증 | 없음 (비인증 API) |
| 요청 VO | `PartiesVO` (`@RequestBody`) |
| 응답 타입 | `ApiResponseMessage` |
| 비고 | AI Foundry FactCheck 자동 탐지 — P2. 인증 없음 주의 |

#### 요청 파라미터 (PartiesVO — 위치 검색 관련 필드)

> 소스: `com.kt.onnuripay.mobile.dbio.vo.PartiesVO` — 위치 관련 필드만 발췌

| 필드명 | 타입 | 필수 | 설명 |
|--------|------|:----:|------|
| `entClCd` | String | N | 기업 분류 코드 (그룹 구분) |
| `entClNm` | String | N | 기업 분류 명 |
| `locgovCd` | String | N | 지자체 코드 |
| `sggCd` | String | N | 시군구 코드 |
| `mrktCd` | String | N | 시장 코드 |
| `emdNm` | String | N | 지역명 (읍면동) |
| `srchLat` | String | N | 지역 위치 위도 |
| `srchLot` | String | N | 지역 위치 경도 |
| `srchLat2` | String | N | 지역 위치 위도 (범위 끝) |
| `srchLot2` | String | N | 지역 위치 경도 (범위 끝) |
| `srchMyLat` | String | N | 현재 위치 위도 |
| `srchMyLot` | String | N | 현재 위치 경도 |
| `srchDistance` | String | N | 거리 검색 (반경, 단위 [추정: km]) |
| `srchWord` | String | N | 검색 단어 |
| `srchWordByMap` | String | N | 지도 검색용 검색 단어 |
| `mapYn` | String | N | 지도 여부 ("Y"/"N") |
| `paging` | PagingDTO | N | 페이징 정보 |

#### 응답 형식

```json
{
  "resultCode": "0000",
  "resultMessage": "success",
  "data": [
    {
      "partcpntId": 12345,
      "partcpntNm": "○○마트",
      "lat": "37.5665",
      "lot": "126.9780",
      "distance": "0.5",
      "entClCd": "MART",
      "entClNm": "마트",
      "imageUrl": "/images/mart_icon.png"
    }
  ]
}
```

#### 기능 설명

기업 분류(그룹) 기준으로 가맹점의 위치 정보를 조회하는 API. 기존 `companyLocation`(개별 위치)의 그룹 집계 버전으로, 지도에서 카테고리별 가맹점 마커를 표시할 때 사용한다. **인증 헤더 없이 호출** 가능한 점이 특이하며, 공개 API로 설계된 것으로 추정된다.

---

## 2. 원장 상세 (LedgerController)

### IF-LPON-LEDGER-001: 환불 상세

| 항목 | 내용 |
|------|------|
| 인터페이스 ID | IF-LPON-LEDGER-001 |
| API Path | `/onnuripay/v1.0/ledger/refundDetail` |
| HTTP Method | POST |
| 소스 메서드 | `LedgerController.refundDetail` (line 169) |
| 소스 파일 | `LedgerController.java` |
| 인증 | Bearer Token (`@RequestHeader("Auth")`) |
| 요청 VO | `LedgerVO` (`@RequestBody`) |
| 응답 타입 | `ApiResponseMessage` |
| 비고 | AI Foundry FactCheck 자동 탐지 — P2 |

#### 요청 파라미터 (LedgerVO — 환불 조회 관련 필드)

> 소스: `com.kt.onnuripay.mobile.vo.LedgerVO` — 환불 상세 조회에 사용되는 필드 발췌

| 필드명 | 타입 | 필수 | 설명 |
|--------|------|:----:|------|
| `partcpntId` | Long | Y [추정] | 사용자 ID |
| `dlngNo` | Long | Y [추정] | 거래번호 (환불 건 특정) |
| `pblcnNo` | Long | N | 발행번호 |
| `waletNo` | Long | N | 사용자 지갑번호 |
| `dlngSeCd` | String | N | 거래 구분 코드 |

#### 응답 형식

```json
{
  "resultCode": "0000",
  "resultMessage": "success",
  "data": {
    "dlngNo": 98765,
    "pntRefuntAmt": 50000,
    "rfndPsbltyYn": "Y",
    "rfndOcrnYn": "Y",
    "pblcnNo": 11111,
    "ogcKndNm": "전자식온누리상품권",
    "dlngYmd": "20260309",
    "dlngHr": "143022",
    "dlngSeCd": "REFUND",
    "dlngSeNm": "환불",
    "srcDlngNo": "87654",
    "chargAcntRegNo": "ACC-001",
    "pntBlce": 150000
  }
}
```

#### 기능 설명

특정 거래번호(`dlngNo`)에 대한 환불 상세 정보를 조회하는 API. 기존 `refundList`(환불 목록)의 상세 조회 페어로, 환불 금액(`pntRefuntAmt`), 환불 가능 여부(`rfndPsbltyYn`), 원 거래번호(`srcDlngNo`) 등을 반환한다.

---

### IF-LPON-LEDGER-002: 자동 충전 코드 목록

| 항목 | 내용 |
|------|------|
| 인터페이스 ID | IF-LPON-LEDGER-002 |
| API Path | `/onnuripay/v1.0/ledger/autoChargeCodeList` |
| HTTP Method | POST |
| 소스 메서드 | `LedgerController.autoChargeCodeList` (line 451) |
| 소스 파일 | `LedgerController.java` |
| 인증 | Bearer Token (`@RequestHeader("Auth")`) |
| 요청 VO | `AutoChargeVO` (`@RequestBody`) |
| 응답 타입 | `ApiResponseMessage` |
| 비고 | AI Foundry FactCheck 자동 탐지 — P2 |

#### 요청 파라미터 (AutoChargeVO)

> 소스: `com.kt.onnuripay.mobile.vo.AutoChargeVO`

| 필드명 | 타입 | 필수 | 설명 |
|--------|------|:----:|------|
| `partcpntId` | Long | Y [추정] | 사용자 ID |
| `autoChargCondKndCd` | String | N | 자동 충전 조건 종류 코드 |
| `autoChargCondKndNm` | String | N | 자동 충전 조건 종류 명 |
| `autoChargCondDtlCd` | String | N | 자동 충전 조건 상세 코드 |
| `autoChargCondDtlNm` | String | N | 자동 충전 조건 상세 명 |
| `stngAmt` | String | N | 설정 금액 |
| `fnncInstCd` | String | N | 금융 기관 코드 |
| `fnncInstNm` | String | N | 금융 기관 명 |
| `discountRate` | String | N | 할인율 |

#### 응답 형식

```json
{
  "resultCode": "0000",
  "resultMessage": "success",
  "data": [
    {
      "autoChargCondKndCd": "BALANCE",
      "autoChargCondKndNm": "잔액 기준",
      "autoChargCondDtlCd": "UNDER_10000",
      "autoChargCondDtlNm": "1만원 이하",
      "stngAmt": "50000",
      "discountRate": "10"
    },
    {
      "autoChargCondKndCd": "PERIODIC",
      "autoChargCondKndNm": "주기 기준",
      "autoChargCondDtlCd": "MONTHLY_1",
      "autoChargCondDtlNm": "매월 1일",
      "stngAmt": "100000",
      "discountRate": "10"
    }
  ]
}
```

#### 기능 설명

자동 충전 설정에 사용할 수 있는 조건 코드 목록을 조회하는 API. 자동 충전 조건 종류(`autoChargCondKndCd`: 잔액 기준, 주기 기준 등)와 상세 코드(`autoChargCondDtlCd`: 1만원 이하, 매월 1일 등)의 코드 테이블을 반환한다. `autoChargeRegister`/`autoChargeUpdate` 호출 전 선택지를 가져오는 용도.

---

## 3. P3 검토 대상

### IF-LPON-ACCOUNT-001: 이니텍 연동 체크

| 항목 | 내용 |
|------|------|
| 인터페이스 ID | IF-LPON-ACCOUNT-001 |
| API Path | `/onnuripay/v1.0/account/innitechCheck` |
| HTTP Method | POST |
| 소스 메서드 | `AccountController.test` (line 173) |
| 소스 파일 | `AccountController.java` |
| 인증 | 없음 (파라미터 없음) |
| 요청 VO | 없음 |
| 응답 타입 | `ApiResponseMessage` |
| 비고 | AI Foundry FactCheck 자동 탐지 — P3 |

#### 요청 파라미터

없음. 파라미터를 받지 않는 무인자 메서드.

#### 응답 형식

```json
{
  "resultCode": "0000",
  "resultMessage": "success",
  "data": null
}
```

#### P3 검토 의견: **문서화 불필요 (테스트/헬스체크용)**

| 판단 근거 | 상세 |
|-----------|------|
| 메서드명 | `test` — 명시적으로 테스트 목적 |
| 파라미터 | 없음 — 비즈니스 로직이 아닌 연동 확인용 |
| 경로 패턴 | `/innitechCheck` — 이니텍(보안 모듈) 연동 상태 확인 |
| 인증 | 없음 — 헬스체크 패턴 |
| 같은 컨트롤러의 다른 API | `accountList`, `accountReg`, `accountUnReg`, `accountDefault`는 모두 Auth 헤더 + AccountInfoVO를 사용하는 정상 API |

**결론**: 이니텍(Innitech) 보안 모듈의 연동 상태를 확인하는 헬스체크/테스트 엔드포인트. 실제 사용자 트래픽이 아닌 운영 모니터링 용도이므로 **인터페이스 설계서 대상에서 제외**를 권장한다. 필요시 운영 가이드(OPS)에 기술.

---

### IF-LPON-FRONT-001: 팝업 목록 조회

| 항목 | 내용 |
|------|------|
| 인터페이스 ID | IF-LPON-FRONT-001 |
| API Path | `/onnuripay/v1.0/front/popupList` |
| HTTP Method | POST |
| 소스 메서드 | `FrontController.selectPopupList` (line 372) |
| 소스 파일 | `FrontController.java` |
| 인증 | Bearer Token (`@RequestHeader("Auth")`) |
| 요청 VO | `PopupVo` (`@RequestBody`) |
| 응답 타입 | `ApiResponseMessage` |
| 비고 | AI Foundry FactCheck 자동 탐지 — P3 |

#### 요청 파라미터 (PopupVo)

> 소스: `PopupVo.java` — DataModel 청크에서 추출 불가. 같은 컨트롤러의 유사 VO(EventVO, NoticeVO) 패턴에서 추정.

| 필드명 | 타입 | 필수 | 설명 |
|--------|------|:----:|------|
| `popupId` | Long | N | 팝업 ID [추정] |
| `pstgLcCd` | String | N | 게시 위치 코드 [추정: "MAIN" / "SUB"] |
| `useYn` | String | N | 사용 여부 [추정: "Y" / "N"] |
| `startDate` | String | N | 게시 시작일 [추정] |
| `endDate` | String | N | 게시 종료일 [추정] |

> ⚠️ 위 필드는 동일 컨트롤러의 `EventVO`와 `ResEventPopVO`의 패턴에서 추정한 것이며, 실제 `PopupVo.java` 소스를 확인하여 보정이 필요하다.

#### 응답 형식

```json
{
  "resultCode": "0000",
  "resultMessage": "success",
  "data": [
    {
      "popupId": 1,
      "title": "온누리상품권 10% 할인 이벤트",
      "imageUrl": "/images/popup/event_01.png",
      "linkUrl": "/event/detail/1",
      "pstgLcCd": "MAIN",
      "startDate": "20260301",
      "endDate": "20260331"
    }
  ]
}
```

#### P3 검토 의견: **조건부 문서화 권장 (앱 UX 보조 API)**

| 판단 근거 | 상세 |
|-----------|------|
| 메서드명 | `selectPopupList` — 정상적인 조회 메서드 (test 아님) |
| 파라미터 | `PopupVo` + Auth — 인증 필요한 정식 API |
| 같은 컨트롤러의 다른 API | `noticeList`, `faqList`, `eventList` 등은 인터페이스 설계서에 기술됨 |
| 유사 API | `CommonController.eventPopupList` (line 255) — 이벤트 팝업 목록이 별도 존재 |

**결론**: 앱 메인 화면 또는 서브 화면에 표시하는 팝업 목록을 조회하는 정식 API. 같은 컨트롤러의 `noticeList`, `eventList` 등이 모두 문서화되어 있으므로, `popupList`도 **인터페이스 설계서에 포함하는 것이 일관성 있다**. 다만, 순수 UI 내부용이고 외부 시스템 연동이 필요하지 않다면 우선순위를 낮출 수 있다.

| 시나리오 | 권장 |
|---------|------|
| 외부 시스템이 팝업 데이터를 참조하는 경우 | 문서화 필수 |
| 앱 내부 전용 (CMS ↔ 앱) | 문서화 권장 (일관성) |
| BO(백오피스)에서만 관리하는 경우 | 문서화 선택 |

---

## 4. 보완 후 예상 커버리지 영향

| 시나리오 | 외부 API 커버리지 | 변화 |
|---------|:-----------------:|:----:|
| 현재 (as-is) | 83.7% (103/123) | — |
| P2 4건 보완 | **87.0%** (107/123) | +3.3%p |
| P2 + P3 popupList | **87.8%** (108/123) | +4.1%p |
| P1+P2 전체 보완 (AIF-ANLS-018 기준) | **95.1%** (117/123) | +11.4%p |

---

## 5. 부록: 소스코드 맥락

### PartiesController 전체 엔드포인트 (18건)

| # | Path | Method | 인증 | 설계서 |
|---|------|--------|:----:|:------:|
| 1 | `/` | `partiesUnlock` | ✅ | ✅ |
| 2 | `/withdrawal` | `withdrawal` | ✅ | ✅ |
| 3 | **`/companySearchCategoryList`** | **`companySearchCategoryList`** | ✅ | ❌ P2 |
| 4 | `/companyLocgovList` | `companyLocgovList` | — | ✅ |
| 5 | `/companyMrktList` | `companyMrktList` | — | ✅ |
| 6 | `/companyLocation` | `companyLocation` | ✅ | ✅ |
| 7 | **`/companyLocationByGroup`** | **`companyLocationByGroup`** | — | ❌ P2 |
| 8 | `/companyCategory` | `companyCategoryList` | — | ✅ |
| 9 | `/companyIncnvTyList` | `companyIncnvTyList` | — | ✅ |
| 10 | `/companyVocReg` | `companyVocReg` | ✅ | ✅ |
| 11 | `/updateSecurityUserPw` | `updateSecurityUserPw` | ✅ | ✅ |
| 12 | `/userInfo` | `getUserInfo` | ✅ | ✅ |
| 13 | `/userClauseAgree` | `userClauseAgree` | ✅ | ✅ |
| 14 | `/userClauseCheck` | `userClauseCheck` | ✅ | ✅ |
| 15 | `/eventParticipate` | `eventParticipate` | ✅ | ✅ |
| 16 | `/dormancyChange` | `dormancyChange` | — | ✅ |
| 17 | `/partiesCheck` | `giftPolicyCheck` | ✅ | ✅ |
| 18 | `/dormancyCheckYn` | `dormancyCheckYn` | — | ✅ |

### LedgerController 전체 엔드포인트 (14건)

| # | Path | Method | 인증 | 설계서 |
|---|------|--------|:----:|:------:|
| 1 | `/chargeList` | `chargeList` | ✅ | ✅ |
| 2 | `/chargeListV2` | `chargeListV2` | ✅ | ✅ |
| 3 | `/chargeRefund` | `refund` | ✅ | ✅ |
| 4 | **`/refundDetail`** | **`refundDetail`** | ✅ | ❌ P2 |
| 5 | `/chargeDetail` | `chargeDetail` | ✅ | ✅ |
| 6 | `/chargeLimit` | `chargeLimit` | ✅ | ✅ |
| 7 | `/charge` | `charge` | ✅ | ✅ |
| 8 | `/refundList` | `refundList` | ✅ | ✅ |
| 9 | `/refundBalance` | `refundBalance` | ✅ | ✅ |
| 10 | `/autoChargeRegister` | `autoChargeRegister` | ✅ | ✅ |
| 11 | `/autoChargeDetail` | `autoChargeDetail` | ✅ | ✅ |
| 12 | **`/autoChargeCodeList`** | **`autoChargeCodeList`** | ✅ | ❌ P2 |
| 13 | `/autoChargeUpdate` | `autoChargeUpdate` | ✅ | ✅ |
| 14 | `/autoChargeUnregister` | `autoChargeUnregister` | ✅ | ✅ |

### FrontController 전체 엔드포인트 (14건)

| # | Path | Method | 인증 | 설계서 |
|---|------|--------|:----:|:------:|
| 1 | `/mainInfo` | `mainInfo` | ✅ | ✅ |
| 2 | `/faqList` | `faqList` | ✅ | ✅ |
| 3 | `/inquiryTypeList` | `inquiryTypeList` | ✅ | ✅ |
| 4 | `/alarmTypeList` | `alarmTypeList` | ✅ | ✅ |
| 5 | `/alarmList` | `alarmList` | ✅ | ✅ |
| 6 | `/noticeList` | `noticeList` | ✅ | ✅ |
| 7 | `/noticeDetail` | `noticeDetail` | — | ✅ |
| 8 | `/qnaReg` | `qnaReg` | ✅ | ✅ |
| 9 | `/qnaDel` | `qnaDel` | ✅ | ✅ |
| 10 | `/qnaMod` | `qnaDelete` | ✅ | ✅ |
| 11 | `/qnaList` | `selectQnaList` | ✅ | ✅ |
| 12 | **`/popupList`** | **`selectPopupList`** | ✅ | ❌ P3 |
| 13 | `/eventList` | `selectEventlist` | ✅ | ✅ |
| 14 | `/eventDetail` | `selectEvent` | ✅ | ✅ |
