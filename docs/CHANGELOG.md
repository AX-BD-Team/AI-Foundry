# CHANGELOG

> 세션 히스토리 아카이브 (최신이 상단)

## 세션 003 — 2026-02-26

- ✅ `wrangler deploy` 3개 서비스 배포 (tmux /team 병렬 실행)
  - svc-llm-router / svc-security / svc-ingestion — 전 서비스 `/health` HTTP 200 확인
- ✅ Wrangler secrets 실값 설정
  - `ANTHROPIC_API_KEY` (svc-llm-router)
  - `CLOUDFLARE_AI_GATEWAY_URL` = `https://gateway.ai.cloudflare.com/v1/.../ai-foundry`
  - `JWT_SECRET` auto-gen (svc-security)
  - `INTERNAL_API_SECRET` printf 방식 재설정 (echo newline 이슈 해결)
- ✅ Cloudflare AI Gateway `ai-foundry` 생성 + Authentication Off
- ✅ E2E LLM 파이프라인 검증
  - `/complete`: HTTP 200, Haiku 응답 확인
  - `/stream`: SSE 스트림 전체 수신 확인 (message_start → content_block → message_stop)

**검증**
- typecheck/lint: skip (소스 변경 없음, 배포/설정 작업만 수행)

---

## 세션 002 — 2026-02-26

- ✅ Cloudflare 인프라 프로비저닝 (REST API 직접 사용)
  - D1 × 10 database_id 취득 + `wrangler.toml` 반영
  - R2 × 2 / Queue × 2 / KV × 2 ID 확인
- ✅ D1 마이그레이션 remote 적용 — 10개 DB × `0001_init.sql` (`/raw` 엔드포인트 사용)
- ✅ typecheck 13/13 통과 (4개 타입 에러 수정)
- ✅ React Router v7 future flag 경고 수정

**검증**
- typecheck: 13/13 pass (`bun run typecheck`)
- lint: skip (미구성)

---

## 세션 001 — 2026-02-26

- `AX-BD-Team/res-ai-foundry` 저장소 생성 및 초기 push
- PRD 원본 문서 반입: `docs/AI_Foundry_PRD_TDS_v0.6.docx`
- Discovery-X 기반 운영 체계 이식:
  - `.claude/settings*.json`
  - `.claude/skills/*`
  - `.claude/agents/*`
- `SPEC.md` 초기 템플릿 생성
