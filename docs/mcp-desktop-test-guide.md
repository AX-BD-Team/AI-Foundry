---
code: AIF-GUID-001
title: "Claude Desktop MCP 연동 테스트 가이드"
version: "1.0"
status: Active
category: GUID
created: 2026-03-08
updated: 2026-03-08
author: Sinclair Seo
---

# Claude Desktop MCP 연동 테스트 가이드

> **작성일**: 2026-03-04 (세션 069)
> **대상**: svc-mcp-server (Staging)
> **목적**: Claude Desktop에서 퇴직연금 Skill 정책을 MCP tool로 호출하는 E2E 검증

---

## 1. 사전 확인

### Config 파일 위치 (Windows Store 앱)

```
C:\Users\sincl\AppData\Local\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\claude_desktop_config.json
```

### 등록된 MCP 서버 (3개)

| MCP 서버 이름 | Skill ID | 정책 코드 | 설명 |
|---|---|---|---|
| `pension-withdrawal-reason` | `c1d28aa2-e62e-462a-8eed-0c7a3bd26830` | `pol-pension-ex-028` | 부적격 인출사유에 의한 신청 거절 |
| `pension-withdrawal-limit` | `d55624fd-a736-45e0-8a30-874518ad96c3` | `pol-pension-wd-003` | 중도인출 사유별 인출 한도 차등 적용 |
| `pension-housing-purchase` | `9e7c7e36-a072-4175-9981-d790569fedd8` | `pol-pension-wd-002` | 주택구입 목적 중도인출 허용 |

### Config 내용 확인

```json
{
  "preferences": { ... },
  "mcpServers": {
    "pension-withdrawal-reason": {
      "url": "https://svc-mcp-server-staging.ktds-axbd.workers.dev/mcp/c1d28aa2-e62e-462a-8eed-0c7a3bd26830",
      "headers": { "Authorization": "Bearer e2e-test-secret-2026" }
    },
    "pension-withdrawal-limit": {
      "url": "https://svc-mcp-server-staging.ktds-axbd.workers.dev/mcp/d55624fd-a736-45e0-8a30-874518ad96c3",
      "headers": { "Authorization": "Bearer e2e-test-secret-2026" }
    },
    "pension-housing-purchase": {
      "url": "https://svc-mcp-server-staging.ktds-axbd.workers.dev/mcp/9e7c7e36-a072-4175-9981-d790569fedd8",
      "headers": { "Authorization": "Bearer e2e-test-secret-2026" }
    }
  }
}
```

---

## 2. Claude Desktop 시작 확인

### Step 1: Claude Desktop 실행
- 컴퓨터 재시작 후 Claude Desktop 열기

### Step 2: MCP 서버 연결 확인
- 대화 입력창 하단 또는 설정(⚙️) → **MCP 서버** 섹션 확인
- 3개 서버가 모두 **초록색(Connected)** 상태인지 확인
- 빨간색(Error)이면 → **섹션 5. 트러블슈팅** 참조

### Step 3: Tool 목록 확인
- 새 대화에서 도구 아이콘(🔧) 클릭
- 다음 3개 tool이 보여야 함:
  - `pol-pension-ex-028` — 부적격 인출사유에 의한 신청 거절
  - `pol-pension-wd-003` — 중도인출 사유별 인출 한도 차등 적용
  - `pol-pension-wd-002` — 주택구입 목적 중도인출 허용

---

## 3. 테스트 시나리오

### 시나리오 A: 주택구입 중도인출 자격 (pension-housing-purchase)

**프롬프트:**
```
퇴직연금 가입자가 주택 구입을 위해 중도인출을 신청했습니다.

- 나이: 만 35세
- 가입기간: 5년
- 세대주 여부: 세대주
- 무주택 여부: 무주택 세대주 (무주택 확인서 보유)
- 구매 예정 주택: 서울시 마포구 아파트, 매매가 4억원

이 가입자가 주택구입 목적 중도인출 자격이 되는지 평가해주세요.
```

**예상 동작:**
1. Claude가 `pol-pension-wd-002` tool 호출을 제안
2. `context`에 위 상황 설명이 전달됨
3. svc-skill → svc-llm-router → LLM 호출 → 정책 평가 결과 반환

**예상 응답 포함 내용:**
- 정책: `POL-PENSION-WD-002`
- 판정: 허용/거절 (근거 포함)
- 신뢰도: 0~1 사이 값
- 모델: provider / model 정보
- 근거: 법정 중도인출 사유 해당 여부 설명

---

### 시나리오 B: 부적격 인출사유 거절 (pension-withdrawal-reason)

**프롬프트:**
```
퇴직연금 가입자가 해외여행 자금 마련을 위해 중도인출을 신청했습니다.

- 나이: 만 28세
- 가입기간: 2년
- 인출사유: 해외여행 경비
- 요청 금액: 500만원

이 인출 신청이 법정 중도인출 사유에 해당하는지 평가해주세요.
```

**예상 동작:**
1. Claude가 `pol-pension-ex-028` tool 호출
2. "해외여행"은 법정 중도인출 사유에 해당하지 않으므로 거절 판정 예상

---

### 시나리오 C: 인출한도 산정 (pension-withdrawal-limit)

**프롬프트:**
```
퇴직연금 가입자가 전세보증금 목적으로 중도인출을 요청합니다.

- 적립금 총액: 5,000만원
- 인출 사유: 무주택자의 주거 목적 전세보증금
- 요청 인출 금액: 3,000만원
- 가입기간: 7년

이 가입자의 중도인출 가능 한도를 평가해주세요.
```

**예상 동작:**
1. Claude가 `pol-pension-wd-003` tool 호출
2. 사유별 인출 한도 차등 적용 정책에 따라 한도 산정

---

### 시나리오 D: 복합 질의 (다중 tool 호출)

**프롬프트:**
```
퇴직연금 가입자가 주택 구입 목적으로 중도인출을 신청했습니다.

- 나이: 만 40세, 가입기간: 10년, 적립금: 8,000만원
- 세대주, 무주택 확인서 보유
- 구매 주택: 경기도 성남시 아파트 5억원
- 요청 인출: 4,000만원

1) 주택구입 중도인출 자격이 되는지,
2) 인출 가능 한도는 얼마인지
모두 평가해주세요.
```

**예상 동작:**
1. Claude가 `pol-pension-wd-002` (자격) + `pol-pension-wd-003` (한도) 두 tool을 순차 호출
2. 두 정책 평가 결과를 종합하여 답변

---

## 4. 검증 체크리스트

| # | 항목 | 확인 |
|---|---|---|
| 1 | Claude Desktop에서 MCP 서버 3개 연결 상태 초록색 | ☐ |
| 2 | Tool 목록에 3개 정책 도구 표시 | ☐ |
| 3 | 시나리오 A: tool 호출 제안 → 승인 → 결과 반환 | ☐ |
| 4 | 시나리오 B: 부적격 사유 거절 판정 | ☐ |
| 5 | 시나리오 C: 인출한도 산정 결과 | ☐ |
| 6 | 시나리오 D: 복수 tool 호출 성공 | ☐ |
| 7 | 응답에 정책코드/판정/신뢰도/근거 포함 | ☐ |
| 8 | 응답 시간 합리적 (30초 이내) | ☐ |
| 9 | 에러 없이 정상 완료 | ☐ |

---

## 5. 트러블슈팅

### MCP 서버가 빨간색 (연결 실패)

**원인 1: `url` 형식 미지원 (Claude Desktop 구버전)**
- Claude Desktop 버전 확인 (설정 → 정보)
- Remote MCP (`url` key) 지원은 비교적 최신 기능
- 해결: Claude Desktop 업데이트

**원인 2: 네트워크 문제**
- WSL 터미널에서 직접 확인:
```bash
curl -s https://svc-mcp-server-staging.ktds-axbd.workers.dev/health
# 예상: {"status":"ok","service":"svc-mcp-server"}
```

**원인 3: 인증 실패**
- Config의 `Authorization` 헤더 값 확인
- Bearer 토큰이 `e2e-test-secret-2026`인지 확인

### Tool 호출 시 에러

**"Skill not found" 에러:**
- Skill ID가 유효한지 확인 (staging 환경의 skill이 삭제되었을 수 있음)
- 확인 명령:
```bash
curl -s -H "X-Internal-Secret: e2e-test-secret-2026" \
  "https://svc-skill-staging.ktds-axbd.workers.dev/skills/c1d28aa2-e62e-462a-8eed-0c7a3bd26830" | jq '.success'
```

**"평가 실패" 또는 타임아웃:**
- LLM 호출이 포함되므로 첫 호출은 느릴 수 있음 (cold start)
- Staging 환경은 Sonnet 사용 → 비용 발생 주의
- OpenAI fallback 동작 가능 (Google quota 소진 시)

### Config 수정 후 반영 안 됨
- Claude Desktop **완전 종료** 후 재시작 필요 (창 닫기 ≠ 종료)
- Windows: 시스템 트레이에서 Claude 아이콘 우클릭 → **Quit**
- 그래도 안 되면: 작업 관리자에서 Claude 프로세스 전부 종료

---

## 6. curl 사전 검증 (WSL에서 실행)

Claude Desktop 테스트 전에 curl로 전체 플로우를 검증할 수 있습니다.

### 6-1. Health Check

```bash
curl -s https://svc-mcp-server-staging.ktds-axbd.workers.dev/health | jq .
```

### 6-2. Initialize

```bash
SKILL_ID="c1d28aa2-e62e-462a-8eed-0c7a3bd26830"
curl -s -X POST \
  -H "Authorization: Bearer e2e-test-secret-2026" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  "https://svc-mcp-server-staging.ktds-axbd.workers.dev/mcp/$SKILL_ID" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-03-26",
      "capabilities": {},
      "clientInfo": {"name": "curl-test", "version": "1.0.0"}
    }
  }' | jq .
```

### 6-3. Tools List

```bash
curl -s -X POST \
  -H "Authorization: Bearer e2e-test-secret-2026" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  "https://svc-mcp-server-staging.ktds-axbd.workers.dev/mcp/$SKILL_ID" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' | jq .
```

### 6-4. Tools Call (실제 정책 평가)

```bash
curl -s -X POST \
  -H "Authorization: Bearer e2e-test-secret-2026" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  "https://svc-mcp-server-staging.ktds-axbd.workers.dev/mcp/$SKILL_ID" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "pol-pension-ex-028",
      "arguments": {
        "context": "퇴직연금 가입자(만 28세, 가입기간 2년)가 해외여행 경비 목적으로 500만원 중도인출을 신청했습니다."
      }
    }
  }' | jq .
```

> **참고**: tools/call은 LLM 호출이 포함되어 10~30초 소요될 수 있습니다.

---

## 7. curl 사전 검증 결과 (2026-03-04)

아래는 curl로 검증한 실제 응답입니다. Claude Desktop에서도 동일한 결과가 나와야 합니다.

### pol-pension-ex-028 (부적격 인출사유 → 거절)

- **입력**: "만 28세, 가입기간 2년, 해외여행 경비 목적 500만원 중도인출 신청"
- **판정**: `APPLICABLE` — 인출사유가 법정 사유에 해당하지 않아 거절
- **신뢰도**: 0.95
- **모델**: openai / gpt-4o-mini
- **응답시간**: 8,616ms
- **근거**: 해외여행은 주택구입/전세자금/6개월요양/파산/개인회생 어디에도 해당 안 함

### pol-pension-wd-002 (주택구입 자격 → 허용)

- **입력**: "만 35세, 가입기간 5년, 세대주, 무주택, 마포 아파트 4억원"
- **판정**: `APPLICABLE` — 조건 충족, 적립금 100% 범위 내 인출 가능
- **신뢰도**: 0.9
- **모델**: openai / gpt-4o-mini
- **응답시간**: 10,457ms
- **근거**: 세대주+무주택+본인명의 주택구입 목적 → 정책 적용. 매매계약서/등기부등본 제출 필요 안내

---

## 8. 테스트 결과 기록

### 테스트 일시: 2026-03-08 (세션 126)
### 테스트 환경: Claude Desktop v1.1.5368.0 (Windows) → mcp-remote 0.1.37 → svc-mcp-server (Staging)

| 시나리오 | 결과 | 비고 |
|---|---|---|
| A: 주택구입 자격 | ✅ PASS | NOT_APPLICABLE (서류 미제출), 신뢰도 90%, gpt-4.1-mini |
| B: 부적격 사유 | ✅ PASS | APPLICABLE (거절), 신뢰도 100%, 해외여행 → 법정 사유 아님 |
| C: 인출한도 | ✅ PASS | APPLICABLE, 신뢰도 100%, 5,000만원의 50% = 2,500만원 한도 |
| D: 복합 질의 | ✅ PASS | 2개 tool 순차 호출 성공, 자격 충족 + 4,000만원 전액 승인 |

### 발견된 이슈:
- Claude Desktop `url` 키 미지원 → `npx mcp-remote` stdio 브릿지 필요
- Windows에 Node.js 별도 설치 필요 (WSL Node.js와 별개)
- 첫 tool 호출 시 도구명 오류 후 자동 재시도로 성공 (deferred tool search 경유)

### 설정 참고 (claude_desktop_config.json):
- `"command": "npx"` + `"args": ["-y", "mcp-remote", "<URL>", "--header", "Authorization: Bearer <TOKEN>"]`
- Windows Node.js LTS 설치 필수 (`winget install OpenJS.NodeJS.LTS`)
