import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  RefreshCw,
  Target,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  createSpecPackage,
  fetchPackages,
  downloadApiSpec,
  downloadTableSpec,
  downloadReport,
  downloadSummary,
} from '@/api/export';
import type { ExportPackage, ApprovalLogEntry } from '@/api/export';
import { fetchKpi } from '@/api/factcheck';
import type { FactCheckKpi } from '@/api/factcheck';
import { CoverageCard } from '@/components/factcheck/CoverageCard';
import { ExportForm } from '@/components/export/ExportForm';
import { PackageList } from '@/components/export/PackageList';
import { ApprovalGate } from '@/components/export/ApprovalGate';
import { DeliverableTab } from '@/components/export/DeliverableTab';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useAuth } from '@/contexts/AuthContext';

const APPROVAL_LOG_KEY = 'ai-foundry-approval-log';

function loadApprovalLog(): Record<string, ApprovalLogEntry[]> {
  try {
    const raw = localStorage.getItem(APPROVAL_LOG_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, ApprovalLogEntry[]>;
  } catch {
    return {};
  }
}

function saveApprovalLog(log: Record<string, ApprovalLogEntry[]>) {
  localStorage.setItem(APPROVAL_LOG_KEY, JSON.stringify(log));
}

const PKG_STATUS_KEY = 'ai-foundry-pkg-status';

function loadPkgStatuses(): Record<string, string> {
  try {
    const raw = localStorage.getItem(PKG_STATUS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

function savePkgStatuses(statuses: Record<string, string>) {
  localStorage.setItem(PKG_STATUS_KEY, JSON.stringify(statuses));
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function ExportCenterPage() {
  const { organizationId } = useOrganization();
  const { user } = useAuth();
  const isPm = user?.userRole === 'Executive';

  const [packages, setPackages] = useState<ExportPackage[]>([]);
  const [kpi, setKpi] = useState<FactCheckKpi | null>(null);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedPkg, setSelectedPkg] = useState<ExportPackage | null>(null);
  const [approvalLogs, setApprovalLogs] = useState<Record<string, ApprovalLogEntry[]>>(loadApprovalLog);
  const [pkgStatuses, setPkgStatuses] = useState<Record<string, string>>(loadPkgStatuses);

  const loadData = async () => {
    setLoading(true);
    try {
      const [pkgRes, kpiRes] = await Promise.all([
        fetchPackages(organizationId),
        fetchKpi(organizationId),
      ]);
      if (pkgRes.success) setPackages(pkgRes.data.packages);
      if (kpiRes.success) setKpi(kpiRes.data);
    } catch {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [organizationId]);

  const handleCreate = async (description: string) => {
    setCreating(true);
    try {
      const res = await createSpecPackage(organizationId, description ? { description } : {});
      if (res.success) {
        toast.success('Spec package created');
        await loadData();
      } else {
        toast.error(res.error.message);
      }
    } catch {
      toast.error('Failed to create package');
    } finally {
      setCreating(false);
    }
  };

  const handleDownload = async (type: 'api' | 'table' | 'report' | 'summary', packageId: string) => {
    try {
      let blob: Blob;
      let filename: string;
      switch (type) {
        case 'api':
          blob = await downloadApiSpec(organizationId, packageId);
          filename = `spec-api-${packageId.slice(0, 8)}.json`;
          break;
        case 'table':
          blob = await downloadTableSpec(organizationId, packageId);
          filename = `spec-table-${packageId.slice(0, 8)}.json`;
          break;
        case 'report':
          blob = await downloadReport(organizationId, packageId);
          filename = `fact-check-report-${packageId.slice(0, 8)}.md`;
          break;
        case 'summary':
          blob = await downloadSummary(organizationId, packageId);
          filename = `spec-summary-${packageId.slice(0, 8)}.csv`;
          break;
      }
      triggerBlobDownload(blob, filename);
      toast.success(`Downloaded ${filename}`);
    } catch {
      toast.error('Download failed');
    }
  };

  // Apply local status overrides to packages
  const enrichedPackages = packages.map((pkg) => {
    const localStatus = pkgStatuses[pkg.packageId];
    if (localStatus) {
      return { ...pkg, status: localStatus as ExportPackage['status'] };
    }
    return pkg;
  });

  const addApprovalEntry = (packageId: string, entry: ApprovalLogEntry) => {
    const updated = { ...approvalLogs };
    const existing = updated[packageId] ?? [];
    updated[packageId] = [...existing, entry];
    setApprovalLogs(updated);
    saveApprovalLog(updated);
  };

  const updatePkgStatus = (packageId: string, status: string) => {
    const updated = { ...pkgStatuses, [packageId]: status };
    setPkgStatuses(updated);
    savePkgStatuses(updated);
  };

  const handleRequestApproval = () => {
    if (!selectedPkg) return;
    updatePkgStatus(selectedPkg.packageId, 'pending_approval');
    addApprovalEntry(selectedPkg.packageId, {
      action: 'request',
      userId: user?.userId ?? 'unknown',
      userName: user?.userName ?? 'Unknown',
      comment: 'Approval requested',
      timestamp: new Date().toISOString(),
    });
    setSelectedPkg({ ...selectedPkg, status: 'pending_approval' });
    toast.success('Approval requested');
  };

  const handleApprove = (comment: string) => {
    if (!selectedPkg) return;
    updatePkgStatus(selectedPkg.packageId, 'approved');
    addApprovalEntry(selectedPkg.packageId, {
      action: 'approve',
      userId: user?.userId ?? 'unknown',
      userName: user?.userName ?? 'Unknown',
      comment: comment || 'Approved',
      timestamp: new Date().toISOString(),
    });
    setSelectedPkg({
      ...selectedPkg,
      status: 'approved',
      approvedBy: user?.userName ?? null,
      approvedAt: new Date().toISOString(),
    });
    toast.success('Package approved');
  };

  const handleReject = (comment: string) => {
    if (!selectedPkg) return;
    updatePkgStatus(selectedPkg.packageId, 'draft');
    addApprovalEntry(selectedPkg.packageId, {
      action: 'reject',
      userId: user?.userId ?? 'unknown',
      userName: user?.userName ?? 'Unknown',
      comment: comment || 'Rejected',
      timestamp: new Date().toISOString(),
    });
    setSelectedPkg({ ...selectedPkg, status: 'draft', rejectReason: comment || 'Rejected' });
    toast.error('Package rejected');
  };

  // Enrich selected package with local status
  const enrichedSelectedPkg = selectedPkg
    ? enrichedPackages.find((p) => p.packageId === selectedPkg.packageId) ?? selectedPkg
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Export 센터 Export Center
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Spec 패키지 · SI 산출물 다운로드 및 PM 승인
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void loadData()} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1${loading ? ' animate-spin' : ''}`} />
          새로고침
        </Button>
      </div>

      <Tabs defaultValue="spec-package">
        <TabsList>
          <TabsTrigger value="spec-package">Spec Package</TabsTrigger>
          <TabsTrigger value="si-deliverables">SI 산출물</TabsTrigger>
        </TabsList>

        <TabsContent value="spec-package">
          {/* KPI Dashboard */}
          {kpi && (
            <div className="space-y-3 mt-4">
              <h2 className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>KPI Dashboard</h2>
              <div className="grid grid-cols-5 gap-3">
                <CoverageCard
                  label="API Coverage"
                  labelEn="Critical API"
                  value={kpi.apiCoverage}
                  target={kpi.apiCoverageTarget}
                  pass={kpi.apiCoveragePass}
                  icon={<Target className="w-8 h-8" />}
                />
                <CoverageCard
                  label="Table Coverage"
                  labelEn="Critical Table"
                  value={kpi.tableCoverage}
                  target={kpi.tableCoverageTarget}
                  pass={kpi.tableCoveragePass}
                  icon={<Target className="w-8 h-8" />}
                />
                <CoverageCard
                  label="Gap Precision"
                  labelEn="Actual Gap / Auto Gap"
                  value={kpi.gapPrecision}
                  target={kpi.gapPrecisionTarget}
                  pass={kpi.gapPrecisionPass}
                  icon={<CheckCircle className="w-8 h-8" />}
                />
                <CoverageCard
                  label="Reviewer Accept"
                  labelEn="Acceptance Rate"
                  value={kpi.reviewerAcceptance}
                  target={kpi.reviewerAcceptanceTarget}
                  pass={kpi.reviewerAcceptancePass}
                  icon={<CheckCircle className="w-8 h-8" />}
                />
                <CoverageCard
                  label="Edit Time Cut"
                  labelEn="Time Reduction"
                  value={kpi.specEditTimeReduction}
                  target={kpi.specEditTimeReductionTarget}
                  pass={kpi.specEditTimeReductionPass}
                  icon={<XCircle className="w-8 h-8" />}
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-12 gap-6 mt-4">
            {/* Left: Form + Package List */}
            <div className="col-span-7 space-y-4">
              <ExportForm onSubmit={handleCreate} creating={creating} />

              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">
                    Spec 패키지
                    <Badge variant="outline" className="ml-2 text-xs">{enrichedPackages.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <PackageList
                    packages={enrichedPackages}
                    onDownloadApiSpec={(id) => void handleDownload('api', id)}
                    onDownloadTableSpec={(id) => void handleDownload('table', id)}
                    onDownloadReport={(id) => void handleDownload('report', id)}
                    onDownloadSummary={(id) => void handleDownload('summary', id)}
                    onSelectPackage={(pkg) => setSelectedPkg(pkg)}
                  />
                </CardContent>
              </Card>
            </div>

            {/* Right: Approval Gate */}
            <div className="col-span-5">
              {enrichedSelectedPkg ? (
                <ApprovalGate
                  pkg={enrichedSelectedPkg}
                  approvalLog={approvalLogs[enrichedSelectedPkg.packageId] ?? []}
                  isPmRole={isPm}
                  onRequestApproval={handleRequestApproval}
                  onApprove={handleApprove}
                  onReject={handleReject}
                />
              ) : (
                <Card className="shadow-sm">
                  <CardContent className="p-12 text-center">
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      패키지를 선택하면 승인 현황을 볼 수 있습니다.
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="si-deliverables">
          <DeliverableTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
