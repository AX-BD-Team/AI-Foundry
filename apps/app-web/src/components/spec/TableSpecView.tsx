import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { TableSpecItem } from '@/api/spec';

interface TableSpecViewProps {
  spec: TableSpecItem;
}

export function TableSpecView({ spec }: TableSpecViewProps) {
  return (
    <div className="space-y-4">
      {/* Table Info */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <span className="font-mono text-sm">{spec.tableName}</span>
            <Badge
              className="text-[10px]"
              style={{
                backgroundColor: spec.classification === 'core' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(107, 114, 128, 0.1)',
                color: spec.classification === 'core' ? '#2563EB' : '#6B7280',
                border: 'none',
              }}
            >
              {spec.classification}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Source Location</span>
              <div style={{ color: 'var(--text-primary)' }}>{spec.sourceLocation}</div>
            </div>
            <div>
              <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Document Reference</span>
              <div style={{ color: 'var(--text-primary)' }}>{spec.documentRef || 'N/A'}</div>
            </div>
            <div>
              <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Confidence</span>
              <div style={{ color: 'var(--text-primary)' }}>{Math.round(spec.confidence * 100)}%</div>
            </div>
            <div>
              <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Columns</span>
              <div style={{ color: 'var(--text-primary)' }}>{spec.columns.length}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Columns Table */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-sm">Columns ({spec.columns.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {spec.columns.length === 0 ? (
            <div className="text-sm py-4 text-center" style={{ color: 'var(--text-secondary)' }}>
              No columns
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Nullable</TableHead>
                  <TableHead>PK</TableHead>
                  <TableHead>FK</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {spec.columns.map((col, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-xs">{col.name}</TableCell>
                    <TableCell className="text-xs">{col.type}</TableCell>
                    <TableCell>
                      {col.nullable ? (
                        <Badge variant="outline" className="text-[10px]">YES</Badge>
                      ) : (
                        <Badge className="text-[10px]" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#DC2626', border: 'none' }}>NOT NULL</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {col.pk && (
                        <Badge className="text-[10px]" style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', color: '#D97706', border: 'none' }}>PK</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs font-mono">
                      {col.fk ?? ''}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Fact Check Reference */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-sm">Fact Check</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6 text-sm">
            <div>
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Total Gaps</span>
              <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>{spec.factCheck.totalGaps}</div>
            </div>
            <div>
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>High Gaps</span>
              <div className="font-semibold" style={{ color: spec.factCheck.highGaps > 0 ? '#DC2626' : 'var(--text-primary)' }}>
                {spec.factCheck.highGaps}
              </div>
            </div>
            <div>
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Coverage</span>
              <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>{spec.factCheck.coveragePct}%</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
