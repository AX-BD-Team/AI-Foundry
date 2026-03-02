import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Area, ComposedChart, ReferenceLine } from 'recharts';
import { Badge } from '@/components/ui/badge';
import { TrendingUp } from 'lucide-react';
import type { QualityTrendItem } from '@/api/governance';

interface Props {
  data?: QualityTrendItem[] | undefined;
}

export const PolicyQualityChart: React.FC<Props> = ({ data }) => {
  // Normalize: API returns 0-100, chart expects 0-1
  const chartData = (data ?? []).map((d) => ({
    date: d.date.slice(5), // "2026-03-01" → "03-01"
    aiAccuracy: d.aiAccuracy / 100,
    hitlAccuracy: d.hitlAccuracy / 100,
  }));

  if (chartData.length === 0) {
    return (
      <Card style={{ borderRadius: 'var(--radius-lg)' }}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">정책 품질 트렌드 Policy Quality Trend (30일)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-center py-8" style={{ color: 'var(--text-secondary)' }}>
            아직 품질 추이 데이터가 없습니다. 정책 생성 후 누적됩니다.
          </div>
        </CardContent>
      </Card>
    );
  }

  // Calculate average HITL contribution
  const avgContribution = chartData.reduce((sum, d) => sum + (d.hitlAccuracy - d.aiAccuracy), 0) / chartData.length;

  return (
    <Card style={{ borderRadius: 'var(--radius-lg)' }}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">정책 품질 트렌드 Policy Quality Trend (30일)</CardTitle>
          <Badge
            className="flex items-center gap-1"
            style={{
              backgroundColor: 'var(--success-light)',
              color: 'var(--success)',
              border: 'none',
            }}
          >
            <TrendingUp className="w-3 h-3" />
            HITL 기여도: 평균 +{(avgContribution * 100).toFixed(1)}%p 향상
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <ComposedChart
          width={800}
          height={300}
          data={chartData}
          margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="hitlGap" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--success)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="var(--success)" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="date"
            tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
            stroke="var(--border)"
          />
          <YAxis
            domain={[0.6, 1.0]}
            tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
            stroke="var(--border)"
            tickFormatter={(value) => value.toFixed(2)}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
            }}
            formatter={(value: number) => value.toFixed(3)}
          />
          <Legend
            wrapperStyle={{ paddingTop: '20px' }}
            iconType="line"
          />
          {/* Reference line for target */}
          <ReferenceLine
            y={0.85}
            stroke="var(--accent)"
            strokeDasharray="5 5"
            strokeWidth={2}
            label={{
              value: '목표 기준 0.85',
              position: 'right',
              fill: 'var(--accent)',
              fontSize: 12,
            }}
          />
          {/* Shaded area showing HITL contribution */}
          <Area
            type="monotone"
            dataKey="hitlAccuracy"
            fill="url(#hitlGap)"
            stroke="none"
          />
          {/* AI Accuracy line */}
          <Line
            type="monotone"
            dataKey="aiAccuracy"
            stroke="#3B82F6"
            strokeWidth={2}
            dot={{ r: 3, fill: '#3B82F6' }}
            name="AI 초기 추출 정확도"
          />
          {/* HITL Accuracy line */}
          <Line
            type="monotone"
            dataKey="hitlAccuracy"
            stroke="var(--success)"
            strokeWidth={2}
            dot={{ r: 3, fill: 'var(--success)' }}
            name="HITL 검증 후 정확도"
          />
        </ComposedChart>
      </CardContent>
    </Card>
  );
};
