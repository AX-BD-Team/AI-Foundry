import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, BarChart3 } from 'lucide-react';
import type { GoldenTestData } from '@/api/governance';

interface Props {
  data?: GoldenTestData | undefined;
}

export const GoldenTestCard: React.FC<Props> = ({ data }) => {
  const latestScore = data?.latestScore ?? 0;
  const isPassed = data?.passed ?? false;
  const recentRuns = data?.recentRuns ?? [];
  const testScores = data?.breakdown ?? [];
  const latestRunAt = data?.latestRunAt;

  // Simple sparkline SVG
  const sparklinePoints = recentRuns.length > 1
    ? recentRuns.map((score, i) => {
        const x = (i / (recentRuns.length - 1)) * 100;
        const y = 100 - ((score - 0.80) / 0.10) * 100; // Scale between 0.80 and 0.90
        return `${x},${y}`;
      }).join(' ')
    : '';

  return (
    <Card style={{ borderRadius: 'var(--radius-lg)' }}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Golden Test 현황 Status</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Latest Run */}
        <div
          className="p-4 rounded-lg"
          style={{
            backgroundColor: isPassed ? 'var(--success-light)' : 'var(--danger-light)',
          }}
        >
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>
                Latest Run
              </div>
              <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                {latestRunAt ?? '-'}
              </div>
            </div>
            <Badge
              className="flex items-center gap-1"
              style={{
                backgroundColor: isPassed ? 'var(--success)' : 'var(--danger)',
                color: '#FFFFFF',
                border: 'none',
              }}
            >
              {isPassed ? <CheckCircle className="w-3 h-3" /> : '✗'}
              {isPassed ? 'Pass' : 'Fail'}
            </Badge>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-3xl font-bold" style={{ color: isPassed ? 'var(--success)' : 'var(--danger)' }}>
              {latestScore.toFixed(2)}
            </div>
            <div className="flex-1">
              <div className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>
                Overall Score
              </div>
              <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Pass threshold: 0.85
              </div>
            </div>
          </div>
        </div>

        {/* Trend Sparkline */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              5-Run Trend
            </span>
          </div>
          <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--surface)' }}>
            <svg viewBox="0 0 100 30" className="w-full h-8">
              {/* Background grid */}
              <line x1="0" y1="15" x2="100" y2="15" stroke="var(--border)" strokeDasharray="2 2" />
              {/* Sparkline */}
              <polyline
                points={sparklinePoints}
                fill="none"
                stroke="var(--success)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Points */}
              {recentRuns.map((score, i) => {
                const x = (i / (recentRuns.length - 1)) * 100;
                const y = 100 - ((score - 0.80) / 0.10) * 100;
                return (
                  <circle
                    key={i}
                    cx={x}
                    cy={y}
                    r="2"
                    fill={i === recentRuns.length - 1 ? 'var(--success)' : '#9CA3AF'}
                  />
                );
              })}
            </svg>
            <div className="flex justify-between mt-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
              {recentRuns.map((score, i) => (
                <span
                  key={i}
                  style={{
                    color: i === recentRuns.length - 1 ? 'var(--success)' : 'var(--text-secondary)',
                    fontWeight: i === recentRuns.length - 1 ? 'bold' : 'normal',
                  }}
                >
                  {score.toFixed(2)}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Score Breakdown */}
        <div>
          <div className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
            점수 분석 Breakdown
          </div>
          <div className="space-y-2">
            {testScores.map((test) => {
              const scoreColor =
                test.score >= 0.85
                  ? 'var(--success)'
                  : test.score >= 0.80
                  ? 'var(--accent)'
                  : 'var(--danger)';
              return (
                <div key={test.name} className="flex items-center gap-3">
                  <div className="w-16 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {test.name}
                  </div>
                  <div className="flex-1">
                    <div className="h-2 rounded-full" style={{ backgroundColor: 'var(--surface)' }}>
                      <div
                        className="h-2 rounded-full transition-all"
                        style={{
                          width: `${test.score * 100}%`,
                          backgroundColor: scoreColor,
                        }}
                      />
                    </div>
                  </div>
                  <div className="w-12 text-right text-sm font-semibold" style={{ color: scoreColor }}>
                    {test.score.toFixed(2)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
