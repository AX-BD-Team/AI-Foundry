# Ralph PRD: retirement-pension-batch-analysis

> 퇴직연금 프로젝트 773건 문서 일괄 분석
> Plan: docs/01-plan/features/retirement-pension-batch-analysis.plan.md

## Context
- Organization: `Miraeasset`
- Environment: Production
- Source: `docs/retirement-pension-source/퇴직연금 프로젝트/`
- Stage 1: 773건 전량, Stage 2: Tier 1+2 (38건)

## Tasks

- [x] R-1: batch-upload 스크립트 작성 — `scripts/batch-upload.sh` curl 기반 일괄 업로드 (디렉토리 순회, 진행률 표시, 실패 재시도 3회, 100ms 간격, MIME type 자동 감지, 결과 로그)
- [x] R-2: batch-status 스크립트 작성 — `scripts/batch-status.sh` 업로드 상태 조회 + 집계 (GET /documents API, parsed/pending/failed 카운트, 분류별 분포)
- [x] R-3: 내부 DOCX 파서 개발 — `services/svc-ingestion/src/parsing/docx.ts` mammoth.js 기반 docx→구조화 텍스트 변환. queue.ts 라우팅에 docx/doc→내부 파서 분기 추가. Unstructured.io는 fallback 유지. 기존 UnstructuredElement[] 형태 호환
- [x] R-4: ERwin 바이너리→텍스트 변환 — `scripts/erwin-extract.sh` ERwin 바이너리에서 테이블 코드 추출 (strings + 패턴 필터), 테이블 코드 체계별 그룹핑 (TB_RPOM, TB_RPCM 등), Markdown 변환 후 txt 저장
- [x] R-5: 내부 DOCX 파서 테스트 — 개발가이드 docx 7건으로 파서 단위 테스트 작성, 핵심 검증: 테이블 보존, 헤딩 구조, 텍스트 추출 완전성
- [x] R-6: Tier 1 문서 업로드 (17건) — Production `Miraeasset` 업로드 완료. parsed 10, failed 7 (SCDSA002 4건 + timeout 3건)
- [x] R-7: Tier 2 목록류 업로드 (22건) — 화면목록 8 + 배치JOB목록 7 + 메뉴구조도 1 + Gap분석서(법인) 6. 전량 parsed
- [x] R-8: Tier 3 화면설계서 업로드 (456건) — 441+15 전량 업로드 완료 (csv comma 이슈 수동 해결). 일부 중복 존재
- [ ] R-9: Tier 4 프로그램/배치설계서 업로드 (153건) — 프로그램설계서 136건 + 배치설계서 17건
- [ ] R-10: Tier 5 단위테스트 업로드 (129건) — 단위테스트케이스 129건 (보조 자료)
- [ ] R-11: 파싱 품질 리포트 생성 — 전체 773건 파싱 결과 집계 (문서별 chunk 수, classification 분포, 실패 건수), 화면설계서 샘플 10건 품질 검증, Stage 2 투입 추천 리포트
