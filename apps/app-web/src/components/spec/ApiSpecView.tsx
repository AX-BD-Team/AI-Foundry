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
import type { ApiSpecItem } from '@/api/spec';

interface ApiSpecViewProps {
  spec: ApiSpecItem;
}

export function ApiSpecView({ spec }: ApiSpecViewProps) {
  const methodColors: Record<string, string> = {
    GET: '#22C55E',
    POST: '#3B82F6',
    PUT: '#F59E0B',
    DELETE: '#EF4444',
    PATCH: '#8B5CF6',
  };
  const methodColor = methodColors[spec.httpMethod] ?? '#6B7280';

  return (
    <div className="space-y-4">
      {/* Endpoint Info */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Badge className="text-xs font-mono" style={{ backgroundColor: methodColor, color: '#fff', border: 'none' }}>
              {spec.httpMethod}
            </Badge>
            <span className="font-mono text-sm">{spec.endpoint}</span>
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
              <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Coverage</span>
              <div style={{ color: 'var(--text-primary)' }}>{spec.factCheck.coveragePct}%</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Parameters Table */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-sm">Parameters ({spec.parameters.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {spec.parameters.length === 0 ? (
            <div className="text-sm py-4 text-center" style={{ color: 'var(--text-secondary)' }}>
              No parameters
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Required</TableHead>
                  <TableHead>Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {spec.parameters.map((p, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-xs">{p.name}</TableCell>
                    <TableCell className="text-xs">{p.type}</TableCell>
                    <TableCell>
                      {p.required ? (
                        <Badge className="text-[10px]" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#DC2626', border: 'none' }}>required</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px]">optional</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">{p.source}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Response Schema */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-sm">Response Schema</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="text-xs overflow-x-auto p-3 rounded-lg" style={{ backgroundColor: 'var(--surface, #f9fafb)', color: 'var(--text-primary)' }}>
            {JSON.stringify(spec.responseSchema, null, 2)}
          </pre>
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
