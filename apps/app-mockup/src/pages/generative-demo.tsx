/**
 * Generative Visualization Demo — PoC 페이지.
 * Widget Renderer + Decision Matrix 통합 검증용.
 * 정적 샘플 HTML/SVG로 시각화 타입별 렌더링을 확인한다.
 */

import { useCallback, useState } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { MockupHeader } from "@/components/shared/MockupHeader";
import { WidgetRenderer } from "@/components/shared/WidgetRenderer";
import { cn } from "@/lib/cn";
import { extractThemeVariables } from "@/lib/widget-theme";
import {
  analyzeDataCharacteristics,
  selectVisualizationType,
  generateVisualizationPrompt,
} from "@/lib/decision-matrix";
import type { WidgetType } from "@/lib/widget-bridge";
import type { BridgeAction } from "@/lib/widget-bridge";

// ── Sample Data ─────────────────────────────────

const SAMPLE_POLICIES = [
  { id: "POL-001", title: "주택구입 중도인출", domain: "pension", trustScore: 0.87, status: "approved", dependsOn: ["POL-002", "POL-003"] },
  { id: "POL-002", title: "무주택 확인 절차", domain: "pension", trustScore: 0.92, status: "approved", dependsOn: ["POL-004"] },
  { id: "POL-003", title: "한도 산정 기준", domain: "pension", trustScore: 0.78, status: "approved", dependsOn: [] },
  { id: "POL-004", title: "본인 인증", domain: "pension", trustScore: 0.95, status: "approved", dependsOn: [] },
  { id: "POL-005", title: "충전 거래 처리", domain: "giftvoucher", trustScore: 0.85, status: "approved", dependsOn: ["POL-006"] },
  { id: "POL-006", title: "결제 한도 검증", domain: "giftvoucher", trustScore: 0.90, status: "approved", dependsOn: [] },
];

const SAMPLE_STATS = [
  { domain: "퇴직연금", policies: 2827, skills: 3065, terms: 1441, date: "2026-01" },
  { domain: "퇴직연금", policies: 2900, skills: 3100, terms: 1450, date: "2026-02" },
  { domain: "퇴직연금", policies: 2827, skills: 3065, terms: 1441, date: "2026-03" },
  { domain: "온누리상품권", policies: 848, skills: 859, terms: 7332, date: "2026-01" },
  { domain: "온누리상품권", policies: 848, skills: 859, terms: 7332, date: "2026-02" },
  { domain: "온누리상품권", policies: 848, skills: 859, terms: 7332, date: "2026-03" },
];

// ── Static HTML Samples per Type ────────────────

const SAMPLE_CONTENT: Record<WidgetType, string> = {
  chart: `
<div style="padding: 16px;">
  <h3 style="color: var(--aif-primary); margin: 0 0 16px 0; font-size: 16px;">도메인별 정책 현황</h3>
  <svg viewBox="0 0 400 220" style="width: 100%; max-width: 500px;">
    <rect x="50" y="20" width="120" height="160" rx="4" fill="var(--aif-primary)" opacity="0.8"/>
    <rect x="230" y="100" width="120" height="80" rx="4" fill="var(--aif-accent)" opacity="0.8"/>
    <text x="110" y="200" text-anchor="middle" font-size="12" fill="var(--aif-text)">퇴직연금</text>
    <text x="290" y="200" text-anchor="middle" font-size="12" fill="var(--aif-text)">온누리상품권</text>
    <text x="110" y="15" text-anchor="middle" font-size="11" fill="var(--aif-text-secondary)">2,827</text>
    <text x="290" y="95" text-anchor="middle" font-size="11" fill="var(--aif-text-secondary)">848</text>
  </svg>
</div>`,

  graph: `
<div style="padding: 16px;">
  <h3 style="color: var(--aif-primary); margin: 0 0 16px 0; font-size: 16px;">정책 의존성 그래프</h3>
  <svg viewBox="0 0 500 300" style="width: 100%;">
    <defs>
      <marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--aif-text-secondary)"/>
      </marker>
    </defs>
    <line x1="250" y1="50" x2="130" y2="140" stroke="var(--aif-border)" stroke-width="1.5" marker-end="url(#arrow)"/>
    <line x1="250" y1="50" x2="370" y2="140" stroke="var(--aif-border)" stroke-width="1.5" marker-end="url(#arrow)"/>
    <line x1="130" y1="140" x2="200" y2="240" stroke="var(--aif-border)" stroke-width="1.5" marker-end="url(#arrow)"/>
    <circle cx="250" cy="50" r="28" fill="var(--aif-primary)" opacity="0.9"/>
    <text x="250" y="55" text-anchor="middle" font-size="9" fill="white">주택구입</text>
    <circle cx="130" cy="140" r="28" fill="var(--aif-accent)" opacity="0.9"/>
    <text x="130" y="145" text-anchor="middle" font-size="9" fill="white">무주택확인</text>
    <circle cx="370" cy="140" r="28" fill="var(--aif-success)" opacity="0.9"/>
    <text x="370" y="145" text-anchor="middle" font-size="9" fill="white">한도산정</text>
    <circle cx="200" cy="240" r="28" fill="var(--aif-bg-secondary)" stroke="var(--aif-border)" stroke-width="2"/>
    <text x="200" y="245" text-anchor="middle" font-size="9" fill="var(--aif-text)">본인인증</text>
  </svg>
</div>`,

  diagram: `
<div style="padding: 16px;">
  <h3 style="color: var(--aif-primary); margin: 0 0 16px 0; font-size: 16px;">중도인출 프로세스 흐름</h3>
  <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: center;">
    <div style="padding: 10px 16px; background: var(--aif-primary); color: white; border-radius: var(--aif-radius); font-size: 13px;">신청 접수</div>
    <span style="color: var(--aif-text-secondary); font-size: 18px;">&rarr;</span>
    <div style="padding: 10px 16px; background: var(--aif-accent); color: white; border-radius: var(--aif-radius); font-size: 13px;">무주택 확인</div>
    <span style="color: var(--aif-text-secondary); font-size: 18px;">&rarr;</span>
    <div style="padding: 10px 16px; background: var(--aif-accent); color: white; border-radius: var(--aif-radius); font-size: 13px;">한도 산정</div>
    <span style="color: var(--aif-text-secondary); font-size: 18px;">&rarr;</span>
    <div style="padding: 10px 16px; background: var(--aif-success); color: white; border-radius: var(--aif-radius); font-size: 13px;">승인 완료</div>
  </div>
</div>`,

  table: `
<div style="padding: 16px;">
  <h3 style="color: var(--aif-primary); margin: 0 0 16px 0; font-size: 16px;">정책 목록</h3>
  <table>
    <thead>
      <tr>
        <th>코드</th>
        <th>제목</th>
        <th>도메인</th>
        <th>신뢰도</th>
        <th>상태</th>
      </tr>
    </thead>
    <tbody>
      <tr><td>POL-001</td><td>주택구입 중도인출</td><td>pension</td><td style="color: var(--aif-accent);">0.87</td><td style="color: var(--aif-success);">approved</td></tr>
      <tr><td>POL-002</td><td>무주택 확인 절차</td><td>pension</td><td style="color: var(--aif-success);">0.92</td><td style="color: var(--aif-success);">approved</td></tr>
      <tr><td>POL-003</td><td>한도 산정 기준</td><td>pension</td><td style="color: var(--aif-accent);">0.78</td><td style="color: var(--aif-success);">approved</td></tr>
      <tr><td>POL-004</td><td>본인 인증</td><td>pension</td><td style="color: var(--aif-success);">0.95</td><td style="color: var(--aif-success);">approved</td></tr>
      <tr><td>POL-005</td><td>충전 거래 처리</td><td>giftvoucher</td><td style="color: var(--aif-accent);">0.85</td><td style="color: var(--aif-success);">approved</td></tr>
      <tr><td>POL-006</td><td>결제 한도 검증</td><td>giftvoucher</td><td style="color: var(--aif-success);">0.90</td><td style="color: var(--aif-success);">approved</td></tr>
    </tbody>
  </table>
</div>`,

  markdown: `
<div style="padding: 16px;">
  <h2 style="color: var(--aif-primary); margin: 0 0 12px 0;">AI Foundry 추출 현황</h2>
  <p style="color: var(--aif-text-secondary); margin: 0 0 16px 0;">2개 도메인의 5-Stage 파이프라인 결과 요약</p>
  <ul style="list-style: none; padding: 0; margin: 0;">
    <li style="padding: 8px 0; border-bottom: 1px solid var(--aif-border);">
      <strong style="color: var(--aif-primary);">정책</strong>: 3,675건 승인 (퇴직연금 2,827 + 온누리상품권 848)
    </li>
    <li style="padding: 8px 0; border-bottom: 1px solid var(--aif-border);">
      <strong style="color: var(--aif-accent);">Skill</strong>: 3,924건 패키징 (퇴직연금 3,065 + 온누리상품권 859)
    </li>
    <li style="padding: 8px 0; border-bottom: 1px solid var(--aif-border);">
      <strong>온톨로지</strong>: 3,880 노드 (Neo4j 동기화 완료)
    </li>
    <li style="padding: 8px 0;">
      <strong style="color: var(--aif-success);">FactCheck 커버리지</strong>: 31.2% (LPON 기준)
    </li>
  </ul>
</div>`,

  form: "",
};

// ── Component ───────────────────────────────────

const VIZ_TYPES: Array<{ type: WidgetType; label: string; emoji: string }> = [
  { type: "chart", label: "차트", emoji: "📊" },
  { type: "graph", label: "그래프", emoji: "🕸️" },
  { type: "diagram", label: "다이어그램", emoji: "📐" },
  { type: "table", label: "테이블", emoji: "📋" },
  { type: "markdown", label: "마크다운", emoji: "📝" },
];

export function GenerativeDemo() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const themeVars = extractThemeVariables(isDark);

  const [selectedType, setSelectedType] = useState<WidgetType>("graph");
  const [query, setQuery] = useState("");
  const [actions, setActions] = useState<BridgeAction[]>([]);
  const [autoResult, setAutoResult] = useState<string | null>(null);

  const handleAction = useCallback((action: BridgeAction) => {
    setActions((prev) => [...prev.slice(-9), action]);
  }, []);

  const handleAutoDetect = useCallback(() => {
    if (!query.trim()) return;

    const isGraph = /의존|관계|연결|그래프|dependency/i.test(query);
    const isTimeSeries = /추이|시간|월별|date|trend/i.test(query);
    const isProcess = /프로세스|흐름|절차|flow|step/i.test(query);
    const isTable = /목록|리스트|전체|list|all/i.test(query);

    const data: Record<string, unknown>[] = isGraph
      ? SAMPLE_POLICIES.map((p) => ({ ...p, parent_id: null }))
      : isTimeSeries
        ? SAMPLE_STATS
        : SAMPLE_POLICIES;

    const metadata = {
      entityType: "policy",
      relationshipCount: isGraph ? 5 : 0,
    };

    const chars = analyzeDataCharacteristics(data, metadata);

    if (isProcess) {
      chars.hasProcessFlow = true;
    }
    if (isTable) {
      chars.rowCount = 25;
    }

    const selection = selectVisualizationType(chars);
    setSelectedType(selection.vizType);
    setAutoResult(`Decision Matrix → ${selection.vizType} (${selection.templateKey})`);

    const prompt = generateVisualizationPrompt(selection.templateKey, data, isDark ? "dark" : "light");
    console.log("[DecisionMatrix] Generated prompt length:", prompt.length);
  }, [query, isDark]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <MockupHeader />

      <main className="mx-auto max-w-5xl px-6 py-6 space-y-6">
        {/* Title */}
        <div>
          <h2 className="text-lg font-bold">Generative Visualization Demo</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Widget Renderer + Decision Matrix PoC — 정적 샘플 HTML로 시각화 타입별 렌더링 검증
          </p>
        </div>

        {/* Query + Auto Detect */}
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <label htmlFor="viz-query" className="block text-sm font-medium mb-2">
            시각화 요청 (쿼리)
          </label>
          <div className="flex gap-2">
            <input
              id="viz-query"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="예: 정책 의존성 그래프, 도메인별 통계 추이, 정책 목록..."
              className="flex-1 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              onKeyDown={(e) => { if (e.key === "Enter") handleAutoDetect(); }}
            />
            <button
              type="button"
              onClick={handleAutoDetect}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              자동 감지
            </button>
          </div>
          {autoResult && (
            <p className="mt-2 text-xs text-blue-600 dark:text-blue-400">{autoResult}</p>
          )}
        </div>

        {/* Type Selector */}
        <div className="flex gap-1 rounded-lg bg-gray-100 dark:bg-gray-800 p-1">
          {VIZ_TYPES.map((v) => (
            <button
              key={v.type}
              type="button"
              onClick={() => setSelectedType(v.type)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-all",
                selectedType === v.type
                  ? "bg-white dark:bg-gray-700 shadow-sm"
                  : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300",
              )}
            >
              <span>{v.emoji}</span>
              {v.label}
            </button>
          ))}
        </div>

        {/* Widget Renderer */}
        <WidgetRenderer
          content={SAMPLE_CONTENT[selectedType]}
          type={selectedType}
          themeVariables={themeVars}
          isDark={isDark}
          onAction={handleAction}
          maxHeight={600}
        />

        {/* Action Log */}
        {actions.length > 0 && (
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
            <h3 className="text-sm font-medium mb-2">Bridge Actions (최근 10건)</h3>
            <div className="space-y-1 text-xs font-mono text-gray-500 dark:text-gray-400">
              {actions.map((a, i) => (
                <div key={i}>
                  [{a.type}] {a.type === "resize" ? `height=${a.height}` : a.type === "error" ? a.message : ""}
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
