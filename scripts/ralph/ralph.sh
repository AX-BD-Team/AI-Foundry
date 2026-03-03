#!/bin/bash
# ============================================================
# Ralph Loop — AI Foundry (Turborepo + Bun + TypeScript)
# 사용법: ./scripts/ralph/ralph.sh [mode] [max_iterations]
#   mode: feature | test | refactor (default: feature)
#   max_iterations: 기본값 20
#
# 예시:
#   ./scripts/ralph/ralph.sh feature 15   # 기능 구현 루프
#   ./scripts/ralph/ralph.sh test 10      # 테스트 커버리지 루프
#   ./scripts/ralph/ralph.sh refactor 8   # 리팩토링 루프
# ============================================================

MODE=${1:-feature}
MAX_ITER=${2:-20}
ITER=0
RALPH_DIR="scripts/ralph"
PRD_FILE="PRD.md"
PROGRESS_FILE="${RALPH_DIR}/progress.md"
CLAUDE_FILE="${RALPH_DIR}/CLAUDE_${MODE}.md"

# 컬러 출력
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}"
echo "╔══════════════════════════════════════════════════╗"
echo "║         🏭 AI Foundry — Ralph Loop               ║"
echo "║         Mode: ${MODE} / Max: ${MAX_ITER} iterations           ║"
echo "╚══════════════════════════════════════════════════╝"
echo -e "${NC}"

# 사전 체크
if [ ! -f "$PRD_FILE" ]; then
  echo -e "${RED}❌ PRD.md 파일이 없습니다. PRD를 먼저 작성해주세요.${NC}"
  echo "   Claude Code에서: Shift+Tab → Plan 모드 → PRD 생성 → PRD.md 저장"
  exit 1
fi

if [ ! -f "$CLAUDE_FILE" ]; then
  echo -e "${RED}❌ ${CLAUDE_FILE} 파일이 없습니다.${NC}"
  exit 1
fi

# progress.md 초기화 (없을 경우)
if [ ! -f "$PROGRESS_FILE" ]; then
  echo "# AI Foundry Ralph Loop Progress" > "$PROGRESS_FILE"
  echo "시작: $(date '+%Y-%m-%d %H:%M')" >> "$PROGRESS_FILE"
  echo "" >> "$PROGRESS_FILE"
fi

# ---- 메인 루프 ----
while [ $ITER -lt $MAX_ITER ]; do
  ITER=$((ITER + 1))
  echo ""
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${YELLOW}🔄 이터레이션 ${ITER} / ${MAX_ITER}  [$(date '+%H:%M:%S')]${NC}"
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

  # 현재 미완료 태스크 미리보기
  NEXT_TASK=$(grep -m1 "^\- \[ \]" "$PRD_FILE" 2>/dev/null || echo "")
  if [ -z "$NEXT_TASK" ]; then
    echo -e "${GREEN}✅ PRD의 모든 태스크가 완료되었습니다!${NC}"
    break
  fi
  echo -e "${CYAN}📋 다음 태스크: ${NEXT_TASK}${NC}"
  echo ""

  # Claude Code 실행
  claude -p "$(cat ${CLAUDE_FILE})" --allowedTools "Edit,Bash,Read,Write,Glob,Grep"

  EXIT_CODE=$?
  if [ $EXIT_CODE -ne 0 ]; then
    echo -e "${RED}⚠️  Claude Code 실행 실패 (exit: ${EXIT_CODE}). 재시도...${NC}"
    sleep 5
    continue
  fi

  # 품질 체크 (Turborepo)
  echo -e "${YELLOW}🔍 품질 체크 실행 중...${NC}"

  bun run typecheck 2>&1 | tail -5
  TC_EXIT=${PIPESTATUS[0]}

  bun run lint 2>&1 | tail -5
  LINT_EXIT=${PIPESTATUS[0]}

  bun test 2>&1 | tail -10
  TEST_EXIT=${PIPESTATUS[0]}

  if [ $TC_EXIT -ne 0 ] || [ $LINT_EXIT -ne 0 ] || [ $TEST_EXIT -ne 0 ]; then
    echo -e "${RED}❌ 품질 체크 실패 (typecheck:${TC_EXIT} lint:${LINT_EXIT} test:${TEST_EXIT}) — Claude가 다음 이터레이션에서 수정합니다${NC}"
  else
    echo -e "${GREEN}✅ 품질 체크 통과${NC}"
  fi

  # 종료 조건 체크
  REMAINING=$(grep -c "^\- \[ \]" "$PRD_FILE" 2>/dev/null || echo "0")
  echo -e "${CYAN}📊 남은 태스크: ${REMAINING}개${NC}"

  if [ "$REMAINING" -eq "0" ]; then
    echo -e "${GREEN}🎉 모든 태스크 완료! Ralph Loop 종료${NC}"
    break
  fi

  echo -e "${YELLOW}⏳ 3초 후 다음 이터레이션...${NC}"
  sleep 3
done

# 최종 요약
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}📋 Ralph Loop 완료 요약${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo "총 이터레이션: ${ITER}"
echo "완료 태스크:"
grep "^\- \[x\]" "$PRD_FILE" | head -20
echo ""
echo "진행 로그: ${PROGRESS_FILE}"
cat "$PROGRESS_FILE" | tail -20
