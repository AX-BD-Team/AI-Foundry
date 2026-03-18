import { useCallback, useEffect, useState } from "react";
import { useDomain } from "@/contexts/DomainContext";
import { fetchPolicies, type Policy } from "@/lib/api/policy";
import { PolicyCard } from "./PolicyCard";
import { ScenarioInput } from "./ScenarioInput";

function matchScore(policy: Policy, keywords: string[]): number {
  const text = `${policy.title} ${policy.condition} ${policy.criteria} ${policy.outcome}`.toLowerCase();
  let score = 0;
  for (const kw of keywords) {
    if (text.includes(kw)) score++;
  }
  return score;
}

export function PolicyEngineDemo() {
  const { domain } = useDomain();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [filtered, setFiltered] = useState<Policy[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setFiltered(null);
    setQuery(null);

    fetchPolicies(domain.organizationId, { status: "approved", limit: 100 })
      .then((data) => {
        if (!cancelled) setPolicies(data.policies);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Fetch failed");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [domain.organizationId]);

  const handleSearch = useCallback(
    (q: string) => {
      setQuery(q);
      const keywords = q.toLowerCase().split(/\s+/).filter(Boolean);
      if (keywords.length === 0) {
        setFiltered(null);
        return;
      }
      const scored = policies
        .map((p) => ({ policy: p, score: matchScore(p, keywords) }))
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score);
      setFiltered(scored.map((r) => r.policy));
    },
    [policies],
  );

  const display = filtered ?? policies;

  return (
    <div className="space-y-6">
      <ScenarioInput domain={domain} onSubmit={handleSearch} loading={loading} />

      {/* Status bar */}
      {query && filtered !== null && (
        <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
          <span>
            &quot;{query}&quot; 검색 결과: <strong className="text-gray-900 dark:text-gray-100">{filtered.length}</strong>건
          </span>
          <button
            onClick={() => { setFiltered(null); setQuery(null); }}
            className="text-indigo-600 dark:text-indigo-400 hover:underline text-xs"
          >
            초기화
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin h-6 w-6 border-2 border-indigo-500 border-t-transparent rounded-full" />
          <span className="ml-3 text-sm text-gray-500">{domain.name} 정책 로딩 중...</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950 p-4 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Results */}
      {!loading && !error && display.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          {query ? `${domain.name} 검색 결과가 없어요. 다른 키워드를 시도해보세요.` : `${domain.name} 정책 데이터가 없어요.`}
        </div>
      )}

      {!loading && !error && display.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {display.map((p) => (
            <PolicyCard key={p.policyId} policy={p} />
          ))}
        </div>
      )}
    </div>
  );
}
