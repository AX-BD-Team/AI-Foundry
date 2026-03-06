import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { FactCheckGap } from '@/api/factcheck';

interface GapListProps {
  gaps: FactCheckGap[];
  onSelectGap?: (gap: FactCheckGap) => void;
  selectedGapId?: string | undefined;
  filterType: string;
  filterSeverity: string;
  onFilterTypeChange: (v: string) => void;
  onFilterSeverityChange: (v: string) => void;
}

const GAP_TYPE_LABELS: Record<string, string> = {
  SM: 'Schema Mismatch',
  MC: 'Missing Column',
  PM: 'Param Mismatch',
  TM: 'Type Mismatch',
  MID: 'Missing in Doc',
};

function severityBadge(severity: string) {
  const styles: Record<string, { bg: string; color: string }> = {
    HIGH: { bg: 'rgba(239, 68, 68, 0.1)', color: '#DC2626' },
    MEDIUM: { bg: 'rgba(245, 158, 11, 0.1)', color: '#D97706' },
    LOW: { bg: 'rgba(34, 197, 94, 0.1)', color: '#16A34A' },
  };
  const s = styles[severity] ?? { bg: 'rgba(107, 114, 128, 0.1)', color: '#6B7280' };
  return (
    <Badge className="text-[10px]" style={{ backgroundColor: s.bg, color: s.color, border: 'none' }}>
      {severity}
    </Badge>
  );
}

function reviewStatusBadge(status: string) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    pending: { bg: 'rgba(107, 114, 128, 0.1)', color: '#6B7280', label: '대기' },
    confirmed: { bg: 'rgba(34, 197, 94, 0.1)', color: '#16A34A', label: '확인' },
    dismissed: { bg: 'rgba(239, 68, 68, 0.1)', color: '#DC2626', label: '기각' },
    modified: { bg: 'rgba(59, 130, 246, 0.1)', color: '#2563EB', label: '수정' },
  };
  const s = map[status] ?? map["pending"] ?? { bg: 'rgba(107, 114, 128, 0.1)', color: '#6B7280', label: '대기' };
  return (
    <Badge className="text-[10px]" style={{ backgroundColor: s.bg, color: s.color, border: 'none' }}>
      {s.label}
    </Badge>
  );
}

export function GapList({
  gaps,
  onSelectGap,
  selectedGapId,
  filterType,
  filterSeverity,
  onFilterTypeChange,
  onFilterSeverityChange,
}: GapListProps) {
  const typeOptions = ['all', 'SM', 'MC', 'PM', 'TM', 'MID'];
  const severityOptions = ['all', 'HIGH', 'MEDIUM', 'LOW'];

  return (
    <div className="space-y-3">
      {/* Filter Chips */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-1">
          <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Type:</span>
          <div className="flex gap-1">
            {typeOptions.map((t) => (
              <button
                key={t}
                className="text-xs px-2 py-1 rounded-full border transition-colors"
                style={{
                  backgroundColor: filterType === t ? 'var(--primary)' : 'transparent',
                  color: filterType === t ? '#fff' : 'var(--text-secondary)',
                  borderColor: filterType === t ? 'var(--primary)' : 'var(--border)',
                }}
                onClick={() => onFilterTypeChange(t)}
              >
                {t === 'all' ? '전체' : t}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Severity:</span>
          <div className="flex gap-1">
            {severityOptions.map((s) => (
              <button
                key={s}
                className="text-xs px-2 py-1 rounded-full border transition-colors"
                style={{
                  backgroundColor: filterSeverity === s ? 'var(--primary)' : 'transparent',
                  color: filterSeverity === s ? '#fff' : 'var(--text-secondary)',
                  borderColor: filterSeverity === s ? 'var(--primary)' : 'var(--border)',
                }}
                onClick={() => onFilterSeverityChange(s)}
              >
                {s === 'all' ? '전체' : s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      {gaps.length === 0 ? (
        <div className="py-8 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
          Gap 항목이 없습니다.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead className="min-w-[300px]">Description</TableHead>
              <TableHead>Review</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {gaps.map((gap) => (
              <TableRow
                key={gap.gap_id}
                className="cursor-pointer"
                style={{
                  backgroundColor: selectedGapId === gap.gap_id ? 'rgba(59, 130, 246, 0.05)' : undefined,
                }}
                onClick={() => onSelectGap?.(gap)}
              >
                <TableCell>
                  <Badge variant="outline" className="text-[10px]">
                    {GAP_TYPE_LABELS[gap.gap_type] ?? gap.gap_type}
                  </Badge>
                </TableCell>
                <TableCell>{severityBadge(gap.severity)}</TableCell>
                <TableCell>
                  <div className="text-sm" style={{ color: 'var(--text-primary)' }}>
                    {gap.description}
                  </div>
                </TableCell>
                <TableCell>{reviewStatusBadge(gap.review_status)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
