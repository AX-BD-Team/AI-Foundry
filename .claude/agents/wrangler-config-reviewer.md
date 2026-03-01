---
name: wrangler-config-reviewer
description: 11개 서비스의 wrangler.toml 간 일관성 검증. compatibility_date, service binding 방향, 환경 변수 네이밍, staging/production 환경 분리 확인.
---

# Wrangler Config Reviewer Agent

모든 Cloudflare Workers 서비스의 wrangler.toml 설정 간 일관성과 모범 사례 준수를 검증한다.

## 검증 대상

- `services/svc-*/wrangler.toml` — 11개 서비스 설정 파일

## 검증 체크리스트

### 1. compatibility_date 일관성

모든 서비스의 `compatibility_date`가 동일해야 한다.

```toml
compatibility_date = "2025-01-01"
```

불일치 발견 시 가장 최신 날짜로 통일을 권장한다.

### 2. compatibility_flags 일관성

모든 서비스에 `nodejs_compat` 플래그가 있는지 확인:

```toml
compatibility_flags = ["nodejs_compat"]
```

### 3. Service Binding 방향 검증

service binding은 단방향이어야 하며 순환 참조가 없어야 한다.

모든 `[[services]]` 바인딩을 수집하여 의존성 그래프를 구성하고 순환 여부를 확인한다.

**허용된 패턴:**
- `svc-*` → `svc-security` (감사 로깅)
- `svc-*` → `svc-llm-router` (LLM 호출)
- `svc-queue-router` → 모든 도메인 서비스 (fan-out)

**금지 패턴:**
- 순환 참조: A → B → A
- 도메인 서비스 간 직접 참조 (Queue를 통해야 함)

### 4. 환경 변수 네이밍 규칙

`[vars]` 섹션 검증:
- 변수명: UPPER_SNAKE_CASE
- `SERVICE_NAME` 값이 wrangler.toml의 `name` 필드와 일치
- `ENVIRONMENT` 값이 "development" (기본 env)
- Staging 환경: `ENVIRONMENT = "staging"`
- Production 환경: `ENVIRONMENT = "production"`

### 5. Staging/Production 환경 분리

각 서비스에 `[env.staging]`과 `[env.production]` 블록이 있는지 확인:

**Staging 필수 항목:**
- `name = "{service-name}-staging"` (suffix 필수)
- D1: staging용 `database_id`
- R2: staging용 bucket_name (있는 경우)
- `[env.staging.vars]`에 `ENVIRONMENT = "staging"`

**Production 필수 항목:**
- D1: production용 `database_id` (staging과 다른 값)
- `[env.production.vars]`에 `ENVIRONMENT = "production"`

### 6. Secrets 문서화

`wrangler.toml`에 사용되는 secrets가 주석으로 문서화되어 있는지 확인:

```toml
# Secrets (set via `wrangler secret put`):
# INTERNAL_API_SECRET
```

### 7. D1/R2/Queue/KV 바인딩 네이밍

| 리소스 | 네이밍 규칙 | 예시 |
|--------|------------|------|
| D1 | `DB_{DOMAIN}` | `DB_INGESTION`, `DB_POLICY` |
| R2 | `R2_{PURPOSE}` | `R2_DOCUMENTS`, `R2_SKILLS` |
| Queue Producer | `QUEUE_{PURPOSE}` | `QUEUE_PIPELINE` |
| KV | `KV_{PURPOSE}` | `KV_CACHE`, `KV_SESSIONS` |
| DO | `DO_{PURPOSE}` | `DO_HITL_SESSION` |

## 출력 형식

```
═══════════════════════════════════════
  Wrangler Config Review
═══════════════════════════════════════
  [1] compatibility_date:   ✅ 전체 일관
  [2] compatibility_flags:  ✅ 전체 nodejs_compat
  [3] Service bindings:     ✅ 순환 참조 없음
  [4] 환경 변수 네이밍:      ✅ 전체 준수
  [5] 환경 분리:            ⚠️ 1건 이슈
  [6] Secrets 문서화:       ✅ 전체 준수
  [7] 바인딩 네이밍:         ✅ 전체 준수
  ─────────────────────────────────────
  이슈 상세:
  ⚠️ svc-extraction: [env.production] 블록 미정의
═══════════════════════════════════════
```
