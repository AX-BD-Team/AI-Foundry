import { useState, useEffect } from 'react';
import { TrustGaugeCard } from '@/components/TrustGaugeCard';
import { PolicyQualityChart } from '@/components/PolicyQualityChart';
import { HitlOperationsCard } from '@/components/HitlOperationsCard';
import { ReasoningEngineCard } from '@/components/ReasoningEngineCard';
import { GoldenTestCard } from '@/components/GoldenTestCard';
import { PipelineOverviewCard } from '@/components/PipelineOverviewCard';
import { StageLatencyChart } from '@/components/StageLatencyChart';
import { DomainCoverageCard } from '@/components/DomainCoverageCard';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Loader2 } from 'lucide-react';
import {
  fetchTrust,
  fetchHitlStats,
  fetchQualityTrend,
  fetchGoldenTests,
  fetchReasoningAnalysis,
  type TrustData,
  type HitlStats,
  type QualityTrendItem,
  type GoldenTestData,
  type ReasoningAnalysis,
} from '@/api/governance';
import { fetchQualityMetrics, type QualityMetrics } from '@/api/analytics';
import { useOrganization } from '@/contexts/OrganizationContext';

function extractScore(
  data: TrustData,
  targetType: string,
): number | null {
  const bucket = data.byTargetType[targetType];
  if (!bucket) return null;
  let totalCount = 0;
  let weightedSum = 0;
  for (const level of Object.keys(bucket)) {
    const entry = bucket[level];
    if (entry) {
      totalCount += entry.count;
      weightedSum += entry.avgScore * entry.count;
    }
  }
  if (totalCount === 0) return null;
  return Math.round((weightedSum / totalCount) * 100) / 100;
}

export default function TrustDashboardPage() {
  const { organizationId } = useOrganization();
  const [trustData, setTrustData] = useState<TrustData | null>(null);
  const [hitlStats, setHitlStats] = useState<HitlStats | null>(null);
  const [qualityTrend, setQualityTrend] = useState<QualityTrendItem[] | null>(null);
  const [goldenTests, setGoldenTests] = useState<GoldenTestData | null>(null);
  const [reasoning, setReasoning] = useState<ReasoningAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pilot quality tab state
  const [activeTab, setActiveTab] = useState('trust');
  const [qualityData, setQualityData] = useState<QualityMetrics | null>(null);
  const [qualityLoading, setQualityLoading] = useState(false);

  // Trust tab data fetch
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.allSettled([
      fetchTrust(organizationId),
      fetchHitlStats(organizationId),
      fetchQualityTrend(organizationId),
      fetchGoldenTests(organizationId),
      fetchReasoningAnalysis(organizationId),
    ])
      .then(([trustRes, hitlRes, qualityRes, goldenRes, reasoningRes]) => {
        if (cancelled) return;

        if (trustRes.status === 'fulfilled' && trustRes.value.success) {
          setTrustData(trustRes.value.data);
        } else {
          setError('신뢰도 데이터를 불러올 수 없습니다');
        }

        if (hitlRes.status === 'fulfilled' && hitlRes.value.success) {
          setHitlStats(hitlRes.value.data);
        }
        if (qualityRes.status === 'fulfilled' && qualityRes.value.success) {
          setQualityTrend(qualityRes.value.data.trend);
        }
        if (goldenRes.status === 'fulfilled' && goldenRes.value.success) {
          setGoldenTests(goldenRes.value.data);
        }
        if (reasoningRes.status === 'fulfilled' && reasoningRes.value.success) {
          setReasoning(reasoningRes.value.data);
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        console.error('Failed to fetch trust dashboard data', e);
        setError('대시보드 데이터를 불러올 수 없습니다');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  // Pilot tab lazy fetch
  useEffect(() => {
    if (activeTab !== 'pilot') return;
    if (qualityData) return;
    let cancelled = false;
    setQualityLoading(true);
    fetchQualityMetrics(organizationId)
      .then((res) => {
        if (cancelled) return;
        if (res.success) setQualityData(res.data);
      })
      .catch((e: unknown) => console.error('Quality fetch failed', e))
      .finally(() => { if (!cancelled) setQualityLoading(false); });
    return () => { cancelled = true; };
  }, [activeTab, qualityData]);

  const l1Score = trustData ? extractScore(trustData, 'output') : null;
  const l2Score = trustData ? extractScore(trustData, 'skill') : null;
  const l3Score = trustData ? extractScore(trustData, 'system') : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          신뢰도 & 품질 대시보드 Trust & Quality Dashboard
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          AI 시스템 신뢰도 모니터링 및 품질 지표 관리
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="trust">신뢰도</TabsTrigger>
          <TabsTrigger value="pilot">파일럿 품질</TabsTrigger>
        </TabsList>

        <TabsContent value="trust" className="space-y-6 mt-4">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--text-secondary)' }} />
            </div>
          )}

          {error && (
            <div className="text-sm text-center py-8" style={{ color: 'var(--danger)' }}>
              {error}
            </div>
          )}

          {!loading && (
            <>
              <div className="grid grid-cols-3 gap-6">
                <TrustGaugeCard level="L1" title="출력 신뢰도" description="개별 AI 추론 결과 품질" score={l1Score ?? 0} />
                <TrustGaugeCard level="L2" title="Skill 신뢰도" description="패키지 수준 검증 결과" score={l2Score ?? 0} />
                <TrustGaugeCard level="L3" title="시스템 신뢰도" description="전체 파이프라인 안정성" score={l3Score ?? 0} />
              </div>

              <div className="grid grid-cols-[60%_40%] gap-6">
                <PolicyQualityChart data={qualityTrend ?? undefined} />
                <HitlOperationsCard data={hitlStats ?? undefined} />
              </div>

              <div className="grid grid-cols-2 gap-6">
                <ReasoningEngineCard data={reasoning ?? undefined} />
                <GoldenTestCard data={goldenTests ?? undefined} />
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="pilot" className="space-y-6 mt-4">
          {qualityLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--text-secondary)' }} />
            </div>
          )}
          {!qualityLoading && qualityData && (
            <>
              <PipelineOverviewCard data={qualityData} />
              <div className="grid grid-cols-2 gap-6">
                <StageLatencyChart data={qualityData.stageLatencies} />
                <DomainCoverageCard data={qualityData} />
              </div>
            </>
          )}
          {!qualityLoading && !qualityData && activeTab === 'pilot' && (
            <div className="text-sm text-center py-8" style={{ color: 'var(--text-secondary)' }}>
              파일럿 품질 데이터가 없습니다. 배치 E2E를 실행하여 데이터를 수집하세요.
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
