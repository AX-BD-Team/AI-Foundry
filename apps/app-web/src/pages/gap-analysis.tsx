import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  GitCompareArrows,
  Workflow,
  Boxes,
  Plug,
  Table2,
  AlertTriangle,
  CheckCircle,
  XCircle,
  ArrowRightLeft,
  RefreshCw,
  FileWarning,
  Code2,
  Database,
  FileCode,
  Download,
  ArrowUpDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useMemo, useCallback } from "react";
import { useOrganization } from "@/contexts/OrganizationContext";
import { fetchGapOverview } from "@/api/gap-analysis";
import type {
  GapOverview,
  PerspectiveSummary,
  PerspectiveItem,
} from "@/api/gap-analysis";

// ── Filter & Sort types ──────────────────────────────────────────

type StatusFilter = PerspectiveItem["status"] | "all";
type SeverityFilter = PerspectiveItem["severity"] | "all";
type SourceFilter = PerspectiveItem["source"] | "all";
type SortBy = "severity" | "name";

// ── Tab config ─────────────────────────────────────────────────────

type PerspectiveKey = "process" | "architecture" | "api" | "table";

const TABS: Array<{
  key: PerspectiveKey;
  label: string;
  labelEn: string;
  icon: React.ReactNode;
  asIsLabel: string;
  toBeLabel: string;
}> = [
  {
    key: "process",
    label: "프로세스",
    labelEn: "Process",
    icon: <Workflow className="w-4 h-4" />,
    asIsLabel: "문서 프로세스",
    toBeLabel: "소스코드 트랜잭션",
  },
  {
    key: "architecture",
    label: "아키텍처",
    labelEn: "Architecture",
    icon: <Boxes className="w-4 h-4" />,
    asIsLabel: "문서 엔티티",
    toBeLabel: "소스코드 DataModel",
  },
  {
    key: "api",
    label: "API",
    labelEn: "API Endpoints",
    icon: <Plug className="w-4 h-4" />,
    asIsLabel: "문서 API",
    toBeLabel: "소스코드 API",
  },
  {
    key: "table",
    label: "테이블",
    labelEn: "Table Schema",
    icon: <Table2 className="w-4 h-4" />,
    asIsLabel: "문서 테이블",
    toBeLabel: "소스코드 DDL/VO",
  },
];

// ── Status helpers ─────────────────────────────────────────────────

function statusColor(status: PerspectiveItem["status"]): string {
  switch (status) {
    case "matched":
      return "#22C55E";
    case "gap-in-doc":
      return "#EF4444";
    case "gap-in-code":
      return "#F59E0B";
    case "mismatch":
      return "#8B5CF6";
    default:
      return "#6B7280";
  }
}

function statusLabel(status: PerspectiveItem["status"]): string {
  switch (status) {
    case "matched":
      return "Matched";
    case "gap-in-doc":
      return "문서 누락";
    case "gap-in-code":
      return "코드 누락";
    case "mismatch":
      return "불일치";
    default:
      return status;
  }
}

function statusIcon(status: PerspectiveItem["status"]) {
  switch (status) {
    case "matched":
      return <CheckCircle className="w-3.5 h-3.5" style={{ color: "#22C55E" }} />;
    case "gap-in-doc":
      return <XCircle className="w-3.5 h-3.5" style={{ color: "#EF4444" }} />;
    case "gap-in-code":
      return <AlertTriangle className="w-3.5 h-3.5" style={{ color: "#F59E0B" }} />;
    case "mismatch":
      return <ArrowRightLeft className="w-3.5 h-3.5" style={{ color: "#8B5CF6" }} />;
    default:
      return null;
  }
}

function severityBadge(severity: string) {
  const map: Record<string, { bg: string; color: string }> = {
    HIGH: { bg: "rgba(239, 68, 68, 0.1)", color: "#DC2626" },
    MEDIUM: { bg: "rgba(245, 158, 11, 0.1)", color: "#D97706" },
    LOW: { bg: "rgba(107, 114, 128, 0.1)", color: "#6B7280" },
  };
  const s = map[severity] ?? map["LOW"]!;
  return (
    <Badge
      className="text-[10px]"
      style={{ backgroundColor: s.bg, color: s.color, border: "none" }}
    >
      {severity}
    </Badge>
  );
}

function coverageColor(pct: number): string {
  if (pct >= 80) return "#22C55E";
  if (pct >= 50) return "#F59E0B";
  return "#EF4444";
}

// ── Page ───────────────────────────────────────────────────────────

export default function GapAnalysisPage() {
  const { organizationId } = useOrganization();
  const [data, setData] = useState<GapOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<PerspectiveKey>("api");

  // Filter & Sort state
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [sortBy, setSortBy] = useState<SortBy>("severity");

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetchGapOverview(organizationId);
      if (res.success) {
        setData(res.data);
      } else {
        toast.error("Gap Analysis 데이터 로딩 실패");
      }
    } catch {
      toast.error("서버 연결 실패");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [organizationId]);

  const activeTabConfig = TABS.find((t) => t.key === activeTab)!;
  const perspective = data?.perspectives[activeTab] ?? null;

  // Reset filters when switching tabs
  const handleTabChange = useCallback((key: PerspectiveKey) => {
    setActiveTab(key);
    setStatusFilter("all");
    setSeverityFilter("all");
    setSourceFilter("all");
  }, []);

  // Filtered + sorted items
  const SEVERITY_ORDER: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  const filteredItems = useMemo(() => {
    if (!perspective) return [];
    let items = perspective.items;
    if (statusFilter !== "all") {
      items = items.filter((i) => i.status === statusFilter);
    }
    if (severityFilter !== "all") {
      items = items.filter((i) => i.severity === severityFilter);
    }
    if (sourceFilter !== "all") {
      items = items.filter((i) => i.source === sourceFilter);
    }
    return [...items].sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      return (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3);
    });
  }, [perspective, statusFilter, severityFilter, sourceFilter, sortBy]);

  // CSV export
  const exportCsv = useCallback(() => {
    if (filteredItems.length === 0) return;
    const header = "name,source,status,severity,detail";
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const rows = filteredItems.map((i) =>
      [i.name, i.source, i.status, i.severity, i.detail ?? ""]
        .map(escape)
        .join(","),
    );
    const bom = "\uFEFF";
    const csv = bom + [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const date = new Date().toISOString().slice(0, 10);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gap-analysis-${activeTab}-${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${filteredItems.length}건 CSV 내보내기 완료`);
  }, [filteredItems, activeTab]);

  return (
    <div className="space-y-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <GitCompareArrows className="w-6 h-6" style={{ color: "var(--accent)" }} />
            As-Is / To-Be Gap 분석
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            SI 산출물 문서(As-Is)와 소스코드(To-Be) 간 4개 관점 비교 분석
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void loadData()}
          disabled={loading}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          새로고침
        </Button>
      </div>

      {/* Source Stats Banner */}
      {data?.sourceStats && (
        <Card className="shadow-sm bg-muted/30">
          <CardContent className="py-3 px-5">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Code2 className="w-3.5 h-3.5" />
                <span>소스코드 구조</span>
              </div>
              <div className="flex gap-5 text-xs">
                <span><FileCode className="w-3 h-3 inline mr-1" />{data.sourceStats.controllerCount} Controllers</span>
                <span><Plug className="w-3 h-3 inline mr-1" />{data.sourceStats.endpointCount} Endpoints</span>
                <span><Database className="w-3 h-3 inline mr-1" />{data.sourceStats.tableCount} Tables</span>
                <span>{data.sourceStats.mapperCount} Mappers</span>
                <span>{data.sourceStats.transactionCount} Transactions</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Overview Cards */}
      {data && (
        <div className="grid grid-cols-4 gap-4">
          {TABS.map((tab) => {
            const p = data.perspectives[tab.key];
            const color = coverageColor(p.coveragePct);
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => handleTabChange(tab.key)}
                className="text-left transition-all duration-200"
              >
                <Card
                  className="shadow-sm hover:shadow-md transition-shadow"
                  style={{
                    borderColor: isActive ? "var(--accent)" : undefined,
                    borderWidth: isActive ? 2 : 1,
                  }}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <span style={{ color: isActive ? "var(--accent)" : "var(--muted-foreground)" }}>
                        {tab.icon}
                      </span>
                      <span className="text-sm font-semibold">{tab.label}</span>
                      <span className="text-[10px] text-muted-foreground">{tab.labelEn}</span>
                    </div>
                    <div className="flex items-end justify-between">
                      <div>
                        <div className="text-2xl font-bold" style={{ color }}>
                          {p.coveragePct}%
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          {p.matchedCount} / {Math.max(p.asIsCount, p.toBeCount)} 매칭
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">Gap</div>
                        <div className="text-lg font-semibold" style={{ color: p.gapCount > 0 ? "#EF4444" : "#22C55E" }}>
                          {p.gapCount}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </button>
            );
          })}
        </div>
      )}

      {/* Tab Content */}
      {perspective && (
        <div className="grid grid-cols-3 gap-6">
          {/* Left: Summary + Stats */}
          <div className="col-span-1 space-y-4">
            <SummaryCard
              perspective={perspective}
              asIsLabel={activeTabConfig.asIsLabel}
              toBeLabel={activeTabConfig.toBeLabel}
            />

            {/* Status distribution */}
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">갭 유형 분포</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {(["matched", "gap-in-doc", "gap-in-code", "mismatch"] as const).map((status) => {
                  const count = perspective.items.filter((i) => i.status === status).length;
                  if (count === 0) return null;
                  const pct = perspective.items.length > 0
                    ? Math.round((count / perspective.items.length) * 100)
                    : 0;
                  return (
                    <div key={status} className="flex items-center gap-2">
                      {statusIcon(status)}
                      <span className="text-xs flex-1">{statusLabel(status)}</span>
                      <span className="text-xs font-medium">{count}</span>
                      <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: statusColor(status),
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* Findings */}
            {data?.findings && data.findings.total > 0 && (
              <Card className="shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <FileWarning className="w-4 h-4 text-amber-500" />
                    진단 소견 ({data.findings.total}건)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {data.findings.topFindings.slice(0, 5).map((f) => (
                    <div key={f.findingId} className="p-2 rounded-md bg-muted/30 text-xs">
                      <div className="flex items-center gap-1.5 mb-1">
                        {severityBadge(f.severity)}
                        <Badge
                          variant="outline"
                          className="text-[10px]"
                        >
                          {f.type}
                        </Badge>
                      </div>
                      <div className="text-foreground/80 line-clamp-2">{f.finding}</div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right: Gap Item List */}
          <div className="col-span-2">
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span>
                    갭 항목 상세 ({filteredItems.length}
                    {filteredItems.length !== perspective.items.length
                      ? ` / ${perspective.items.length}`
                      : ""}
                    건)
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[11px]"
                      onClick={() => setSortBy((prev) => (prev === "severity" ? "name" : "severity"))}
                    >
                      <ArrowUpDown className="w-3 h-3 mr-1" />
                      {sortBy === "severity" ? "심각도순" : "이름순"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 px-2 text-[11px]"
                      onClick={exportCsv}
                      disabled={filteredItems.length === 0}
                    >
                      <Download className="w-3 h-3 mr-1" />
                      CSV
                    </Button>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {/* Filter controls */}
                <div className="space-y-2 mb-3">
                  {/* Status filter */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] text-muted-foreground w-10 shrink-0">Status</span>
                    {(["all", "matched", "gap-in-doc", "gap-in-code", "mismatch"] as const).map((s) => (
                      <Badge
                        key={s}
                        className="text-[10px] cursor-pointer select-none transition-opacity"
                        variant={statusFilter === s ? "default" : "outline"}
                        style={
                          statusFilter === s && s !== "all"
                            ? { backgroundColor: `${statusColor(s)}20`, color: statusColor(s), border: `1px solid ${statusColor(s)}` }
                            : undefined
                        }
                        onClick={() => setStatusFilter(s)}
                      >
                        {s === "all" ? "전체" : statusLabel(s)}
                      </Badge>
                    ))}
                  </div>
                  {/* Severity filter */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] text-muted-foreground w-10 shrink-0">Severity</span>
                    {(["all", "HIGH", "MEDIUM", "LOW"] as const).map((s) => (
                      <Badge
                        key={s}
                        className="text-[10px] cursor-pointer select-none transition-opacity"
                        variant={severityFilter === s ? "default" : "outline"}
                        onClick={() => setSeverityFilter(s)}
                      >
                        {s === "all" ? "전체" : s}
                      </Badge>
                    ))}
                  </div>
                  {/* Source filter */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] text-muted-foreground w-10 shrink-0">Source</span>
                    {(["all", "document", "code", "both"] as const).map((s) => (
                      <Badge
                        key={s}
                        className="text-[10px] cursor-pointer select-none transition-opacity"
                        variant={sourceFilter === s ? "default" : "outline"}
                        onClick={() => setSourceFilter(s)}
                      >
                        {s === "all" ? "전체" : sourceLabel(s as PerspectiveItem["source"])}
                      </Badge>
                    ))}
                  </div>
                </div>

                {perspective.items.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    분석 데이터가 없어요. 먼저 문서 업로드 + FactCheck를 실행해 주세요.
                  </div>
                ) : filteredItems.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground text-sm">
                    필터 조건에 맞는 항목이 없어요.
                  </div>
                ) : (
                  <div className="space-y-1 max-h-[600px] overflow-auto">
                    {filteredItems.map((item, idx) => (
                      <GapItemRow key={`${item.name}-${idx}`} item={item} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Loading / Empty */}
      {loading && !data && (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}
      {!loading && !data && (
        <Card className="shadow-sm">
          <CardContent className="py-12 text-center text-muted-foreground">
            Gap 분석 데이터를 로드할 수 없어요. 조직을 선택하고 새로고침해 주세요.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────

function SummaryCard({
  perspective,
  asIsLabel,
  toBeLabel,
}: {
  perspective: PerspectiveSummary;
  asIsLabel: string;
  toBeLabel: string;
}) {
  const circumference = 2 * Math.PI * 36;
  const dashOffset =
    circumference - (circumference * Math.min(perspective.coveragePct, 100)) / 100;
  const color = coverageColor(perspective.coveragePct);

  return (
    <Card className="shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-center gap-4 mb-4">
          <div className="relative w-20 h-20 shrink-0">
            <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
              <circle
                cx="40" cy="40" r="36"
                fill="none" stroke="var(--border)" strokeWidth="6"
              />
              <circle
                cx="40" cy="40" r="36"
                fill="none" stroke={color} strokeWidth="6"
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
                strokeLinecap="round"
                className="transition-all duration-500"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-sm font-bold" style={{ color }}>
                {perspective.coveragePct}%
              </span>
            </div>
          </div>
          <div>
            <div className="text-lg font-bold">Coverage</div>
            <div className="text-xs text-muted-foreground">
              {perspective.matchedCount}건 매칭 / {perspective.gapCount}건 갭
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">As-Is ({asIsLabel})</span>
            <span className="font-medium">{perspective.asIsCount}건</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">To-Be ({toBeLabel})</span>
            <span className="font-medium">{perspective.toBeCount}건</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Matched</span>
            <span className="font-medium text-green-600">{perspective.matchedCount}건</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Gap</span>
            <span className="font-medium text-red-600">{perspective.gapCount}건</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function sourceLabel(source: PerspectiveItem["source"]): string {
  switch (source) {
    case "document": return "Doc";
    case "code": return "Code";
    case "both": return "Both";
    default: return source;
  }
}

function GapItemRow({ item }: { item: PerspectiveItem }) {
  return (
    <div
      className="flex items-center gap-3 p-2.5 rounded-md hover:bg-muted/30 transition-colors border-l-2"
      style={{ borderLeftColor: statusColor(item.status) }}
    >
      {statusIcon(item.status)}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate" title={item.name}>
          {item.name}
        </div>
        {item.detail && (
          <div className="text-[11px] text-muted-foreground truncate" title={item.detail}>
            {item.detail}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Badge
          variant="outline"
          className="text-[10px]"
        >
          {sourceLabel(item.source)}
        </Badge>
        <Badge
          className="text-[10px]"
          style={{
            backgroundColor: `${statusColor(item.status)}15`,
            color: statusColor(item.status),
            border: "none",
          }}
        >
          {statusLabel(item.status)}
        </Badge>
        {severityBadge(item.severity)}
      </div>
    </div>
  );
}
