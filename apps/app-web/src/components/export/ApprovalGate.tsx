import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, Send, Clock } from 'lucide-react';
import type { ExportPackage, ApprovalLogEntry } from '@/api/export';

interface ApprovalGateProps {
  pkg: ExportPackage;
  approvalLog: ApprovalLogEntry[];
  isPmRole: boolean;
  onRequestApproval: () => void;
  onApprove: (comment: string) => void;
  onReject: (comment: string) => void;
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
    <Badge className="text-xs" style={{ backgroundColor: s.bg, color: s.color, border: 'none' }}>
      {s.label}
    </Badge>
  );
}

export function ApprovalGate({ pkg, approvalLog, isPmRole, onRequestApproval, onApprove, onReject }: ApprovalGateProps) {
  const [comment, setComment] = useState('');

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">PM Approval Gate</CardTitle>
          {statusBadge(pkg.status)}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Package Info */}
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>APIs</span>
            <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>{pkg.apiSpecCount}</div>
          </div>
          <div>
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Tables</span>
            <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>{pkg.tableSpecCount}</div>
          </div>
          <div>
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Gaps</span>
            <div className="font-semibold" style={{ color: pkg.gapCount > 0 ? '#DC2626' : 'var(--text-primary)' }}>{pkg.gapCount}</div>
          </div>
        </div>

        {/* Action Buttons */}
        {pkg.status === 'draft' && (
          <div>
            <Button onClick={onRequestApproval} className="gap-2">
              <Send className="w-4 h-4" />
              Request Approval
            </Button>
          </div>
        )}

        {pkg.status === 'pending_approval' && !isPmRole && (
          <div className="flex items-center gap-2 p-3 rounded-lg" style={{ backgroundColor: 'rgba(245, 158, 11, 0.08)' }}>
            <Clock className="w-4 h-4" style={{ color: '#D97706' }} />
            <span className="text-sm" style={{ color: '#D97706' }}>Waiting for PM approval...</span>
          </div>
        )}

        {pkg.status === 'pending_approval' && isPmRole && (
          <div className="space-y-3 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
            <textarea
              className="w-full border rounded-lg p-3 text-sm"
              style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface, #fff)', color: 'var(--text-primary)' }}
              rows={2}
              placeholder="Approval/Rejection Comment..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            <div className="flex gap-2">
              <Button onClick={() => { onApprove(comment); setComment(''); }} className="gap-1">
                <CheckCircle className="w-4 h-4" />
                Approve
              </Button>
              <Button variant="outline" onClick={() => { onReject(comment); setComment(''); }} className="gap-1">
                <XCircle className="w-4 h-4" />
                Reject
              </Button>
            </div>
          </div>
        )}

        {pkg.status === 'approved' && (
          <div className="flex items-center gap-2 p-3 rounded-lg" style={{ backgroundColor: 'rgba(34, 197, 94, 0.08)' }}>
            <CheckCircle className="w-4 h-4" style={{ color: '#16A34A' }} />
            <span className="text-sm" style={{ color: '#16A34A' }}>
              Approved by {pkg.approvedBy ?? 'PM'} at {pkg.approvedAt ? new Date(pkg.approvedAt).toLocaleString('ko-KR') : ''}
            </span>
          </div>
        )}

        {/* Approval History */}
        {approvalLog.length > 0 && (
          <div className="border-t pt-4 space-y-2" style={{ borderColor: 'var(--border)' }}>
            <div className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Approval History</div>
            {approvalLog.map((entry, i) => {
              const actionColor = entry.action === 'approve' ? '#16A34A' : entry.action === 'reject' ? '#DC2626' : '#3B82F6';
              return (
                <div key={i} className="flex items-start gap-2 text-xs py-1.5 border-b last:border-0" style={{ borderColor: 'var(--border)' }}>
                  <div className="w-2 h-2 rounded-full mt-1 shrink-0" style={{ backgroundColor: actionColor }} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{entry.userName}</span>
                      <Badge className="text-[9px]" style={{ backgroundColor: `${actionColor}15`, color: actionColor, border: 'none' }}>
                        {entry.action}
                      </Badge>
                      <span style={{ color: 'var(--text-secondary)' }}>{new Date(entry.timestamp).toLocaleString('ko-KR')}</span>
                    </div>
                    {entry.comment && (
                      <div className="mt-0.5" style={{ color: 'var(--text-secondary)' }}>{entry.comment}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
