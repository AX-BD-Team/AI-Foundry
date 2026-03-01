---
name: secrets-check
user-invocable: true
description: 모든 서비스의 wrangler.toml에 선언된 secrets 상태를 환경별로 검증. --env staging/production 으로 특정 환경만 확인 가능.
---

# Secrets Check — 서비스 시크릿 상태 검증

모든 서비스의 wrangler.toml과 env.ts에서 필요한 secrets를 수집하고,
실제 설정 상태를 환경별로 검증한다.

## Arguments

- `$ARGUMENTS` 없음: 전체 환경 요약
- `--env staging`: staging 환경만 확인
- `--env production`: production 환경만 확인

## 알려진 시크릿 목록

| Secret | 사용 서비스 |
|--------|------------|
| `INTERNAL_API_SECRET` | 모든 서비스 (공통) |
| `ANTHROPIC_API_KEY` | svc-llm-router |
| `NEO4J_URI` | svc-ontology |
| `NEO4J_USER` | svc-ontology |
| `NEO4J_PASSWORD` | svc-ontology |
| `UNSTRUCTURED_API_KEY` | svc-ingestion |
| `CF_AI_GATEWAY_TOKEN` | svc-llm-router |

## Steps

### 1. 시크릿 선언 수집

각 `services/svc-*/wrangler.toml`에서:
- `# Secrets` 주석 아래 나열된 시크릿 이름 수집
- `[vars]` 섹션에 시크릿이 하드코딩되어 있지 않은지 확인

각 `services/svc-*/src/env.ts`에서:
- `Env` 인터페이스의 필드 중 위 알려진 시크릿에 해당하는 것 식별

### 2. 환경별 상태 확인

각 서비스 디렉토리에서 `wrangler secret list`를 실행:

```bash
# Development (기본)
cd services/svc-{name} && wrangler secret list 2>&1

# Staging
cd services/svc-{name} && wrangler secret list --env staging 2>&1

# Production
cd services/svc-{name} && wrangler secret list --env production 2>&1
```

`$ARGUMENTS`에 `--env`가 지정되면 해당 환경만 확인한다.

### 3. 결과 리포트

서비스별로 아래 형식으로 출력:

```
═══════════════════════════════════════
  Secrets Status Report
═══════════════════════════════════════
```

| Service | Secret | Dev | Staging | Prod |
|---------|--------|-----|---------|------|
| svc-ingestion | INTERNAL_API_SECRET | ✅ | ✅ | ✅ |
| svc-llm-router | ANTHROPIC_API_KEY | ✅ | ⚠️ | ❌ |

범례:
- ✅ = 설정됨
- ⚠️ = 설정되었으나 placeholder 의심 (Known Blockers 참조)
- ❌ = 미설정

### 4. 권장 조치

미설정 시크릿에 대해 설정 명령 제안:

```bash
# 기본 환경
printf 'actual-value' | wrangler secret put SECRET_NAME

# Staging
printf 'actual-value' | wrangler secret put SECRET_NAME --env staging

# Production
printf 'actual-value' | wrangler secret put SECRET_NAME --env production
```

### 5. Known Blockers 참조

MEMORY.md의 Known Blockers 섹션과 대조하여,
이미 알려진 미설정 항목은 별도 표시한다.
