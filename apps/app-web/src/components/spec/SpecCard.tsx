import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChevronRight } from 'lucide-react';
import type { ApiSpecItem, TableSpecItem } from '@/api/spec';

interface SpecCardProps {
  spec: ApiSpecItem | TableSpecItem;
  type: 'api' | 'table';
  onClick?: () => void;
}

function classificationBadge(classification: string) {
  const map: Record<string, { bg: string; color: string }> = {
    core: { bg: 'rgba(59, 130, 246, 0.1)', color: '#2563EB' },
    'non-core': { bg: 'rgba(107, 114, 128, 0.1)', color: '#6B7280' },
    unknown: { bg: 'rgba(249, 115, 22, 0.1)', color: '#EA580C' },
  };
  const s = map[classification] ?? map["unknown"] ?? { bg: 'rgba(249, 115, 22, 0.1)', color: '#EA580C' };
  return (
    <Badge className="text-[10px]" style={{ backgroundColor: s.bg, color: s.color, border: 'none' }}>
      {classification}
    </Badge>
  );
}

export function SpecCard({ spec, type, onClick }: SpecCardProps) {
  const isApi = type === 'api';
  const apiSpec = isApi ? (spec as ApiSpecItem) : null;
  const tableSpec = !isApi ? (spec as TableSpecItem) : null;

  const title = isApi ? `${apiSpec?.httpMethod} ${apiSpec?.endpoint}` : tableSpec?.tableName ?? '';
  const subtitle = spec.sourceLocation;
  const fc = spec.factCheck;

  return (
    <Card className="shadow-sm cursor-pointer hover:shadow-md transition-shadow" onClick={onClick}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                {title}
              </span>
              {classificationBadge(spec.classification)}
            </div>
            <div className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>{subtitle}</div>
            <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
              <span>Confidence: {Math.round(spec.confidence * 100)}%</span>
              <span>|</span>
              <span>Coverage: {fc.coveragePct}%</span>
              <span>|</span>
              <span>Gaps: {fc.totalGaps}</span>
              {fc.highGaps > 0 && (
                <Badge className="text-[9px] px-1" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#DC2626', border: 'none' }}>
                  {fc.highGaps} HIGH
                </Badge>
              )}
            </div>
            {isApi && apiSpec && (
              <div className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                {apiSpec.parameters.length} params | Doc: {apiSpec.documentRef || 'N/A'}
              </div>
            )}
            {!isApi && tableSpec && (
              <div className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                {tableSpec.columns.length} columns | Doc: {tableSpec.documentRef || 'N/A'}
              </div>
            )}
          </div>
          <ChevronRight className="w-5 h-5 shrink-0 mt-1" style={{ color: 'var(--text-secondary)' }} />
        </div>
      </CardContent>
    </Card>
  );
}
