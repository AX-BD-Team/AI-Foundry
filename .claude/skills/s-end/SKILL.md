---
name: s-end
description: res-ai-foundry 세션 종료. 변경사항 커밋 + SPEC/CHANGELOG 동기화 + 다음 작업 명확화.
argument-hint: "[추가 메모]"
user-invocable: true
---

# Session End — res-ai-foundry 정리 루틴

## 목표
1. 코드/문서 변경을 안전하게 커밋
2. SPEC 상태값 갱신
3. CHANGELOG에 세션 기록 남김
4. 다음 세션이 바로 이어질 수 있게 컨텍스트 고정

## 사전 확인

```bash
!`git log --oneline -5`
!`git status --short`
!`git diff --stat`
```

## 실행 단계

### Phase 1) 변경사항 커밋
- 논리 단위로 커밋 (feat/fix/docs/chore/refactor)
- 민감정보(.env, .dev.vars, key 파일) 커밋 금지

검증은 프로젝트 단계에 맞춰 분기:
- `package.json` 존재 시: `pnpm typecheck && pnpm lint` 실행
- 아직 미구성 시: 검증 스킵 사유를 CHANGELOG에 기록

### Phase 2) SPEC.md 갱신
최소 갱신 항목:
- §5 Current Status (진척도/상태 수치)
- §6 Execution Plan 체크박스
- 필요 시 §8 Decision Log

### Phase 3) CHANGELOG prepend
`docs/CHANGELOG.md` 상단에 이번 세션 추가:

```markdown
## 세션 NNN — YYYY-MM-DD
- ✅ 작업 1
- ✅ 작업 2

**검증**
- typecheck/lint: pass | skip(사유)
```

### Phase 4) 문서 커밋

```bash
git add SPEC.md docs/CHANGELOG.md
git commit -m "docs: update SPEC/CHANGELOG — 세션 NNN"
```

### Phase 5) 마무리 요약
아래를 출력:
- 커밋 목록(해시 + 메시지)
- SPEC 변경 포인트
- 다음 작업 1~3개
- 필요 시 `/git-sync push` 권장

## 출력 템플릿

```markdown
## 세션 종료 완료

### 커밋
- `abc1234` feat: ...
- `def5678` docs: update SPEC/CHANGELOG — 세션 NNN

### 문서 업데이트
- SPEC: [요약]
- CHANGELOG: 세션 NNN 추가

### 다음 작업
1) ...
2) ...
3) ...
```
