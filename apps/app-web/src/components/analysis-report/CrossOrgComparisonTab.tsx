import { useEffect, useState, useMemo, useCallback } from "react";
import {
  Layers,
  Building2,
  Lightbulb,
  Star,
  Loader2,
  GitCompare,
  ArrowUpDown,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import type { CrossOrgComparison, ComparisonItem } from "@ai-foundry/types";
import {
  fetchOrganizations,
  triggerComparison,
  fetchStandardization,
} from "@/api/analysis";
import type { OrganizationSummary } from "@/api/analysis";
import { MetricCard } from "./MetricCard";
import { useOrganization } from "@/contexts/OrganizationContext";

// ── 서비스 그룹 메타데이터 ───────────────────────────────────────────

const SERVICE_GROUP_META: Record<
  string,
  { label: string; color: string; description: string }
> = {
  common_standard: {
    label: "공통 표준",
    color: "#3B82F6",
    description: "복수 조직에 공통 존재하는 표준화 대상",
  },
  org_specific: {
    label: "조직 고유",
    color: "#8B5CF6",
    description: "한 조직에만 존재하는 고유 항목",
  },
  tacit_knowledge: {
    label: "암묵지",
    color: "#F59E0B",
    description: "문서에 명시되지 않았으나 흐름에서 추론됨",
  },
  core_differentiator: {
    label: "핵심 차별",
    color: "#EF4444",
    description: "해당 조직의 경쟁 우위 요소",
  },
};

// ── 타입 ─────────────────────────────────────────────────────────────

type SortKey = "name" | "type" | "serviceGroup";

interface StandardizationCandidate {
  name: string;
  score: number;
  orgsInvolved: string[];
  note: string;
}

// ── 컴포넌트 ─────────────────────────────────────────────────────────

export function CrossOrgComparisonTab() {
  const { organizationId } = useOrganization();
  // 조직 목록
  const [organizations, setOrganizations] = useState<OrganizationSummary[]>([]);
  const [loadingOrgs, setLoadingOrgs] = useState(true);

  // 선택된 조직
  const [orgA, setOrgA] = useState("");
  const [orgB, setOrgB] = useState("");

  // 비교 결과
  const [comparison, setComparison] = useState<CrossOrgComparison | null>(null);
  const [comparing, setComparing] = useState(false);

  // 표준화 후보
  const [candidates, setCandidates] = useState<StandardizationCandidate[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);

  // 아이템 테이블 정렬/필터
  const [sortKey, setSortKey] = useState<SortKey>("serviceGroup");
  const [sortAsc, setSortAsc] = useState(true);
  const [filterGroup, setFilterGroup] = useState<string>("all");

  // 조직 목록 로드
  useEffect(() => {
    void fetchOrganizations(organizationId)
      .then((res) => {
        if (res.success) {
          setOrganizations(res.data.organizations);
          // 자동 선택: 2개 이상이면 첫 번째, 두 번째
          const first = res.data.organizations[0];
          const second = res.data.organizations[1];
          if (first) setOrgA(first.organizationId);
          if (second) setOrgB(second.organizationId);
        } else {
          toast.error("조직 목록 로드 실패");
        }
      })
      .catch(() => toast.error("조직 목록 API 호출 실패"))
      .finally(() => setLoadingOrgs(false));
  }, [organizationId]);

  // 비교 실행
  const handleCompare = useCallback(async () => {
    if (!orgA || !orgB || orgA === orgB) {
      toast.error("서로 다른 두 조직을 선택해주세요");
      return;
    }

    setComparing(true);
    setComparison(null);
    setCandidates([]);

    try {
      const res = await triggerComparison(organizationId, {
        organizationIds: [orgA, orgB],
        domain: "퇴직연금",
      });

      if (res.success) {
        setComparison(res.data);
        toast.success("조직 비교 완료");

        // 표준화 후보 조회
        setLoadingCandidates(true);
        try {
          const stdRes = await fetchStandardization(organizationId, res.data.comparisonId);
          if (stdRes.success) {
            setCandidates(stdRes.data.candidates);
          }
        } catch {
          // 표준화 후보 로드 실패는 무시
        } finally {
          setLoadingCandidates(false);
        }
      } else {
        toast.error("비교 실패: " + res.error.message);
      }
    } catch {
      toast.error("비교 API 호출 실패");
    } finally {
      setComparing(false);
    }
  }, [organizationId, orgA, orgB]);

  // 정렬 + 필터된 아이템
  const filteredItems = useMemo(() => {
    if (!comparison) return [];
    let items = [...comparison.items];
    if (filterGroup !== "all") {
      items = items.filter((i) => i.serviceGroup === filterGroup);
    }
    items.sort((a, b) => {
      const cmp = a[sortKey].localeCompare(b[sortKey]);
      return sortAsc ? cmp : -cmp;
    });
    return items;
  }, [comparison, sortKey, sortAsc, filterGroup]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  }

  // ── 로딩 상태 ──
  if (loadingOrgs) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 rounded-lg" />
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  // ── 조직 부족 ──
  if (organizations.length < 2) {
    return (
      <div
        className="flex flex-col items-center justify-center h-64 gap-2"
      >
        <Building2
          className="w-12 h-12"
          style={{ color: "var(--text-secondary)" }}
        />
        <p
          className="text-sm text-center"
          style={{ color: "var(--text-secondary)" }}
        >
          조직 간 비교에는 최소 2개 조직의 분석 결과가 필요합니다.
          <br />
          현재 분석 완료 조직: {organizations.length}개
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 조직 선택 + 비교 실행 */}
      <div
        className="p-4 rounded-lg border flex flex-wrap items-end gap-4"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="flex-1 min-w-[200px]">
          <label
            className="text-xs font-medium mb-1 block"
            style={{ color: "var(--text-secondary)" }}
          >
            조직 A
          </label>
          <Select value={orgA} onValueChange={setOrgA}>
            <SelectTrigger>
              <SelectValue placeholder="조직 선택..." />
            </SelectTrigger>
            <SelectContent>
              {organizations.map((org) => (
                <SelectItem
                  key={org.organizationId}
                  value={org.organizationId}
                  disabled={org.organizationId === orgB}
                >
                  {org.organizationId} ({org.analysisCount}건 분석)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center">
          <GitCompare
            className="w-5 h-5"
            style={{ color: "var(--text-secondary)" }}
          />
        </div>

        <div className="flex-1 min-w-[200px]">
          <label
            className="text-xs font-medium mb-1 block"
            style={{ color: "var(--text-secondary)" }}
          >
            조직 B
          </label>
          <Select value={orgB} onValueChange={setOrgB}>
            <SelectTrigger>
              <SelectValue placeholder="조직 선택..." />
            </SelectTrigger>
            <SelectContent>
              {organizations.map((org) => (
                <SelectItem
                  key={org.organizationId}
                  value={org.organizationId}
                  disabled={org.organizationId === orgA}
                >
                  {org.organizationId} ({org.analysisCount}건 분석)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          onClick={() => void handleCompare()}
          disabled={comparing || !orgA || !orgB || orgA === orgB}
        >
          {comparing ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              비교 중...
            </>
          ) : (
            <>
              <GitCompare className="w-4 h-4 mr-2" />
              비교 실행
            </>
          )}
        </Button>
      </div>

      {/* 비교 중 로딩 */}
      {comparing && (
        <div
          className="flex flex-col items-center justify-center py-16 gap-3"
        >
          <Loader2
            className="w-8 h-8 animate-spin"
            style={{ color: "#3B82F6" }}
          />
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            LLM이 두 조직의 분석 결과를 비교하고 있습니다...
          </p>
        </div>
      )}

      {/* 비교 결과 */}
      {comparison && !comparing && (
        <>
          {/* 그룹 요약 카드 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard
              icon={Layers}
              label="공통 표준"
              count={comparison.groupSummary.commonStandard}
              color="#3B82F6"
            />
            <MetricCard
              icon={Building2}
              label="조직 고유"
              count={comparison.groupSummary.orgSpecific}
              color="#8B5CF6"
            />
            <MetricCard
              icon={Lightbulb}
              label="암묵지"
              count={comparison.groupSummary.tacitKnowledge}
              color="#F59E0B"
            />
            <MetricCard
              icon={Star}
              label="핵심 차별"
              count={comparison.groupSummary.coreDifferentiator}
              color="#EF4444"
            />
          </div>

          {/* 비교 아이템 테이블 */}
          <div
            className="border rounded-lg"
            style={{ borderColor: "var(--border)" }}
          >
            <div
              className="px-4 py-3 border-b flex items-center justify-between"
              style={{ borderColor: "var(--border)" }}
            >
              <h3
                className="text-sm font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                비교 항목 ({comparison.items.length}건)
              </h3>
              <Select value={filterGroup} onValueChange={setFilterGroup}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 그룹</SelectItem>
                  {Object.entries(SERVICE_GROUP_META).map(([key, meta]) => (
                    <SelectItem key={key} value={key}>
                      {meta.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead
                    className="cursor-pointer select-none"
                    onClick={() => handleSort("name")}
                  >
                    <div className="flex items-center gap-1">
                      항목명 <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none"
                    onClick={() => handleSort("type")}
                  >
                    <div className="flex items-center gap-1">
                      유형 <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none"
                    onClick={() => handleSort("serviceGroup")}
                  >
                    <div className="flex items-center gap-1">
                      분류 <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </TableHead>
                  <TableHead>존재 조직</TableHead>
                  <TableHead>분류 근거</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.map((item, idx) => (
                  <ComparisonItemRow key={idx} item={item} />
                ))}
                {filteredItems.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center py-8"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      해당 그룹에 항목이 없습니다.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* 표준화 후보 */}
          <div
            className="border rounded-lg"
            style={{ borderColor: "var(--border)" }}
          >
            <div
              className="px-4 py-3 border-b"
              style={{ borderColor: "var(--border)" }}
            >
              <h3
                className="text-sm font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                표준화 권고
              </h3>
              <p
                className="text-xs mt-1"
                style={{ color: "var(--text-secondary)" }}
              >
                공통 항목 중 표준화 가능성이 높은 후보
              </p>
            </div>
            {loadingCandidates ? (
              <div className="p-4 space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 rounded" />
                ))}
              </div>
            ) : candidates.length === 0 ? (
              <div
                className="py-8 text-center text-sm"
                style={{ color: "var(--text-secondary)" }}
              >
                표준화 후보가 없습니다.
              </div>
            ) : (
              <div className="p-4 space-y-3">
                {candidates.map((c, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-4 p-3 rounded-lg border"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <CheckCircle2
                          className="w-4 h-4"
                          style={{ color: "#22C55E" }}
                        />
                        <span
                          className="font-medium text-sm"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {c.name}
                        </span>
                      </div>
                      <p
                        className="text-xs mt-1 ml-6"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {c.note}
                      </p>
                    </div>
                    <div className="w-32 text-right">
                      <div
                        className="text-xs mb-1"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        표준화 점수
                      </div>
                      <Progress
                        value={c.score * 100}
                        className="h-2"
                      />
                      <div
                        className="text-xs mt-1 font-medium"
                        style={{
                          color:
                            c.score >= 0.7
                              ? "#22C55E"
                              : c.score >= 0.4
                                ? "#F59E0B"
                                : "var(--text-secondary)",
                        }}
                      >
                        {(c.score * 100).toFixed(0)}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── 비교 아이템 행 ──────────────────────────────────────────────────

function ComparisonItemRow({ item }: { item: ComparisonItem }) {
  const groupMeta = SERVICE_GROUP_META[item.serviceGroup] ?? {
    label: item.serviceGroup,
    color: "#6B7280",
  };

  return (
    <TableRow>
      <TableCell
        className="font-medium"
        style={{ color: "var(--text-primary)" }}
      >
        {item.name}
      </TableCell>
      <TableCell>
        <Badge variant="outline" className="text-xs">
          {item.type}
        </Badge>
      </TableCell>
      <TableCell>
        <Badge
          className="text-xs text-white"
          style={{ backgroundColor: groupMeta.color }}
        >
          {groupMeta.label}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1">
          {item.presentIn.map((p) => (
            <Badge
              key={p.organizationId}
              variant="secondary"
              className="text-xs"
            >
              {p.organizationName}
            </Badge>
          ))}
        </div>
      </TableCell>
      <TableCell
        className="text-xs max-w-[200px] truncate"
        style={{ color: "var(--text-secondary)" }}
        title={item.classificationReason}
      >
        {item.classificationReason}
      </TableCell>
    </TableRow>
  );
}
