/**
 * DynamicStatusReport — API-driven report renderer
 * AIF-REQ-011: Replaces hardcoded LponStatusReport & MiraeassetStatusReport
 *
 * Fetches report sections from svc-analytics and renders each section
 * based on its contentType using existing StatusReportWidgets.
 */

import { useEffect, useState, useCallback } from "react";
import {
  Search,
  Target,
  DollarSign,
  Zap,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Layers,
  FileText,
  BookOpen,
  Puzzle,
  TrendingUp,
  Download,
  History,
  ChevronDown,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  SectionHeader,
  DataTable,
  TaskCard,
  FindingCard,
  PolicyExampleCard,
} from "./StatusReportWidgets";
import {
  fetchReportSections,
  fetchReportSnapshots,
  fetchReportSnapshot,
  exportReportMarkdown,
  type ReportSection,
  type SnapshotSummary,
} from "@/api/reports";

/* ─── Icon registry ─── */
const ICON_MAP: Record<string, LucideIcon> = {
  Search,
  Target,
  DollarSign,
  Zap,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Layers,
  FileText,
  BookOpen,
  Puzzle,
  TrendingUp,
  Download,
  History,
};

function resolveIcon(iconName: string | null): LucideIcon {
  if (iconName && ICON_MAP[iconName]) {
    return ICON_MAP[iconName] as LucideIcon;
  }
  return FileText;
}

/* ─── Content type renderers ─── */

function renderEvaluationTable(content: Record<string, unknown>) {
  const tableHeaders = content["headers"] as string[] | undefined;
  const rows = content["rows"] as string[][] | undefined;
  const highlightCol = content["highlightCol"] as number | undefined;
  if (!tableHeaders || !rows) return null;

  const tableProps: { headers: string[]; rows: string[][]; highlightCol?: number } = {
    headers: tableHeaders,
    rows,
  };
  if (highlightCol !== undefined) {
    tableProps.highlightCol = highlightCol;
  }
  return <DataTable {...tableProps} />;
}

function renderFindingCards(content: Record<string, unknown>) {
  const cards = content["cards"] as Array<{
    title: string;
    items: string[];
    iconName?: string;
    color?: string;
  }> | undefined;
  if (!cards) return null;
  return (
    <div className="space-y-4">
      {cards.map((card, i) => (
        <FindingCard
          key={i}
          icon={resolveIcon(card.iconName ?? null)}
          title={card.title}
          items={card.items}
          color={card.color ?? "var(--accent)"}
        />
      ))}
    </div>
  );
}

function renderMetricGrid(content: Record<string, unknown>) {
  const metrics = content["metrics"] as Array<{
    label: string;
    value: string;
    sub?: string;
    color?: string;
  }> | undefined;
  if (!metrics) return null;
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {metrics.map((m, i) => (
        <div key={i} className="p-3 rounded-lg border" style={{ borderColor: "var(--border)" }}>
          <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
            {m.label}
          </div>
          <div
            className="text-xl font-bold"
            style={{ color: m.color ?? "var(--accent)" }}
          >
            {m.value}
          </div>
          {m.sub && (
            <div className="text-[0.65rem]" style={{ color: "var(--text-secondary)" }}>
              {m.sub}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function renderTaskList(content: Record<string, unknown>) {
  const tasks = content["tasks"] as Array<{
    priority: "high" | "medium" | "low";
    title: string;
    description: string;
    status: string;
  }> | undefined;
  if (!tasks) return null;

  const activeTasks = tasks.filter((t) => !t.title.startsWith("✅"));
  const completedTasks = tasks.filter((t) => t.title.startsWith("✅"));

  return <TaskListWithFold activeTasks={activeTasks} completedTasks={completedTasks} />;
}

function TaskListWithFold({ activeTasks, completedTasks }: {
  activeTasks: Array<{ priority: "high" | "medium" | "low"; title: string; description: string; status: string }>;
  completedTasks: Array<{ priority: "high" | "medium" | "low"; title: string; description: string; status: string }>;
}) {
  const [showCompleted, setShowCompleted] = useState(false);

  return (
    <div className="space-y-3">
      {activeTasks.map((t, i) => (
        <TaskCard key={i} priority={t.priority} title={t.title} description={t.description} status={t.status} />
      ))}
      {completedTasks.length > 0 && (
        <div>
          <button
            type="button"
            className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-md border transition-colors w-full justify-center"
            style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
            onClick={() => setShowCompleted((v) => !v)}
          >
            <CheckCircle2 className="w-3.5 h-3.5" style={{ color: "#10b981" }} />
            {showCompleted ? "완료 항목 접기" : `완료된 항목 ${completedTasks.length}건 보기`}
            <ChevronDown
              className="w-3.5 h-3.5 transition-transform duration-200"
              style={{ transform: showCompleted ? "rotate(180deg)" : "rotate(0deg)" }}
            />
          </button>
          {showCompleted && (
            <div className="space-y-3 mt-3 opacity-75">
              {completedTasks.map((t, i) => (
                <TaskCard key={i} priority={t.priority} title={t.title} description={t.description} status={t.status} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function renderPolicyExamples(content: Record<string, unknown>) {
  const notice = content["notice"] as string | undefined;
  const policies = content["policies"] as Array<{
    code: string;
    title: string;
    description: string;
  }> | undefined;
  if (!policies) return null;
  return (
    <>
      {notice && (
        <div
          className="p-3 mb-4 rounded-lg border"
          style={{
            borderColor: "#f59e0b",
            backgroundColor: "color-mix(in srgb, #f59e0b 6%, transparent)",
          }}
        >
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
            <AlertTriangle
              className="w-3 h-3 inline mr-1"
              style={{ color: "#f59e0b" }}
            />
            <strong style={{ color: "var(--text-primary)" }}>
              {notice}
            </strong>
          </p>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {policies.map((p, i) => (
          <PolicyExampleCard
            key={i}
            code={p.code}
            title={p.title}
            description={p.description}
          />
        ))}
      </div>
    </>
  );
}

function renderTextBlock(content: Record<string, unknown>) {
  const blocks = content["blocks"] as Array<{
    label?: string;
    paragraphs: string[];
  }> | undefined;
  if (!blocks) return null;
  return (
    <div className="space-y-4">
      {blocks.map((block, i) => (
        <div key={i}>
          {block.label && (
            <h4
              className="text-sm font-medium mb-2"
              style={{ color: "var(--text-primary)" }}
            >
              {block.label}
            </h4>
          )}
          {block.paragraphs.map((p, j) => (
            <p
              key={j}
              className="text-xs leading-relaxed mb-2"
              style={{ color: "var(--text-secondary)" }}
            >
              {p}
            </p>
          ))}
        </div>
      ))}
    </div>
  );
}

function renderFramingBlock(content: Record<string, unknown>) {
  const text = content["text"] as string | undefined;
  if (!text) return null;
  return (
    <div
      className="p-4 rounded-lg border"
      style={{
        borderColor: "var(--accent)",
        backgroundColor: "color-mix(in srgb, var(--accent) 6%, transparent)",
      }}
    >
      <p className="text-sm" style={{ color: "var(--text-primary)" }}>
        {text}
      </p>
    </div>
  );
}

/* ─── Section renderer dispatcher ─── */

function renderSectionContent(section: ReportSection) {
  const content = section.content as Record<string, unknown>;
  if (!content) return null;

  switch (section.contentType) {
    case "evaluation_table":
    case "data_table":
    case "comparison_table":
      return renderEvaluationTable(content);
    case "finding_cards":
      return renderFindingCards(content);
    case "metric_grid":
      return renderMetricGrid(content);
    case "task_list":
      return renderTaskList(content);
    case "policy_examples":
      return renderPolicyExamples(content);
    case "text_block":
      return renderTextBlock(content);
    case "framing_block":
      return renderFramingBlock(content);
    default:
      return (
        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
          Unknown content type: {section.contentType}
        </p>
      );
  }
}

/* ─── Main Component ─── */

interface DynamicStatusReportProps {
  organizationId: string;
}

export function DynamicStatusReport({ organizationId }: DynamicStatusReportProps) {
  const [sections, setSections] = useState<ReportSection[]>([]);
  const [snapshots, setSnapshots] = useState<SnapshotSummary[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  /* ─── Load live sections + snapshot list ─── */
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const [sectionsRes, snapshotsRes] = await Promise.all([
          fetchReportSections(organizationId),
          fetchReportSnapshots(organizationId),
        ]);

        if (cancelled) return;

        if (sectionsRes.success) {
          setSections(sectionsRes.data.sections);
        } else {
          toast.error("보고서 섹션 로드 실패");
        }

        if (snapshotsRes.success) {
          setSnapshots(snapshotsRes.data.snapshots);
        }
      } catch {
        if (!cancelled) toast.error("보고서 데이터 로드 실패");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [organizationId]);

  /* ─── Load snapshot sections when version selected ─── */
  useEffect(() => {
    if (!selectedVersion) return;

    let cancelled = false;

    async function loadSnapshot() {
      setLoading(true);
      try {
        const res = await fetchReportSnapshot(organizationId, selectedVersion);
        if (cancelled) return;

        if (res.success) {
          const snapshotSections = res.data.sectionsJson as ReportSection[];
          setSections(snapshotSections);
        } else {
          toast.error("스냅샷 로드 실패");
        }
      } catch {
        if (!cancelled) toast.error("스냅샷 로드 실패");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadSnapshot();
    return () => { cancelled = true; };
  }, [organizationId, selectedVersion]);

  /* ─── Reload live data when "현재" is selected ─── */
  const handleVersionChange = useCallback(
    (version: string) => {
      setSelectedVersion(version);
      if (!version) {
        // Reload live sections
        let cancelled = false;
        setLoading(true);

        void (async () => {
          try {
            const res = await fetchReportSections(organizationId);
            if (cancelled) return;
            if (res.success) {
              setSections(res.data.sections);
            }
          } catch {
            if (!cancelled) toast.error("보고서 섹션 로드 실패");
          } finally {
            if (!cancelled) setLoading(false);
          }
        })();

        return () => { cancelled = true; };
      }
    },
    [organizationId],
  );

  /* ─── Export markdown ─── */
  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const md = await exportReportMarkdown(
        organizationId,
        selectedVersion || undefined,
      );

      const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${organizationId}-report${selectedVersion ? `-${selectedVersion}` : ""}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("Markdown 내보내기 완료");
    } catch {
      toast.error("Markdown 내보내기 실패");
    } finally {
      setExporting(false);
    }
  }, [organizationId, selectedVersion]);

  /* ─── Loading state ─── */
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div
          className="animate-spin w-6 h-6 border-2 border-t-transparent rounded-full"
          style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }}
        />
        <span
          className="ml-3 text-sm"
          style={{ color: "var(--text-secondary)" }}
        >
          보고서 데이터 로딩 중...
        </span>
      </div>
    );
  }

  /* ─── Empty state ─── */
  if (sections.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          이 조직에 대한 보고서 섹션이 아직 등록되지 않았어요.
        </p>
        <p
          className="text-xs mt-2"
          style={{ color: "var(--text-secondary)" }}
        >
          <code className="px-1 py-0.5 rounded" style={{ backgroundColor: "var(--bg-secondary)" }}>
            POST /api/reports/sections/seed
          </code>
          {" "}API를 사용하여 보고서 콘텐츠를 등록해 주세요.
        </p>
      </div>
    );
  }

  /* ─── Main render ─── */
  return (
    <>
      {/* ─── Toolbar: version selector + export ─── */}
      <div
        className="flex items-center justify-between gap-3 mb-6 p-3 rounded-lg border"
        style={{
          borderColor: "var(--border)",
          backgroundColor: "var(--bg-secondary)",
        }}
      >
        <div className="flex items-center gap-2">
          <History className="w-4 h-4" style={{ color: "var(--text-secondary)" }} />
          <select
            className="text-sm rounded-md border px-2 py-1"
            style={{
              borderColor: "var(--border)",
              backgroundColor: "var(--bg-primary)",
              color: "var(--text-primary)",
            }}
            value={selectedVersion}
            onChange={(e) => handleVersionChange(e.target.value)}
          >
            <option value="">
              현재 (Live)
            </option>
            {snapshots.map((s) => (
              <option key={s.version} value={s.version}>
                {s.version}
                {s.title ? ` — ${s.title}` : ""}
                {` (${new Date(s.createdAt).toLocaleDateString("ko-KR")})`}
              </option>
            ))}
          </select>
          {selectedVersion && (
            <span
              className="text-xs px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: "color-mix(in srgb, #f59e0b 15%, transparent)",
                color: "#f59e0b",
              }}
            >
              스냅샷
            </span>
          )}
        </div>

        <button
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md border transition-colors"
          style={{
            borderColor: "var(--border)",
            color: "var(--text-primary)",
          }}
          onClick={() => void handleExport()}
          disabled={exporting}
        >
          <Download className="w-4 h-4" />
          {exporting ? "내보내는 중..." : "Markdown 내보내기"}
        </button>
      </div>

      {/* ─── Report sections ─── */}
      {sections.map((section) => (
        <section key={section.sectionId || section.sectionKey} className="mb-8">
          <SectionHeader
            icon={resolveIcon(section.iconName)}
            title={section.title}
            subtitle={section.subtitle ?? ""}
          />
          {renderSectionContent(section)}
        </section>
      ))}
    </>
  );
}
