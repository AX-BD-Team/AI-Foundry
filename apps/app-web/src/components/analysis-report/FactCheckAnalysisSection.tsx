import { useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend,
} from "recharts";
import {
  Search, TrendingUp, FileText, AlertTriangle, ChevronDown, ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import { SectionHeader } from "./StatusReportWidgets";
import {
  fetchDomainSummary,
  fetchTrend,
  fetchDocumentSuggestions,
  type DomainGapSummary,
  type TrendPoint,
  type DocumentSuggestion,
} from "@/api/factcheck";

/* ═══ Props ═══ */
interface Props {
  organizationId: string;
  embedded?: boolean; // true = skip section wrapper + SectionHeader (used inside CollapsibleSection)
}

/* ═══ Main Component ═══ */
export function FactCheckAnalysisSection({ organizationId, embedded = false }: Props) {
  const [domains, setDomains] = useState<DomainGapSummary[]>([]);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [suggestions, setSuggestions] = useState<DocumentSuggestion[]>([]);
  const [coveragePct, setCoveragePct] = useState(0);
  const [matchedItems, setMatchedItems] = useState(0);
  const [totalSourceItems, setTotalSourceItems] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showAllSuggestions, setShowAllSuggestions] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [domainRes, trendRes, suggestRes] = await Promise.all([
          fetchDomainSummary(organizationId),
          fetchTrend(organizationId),
          fetchDocumentSuggestions(organizationId),
        ]);
        if (cancelled) return;

        if (domainRes.success) {
          setDomains(domainRes.data.domains);
          setCoveragePct(domainRes.data.coveragePct);
          setMatchedItems(domainRes.data.matchedItems);
          setTotalSourceItems(domainRes.data.totalSourceItems);
        }
        if (trendRes.success) {
          setTrend(trendRes.data.trend);
        }
        if (suggestRes.success) {
          setSuggestions(suggestRes.data.suggestions);
        }
      } catch {
        if (!cancelled) toast.error("FactCheck 분석 데이터 로드 실패");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [organizationId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin w-5 h-5 border-2 border-t-transparent rounded-full"
          style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} />
        <span className="ml-2 text-sm" style={{ color: "var(--text-secondary)" }}>
          FactCheck 분석 로딩 중...
        </span>
      </div>
    );
  }

  // No data — show placeholder
  if (domains.length === 0 && trend.length === 0) {
    return null;
  }

  const activeDomains = domains.filter((d) => d.domain !== "unknown" && d.totalGaps > 0);
  const visibleSuggestions = showAllSuggestions ? suggestions : suggestions.slice(0, 5);

  return (
    <section className="space-y-6">
      {!embedded && (
        <SectionHeader
          icon={Search}
          title="FactCheck 커버리지 분석"
          subtitle="소스코드↔문서 API 매칭 현황 및 도메인별 갭 분석"
        />
      )}

      {/* ─── KPI Summary Bar ─── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiBox label="보정 커버리지" value={`${coveragePct}%`} color="#3b82f6"
          explanation="노이즈 필터링 후 실질 API 매칭 비율" />
        <KpiBox label="매칭 성공" value={`${matchedItems}건`} color="#10b981"
          explanation="소스코드 API와 문서가 일치하는 항목" />
        <KpiBox label="소스 항목" value={`${totalSourceItems.toLocaleString()}건`} color="#8b5cf6"
          explanation="Spring Controller에서 추출한 API 엔드포인트" />
        <KpiBox label="미매칭 갭" value={`${(totalSourceItems - matchedItems).toLocaleString()}건`} color="#ef4444"
          explanation="문서에 기술되지 않은 API — 문서 보완 필요" />
      </div>

      {/* ─── 1. Domain Coverage Chart ─── */}
      {activeDomains.length > 0 && (
        <div className="p-4 rounded-lg border" style={{ borderColor: "var(--border)" }}>
          <h4 className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
            도메인별 갭 분포
          </h4>
          <ResponsiveContainer width="100%" height={Math.max(240, activeDomains.length * 28 + 40)}>
            <BarChart
              data={activeDomains.map((d) => ({
                name: d.label,
                HIGH: d.highGaps,
                MEDIUM: d.mediumGaps,
                LOW: d.lowGaps,
              }))}
              layout="vertical"
              margin={{ top: 5, right: 30, left: 80, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis type="number" tick={{ fill: "var(--text-secondary)", fontSize: 11 }} />
              <YAxis
                dataKey="name"
                type="category"
                tick={{ fill: "var(--text-secondary)", fontSize: 11 }}
                width={75}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--bg-primary)",
                  borderColor: "var(--border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="HIGH" stackId="a" fill="#ef4444" name="HIGH" radius={[0, 0, 0, 0]} />
              <Bar dataKey="MEDIUM" stackId="a" fill="#f59e0b" name="MEDIUM" />
              <Bar dataKey="LOW" stackId="a" fill="#6b7280" name="LOW" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ─── 2. Coverage Trend Chart ─── */}
      {trend.length >= 2 && (
        <div className="p-4 rounded-lg border" style={{ borderColor: "var(--border)" }}>
          <h4 className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
            <TrendingUp className="w-4 h-4 inline-block mr-1" style={{ color: "#3b82f6" }} />
            커버리지 개선 추이
          </h4>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart
              data={trend.map((t) => ({
                run: `#${t.run}`,
                "커버리지(%)": t.coveragePct,
                "매칭 수": t.matchedItems,
                "갭 수": t.gapCount,
              }))}
              margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="run" tick={{ fill: "var(--text-secondary)", fontSize: 11 }} />
              <YAxis yAxisId="left" tick={{ fill: "var(--text-secondary)", fontSize: 11 }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fill: "var(--text-secondary)", fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--bg-primary)",
                  borderColor: "var(--border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line yAxisId="left" type="monotone" dataKey="커버리지(%)" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
              <Line yAxisId="right" type="monotone" dataKey="매칭 수" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
          <div className="text-[0.65rem] mt-1 text-center" style={{ color: "var(--text-secondary)" }}>
            총 {trend.length}회 실행 | 최신: {trend.length > 0 ? new Date(trend[trend.length - 1]!.createdAt).toLocaleDateString("ko-KR") : "-"}
          </div>
        </div>
      )}

      {/* ─── 3. Document Suggestions Table ─── */}
      {suggestions.length > 0 && (
        <div className="p-4 rounded-lg border" style={{ borderColor: "var(--border)" }}>
          <h4 className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
            <FileText className="w-4 h-4 inline-block mr-1" style={{ color: "#f59e0b" }} />
            문서 보완 제안 ({suggestions.length}건)
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: "var(--bg-secondary)" }}>
                  <th className="px-3 py-2 text-left font-medium text-xs" style={{ color: "var(--text-secondary)" }}>우선순위</th>
                  <th className="px-3 py-2 text-left font-medium text-xs" style={{ color: "var(--text-secondary)" }}>도메인</th>
                  <th className="px-3 py-2 text-right font-medium text-xs" style={{ color: "var(--text-secondary)" }}>갭 수</th>
                  <th className="px-3 py-2 text-right font-medium text-xs" style={{ color: "var(--text-secondary)" }}>HIGH</th>
                  <th className="px-3 py-2 text-left font-medium text-xs" style={{ color: "var(--text-secondary)" }}>필요 문서</th>
                  <th className="px-3 py-2 text-left font-medium text-xs" style={{ color: "var(--text-secondary)" }}>주요 API/테이블</th>
                </tr>
              </thead>
              <tbody>
                {visibleSuggestions.map((s) => (
                  <tr key={s.domain} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="px-3 py-2">
                      <PriorityBadge priority={s.priority} />
                    </td>
                    <td className="px-3 py-2 font-medium text-xs" style={{ color: "var(--text-primary)" }}>
                      {s.domainLabel}
                    </td>
                    <td className="px-3 py-2 text-right text-xs" style={{ color: "var(--text-primary)" }}>
                      {s.gapCount}
                    </td>
                    <td className="px-3 py-2 text-right text-xs" style={{ color: s.highGaps > 0 ? "#ef4444" : "var(--text-secondary)" }}>
                      {s.highGaps}
                    </td>
                    <td className="px-3 py-2 text-xs" style={{ color: "var(--text-secondary)" }}>
                      {s.suggestedDocType}
                    </td>
                    <td className="px-3 py-2 text-xs font-mono" style={{ color: "var(--text-secondary)" }}>
                      {[...s.sampleApis.slice(0, 2), ...s.sampleTables.slice(0, 1)].join(", ") || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {suggestions.length > 5 && (
            <button
              className="mt-2 text-xs flex items-center gap-1 mx-auto"
              style={{ color: "var(--accent)" }}
              onClick={() => setShowAllSuggestions((v) => !v)}
            >
              {showAllSuggestions ? (
                <>접기 <ChevronUp className="w-3 h-3" /></>
              ) : (
                <>{suggestions.length - 5}건 더 보기 <ChevronDown className="w-3 h-3" /></>
              )}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/* ═══ Sub-Components ═══ */

function KpiBox({ label, value, color, explanation }: { label: string; value: string; color: string; explanation?: string }) {
  return (
    <div className="p-3 rounded-lg border" style={{ borderColor: "var(--border)" }}>
      <div className="text-xs" style={{ color: "var(--text-secondary)" }}>{label}</div>
      <div className="text-xl font-bold" style={{ color }}>{value}</div>
      {explanation && (
        <div className="text-[0.6rem] mt-1" style={{ color: "var(--text-secondary)" }}>{explanation}</div>
      )}
    </div>
  );
}

function PriorityBadge({ priority }: { priority: "HIGH" | "MEDIUM" | "LOW" }) {
  const config = {
    HIGH: { bg: "#fef2f2", color: "#ef4444", label: "높음" },
    MEDIUM: { bg: "#fffbeb", color: "#f59e0b", label: "보통" },
    LOW: { bg: "#f9fafb", color: "#6b7280", label: "낮음" },
  };
  const c = config[priority];
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[0.65rem] font-medium"
      style={{ backgroundColor: c.bg, color: c.color }}
    >
      {priority === "HIGH" && <AlertTriangle className="w-3 h-3" />}
      {c.label}
    </span>
  );
}
