import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { fetchDocuments } from "@/api/ingestion";
import { fetchExtractions } from "@/api/extraction";
import type { DocumentRow } from "@/api/ingestion";
import {
  fetchAnalysisSummary,
  fetchCoreProcesses,
  fetchFindings,
  triggerAnalysis,
} from "@/api/analysis";
import type { LlmProvider, LlmTier } from "@/api/analysis";
import type {
  ExtractionSummary,
  CoreIdentification,
  DiagnosisResult,
} from "@ai-foundry/types";
import { ExtractionSummaryTab } from "@/components/analysis-report/ExtractionSummaryTab";
import { CoreProcessesTab } from "@/components/analysis-report/CoreProcessesTab";
import { DiagnosticFindingsTab } from "@/components/analysis-report/DiagnosticFindingsTab";
import { LlmModelBadge } from "@/components/analysis-report/LlmModelBadge";
import { ReanalysisPopover } from "@/components/analysis-report/ReanalysisPopover";
import { TriageView } from "@/components/analysis-report/TriageView";
import { DomainReportView } from "@/components/analysis-report/DomainReportView";
import { ProjectStatusTab } from "@/components/analysis-report/ProjectStatusTab";
import { useOrganization } from "@/contexts/OrganizationContext";

type TopView = "triage" | "report" | "detail" | "status";

export default function AnalysisReportPage() {
  const { organizationId } = useOrganization();
  const [searchParams, setSearchParams] = useSearchParams();

  // Top-level view: triage (default), report, or detail (legacy doc-level)
  const rawView = searchParams.get("view");
  const topView: TopView =
    rawView === "report" ? "report"
    : rawView === "detail" ? "detail"
    : rawView === "status" ? "status"
    : "triage";

  // Detail view state (legacy doc-level analysis)
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string>(
    searchParams.get("doc") ?? "",
  );
  const [activeTab, setActiveTab] = useState("summary");
  const [targetProcess, setTargetProcess] = useState<string | null>(null);

  const [summary, setSummary] = useState<ExtractionSummary | null>(null);
  const [coreData, setCoreData] = useState<CoreIdentification | null>(null);
  const [diagnosisData, setDiagnosisData] = useState<DiagnosisResult | null>(null);
  const [llmInfo, setLlmInfo] = useState<{ provider: string; model: string } | null>(null);

  const [loadingDocs, setLoadingDocs] = useState(true);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [loadingCore, setLoadingCore] = useState(false);
  const [loadingFindings, setLoadingFindings] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [triggering, setTriggering] = useState(false);

  // Load documents for detail view
  useEffect(() => {
    if (topView !== "detail") {
      setLoadingDocs(false);
      return;
    }
    void fetchDocuments(organizationId)
      .then((res) => {
        if (res.success) {
          setDocuments(res.data.documents);
          if (!selectedDocId) {
            const first = res.data.documents[0];
            if (first) setSelectedDocId(first.document_id);
          }
        } else {
          toast.error("문서 목록 로드 실패: " + res.error.message);
        }
      })
      .catch(() => toast.error("문서 목록 API 호출 실패"))
      .finally(() => setLoadingDocs(false));
  }, [topView, organizationId]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadAnalysisData = useCallback((docId: string) => {
    setSummary(null);
    setCoreData(null);
    setDiagnosisData(null);
    setLoadingSummary(true);
    setLoadingCore(true);
    setLoadingFindings(true);

    void fetchAnalysisSummary(organizationId, docId)
      .then((res) => {
        if (res.success) {
          setSummary(res.data);
          const d = res.data as ExtractionSummary & { llmProvider?: string; llmModel?: string };
          if (d.llmProvider) setLlmInfo({ provider: d.llmProvider, model: d.llmModel ?? "unknown" });
          else setLlmInfo(null);
        }
      })
      .catch(() => toast.error("추출 요약 API 호출 실패"))
      .finally(() => setLoadingSummary(false));

    void fetchCoreProcesses(organizationId, docId)
      .then((res) => { if (res.success) setCoreData(res.data); })
      .catch(() => toast.error("핵심 프로세스 API 호출 실패"))
      .finally(() => setLoadingCore(false));

    void fetchFindings(organizationId, docId)
      .then((res) => { if (res.success) setDiagnosisData(res.data); })
      .catch(() => toast.error("진단 소견 API 호출 실패"))
      .finally(() => setLoadingFindings(false));
  }, [organizationId]);

  useEffect(() => {
    if (topView !== "detail" || !selectedDocId) return;
    loadAnalysisData(selectedDocId);
  }, [selectedDocId, topView, loadAnalysisData]);

  const handleReanalyze = useCallback(async (provider: LlmProvider, tier: LlmTier) => {
    if (!selectedDocId || !summary) return;
    setReanalyzing(true);
    try {
      const res = await triggerAnalysis(summary.organizationId, {
        documentId: selectedDocId,
        extractionId: summary.extractionId,
        organizationId: summary.organizationId,
        preferredProvider: provider,
        preferredTier: tier,
      });
      if (res.success) {
        toast.success(`재분석 완료 (${provider} / ${tier})`);
        loadAnalysisData(selectedDocId);
      } else {
        toast.error("재분석 실패: " + res.error.message);
      }
    } catch {
      toast.error("재분석 API 호출 실패");
    } finally {
      setReanalyzing(false);
    }
  }, [selectedDocId, summary, loadAnalysisData]);

  const handleTriggerAnalysis = useCallback(async () => {
    if (!selectedDocId) return;
    setTriggering(true);
    try {
      const extRes = await fetchExtractions(organizationId, selectedDocId);
      if (!extRes.success) {
        toast.error("추출 데이터 조회 실패: " + extRes.error.message);
        return;
      }
      const completed = extRes.data.extractions.find((e) => e.status === "completed");
      if (!completed) {
        toast.error("완료된 추출이 없습니다.");
        return;
      }
      const res = await triggerAnalysis(organizationId, {
        documentId: selectedDocId,
        extractionId: completed.extractionId,
        organizationId,
      });
      if (res.success) {
        toast.success("분석 완료");
        loadAnalysisData(selectedDocId);
      } else {
        toast.error("분석 실패: " + res.error.message);
      }
    } catch {
      toast.error("분석 API 호출 실패");
    } finally {
      setTriggering(false);
    }
  }, [selectedDocId, organizationId, loadAnalysisData]);

  const handleProcessClick = useCallback((processName: string) => {
    setTargetProcess(processName);
    setActiveTab("core");
  }, []);

  const handleRefreshFindings = useCallback(() => {
    if (!selectedDocId) return;
    setLoadingFindings(true);
    void fetchFindings(organizationId, selectedDocId)
      .then((res) => { if (res.success) setDiagnosisData(res.data); })
      .catch(() => toast.error("진단 소견 API 호출 실패"))
      .finally(() => setLoadingFindings(false));
  }, [organizationId, selectedDocId]);

  function setTopView(view: TopView) {
    const params: Record<string, string> = { view };
    if (view === "detail" && selectedDocId) params["doc"] = selectedDocId;
    setSearchParams(params, { replace: true });
  }

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
            분석 리포트
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            {topView === "triage" && "문서 선별 · 분석 가치 기반 우선순위"}
            {topView === "report" && "도메인 전체 집계 · 핵심 발견사항"}
            {topView === "detail" && "문서별 3-Layer 분석"}
            {topView === "status" && "파일럿 진행 현황 · 품질 평가 · 비용 분석"}
          </p>
        </div>
        {topView === "detail" && (
          <div className="flex items-center gap-3">
            {summary && (
              <div className="flex items-center gap-2">
                <LlmModelBadge provider={llmInfo?.provider ?? null} model={llmInfo?.model ?? null} />
                <ReanalysisPopover
                  currentProvider={llmInfo?.provider}
                  currentModel={llmInfo?.model}
                  onReanalyze={handleReanalyze}
                  disabled={reanalyzing || !summary}
                />
              </div>
            )}
            <div className="w-64">
              <Select
                value={selectedDocId}
                onValueChange={(v) => {
                  setSelectedDocId(v);
                  setSearchParams({ view: "detail", doc: v }, { replace: true });
                }}
                disabled={loadingDocs}
              >
                <SelectTrigger>
                  <SelectValue placeholder="문서 선택..." />
                </SelectTrigger>
                <SelectContent>
                  {documents.map((doc) => (
                    <SelectItem key={doc.document_id} value={doc.document_id}>
                      {doc.original_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>

      {/* Top-level Tab Navigation */}
      <Tabs value={topView} onValueChange={(v) => setTopView(v as TopView)}>
        <TabsList>
          <TabsTrigger value="triage">문서 선별</TabsTrigger>
          <TabsTrigger value="report">도메인 리포트</TabsTrigger>
          <TabsTrigger value="detail">문서 상세</TabsTrigger>
          <TabsTrigger value="status">진행 현황</TabsTrigger>
        </TabsList>

        <TabsContent value="triage" className="mt-4">
          <TriageView />
        </TabsContent>

        <TabsContent value="report" className="mt-4">
          <DomainReportView />
        </TabsContent>

        <TabsContent value="detail" className="mt-4">
          {/* Inner tabs for document-level analysis */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="summary">추출 요약</TabsTrigger>
              <TabsTrigger value="core">핵심 프로세스</TabsTrigger>
              <TabsTrigger value="findings">진단 소견</TabsTrigger>
            </TabsList>

            <TabsContent value="summary" className="mt-4">
              <ExtractionSummaryTab
                data={summary}
                loading={loadingSummary}
                onProcessClick={handleProcessClick}
                onTriggerAnalysis={handleTriggerAnalysis}
                triggering={triggering}
              />
            </TabsContent>

            <TabsContent value="core" className="mt-4">
              <CoreProcessesTab
                data={coreData}
                loading={loadingCore}
                initialProcess={targetProcess}
                onTriggerAnalysis={handleTriggerAnalysis}
                triggering={triggering}
              />
            </TabsContent>

            <TabsContent value="findings" className="mt-4">
              <DiagnosticFindingsTab
                data={diagnosisData}
                loading={loadingFindings}
                documentId={selectedDocId}
                onRefresh={handleRefreshFindings}
                onTriggerAnalysis={handleTriggerAnalysis}
                triggering={triggering}
              />
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="status" className="mt-4">
          <ProjectStatusTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
