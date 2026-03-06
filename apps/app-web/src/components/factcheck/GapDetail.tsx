import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, Edit3 } from 'lucide-react';
import type { FactCheckGap } from '@/api/factcheck';

interface GapDetailProps {
  gap: FactCheckGap;
  onReview: (gapId: string, action: 'confirm' | 'dismiss' | 'modify', comment?: string) => void;
  reviewerRole?: boolean;
  reviewing?: boolean;
}

function tryParseJson(str: string | null): Record<string, unknown> | null {
  if (str === null) return null;
  try {
    return JSON.parse(str) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function ItemDisplay({ title, data, raw }: { title: string; data: Record<string, unknown> | null; raw: string | null }) {
  if (data === null && raw === null) {
    return (
      <div className="flex-1 p-4 rounded-lg" style={{ backgroundColor: 'rgba(239, 68, 68, 0.05)' }}>
        <div className="text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>{title}</div>
        <div className="text-sm italic" style={{ color: '#DC2626' }}>
          (Missing / Not found)
        </div>
      </div>
    );
  }
  return (
    <div className="flex-1 p-4 rounded-lg" style={{ backgroundColor: 'var(--surface, #f9fafb)' }}>
      <div className="text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>{title}</div>
      {data !== null ? (
        <pre className="text-xs overflow-x-auto whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>
          {JSON.stringify(data, null, 2)}
        </pre>
      ) : (
        <div className="text-sm" style={{ color: 'var(--text-primary)' }}>{raw}</div>
      )}
    </div>
  );
}

export function GapDetail({ gap, onReview, reviewerRole, reviewing }: GapDetailProps) {
  const [comment, setComment] = useState('');
  const sourceData = tryParseJson(gap.source_item);
  const docData = tryParseJson(gap.document_item);

  const severityColor: Record<string, { bg: string; color: string }> = {
    HIGH: { bg: 'rgba(239, 68, 68, 0.1)', color: '#DC2626' },
    MEDIUM: { bg: 'rgba(245, 158, 11, 0.1)', color: '#D97706' },
    LOW: { bg: 'rgba(34, 197, 94, 0.1)', color: '#16A34A' },
  };
  const sc = severityColor[gap.severity] ?? severityColor["MEDIUM"] ?? { bg: 'rgba(245, 158, 11, 0.1)', color: '#D97706' };

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Gap Detail</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px]">{gap.gap_type}</Badge>
            <Badge className="text-[10px]" style={{ backgroundColor: sc.bg, color: sc.color, border: 'none' }}>
              {gap.severity}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Description */}
        <div>
          <div className="text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Description</div>
          <div className="text-sm" style={{ color: 'var(--text-primary)' }}>{gap.description}</div>
        </div>

        {/* Evidence */}
        {gap.evidence && (
          <div>
            <div className="text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Evidence</div>
            <div className="text-sm" style={{ color: 'var(--text-primary)' }}>{gap.evidence}</div>
          </div>
        )}

        {/* Source vs Document Side-by-Side */}
        <div className="flex gap-4">
          <ItemDisplay title="Source (Code)" data={sourceData} raw={gap.source_item} />
          <ItemDisplay title="Document (Spec)" data={docData} raw={gap.document_item} />
        </div>

        {/* Review Actions */}
        {reviewerRole && gap.review_status === 'pending' && (
          <div className="border-t pt-4 space-y-3" style={{ borderColor: 'var(--border)' }}>
            <div className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Review Actions</div>
            <textarea
              className="w-full border rounded-lg p-3 text-sm"
              style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface, #fff)', color: 'var(--text-primary)' }}
              rows={2}
              placeholder="Comment (optional)"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={reviewing}
                onClick={() => onReview(gap.gap_id, 'confirm', comment || undefined)}
                className="gap-1"
              >
                <CheckCircle className="w-4 h-4" />
                Confirm
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={reviewing}
                onClick={() => onReview(gap.gap_id, 'dismiss', comment || undefined)}
                className="gap-1"
              >
                <XCircle className="w-4 h-4" />
                Dismiss
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={reviewing}
                onClick={() => onReview(gap.gap_id, 'modify', comment || undefined)}
                className="gap-1"
              >
                <Edit3 className="w-4 h-4" />
                Modify
              </Button>
            </div>
          </div>
        )}

        {/* Review result */}
        {gap.review_status !== 'pending' && (
          <div className="border-t pt-4" style={{ borderColor: 'var(--border)' }}>
            <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Reviewed by {gap.reviewer_id ?? 'N/A'} at {gap.reviewed_at ? new Date(gap.reviewed_at).toLocaleString('ko-KR') : 'N/A'}
            </div>
            {gap.reviewer_comment && (
              <div className="text-sm mt-1" style={{ color: 'var(--text-primary)' }}>{gap.reviewer_comment}</div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
