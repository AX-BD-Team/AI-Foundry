import { useState, useEffect, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  PlayCircle,
  RefreshCw,
  Zap,
  AlertTriangle,
  CheckCircle,
  Target,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  triggerFactCheck,
  fetchResults,
  fetchGaps,
  reviewGap,
  triggerLlmMatch,
  fetchSummary,
} from '@/api/factcheck';
import type { FactCheckResult, FactCheckGap, FactCheckSummary } from '@/api/factcheck';
import { CoverageCard } from '@/components/factcheck/CoverageCard';
import { GapList } from '@/components/factcheck/GapList';
import { GapDetail } from '@/components/factcheck/GapDetail';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useAuth } from '@/contexts/AuthContext';

function resultStatusBadge(status: string) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    pending: { bg: 'rgba(107, 114, 128, 0.1)', color: '#6B7280', label: 'Pending' },
    completed: { bg: 'rgba(34, 197, 94, 0.1)', color: '#16A34A', label: 'Completed' },
    failed: { bg: 'rgba(239, 68, 68, 0.1)', color: '#DC2626', label: 'Failed' },
  };
  const s = map[status] ?? map["pending"] ?? { bg: 'rgba(107, 114, 128, 0.1)', color: '#6B7280', label: 'Pending' };
  return (
    <Badge className="text-[10px]" style={{ backgroundColor: s.bg, color: s.color, border: 'none' }}>
      {s.label}
    </Badge>
  );
}

export default function FactCheckPage() {
  const { organizationId } = useOrganization();
  const { user } = useAuth();
  const isReviewer = user?.userRole === 'Reviewer' || user?.userRole === 'Executive';

  const [results, setResults] = useState<FactCheckResult[]>([]);
  const [summary, setSummary] = useState<FactCheckSummary | null>(null);
  const [selectedResult, setSelectedResult] = useState<FactCheckResult | null>(null);
  const [gaps, setGaps] = useState<FactCheckGap[]>([]);
  const [selectedGap, setSelectedGap] = useState<FactCheckGap | null>(null);

  const [filterType, setFilterType] = useState('all');
  const [filterSeverity, setFilterSeverity] = useState('all');

  const [loadingResults, setLoadingResults] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [llmMatching, setLlmMatching] = useState<Set<string>>(new Set());

  const loadResults = async () => {
    setLoadingResults(true);
    try {
      const [resResults, resSummary] = await Promise.all([
        fetchResults(organizationId),
        fetchSummary(organizationId),
      ]);
      if (resResults.success) setResults(resResults.data.results);
      if (resSummary.success) setSummary(resSummary.data);
    } catch {
      toast.error('Failed to load fact check results');
    } finally {
      setLoadingResults(false);
    }
  };

  useEffect(() => {
    void loadResults();
  }, [organizationId]);

  const loadGaps = async (resultId: string) => {
    try {
      const filters: { type?: string; severity?: string } = {};
      if (filterType !== 'all') filters.type = filterType;
      if (filterSeverity !== 'all') filters.severity = filterSeverity;
      const res = await fetchGaps(organizationId, resultId, filters);
      if (res.success) {
        setGaps(res.data.gaps);
        setSelectedGap(null);
      }
    } catch {
      toast.error('Failed to load gaps');
    }
  };

  // Reload gaps when filters change
  useEffect(() => {
    if (selectedResult) {
      void loadGaps(selectedResult.result_id);
    }
  }, [filterType, filterSeverity]);

  const handleSelectResult = (result: FactCheckResult) => {
    setSelectedResult(result);
    setSelectedGap(null);
    void loadGaps(result.result_id);
  };

  const handleTrigger = async () => {
    setTriggering(true);
    try {
      const res = await triggerFactCheck(organizationId, {});
      if (res.success) {
        toast.success('Fact check triggered');
        await loadResults();
      } else {
        toast.error(res.error.message);
      }
    } catch {
      toast.error('Failed to trigger fact check');
    } finally {
      setTriggering(false);
    }
  };

  const handleReviewGap = async (gapId: string, action: 'confirm' | 'dismiss' | 'modify', comment?: string) => {
    setReviewing(true);
    try {
      const res = await reviewGap(organizationId, gapId, { action, ...(comment ? { comment } : {}) });
      if (res.success) {
        toast.success(`Gap ${action}ed`);
        if (selectedResult) void loadGaps(selectedResult.result_id);
        setSelectedGap(null);
      } else {
        toast.error(res.error.message);
      }
    } catch {
      toast.error('Review failed');
    } finally {
      setReviewing(false);
    }
  };

  const handleLlmMatch = async (resultId: string) => {
    setLlmMatching((prev) => new Set(prev).add(resultId));
    try {
      const res = await triggerLlmMatch(organizationId, resultId);
      if (res.success) {
        toast.success('LLM semantic matching started');
      } else {
        toast.error(res.error.message);
      }
    } catch {
      toast.error('LLM match failed');
    } finally {
      setLlmMatching((prev) => { const next = new Set(prev); next.delete(resultId); return next; });
    }
  };

  const filteredGaps = useMemo(() => {
    return gaps.filter((g) => {
      if (filterType !== 'all' && g.gap_type !== filterType) return false;
      if (filterSeverity !== 'all' && g.severity !== filterSeverity) return false;
      return true;
    });
  }, [gaps, filterType, filterSeverity]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Fact Check Dashboard
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Source code vs Document gap analysis
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void loadResults()} disabled={loadingResults}>
            <RefreshCw className={`w-4 h-4 mr-1${loadingResults ? ' animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button onClick={() => void handleTrigger()} disabled={triggering}>
            <PlayCircle className="w-4 h-4 mr-2" />
            {triggering ? 'Running...' : 'Run Fact Check'}
          </Button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      {summary && (
        <div className="grid grid-cols-4 gap-4">
          <CoverageCard
            label="Average Coverage"
            labelEn="Avg Coverage"
            value={summary.avgCoverage}
            icon={<Target className="w-10 h-10" />}
          />
          <Card className="shadow-sm">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>Total Gaps</div>
                  <div className="text-3xl font-bold mt-2" style={{ color: 'var(--text-primary)' }}>{summary.totalGaps}</div>
                </div>
                <AlertTriangle className="w-10 h-10" style={{ color: '#F59E0B', opacity: 0.2 }} />
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-sm">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>HIGH Gaps</div>
                  <div className="text-3xl font-bold mt-2" style={{ color: '#DC2626' }}>{summary.highGaps}</div>
                </div>
                <Zap className="w-10 h-10" style={{ color: '#EF4444', opacity: 0.2 }} />
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-sm">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>Completed</div>
                  <div className="text-3xl font-bold mt-2" style={{ color: '#22C55E' }}>{summary.completedResults}</div>
                </div>
                <CheckCircle className="w-10 h-10" style={{ color: '#22C55E', opacity: 0.2 }} />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-12 gap-6">
        {/* Results List */}
        <div className="col-span-4 space-y-3">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-sm">
                Fact Check Results
                <Badge variant="outline" className="ml-2 text-xs">{results.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {results.length === 0 ? (
                <p className="text-sm py-4 text-center" style={{ color: 'var(--text-secondary)' }}>
                  No results yet. Run a fact check to start.
                </p>
              ) : (
                <div className="space-y-2 max-h-[500px] overflow-y-auto">
                  {results.map((r) => (
                    <div
                      key={r.result_id}
                      className="p-3 rounded-lg border cursor-pointer transition-colors"
                      style={{
                        borderColor: selectedResult?.result_id === r.result_id ? 'var(--primary)' : 'var(--border)',
                        backgroundColor: selectedResult?.result_id === r.result_id ? 'rgba(26, 54, 93, 0.05)' : 'transparent',
                      }}
                      onClick={() => handleSelectResult(r)}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-mono" style={{ color: 'var(--text-primary)' }}>
                          {r.result_id.slice(0, 8)}...
                        </span>
                        {resultStatusBadge(r.status)}
                      </div>
                      <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
                        <Badge variant="outline" className="text-[10px]">{r.spec_type}</Badge>
                        <span>Coverage: {r.coverage_pct}%</span>
                        <span>Gaps: {r.gap_count}</span>
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                          {new Date(r.created_at).toLocaleString('ko-KR')}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-[10px] h-6 px-2"
                          disabled={llmMatching.has(r.result_id)}
                          onClick={(e) => { e.stopPropagation(); void handleLlmMatch(r.result_id); }}
                        >
                          <Zap className="w-3 h-3 mr-1" />
                          LLM Match
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Gaps Panel */}
        <div className="col-span-8 space-y-4">
          {selectedResult ? (
            <>
              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-sm">
                    Gaps for {selectedResult.result_id.slice(0, 8)}...
                    <Badge variant="outline" className="ml-2 text-xs">{filteredGaps.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <GapList
                    gaps={filteredGaps}
                    onSelectGap={setSelectedGap}
                    selectedGapId={selectedGap?.gap_id}
                    filterType={filterType}
                    filterSeverity={filterSeverity}
                    onFilterTypeChange={setFilterType}
                    onFilterSeverityChange={setFilterSeverity}
                  />
                </CardContent>
              </Card>

              {selectedGap && (
                <GapDetail
                  gap={selectedGap}
                  onReview={handleReviewGap}
                  reviewerRole={isReviewer}
                  reviewing={reviewing}
                />
              )}
            </>
          ) : (
            <Card className="shadow-sm">
              <CardContent className="p-12 text-center">
                <AlertTriangle className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-secondary)', opacity: 0.3 }} />
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Select a fact check result to view gaps.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
