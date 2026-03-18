/**
 * LPON 보고서 섹션 현행화 스크립트
 * - Executive Summary "So What?" 추가
 * - 해소된 항목 반영 (도메인 코드, Neo4j, PPTX, MCP)
 * - 수치 업데이트 (FactCheck 31.2%)
 *
 * Usage: bun run scripts/update-lpon-report.ts [--dry-run]
 */

const API_BASE = "https://ai-foundry.minu.best/api";
const ORG_ID = "LPON";
const DRY_RUN = process.argv.includes("--dry-run");

interface SectionPayload {
  organizationId: string;
  title: string;
  subtitle?: string;
  iconName?: string;
  contentType: string;
  content: unknown;
  sortOrder: number;
}

/* ═══════════════════════════════════════════════
 * Section Definitions
 * ═══════════════════════════════════════════════ */

const sections: Record<string, SectionPayload> = {
  /* ─── NEW: Executive Summary ─── */
  executive_summary: {
    organizationId: ORG_ID,
    title: "Executive Summary — 이 분석 결과, 쓸 수 있는가?",
    subtitle: "보고 받는 분을 위한 결론 요약",
    iconName: "Target",
    contentType: "finding_cards",
    sortOrder: -1,
    content: {
      cards: [
        {
          title: "한 줄 결론",
          items: [
            "SI 산출물(문서 88건 + 소스코드)에서 비즈니스 정책·용어·Skill 자산은 AI로 추출하여 즉시 활용할 수 있어요. 시스템 통합 설계나 프로세스 흐름 복원은 전문가 보완이 필요해요.",
            "검증 포인트: 퇴직연금 → 온누리상품권 도메인 전환 시 파이프라인 재설정 없이 즉시 적용됨 — AI Foundry의 도메인 비의존(domain-agnostic) 아키텍처가 유효함을 입증.",
          ],
          iconName: "Target",
          color: "#3b82f6",
        },
        {
          title: "✅ 즉시 활용 가능 — 전문가 검토 10~20%만 추가하면 실무 투입",
          items: [
            "비즈니스 정책 848건 추출 (발행·충전·환불·가맹점 규칙) — 조건-기준-결과 트리플 구조화, 승인율 95.4%",
            "도메인 용어 사전 33,912건 — 온누리상품권 특화 용어 체계화, 퇴직연금 대비 2.5배 밀도",
            "Skill 패키지 859건 — MCP 서버 + OpenAPI 어댑터 포함, Claude Desktop 연동 검증 완료",
          ],
          iconName: "CheckCircle2",
          color: "#10b981",
        },
        {
          title: "⚠️ 보완하면 활용 가능 — 추가 문서 투입 시 향상",
          items: [
            "소스코드↔문서 커버리지 31.2% (119/382건) — 외부 API 기준 83.7%, 내부 API(회원관리·배치·관리자) 문서화가 부족",
            "Wave 2 Archive 127건 미투입 — 추가 분석 시 정책·용어 자산 확대 가능",
            "프로세스 흐름도 — API 호출 패턴에서 부분 복원 수준 (30~40%), 소스코드 AST 분석 확장으로 개선 가능",
          ],
          iconName: "AlertTriangle",
          color: "#f59e0b",
        },
        {
          title: "❌ AI만으로는 부족 — 별도 전문가 작업 필요",
          items: [
            "시스템 통합 설계 — 서비스 간 의존 관계, 아키텍처 의사결정은 AI 추출 범위 밖 (AI 기여도 10~20%)",
            "비기능 요구사항 — 성능·보안·인프라 설계는 아키텍처 분석 전문가 주도 필요",
          ],
          iconName: "AlertTriangle",
          color: "#ef4444",
        },
      ],
    },
  },

  /* ─── UPDATE: FactCheck 수치 현행화 ─── */
  factcheck: {
    organizationId: ORG_ID,
    title: "FactCheck — 소스코드 ↔ 문서 API 커버리지",
    subtitle: "소스코드 API와 문서 간 매칭 분석 (14회 반복 개선)",
    iconName: "Search",
    contentType: "metric_grid",
    sortOrder: 1,
    content: {
      metrics: [
        { label: "소스 항목 (정규화)", value: "382건", sub: "Spring Controller 기반 API 추출", color: "#8b5cf6" },
        { label: "문서 매칭", value: "119건", sub: "구조 매칭 98 + LLM 매칭 21", color: "#10b981" },
        { label: "보정 커버리지", value: "31.2%", sub: "14회 반복 개선 (초기 8.7% → 31.2%)", color: "#3b82f6" },
        { label: "외부 API 커버리지", value: "83.7%", sub: "외부 인터페이스 103/123건 문서화", color: "#10b981" },
        { label: "문서 역방향 커버리지", value: "90.4%", sub: "문서 API 103/114건 소스 존재 확인", color: "#10b981" },
        { label: "미매칭 갭", value: "263건", sub: "내부 API(회원관리·배치·관리자) 중심", color: "#ef4444" },
      ],
    },
  },

  /* ─── UPDATE: 종합 판정 (해소 항목 반영) ─── */
  core_verdict: {
    organizationId: ORG_ID,
    title: "종합 판정",
    subtitle: "소스코드 역공학 가능성 종합 평가",
    iconName: "CheckCircle2",
    contentType: "finding_cards",
    sortOrder: 2,
    content: {
      cards: [
        {
          title: "생각보다 잘 되는 것",
          items: [
            "도메인 전환 유연성 — 퇴직연금 → 온누리상품권 전환에 모델 재학습 없이 동일 파이프라인 즉시 적용. 도메인 코드(POL-GIFTVOUCHER-*)도 자동 감지",
            "용어 수집 밀도 — 문서당 86.3건 용어 추출, 퇴직연금(34건)보다 2.5배 높은 수집률",
            "5-Stage 파이프라인 완주 — Ingestion → Skill까지 전 단계 end-to-end 완료 (88건 → 859 Skills)",
            "정책 승인 효율 — 848건 정책 전량 승인, 벌크 승인(333건) 운영 검증 완료",
            "대용량 문서 처리 — PDF 페이지 분할 + PPTX 슬라이드 분할로 15.9MB 파일까지 처리 성공 (8/8 전량)",
            "온톨로지 그래프 — Neo4j 3,880건 전량 동기화 완료, 도메인 지식 시각화 가능",
          ],
          iconName: "CheckCircle2",
          color: "#10b981",
        },
        {
          title: "아직 부족한 것",
          items: [
            "소스코드↔문서 커버리지 31.2% — 14회 반복 개선에도 내부 API(회원관리·배치·관리자) 문서화율이 낮음. 다만 외부 API 기준으로는 83.7% 커버",
            "Wave 2 미착수 — Archive 폴더 127건 문서 미처리 (별도 일정 필요)",
          ],
          iconName: "AlertTriangle",
          color: "#f59e0b",
        },
        {
          title: "보강하면 가능한 것",
          items: [
            "소스코드 AST 분석 확장 — Java/Spring AST 파서 이미 구현, Controller 외 Service/Mapper/DDL까지 확장하면 커버리지 향상 가능",
            "FactCheck 문서 보완 자동 제안 — 263건 갭 기반 16개 도메인별 필요 문서 목록 + 우선순위 이미 제공 중",
            "Wave 2 투입 — Archive 127건 추가 분석으로 정책·용어 자산 확대",
          ],
          iconName: "Zap",
          color: "#3b82f6",
        },
      ],
    },
  },

  /* ─── UPDATE: 활용 영역 테이블 ─── */
  utilization: {
    organizationId: ORG_ID,
    title: "이 추출 결과로 무엇을 할 수 있는가?",
    subtitle: "추출 결과 활용 영역 분석",
    iconName: "Layers",
    contentType: "data_table",
    sortOrder: 3,
    content: {
      headers: ["활용 영역", "AI 자동 생성", "전문가 보완", "종합"],
      rows: [
        ["비즈니스 정책 (상품권 규정)", "80~90%", "10~20%", "✅ 발행·충전·환불 규칙 즉시 활용 (848건)"],
        ["도메인 용어 사전", "90~95%", "5~10%", "✅ 33,912 용어 체계화 완료"],
        ["Skill 패키지 (MCP/API)", "85~90%", "10~15%", "✅ 859건 배포, MCP E2E 검증 완료"],
        ["소스코드 문서화 보완", "30~40%", "60~70%", "⚠️ FactCheck 기반 갭 우선순위 + 16건 자동 제안"],
        ["프로세스 흐름도", "30~40%", "60~70%", "⚠️ API 패턴에서 부분 복원 수준"],
        ["시스템 통합 설계", "10~20%", "80~90%", "❌ 별도 아키텍처 설계 필요"],
      ],
    },
  },

  /* ─── UPDATE: 종합 판정 — 최종 결론 ─── */
  final_verdict: {
    organizationId: ORG_ID,
    title: "종합 판정",
    subtitle: "핵심 평가 최종 결론",
    iconName: "ShieldCheck",
    contentType: "text_block",
    sortOrder: 4,
    content: {
      blocks: [
        {
          label: "현재 수준:",
          paragraphs: [
            "전자식 온누리상품권 플랫폼의 88건 문서에서 848건 정책, 33,912건 용어, 859건 Skill을 추출했어요. 도메인 전환(퇴직연금 → 온누리상품권) 시 파이프라인 재설정 없이 즉시 적용 가능함을 검증했고, 도메인 코드 자동 감지(POL-GIFTVOUCHER-*), 대용량 문서 분할 처리(15.9MB), Neo4j 온톨로지 3,880건 동기화까지 프로덕션 레벨로 완료했어요.",
          ],
        },
        {
          label: "핵심 발견:",
          paragraphs: [
            "FactCheck 14회 반복 분석에서 소스코드 382개 API 대비 문서 커버리지가 31.2%이지만, 외부 인터페이스 기준으로는 83.7%로 양호해요. 미매칭 263건의 대부분은 내부 API(회원관리, 배치, 관리자 기능)로, 외부 인터페이스 설계서에 기술되지 않는 것이 SI 프로젝트의 구조적 특성이에요. AI Foundry는 이 '암묵지 갭'을 정량적으로 가시화하고, 도메인별 문서 보완 우선순위를 자동 제안하는 도구로 기능해요.",
          ],
        },
        {
          label: "결론:",
          paragraphs: [
            "비즈니스 정책·용어·Skill 자산은 즉시 활용 가능 (AI 기여 80~95%). 소스코드 문서화 보완과 프로세스 복원은 추가 문서 투입 및 AST 분석 확장으로 개선 가능. 시스템 통합 설계는 AI 추출 범위 밖이므로 전문가 주도 작업이 필요해요.",
          ],
        },
      ],
    },
  },

  /* ─── UPDATE: 품질 평가 (해소 항목 제거) ─── */
  quality_assessment: {
    organizationId: ORG_ID,
    title: "품질 평가",
    subtitle: "온누리상품권 도메인 추출 성과 및 한계 분석",
    iconName: "ShieldCheck",
    contentType: "finding_cards",
    sortOrder: 5,
    content: {
      cards: [
        {
          title: "잘 되는 것 — 추출 사례",
          items: [
            "상품권 발행·충전·사용·환불 전 과정의 업무 규칙을 조건-기준-결과 트리플로 자동 추출 (848건, 승인율 95.4%)",
            "규정집, 매뉴얼, FAQ 등 다양한 문서 유형에서 일관된 정책 구조화 — 파싱 성공률 96.6% (85/88), 대용량 문서 8/8 전량 처리",
            "도메인 용어 밀도가 퇴직연금 대비 2.5배 — 온누리상품권 특화 용어 사전으로 즉시 활용 가능 (33,912건)",
            "벌크 승인 333건 운영 — 대량 정책 검토·승인 워크플로 실용성 검증",
            "도메인 전환 시 파이프라인 재설정 불필요 — POL-GIFTVOUCHER-* 도메인 코드 자동 감지",
            "MCP Server + OpenAPI 어댑터 — Skill 859건 Claude Desktop 연동 검증 완료",
          ],
          iconName: "CheckCircle2",
          color: "#10b981",
        },
        {
          title: "한계점",
          items: [
            "소스코드↔문서 커버리지 31.2% — 내부 API(회원관리·배치·관리자)의 문서화율이 낮음 (외부 API 기준 83.7%)",
            "Wave 2 Archive 127건 미착수 — 추가 문서 분석으로 정책·용어 자산 확대 가능하나 일정 미확보",
          ],
          iconName: "AlertTriangle",
          color: "#f59e0b",
        },
      ],
    },
  },

  /* ─── UPDATE: 향후 과제 (해소 항목 반영) ─── */
  next_steps: {
    organizationId: ORG_ID,
    title: "향후 과제",
    subtitle: "온누리상품권 분석 고도화 로드맵",
    iconName: "TrendingUp",
    contentType: "task_list",
    sortOrder: 8,
    content: {
      tasks: [
        {
          priority: "high",
          title: "Wave 2 문서 투입",
          description: "Archive 폴더 127건 추가 문서 분석 — 정책·용어 자산 확대",
          status: "대기",
        },
        {
          priority: "medium",
          title: "소스코드 AST 분석 확장",
          description: "Java/Spring AST 파서 확장 (Controller → Service/Mapper/DDL) — FactCheck 커버리지 향상",
          status: "검토 중",
        },
        {
          priority: "medium",
          title: "LLM 프로바이더 품질 비교",
          description: "Anthropic vs OpenAI extraction 품질 벤치마크 (AIF-REQ-002)",
          status: "IN_PROGRESS",
        },
        {
          priority: "low",
          title: "✅ 도메인 코드 자동 감지",
          description: "POL-PENSION-* → org별 도메인 코드 매핑 (POL-GIFTVOUCHER-*) 자동 적용 완료",
          status: "완료",
        },
        {
          priority: "low",
          title: "✅ Neo4j Backfill 실행",
          description: "3,880건 ontology 노드를 Neo4j Aura에 전량 동기화 완료",
          status: "완료",
        },
        {
          priority: "low",
          title: "✅ 대용량 문서 처리",
          description: "PDF 페이지 분할 + PPTX 슬라이드 분할 — 15.9MB PPTX 포함 8/8 전량 성공 (AIF-REQ-004)",
          status: "완료",
        },
        {
          priority: "low",
          title: "✅ MCP 어댑터 + Skill 배포",
          description: "859건 Skill → MCP Server 등록, KV 3환경, Claude Desktop E2E 7/7 PASS (AIF-REQ-009)",
          status: "완료",
        },
      ],
    },
  },

  /* ─── UPDATE: 대표 추출 정책 예시 ─── */
  policy_examples: {
    organizationId: ORG_ID,
    title: "대표 추출 정책 예시",
    subtitle: "온누리상품권 도메인에서 추출된 주요 정책",
    iconName: "ShieldCheck",
    contentType: "policy_examples",
    sortOrder: 9,
    content: {
      policies: [
        {
          code: "POL-GIFTVOUCHER-BN-*",
          title: "상품권 발행 규칙",
          description:
            "전자식 온누리상품권 발행 시 본인인증 및 발행 한도 검증 — 1인당 월 구매 한도 제한",
        },
        {
          code: "POL-GIFTVOUCHER-CT-*",
          title: "충전 거래 검증",
          description:
            "상품권 충전 시 결제수단 유효성 및 충전 한도 검증 — 일/월 단위 누적 한도 적용",
        },
        {
          code: "POL-GIFTVOUCHER-WD-*",
          title: "환불 조건 규칙",
          description:
            "온누리상품권 환불 시 사용 이력 확인 및 환불 수수료 산정 — 사용 비율에 따른 차등 적용",
        },
        {
          code: "POL-GIFTVOUCHER-RG-*",
          title: "가맹점 등록 기준",
          description:
            "온누리상품권 가맹점 등록 시 소상공인 확인 및 업종 적격 심사 — 매출 기준 충족 여부",
        },
      ],
    },
  },
};

/* ═══════════════════════════════════════════════
 * Execution
 * ═══════════════════════════════════════════════ */

async function updateSection(sectionKey: string, payload: SectionPayload): Promise<boolean> {
  const url = `${API_BASE}/reports/sections/${sectionKey}`;

  if (DRY_RUN) {
    console.log(`[DRY RUN] PUT ${sectionKey} — ${payload.title}`);
    return true;
  }

  try {
    const res = await fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Organization-Id": ORG_ID,
        "X-User-Id": "admin-sinclair",
        "X-User-Role": "Admin",
      },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      console.log(`✅ ${sectionKey} — ${payload.title}`);
      return true;
    } else {
      const text = await res.text();
      console.error(`❌ ${sectionKey} — ${res.status}: ${text}`);
      return false;
    }
  } catch (err) {
    console.error(`❌ ${sectionKey} — ${err}`);
    return false;
  }
}

async function main() {
  console.log(`\n${"═".repeat(50)}`);
  console.log(`LPON 보고서 섹션 현행화${DRY_RUN ? " (DRY RUN)" : ""}`);
  console.log(`${"═".repeat(50)}\n`);

  const entries = Object.entries(sections);
  let success = 0;
  let fail = 0;

  for (const [key, payload] of entries) {
    const ok = await updateSection(key, payload);
    if (ok) success++;
    else fail++;
  }

  console.log(`\n${"─".repeat(50)}`);
  console.log(`결과: ${success} 성공, ${fail} 실패 (총 ${entries.length}건)`);
  console.log(`${"─".repeat(50)}\n`);
}

void main();
