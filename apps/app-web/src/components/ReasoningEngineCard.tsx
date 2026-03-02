import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, AlertCircle, GitMerge } from 'lucide-react';
import type { ReasoningAnalysis } from '@/api/governance';

interface Props {
  data?: ReasoningAnalysis | undefined;
}

export const ReasoningEngineCard: React.FC<Props> = ({ data }) => {
  const conflicts = data?.conflicts ?? [];
  const gaps = data?.gaps ?? [];
  const similarGroups = data?.similarGroups ?? [];

  return (
    <Card style={{ borderRadius: 'var(--radius-lg)' }}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Reasoning Engine 분석 결과</CardTitle>
          {data && (
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              {data.totalPoliciesAnalyzed}건 분석
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Conflict Detection */}
        <div
          className="p-4 rounded-lg border-l-4"
          style={{
            borderColor: 'var(--accent)',
            backgroundColor: 'rgba(246, 173, 85, 0.05)',
          }}
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 mt-0.5" style={{ color: 'var(--accent)' }} />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <h4 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                  충돌 탐지 Conflict Detection
                </h4>
                <Badge
                  style={{
                    backgroundColor: 'rgba(246, 173, 85, 0.2)',
                    color: 'var(--accent)',
                    border: 'none',
                  }}
                >
                  {conflicts.length}건 발견
                </Badge>
              </div>
              {conflicts.length > 0 ? (
                <div className="space-y-2">
                  {conflicts.map((c, i) => (
                    <div
                      key={i}
                      className="p-3 rounded text-sm font-mono"
                      style={{
                        backgroundColor: 'var(--surface)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <code style={{ color: '#3B82F6' }}>{c.policyA}</code>
                        <span style={{ color: 'var(--text-secondary)' }}>↔</span>
                        <code style={{ color: '#3B82F6' }}>{c.policyB}</code>
                      </div>
                      <div className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {c.reason}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  충돌 없음
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Gap Analysis */}
        <div
          className="p-4 rounded-lg border-l-4"
          style={{
            borderColor: '#3B82F6',
            backgroundColor: 'rgba(59, 130, 246, 0.05)',
          }}
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 mt-0.5" style={{ color: '#3B82F6' }} />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <h4 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                  Gap Analysis
                </h4>
                <Badge
                  style={{
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    color: '#3B82F6',
                    border: 'none',
                  }}
                >
                  {gaps.length}건
                </Badge>
              </div>
              {gaps.length > 0 ? (
                <div className="space-y-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                  {gaps.map((g, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="mt-1">•</span>
                      <span>{g.description}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  누락된 정책 영역 없음
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Similar Policies */}
        <div
          className="p-4 rounded-lg border-l-4"
          style={{
            borderColor: 'var(--success)',
            backgroundColor: 'var(--success-light)',
          }}
        >
          <div className="flex items-start gap-3">
            <GitMerge className="w-5 h-5 mt-0.5" style={{ color: 'var(--success)' }} />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <h4 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                  유사 정책 매핑 Similar Policies
                </h4>
                <Badge
                  style={{
                    backgroundColor: 'var(--success)',
                    color: '#FFFFFF',
                    border: 'none',
                  }}
                >
                  {similarGroups.length}건 발견
                </Badge>
              </div>
              {similarGroups.length > 0 ? (
                <>
                  <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    키워드 기반 유사 정책 그룹 분석
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {similarGroups.map((g) => (
                      <Badge
                        key={g.keyword}
                        variant="outline"
                        className="text-xs"
                        style={{
                          borderColor: 'var(--success)',
                          color: 'var(--success)',
                        }}
                      >
                        {g.keyword} ({g.policies.length})
                      </Badge>
                    ))}
                  </div>
                </>
              ) : (
                <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  유사 정책 그룹 없음
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};