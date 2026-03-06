import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Download, FileJson, FileText, FileSpreadsheet } from 'lucide-react';
import type { ExportPackage } from '@/api/export';

interface PackageListProps {
  packages: ExportPackage[];
  onDownloadApiSpec: (packageId: string) => void;
  onDownloadTableSpec: (packageId: string) => void;
  onDownloadReport: (packageId: string) => void;
  onDownloadSummary: (packageId: string) => void;
  onSelectPackage?: (pkg: ExportPackage) => void;
}

function statusBadge(status: string) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    draft: { bg: 'rgba(107, 114, 128, 0.1)', color: '#6B7280', label: 'Draft' },
    pending_approval: { bg: 'rgba(245, 158, 11, 0.1)', color: '#D97706', label: 'Pending Approval' },
    approved: { bg: 'rgba(34, 197, 94, 0.1)', color: '#16A34A', label: 'Approved' },
    exported: { bg: 'rgba(59, 130, 246, 0.1)', color: '#2563EB', label: 'Exported' },
  };
  const s = map[status] ?? map["draft"] ?? { bg: 'rgba(107, 114, 128, 0.1)', color: '#6B7280', label: 'Draft' };
  return (
    <Badge className="text-[10px]" style={{ backgroundColor: s.bg, color: s.color, border: 'none' }}>
      {s.label}
    </Badge>
  );
}

export function PackageList({
  packages,
  onDownloadApiSpec,
  onDownloadTableSpec,
  onDownloadReport,
  onDownloadSummary,
  onSelectPackage,
}: PackageListProps) {
  if (packages.length === 0) {
    return (
      <div className="py-8 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
        No export packages created yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {packages.map((pkg) => (
        <Card
          key={pkg.packageId}
          className="shadow-sm cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => onSelectPackage?.(pkg)}
        >
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-semibold font-mono" style={{ color: 'var(--text-primary)' }}>
                    {pkg.packageId.slice(0, 8)}...
                  </span>
                  {statusBadge(pkg.status)}
                </div>
                <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  <span>{pkg.apiSpecCount} APIs</span>
                  <span>{pkg.tableSpecCount} Tables</span>
                  <span>{pkg.gapCount} Gaps</span>
                  <span>|</span>
                  <span>{new Date(pkg.createdAt).toLocaleString('ko-KR')}</span>
                </div>
                {pkg.approvedBy && (
                  <div className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                    Approved by {pkg.approvedBy} at {pkg.approvedAt ? new Date(pkg.approvedAt).toLocaleString('ko-KR') : ''}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" size="icon" title="API Spec" onClick={() => onDownloadApiSpec(pkg.packageId)}>
                  <FileJson className="w-4 h-4" style={{ color: '#3B82F6' }} />
                </Button>
                <Button variant="ghost" size="icon" title="Table Spec" onClick={() => onDownloadTableSpec(pkg.packageId)}>
                  <Download className="w-4 h-4" style={{ color: '#22C55E' }} />
                </Button>
                <Button variant="ghost" size="icon" title="Report" onClick={() => onDownloadReport(pkg.packageId)}>
                  <FileText className="w-4 h-4" style={{ color: '#8B5CF6' }} />
                </Button>
                <Button variant="ghost" size="icon" title="Summary" onClick={() => onDownloadSummary(pkg.packageId)}>
                  <FileSpreadsheet className="w-4 h-4" style={{ color: '#F59E0B' }} />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
