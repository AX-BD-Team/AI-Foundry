---
code: FX-RESEARCH-014
title: 외부 레포 분석 — open-swe & ClawTeam Foundry-X 적용 검토
version: 1.0
status: Active
category: RESEARCH
created: 2026-03-18
author: Sinclair Seo
---

# FX-RESEARCH-014: 외부 레포 분석 보고서

## 분석 대상

| 레포 | 설명 | Stars |
|------|------|-------|
| `langchain-ai/open-swe` | An Open-Source Asynchronous Coding Agent (LangGraph 기반) | ~5.3k |
| `HKUDS/ClawTeam` | Agent Swarm Intelligence — One Command → Full Automation | 신규 |

---

## 1. open-swe 핵심 패턴

### 1.1 아키텍처 개요

```
GitHub Issue/Label
       │
       ▼
  Manager Agent          ← 진입점, 상태/라우팅 오케스트레이션
       │
       ▼
  Planner Agent          ← 코드베이스 리서치 + 실행 계획 수립
       │  └─ 인간이 계획 수락/수정/거절 (Human-in-the-loop)
       ▼
  Programmer Agent       ← 코드 작성, 테스트 실행, 도구 사용
       │
       ▼
  Reviewer Agent         ← 결과 검증, 오류 수정 후 PR 오픈
       │
       ▼
  open_pr_if_needed      ← 안전망 미들웨어 (PR 미오픈 시 자동 처리)
```

### 1.2 핵심 설계 결정

1. **격리 우선 (Isolate First)**: 모든 태스크가 독립된 클라우드 샌드박스(Modal/Daytona/Runloop)에서 실행됨. 프로덕션 접근 없음, 확인 프롬프트 없음.
2. **Double Texting**: 에이전트 실행 중 사람이 메시지를 보내면 현재 세션에 통합됨. 대부분의 코딩 에이전트에 없는 기능.
3. **Planner 단계**: 바로 코드로 뛰어들지 않고 먼저 코드베이스를 리서치 → 상세 실행 계획 수립 → 인간 승인 후 실행. "많은 에이전트가 바로 코드로 뛰어들어 CI를 망가뜨린다"는 문제를 이 단계로 해결.
4. **미들웨어 안전망**: `open_pr_if_needed`는 LLM 동작에 의존하지 않고 결정론적으로 PR 오픈을 보장.
5. **GitHub 네이티브 통합**: 태스크마다 GitHub Issue가 자동 생성되고, 완료 시 PR이 Issue를 close함. 개발자가 새 도구를 배울 필요 없음.

### 1.3 Foundry-X와의 비교

| 기능 | open-swe | Foundry-X v1.1 |
|------|----------|----------------|
| Planner 단계 | ✅ 코드베이스 사전 리서치 | ❌ 없음 |
| 인간 계획 승인 | ✅ Accept/Edit/Reject | ⚠️ PR review gate만 있음 |
| PR 자동 생성 | ✅ (F65와 동일) | ✅ PrPipelineService |
| 실행 중 피드백 | ✅ Double texting | ❌ 없음 |
| 에이전트 격리 | ✅ 클라우드 샌드박스 | ⚠️ 브랜치 기반만 |
| SDD 검증 | ❌ 없음 | ✅ 7-gate (SDD≥80) |
| 하네스 무결성 | ❌ 없음 | ✅ CONSTITUTION.md |

---

## 2. ClawTeam 핵심 패턴

### 2.1 아키텍처 개요

```
Human: "목표 입력"
       │
       ▼
  Leader Agent (Claude Code)
  ├── clawteam spawn --agent-name worker1 --task "..."
  ├── clawteam spawn --agent-name worker2 --task "..."
  └── clawteam spawn --agent-name worker3 --task "..."
       │
       ▼  각 Worker 자동 할당:
  ┌────────────────────────────┐
  │  git worktree (격리된 코드) │
  │  tmux window (독립 터미널)  │
  │  identity (고유 아이덴티티) │
  └────────────────────────────┘
       │
       ▼  Worker 통신 CLI:
  ├── clawteam task list   (작업 확인)
  ├── clawteam task update (완료 보고)
  ├── clawteam inbox send  (리더에게 보고)
  └── clawteam inbox receive (지시 수신)
       │
       ▼
  ~/.clawteam/
  ├── teams/      (팀 정의)
  ├── tasks/      (태스크 상태)
  ├── inboxes/    (에이전트 간 메시지)
  └── workspaces/ (격리된 코드)
```

### 2.2 핵심 설계 결정

1. **CLI 커맨드 인젝션**: 에이전트 프롬프트에 CLI 커맨드가 자동 주입됨. 에이전트가 파일시스템 기반 통신을 자연스럽게 사용하게 됨.
2. **파일시스템이 SSOT**: DB/Redis 없이 `~/.clawteam/` 파일만으로 멀티에이전트 상태 관리. Git이 진실인 Foundry-X 철학과 동일.
3. **git worktree 격리**: 각 Worker가 독립된 git worktree를 가짐 → 동시 실행 시 파일 충돌 없음.
4. **모든 CLI 에이전트 호환**: Claude Code, Codex, OpenClaw 등 어떤 CLI 에이전트도 Worker로 사용 가능.
5. **Leader의 주기적 결과 수집**: 30분마다 board를 체크하고 성과 좋은 방향으로 리소스 재분배 (karpathy autoresearch 패턴).

### 2.3 Foundry-X와의 비교

| 기능 | ClawTeam | Foundry-X v1.1 |
|------|----------|----------------|
| 에이전트 간 통신 | ✅ inbox send/receive | ❌ 없음 (SSE는 대시보드→인간만) |
| git worktree 격리 | ✅ 자동 할당 | ⚠️ 브랜치만 (worktree 없음) |
| Leader/Worker 패턴 | ✅ 명시적 CLI | ⚠️ Agent Teams는 Claude Code 내부만 |
| 상태 저장 | 파일시스템 | D1 (더 강력) |
| 모니터링 UI | tmux board + Web UI | ✅ 대시보드 (더 강력) |
| 모든 에이전트 호환 | ✅ CLI 표준 | ❌ Claude API만 |
| SDD 검증 | ❌ 없음 | ✅ 7-gate |

---

## 3. Foundry-X 현재 강점 (유지 포인트)

두 레포 모두 **코드 작성 자동화**에 집중하며, 아래 Foundry-X 고유 개념이 없음:

| Foundry-X 고유 강점 | 설명 |
|---------------------|------|
| **SDD Triangle** | Spec↔Code↔Test 삼각 동기화. 7-gate auto-merge의 SDD≥80 강제 |
| **하네스 무결성** | CONSTITUTION.md Always/Ask/Never 경계 구조 |
| **NL→Spec 변환** | 자연어 → 명세 자동 생성 + 충돌 감지 |
| **KT DS 특화** | SM 변경 요청(SR) 처리 컨텍스트 |
| **Generative UI** | 에이전트 결과의 인터랙티브 렌더링 |
| **MCP 양방향** | Sampling + Prompts 통합 완료 |

---

## 4. 갭 분석 — 추가 필요 요소

### GAP-1: Planner 에이전트 (open-swe)

**현재 상태**: `PrPipelineService`가 `branch → commit → PR → review → merge` 흐름을 처리하지만, **실행 전 코드베이스 리서치 + 계획 수립 단계가 없음**.

**문제**: 에이전트가 태스크 맥락 없이 바로 코드 작성 → 오류 가능성 증가, 리뷰 사이클 증가.

**제안**: `PlannerAgent` 서비스 추가
```typescript
// packages/api/src/services/planner-agent.ts
interface ExecutionPlan {
  taskId: string;
  codebaseAnalysis: string;    // 코드베이스 리서치 결과
  proposedSteps: PlanStep[];   // 구체적 실행 단계
  estimatedFiles: string[];    // 변경 예상 파일 목록
  risks: string[];             // 위험 요소
  status: 'pending_approval' | 'approved' | 'rejected';
}
```

**구현 범위**:
- `PlannerAgent` 서비스 (코드베이스 분석 + Claude API 계획 수립)
- `AgentPlanCard.tsx` (계획 표시 + 수락/수정/거절 UI)
- `POST /agents/plan` 엔드포인트
- `D1 agent_plans` 테이블
- `PrPipelineService` 앞에 Plan 단계 연결

### GAP-2: 에이전트 간 inbox 통신 (ClawTeam)

**현재 상태**: 에이전트들이 각자 SSE로 대시보드(→인간)에만 이벤트를 보냄. **에이전트 → 에이전트 비동기 통신 없음**.

**문제**: Leader 에이전트가 Worker 에이전트에게 태스크를 위임하거나 결과를 수집하는 메커니즘이 없음.

**제안**: D1 기반 agent_messages 테이블 + API
```sql
-- 0008_agent_messages.sql
CREATE TABLE agent_messages (
  id          TEXT PRIMARY KEY,
  team_id     TEXT NOT NULL,
  from_agent  TEXT NOT NULL,
  to_agent    TEXT NOT NULL,
  type        TEXT NOT NULL,  -- 'task_assign' | 'task_result' | 'query' | 'ack'
  payload     TEXT NOT NULL,  -- JSON
  status      TEXT DEFAULT 'unread',  -- 'unread' | 'read' | 'processed'
  created_at  INTEGER NOT NULL,
  read_at     INTEGER
);
```

**API 엔드포인트**:
```
POST /agents/inbox/send    -- 메시지 발송
GET  /agents/inbox/receive -- 미읽은 메시지 폴링
POST /agents/inbox/:id/ack -- 수신 확인
```

**SSE 이벤트**: `agent.message.received` 추가

### GAP-3: git worktree 격리 (ClawTeam, 중기)

**현재 상태**: F65에서 `agent/{agentId}/{taskType}-{timestamp}` 브랜치를 생성하지만 **git worktree 자동 할당 없음**.

**문제**: 여러 에이전트가 동시에 같은 파일을 편집할 경우 충돌 가능성 존재.

**제안**: `WorktreeManager` 서비스 추가 (Phase 3)
```typescript
interface WorktreeConfig {
  agentId: string;
  branchName: string;
  worktreePath: string;  // /tmp/foundry-x-worktrees/{agentId}
  baseBranch: string;
}
```

---

## 5. Sprint 14 F-item 등록 제안

### F67: PlannerAgent 도입 (P1)

| 항목 | 내용 |
|------|------|
| **REQ** | FX-REQ-067 |
| **Priority** | P1 |
| **출처** | open-swe Planner 패턴 |
| **목표** | 태스크 실행 전 코드베이스 리서치 + 계획 수립 + 인간 승인 단계 추가 |
| **구현** | `PlannerAgent` + `AgentPlanCard.tsx` + `POST /agents/plan` + D1 `agent_plans` |
| **테스트** | planner-agent 8건 + routes-plan 4건 = 12건 목표 |
| **Match Rate 목표** | 90%+ |
| **Agent Teams** | W1: PlannerAgent 서비스 + API / W2: AgentPlanCard UI + SSE |

**수락 기준**:
- [ ] `PlannerAgent`가 코드베이스를 분석하고 단계별 계획을 JSON으로 반환
- [ ] 대시보드에서 계획 카드 표시 + 수락/수정/거절 버튼
- [ ] 계획 승인 후 `PrPipelineService` 자동 연결
- [ ] `agent_plans` D1 테이블 migration
- [ ] 테스트 12건 이상 통과

### F68: 에이전트 inbox 통신 (P1)

| 항목 | 내용 |
|------|------|
| **REQ** | FX-REQ-068 |
| **Priority** | P1 |
| **출처** | ClawTeam inbox 패턴 |
| **목표** | 에이전트 간 비동기 메시지 큐 — Leader/Worker 태스크 위임 + 결과 수집 |
| **구현** | D1 `agent_messages` + `POST/GET /agents/inbox/*` + SSE `agent.message.*` |
| **테스트** | inbox-service 6건 + routes-inbox 4건 = 10건 목표 |
| **Match Rate 목표** | 90%+ |
| **Agent Teams** | W1: inbox 서비스 + D1 migration / W2: API 라우트 + SSE 이벤트 |

**수락 기준**:
- [ ] Agent A가 Agent B에게 메시지 발송 가능
- [ ] Agent B가 inbox를 폴링해서 미읽은 메시지 수신
- [ ] SSE `agent.message.received` 이벤트 대시보드 수신
- [ ] 메시지 타입: `task_assign`, `task_result`, `query`, `ack`
- [ ] 테스트 10건 이상 통과

---

## 6. 구현 우선순위 로드맵

```
Sprint 14 (v1.2.0)
├── F67: PlannerAgent          ← open-swe 패턴, PR 품질 향상
└── F68: Agent inbox 통신      ← ClawTeam 패턴, 멀티에이전트 기반

Sprint 15 (v1.3.0) — 검토 필요
├── Double texting 지원        ← open-swe 패턴, Workers 상태 설계 필요
└── git worktree 격리          ← ClawTeam 패턴, WorktreeManager 서비스

Phase 3 (장기)
└── 외부 CLI 에이전트 연동     ← Codex/다른 CLI도 Worker로 활용
```

---

## 7. 참고 자료

| 자료 | URL |
|------|-----|
| open-swe GitHub | https://github.com/langchain-ai/open-swe |
| open-swe 블로그 | https://blog.langchain.com/introducing-open-swe-an-open-source-asynchronous-coding-agent/ |
| ClawTeam GitHub | https://github.com/HKUDS/ClawTeam |
| open-swe 데모 | https://swe.langchain.com |
| Foundry-X SPEC | `SPEC.md` §5 F-items |
| Foundry-X PRD | `docs/specs/prd-v4.md` |

---

## 변경 이력

| 버전 | 날짜 | 내용 |
|------|------|------|
| 1.0 | 2026-03-18 | 초안 — open-swe + ClawTeam 분석, GAP 3건, F67/F68 등록 제안 |
