import { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { CheckCircle, XCircle, MessageSquare, AlertTriangle, Clock, User } from 'lucide-react';
import { toast } from 'sonner';
import { fetchPolicies, approvePolicy, rejectPolicy } from '@/api/policy';
import { useOrganization } from '@/contexts/OrganizationContext';

interface PolicyItem {
  id: string;
  policyCode: string;
  title: string;
  condition: string;
  criteria: string;
  outcome: string;
  status: string;
  tags: string[];
  createdAt: string;
}

export default function HITLReviewPage() {
  const { organizationId } = useOrganization();
  const [policies, setPolicies] = useState<PolicyItem[]>([]);
  const [selectedPolicy, setSelectedPolicy] = useState<PolicyItem | null>(null);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(true);

  const loadPolicies = async () => {
    setLoading(true);
    try {
      const res = await fetchPolicies(organizationId, { status: 'candidate', limit: 50 });
      if (res.success) {
        setPolicies(res.data.policies);
        const first = res.data.policies[0];
        if (first) setSelectedPolicy(first);
      }
    } catch {
      toast.error('정책 목록을 불러올 수 없습니다');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadPolicies(); }, []);

  const handleApprove = async () => {
    if (!selectedPolicy) return;
    try {
      const res = await approvePolicy(organizationId, selectedPolicy.id, { reviewerId: 'reviewer-001', comment });
      if (res.success) {
        toast.success(`${selectedPolicy.policyCode} 승인 완료`);
        setComment('');
        void loadPolicies();
      }
    } catch {
      toast.error('승인 처리 중 오류 발생');
    }
  };

  const handleReject = async () => {
    if (!selectedPolicy) return;
    try {
      const res = await rejectPolicy(organizationId, selectedPolicy.id, { reviewerId: 'reviewer-001', comment });
      if (res.success) {
        toast.success(`${selectedPolicy.policyCode} 반려 완료`);
        setComment('');
        void loadPolicies();
      }
    } catch {
      toast.error('반려 처리 중 오류 발생');
    }
  };

  const getPriorityColor = (tags: string[]) => {
    if (tags.includes('urgent')) return 'var(--danger)';
    if (tags.includes('important')) return 'var(--accent)';
    return '#3B82F6';
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          HITL 검토 Human-in-the-Loop Review
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          AI 추론 정책의 전문가 검토 및 승인
        </p>
      </div>

      <div className="grid grid-cols-[40%_60%] gap-6 h-[calc(100vh-12rem)]">
        {/* Review Queue */}
        <div className="space-y-3 overflow-auto">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
              검토 대기 ({policies.length}건)
            </h2>
          </div>
          {loading ? (
            <p className="text-sm text-center py-8" style={{ color: 'var(--text-secondary)' }}>불러오는 중...</p>
          ) : policies.length === 0 ? (
            <Card><CardContent className="p-8 text-center">
              <CheckCircle className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--success)' }} />
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>검토 대기 항목 없음</p>
            </CardContent></Card>
          ) : policies.map((policy) => (
            <Card
              key={policy.id}
              className={`cursor-pointer transition-all shadow-sm ${selectedPolicy?.id === policy.id ? 'ring-2 ring-primary' : ''}`}
              onClick={() => { setSelectedPolicy(policy); setComment(''); }}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <Badge style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', color: '#3B82F6', border: 'none' }} className="text-xs font-mono">
                    {policy.policyCode}
                  </Badge>
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: getPriorityColor(policy.tags) }} />
                </div>
                <h3 className="font-semibold text-sm mb-1" style={{ color: 'var(--text-primary)' }}>{policy.title}</h3>
                <p className="text-xs line-clamp-2 mb-2" style={{ color: 'var(--text-secondary)' }}>{policy.condition}</p>
                <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  <Clock className="w-3 h-3" />
                  <span>{new Date(policy.createdAt).toLocaleDateString('ko-KR')}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Detail Panel */}
        <div className="overflow-auto">
          {selectedPolicy ? (
            <Card className="shadow-sm">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <Badge className="mb-2 font-mono">{selectedPolicy.policyCode}</Badge>
                    <CardTitle>{selectedPolicy.title}</CardTitle>
                  </div>
                  <Badge variant="outline" style={{ color: 'var(--accent)' }}>
                    <AlertTriangle className="w-3 h-3 mr-1" /> 검토 대기
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>조건 Condition</h3>
                  <div className="p-4 rounded-lg text-sm" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                    {selectedPolicy.condition}
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>기준 Criteria</h3>
                  <div className="p-4 rounded-lg text-sm" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                    {selectedPolicy.criteria}
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>결과 Outcome</h3>
                  <div className="p-4 rounded-lg text-sm" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                    {selectedPolicy.outcome}
                  </div>
                </div>
                {selectedPolicy.tags.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>태그</h3>
                    <div className="flex flex-wrap gap-2">
                      {selectedPolicy.tags.map((tag, i) => (
                        <Badge key={i} variant="outline">{tag}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
                    <MessageSquare className="w-4 h-4 inline mr-1" />
                    리뷰 코멘트
                  </h3>
                  <Textarea
                    placeholder="검토 의견을 입력하세요..."
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    rows={3}
                  />
                </div>
                <div className="flex gap-3">
                  <Button onClick={() => void handleApprove()} className="flex-1" style={{ backgroundColor: 'var(--success)' }}>
                    <CheckCircle className="w-4 h-4 mr-2" /> 승인
                  </Button>
                  <Button onClick={() => void handleReject()} variant="outline" className="flex-1" style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}>
                    <XCircle className="w-4 h-4 mr-2" /> 반려
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-secondary)' }}>
              <User className="w-6 h-6 mr-2" /> 정책을 선택하세요
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
