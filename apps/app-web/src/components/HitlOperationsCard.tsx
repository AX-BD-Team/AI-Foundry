import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { CheckCircle, Clock, Edit, XCircle, Award } from 'lucide-react';
import type { HitlStats } from '@/api/governance';

interface Props {
  data?: HitlStats | undefined;
}

export const HitlOperationsCard: React.FC<Props> = ({ data }) => {
  const completionRate = data?.completionRate ?? 0;
  const editRate = data?.editRate ?? 0;
  const rejectionRate = data?.rejectionRate ?? 0;
  const avgReviewTimeLabel = data?.avgReviewTimeLabel ?? '-';
  const weeklyCompleted = data?.weeklyCompleted ?? 0;
  const weeklyTotal = data?.weeklyTotal ?? 0;
  const reviewers = data?.reviewers ?? [];

  return (
    <Card style={{ borderRadius: 'var(--radius-lg)' }}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">HITL 운영 현황 Operations Status</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Metrics */}
        <div className="space-y-4">
          {/* Completion Rate */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle className="w-4 h-4" style={{ color: 'var(--success)' }} />
                <span style={{ color: 'var(--text-primary)' }}>검토 완료율</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {completionRate}%
                </span>
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  (이번 주 {weeklyCompleted}/{weeklyTotal}건)
                </span>
              </div>
            </div>
            <Progress value={completionRate} className="h-2" />
          </div>

          {/* Average Review Time */}
          <div className="flex items-center justify-between p-3 rounded-lg" style={{ backgroundColor: 'var(--surface)' }}>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4" style={{ color: '#3B82F6' }} />
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                평균 검토 시간
              </span>
            </div>
            <span className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
              {avgReviewTimeLabel}
            </span>
          </div>

          {/* Edit Rate */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-sm">
                <Edit className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                <span style={{ color: 'var(--text-primary)' }}>수정률</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {editRate}%
                </span>
                <Badge
                  style={{
                    backgroundColor: 'var(--success-light)',
                    color: 'var(--success)',
                    border: 'none',
                  }}
                >
                  목표 &lt; 30% ✅
                </Badge>
              </div>
            </div>
            <Progress value={editRate} className="h-2" max={30} />
          </div>

          {/* Rejection Rate */}
          <div className="flex items-center justify-between p-3 rounded-lg" style={{ backgroundColor: 'var(--surface)' }}>
            <div className="flex items-center gap-2">
              <XCircle className="w-4 h-4" style={{ color: 'var(--danger)' }} />
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                반려율
              </span>
            </div>
            <span className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
              {rejectionRate}%
            </span>
          </div>
        </div>

        {/* Reviewer Leaderboard */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Award className="w-4 h-4" style={{ color: 'var(--accent)' }} />
            <h4 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              검토자 리더보드 Reviewer Leaderboard
            </h4>
          </div>
          <div className="space-y-2">
            {reviewers.map((reviewer, index) => (
              <div
                key={reviewer.name}
                className="flex items-center gap-3 p-3 rounded-lg"
                style={{
                  backgroundColor: index === 0 ? 'rgba(246, 173, 85, 0.1)' : 'var(--surface)',
                  border: index === 0 ? '1px solid var(--accent)' : 'none',
                }}
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm"
                  style={{
                    backgroundColor:
                      index === 0 ? 'var(--accent)' : index === 1 ? '#9CA3AF' : '#CD7F32',
                    color: '#FFFFFF',
                  }}
                >
                  {index + 1}
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                    {reviewer.name}
                  </div>
                  <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
                    <span>{reviewer.count}건</span>
                    <span>•</span>
                    <span>avg {reviewer.avgTime}</span>
                    <span>•</span>
                    <span>수정률 {reviewer.editRate}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
