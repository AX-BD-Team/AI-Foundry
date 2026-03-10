import { useEffect, useState } from "react";
import {
  FileText,
  ShieldCheck,
  BookOpen,
  Puzzle,
  TrendingUp,
  Search,
  Target,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Layers,
} from "lucide-react";
import { toast } from "sonner";
import { MetricCard } from "./MetricCard";
import { SectionHeader, SourceFileInfo } from "./StatusReportWidgets";
import { CollapsibleSection } from "./CollapsibleSection";
import { ScoreGauge } from "./ScoreGauge";
import { ReadinessBar } from "./ReadinessBar";
import { DynamicStatusReport } from "./DynamicStatusReport";
import { FactCheckAnalysisSection } from "./FactCheckAnalysisSection";
import { fetchDocuments } from "@/api/ingestion";
import { fetchPolicies } from "@/api/policy";
import { fetchSkills } from "@/api/skill";
import { fetchTermsStats } from "@/api/ontology";
import { useOrganization } from "@/contexts/OrganizationContext";

/* ═══ Pipeline counts from each service DB ═══ */
interface PipelineCounts {
  totalDocs: number;
  approvedPolicies: number;
  totalPolicies: number;
  totalTerms: number;
  totalSkills: number;
}

/* ═══ Org-specific source file info ═══ */
interface OrgSourceInfo {
  leftCount: string;
  leftLabel: string;
  leftSub: string;
  rightCount: string;
  rightLabel: string;
  rightSub: string;
  hitlCount?: string;
  hitlSub?: string;
}

function getSourceInfo(orgId: string): OrgSourceInfo | null {
  switch (orgId) {
    case "Miraeasset":
    case "org-mirae-pension":
      return {
        leftCount: "1,034",
        leftLabel: "전체 소스 파일",
        leftSub: "미래에셋 787 + 현대해상/LLM 247",
        rightCount: "787",
        rightLabel: "파일럿 대상",
        rightSub: "미래에셋 퇴직연금 문서만 분석",
        hitlCount: "18건",
        hitlSub: "BN 4 · WD 3 · CT 2 · EN 3 · TR 2 · CL 1 · RG 3",
      };
    case "LPON":
      return {
        leftCount: "215",
        leftLabel: "전체 소스 파일",
        leftSub: "Wave 1: 88건 + Wave 2 Archive: 127건",
        rightCount: "88",
        rightLabel: "Wave 1 분석 완료",
        rightSub: "전자식 온누리상품권 플랫폼 문서",
        hitlCount: "333건",
        hitlSub: "벌크 승인 운영 검증 완료",
      };
    default:
      return null;
  }
}

/* ═══ Compute readiness score from pipeline data ═══ */
function computeScore(counts: PipelineCounts): number {
  // Weighted scoring: pipeline completion metrics
  const parsingScore = counts.totalDocs > 0 ? 95 : 0; // 96.6% success → ~95
  const policyScore = counts.totalPolicies > 0
    ? Math.round((counts.approvedPolicies / counts.totalPolicies) * 100)
    : 0;
  const termScore = counts.totalTerms > 100 ? 90 : counts.totalTerms > 0 ? 50 : 0;
  const skillScore = counts.totalSkills > 100 ? 85 : counts.totalSkills > 0 ? 50 : 0;

  // Weighted average: policy quality matters most
  return Math.round(
    parsingScore * 0.15 +
    policyScore * 0.35 +
    termScore * 0.25 +
    skillScore * 0.25,
  );
}

/* ═══ Main Component ═══ */
export function ProjectStatusTab() {
  const { organizationId } = useOrganization();
  const [counts, setCounts] = useState<PipelineCounts | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [docsRes, approvedRes, allPolRes, termsRes, skillsRes] = await Promise.all([
          fetchDocuments(organizationId, 1),
          fetchPolicies(organizationId, { status: "approved", limit: 1 }),
          fetchPolicies(organizationId, { limit: 1 }),
          fetchTermsStats(organizationId),
          fetchSkills(organizationId, { limit: 1 }),
        ]);
        if (cancelled) return;
        setCounts({
          totalDocs: docsRes.success ? docsRes.data.total : 0,
          approvedPolicies: approvedRes.success ? approvedRes.data.total : 0,
          totalPolicies: allPolRes.success ? allPolRes.data.total : 0,
          totalTerms: termsRes.success ? termsRes.data.totalTerms : 0,
          totalSkills: skillsRes.success ? skillsRes.data.total : 0,
        });
      } catch {
        if (!cancelled) toast.error("현황 데이터 로드 실패");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [organizationId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-6 h-6 border-2 border-t-transparent rounded-full"
          style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} />
        <span className="ml-3 text-sm" style={{ color: "var(--text-secondary)" }}>
          현황 데이터 로딩 중...
        </span>
      </div>
    );
  }

  const totalDocs = counts?.totalDocs ?? 0;
  const approvedPolicies = counts?.approvedPolicies ?? 0;
  const totalPolicies = counts?.totalPolicies ?? 0;
  const totalTerms = counts?.totalTerms ?? 0;
  const totalSkills = counts?.totalSkills ?? 0;
  const approvalRate = totalPolicies > 0 ? approvedPolicies / totalPolicies : 0;
  const score = counts ? computeScore(counts) : 0;
  const sourceInfo = getSourceInfo(organizationId);

  return (
    <div className="space-y-6">
      {/* ═══════════════════════════════════════════════════════
       * LEVEL 1: Executive Summary — 항상 보임 (above the fold)
       * ═══════════════════════════════════════════════════════ */}
      <section
        className="p-6 rounded-xl border-2"
        style={{
          borderColor: "var(--accent)",
          backgroundColor: "color-mix(in srgb, var(--accent) 3%, transparent)",
        }}
      >
        {/* Headline */}
        <div className="flex items-center gap-2 mb-1">
          <Target className="w-5 h-5" style={{ color: "var(--accent)" }} />
          <h2 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>
            이 분석 결과, 쓸 수 있는가?
          </h2>
        </div>
        <p className="text-sm mb-5" style={{ color: "var(--text-secondary)" }}>
          SI 산출물에서 추출한 비즈니스 정책·용어·Skill은 <strong style={{ color: "var(--text-primary)" }}>즉시 활용 가능</strong>.
          시스템 통합 설계는 전문가 보완 필요.
        </p>

        {/* Score Gauge + Readiness Bar + Key Numbers */}
        <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-6 items-center">
          {/* Gauge */}
          <div className="flex justify-center">
            <ScoreGauge score={score} label="활용 준비도" />
          </div>

          {/* Right side: traffic light + key numbers */}
          <div className="space-y-4">
            <ReadinessBar segments={[
              { label: "즉시 활용", pct: 50, color: "#10b981", icon: "✅" },
              { label: "보완 후 활용", pct: 33, color: "#f59e0b", icon: "⚠️" },
              { label: "AI 한계", pct: 17, color: "#ef4444", icon: "❌" },
            ]} />

            {/* Traffic light cards */}
            <div className="grid grid-cols-3 gap-2">
              <TrafficCard
                icon={CheckCircle2}
                color="#10b981"
                title="즉시 활용"
                items={["정책 848건", "용어 사전", "Skill 859건"]}
              />
              <TrafficCard
                icon={AlertTriangle}
                color="#f59e0b"
                title="보완 후 활용"
                items={["커버리지 31%", "프로세스 복원"]}
              />
              <TrafficCard
                icon={XCircle}
                color="#ef4444"
                title="별도 작업"
                items={["시스템 설계", "비기능 요건"]}
              />
            </div>
          </div>
        </div>

        {/* AI vs AI+전문가 비교 */}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <ComparisonCard
            label="AI만 사용"
            items={["비즈니스 정책 80~90%", "용어 사전 90~95%", "Skill 패키지 85~90%"]}
            summary="정책·용어·Skill은 AI만으로 즉시 활용 가능"
            color="#10b981"
          />
          <ComparisonCard
            label="AI + 전문가"
            items={["소스코드 문서화 →60~70%↑", "프로세스 흐름도 →60~70%↑", "시스템 통합 →80~90%↑"]}
            summary="문서 보완·설계는 전문가 협업으로 품질 향상"
            color="#3b82f6"
          />
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
       * LEVEL 2: 핵심 지표 — 접기/펼치기 가능
       * ═══════════════════════════════════════════════════════ */}
      <CollapsibleSection
        icon={TrendingUp}
        title="파이프라인 현황"
        subtitle="5-Stage Core Engine 실행 결과 요약"
        defaultOpen
      >
        {/* 소스 파일 → 파이프라인 흐름 */}
        {sourceInfo && (
          <div className="p-4 rounded-lg border mb-4" style={{
            borderColor: "var(--border)",
            backgroundColor: "color-mix(in srgb, var(--accent) 5%, transparent)",
          }}>
            <div className="flex items-center gap-2 mb-3">
              <FileText className="w-4 h-4" style={{ color: "var(--accent)" }} />
              <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                소스 파일 현황
              </span>
            </div>
            <SourceFileInfo {...sourceInfo} />
          </div>
        )}

        {/* 파이프라인 산출물 — MetricCard with explanations */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard icon={FileText} label="시스템 등록 문서" count={totalDocs} color="#3b82f6"
            explanation="파이프라인에 투입된 총 문서 수" />
          <MetricCard icon={ShieldCheck} label="정책 (Approved)" count={approvedPolicies} color="#10b981"
            explanation="조건-기준-결과 트리플로 구조화된 업무 규칙" />
          <MetricCard icon={BookOpen} label="온톨로지 용어" count={totalTerms} color="#8b5cf6"
            explanation="도메인 특화 용어 사전 — SKOS/JSON-LD 체계" />
          <MetricCard icon={Puzzle} label="Skill 패키지" count={totalSkills} color="#f59e0b"
            explanation="MCP/OpenAPI로 배포 가능한 AI Skill 단위" />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
          <div className="p-3 rounded-lg border" style={{ borderColor: "var(--border)" }}>
            <div className="text-xs" style={{ color: "var(--text-secondary)" }}>정책 승인율</div>
            <div className="text-xl font-bold" style={{ color: "#10b981" }}>
              {(approvalRate * 100).toFixed(1)}%
            </div>
            <div className="text-[0.65rem]" style={{ color: "var(--text-secondary)" }}>
              HITL 검토를 통과한 정책의 비율
            </div>
          </div>
          <div className="p-3 rounded-lg border" style={{ borderColor: "var(--border)" }}>
            <div className="text-xs" style={{ color: "var(--text-secondary)" }}>전체 정책</div>
            <div className="text-xl font-bold" style={{ color: "#3b82f6" }}>
              {totalPolicies.toLocaleString()}건
            </div>
            <div className="text-[0.65rem]" style={{ color: "var(--text-secondary)" }}>
              candidate {(totalPolicies - approvedPolicies).toLocaleString()} 포함
            </div>
          </div>
          {sourceInfo?.hitlCount && (
            <div className="p-3 rounded-lg border" style={{ borderColor: "var(--border)" }}>
              <div className="text-xs" style={{ color: "var(--text-secondary)" }}>HITL 리뷰</div>
              <div className="text-xl font-bold" style={{ color: "#f59e0b" }}>
                {sourceInfo.hitlCount}
              </div>
              {sourceInfo.hitlSub && (
                <div className="text-[0.65rem]" style={{ color: "var(--text-secondary)" }}>
                  {sourceInfo.hitlSub}
                </div>
              )}
            </div>
          )}
        </div>
      </CollapsibleSection>

      {/* ═══ FactCheck 커버리지 — 접기/펼치기 ═══ */}
      <CollapsibleSection
        icon={Search}
        title="FactCheck 커버리지 분석"
        subtitle="소스코드↔문서 API 매칭 현황 및 도메인별 갭 분석"
      >
        <FactCheckAnalysisSection organizationId={organizationId} embedded />
      </CollapsibleSection>

      {/* ═══════════════════════════════════════════════════════
       * LEVEL 3: 상세 보고서 — 접기/펼치기 (DynamicStatusReport)
       * ═══════════════════════════════════════════════════════ */}
      <CollapsibleSection
        icon={Layers}
        title="상세 분석 보고서"
        subtitle="종합 판정 · 품질 평가 · 비용 분석 · 향후 과제"
      >
        <DynamicStatusReport organizationId={organizationId} />
      </CollapsibleSection>
    </div>
  );
}

/* ═══ Sub-components ═══ */

function TrafficCard({ icon: Icon, color, title, items }: {
  icon: React.ElementType;
  color: string;
  title: string;
  items: string[];
}) {
  return (
    <div
      className="p-3 rounded-lg border"
      style={{ borderColor: color, borderLeftWidth: 3, backgroundColor: `color-mix(in srgb, ${color} 5%, transparent)` }}
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon className="w-3.5 h-3.5" style={{ color }} />
        <span className="text-xs font-semibold" style={{ color }}>{title}</span>
      </div>
      {items.map((item, i) => (
        <div key={i} className="text-[0.65rem]" style={{ color: "var(--text-secondary)" }}>
          {item}
        </div>
      ))}
    </div>
  );
}

function ComparisonCard({ label, items, summary, color }: {
  label: string;
  items: string[];
  summary: string;
  color: string;
}) {
  return (
    <div className="p-3 rounded-lg border" style={{ borderColor: "var(--border)" }}>
      <div
        className="text-xs font-semibold mb-2 px-2 py-0.5 rounded inline-block"
        style={{ backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`, color }}
      >
        {label}
      </div>
      {items.map((item, i) => (
        <div key={i} className="text-xs mb-0.5" style={{ color: "var(--text-secondary)" }}>
          · {item}
        </div>
      ))}
      <div className="mt-2 pt-2 border-t text-[0.65rem] font-medium" style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}>
        {summary}
      </div>
    </div>
  );
}
