---
name: git-sync
description: "res-ai-foundry의 Windows/WSL 멀티 작업환경 Git 동기화. status/push/pull/stash 지원"
argument-hint: "[push|pull|status|stash]"
user-invocable: true
---

# Git Sync — res-ai-foundry (Windows ↔ WSL)

GitHub를 단일 허브로 사용해 WSL 복제본과 Windows 복제본을 동기화한다.

- WSL 기준 경로: `/home/sinclair/work/axbd/res-ai-foundry`
- Windows 기준 경로: `C:\Users\sincl\work\axbd\res-ai-foundry`
- 기본 브랜치: `main`

## 서브커맨드
- 인자 없음 / `status`: 상태 점검
- `push`: 현재 환경 변경사항 업로드
- `pull`: 다른 환경 변경사항 반영
- `stash`: stash 목록 확인

---

## 공통 선행

```bash
git branch --show-current
git status --short
git stash list
git fetch origin
git rev-list --left-right --count HEAD...origin/$(git branch --show-current)
```

해석:
- `ahead=0, behind=0` 동기화됨
- `ahead>0` push 필요
- `behind>0` pull 필요
- `ahead>0 && behind>0` 분기(diverged)

---

## status

출력 체크리스트:
- 현재 브랜치(main 권장)
- ahead/behind 카운트
- 로컬 변경 파일 수
- stash 개수
- 다음 권장 액션(push/pull/정리)

---

## push (환경 떠나기 전)

1) 변경사항 확인 (`git status --short`)
2) 변경 있으면 커밋
   - 빠른 동기화 시: `chore: WIP sync from <WSL|Windows>`
   - 정식 작업이면 의미 있는 커밋 메시지
3) push

```bash
git push origin $(git branch --show-current)
```

가드레일:
- `behind>0`이면 먼저 pull
- `diverged`이면 pull --rebase 후 push
- force push 금지

---

## pull (환경 진입 후)

1) behind 확인
2) 로컬 변경 있으면 stash 또는 WIP 커밋
3) pull --rebase

```bash
git pull --rebase origin $(git branch --show-current)
```

4) stash 복원(필요 시)

```bash
git stash pop
```

충돌 시:
- 충돌 파일 나열
- 해결 후 `git add ... && git rebase --continue`

---

## stash

```bash
git stash list
```

필요 시 `show/pop/drop` 안내.

---

## res-ai-foundry 전용 체크

- 문서 중심 단계이므로 `SPEC.md`, `docs/CHANGELOG.md`, `CLAUDE.md` 충돌 가능성이 높음
- 충돌 시 우선순위:
  1) PRD 정합성
  2) 최신 세션 기록
  3) 브랜치 히스토리 일관성

- 민감 파일(`.env`, `.dev.vars`)이 status에 보이면 즉시 커밋 제외 처리
