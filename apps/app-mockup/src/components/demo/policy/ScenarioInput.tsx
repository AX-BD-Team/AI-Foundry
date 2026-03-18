import { useState } from "react";
import type { DomainConfig } from "@/types/demo";
import { cn } from "@/lib/cn";

const QUICK_SCENARIOS: Record<string, string[]> = {
  giftvoucher: ["5만원 온라인 결제", "충전 한도 초과", "상품권 환불 요청"],
  pension: ["중도인출 신청", "퇴직급여 지급", "운용지시 변경"],
};

const PLACEHOLDERS: Record<string, string> = {
  giftvoucher: "온누리상품권으로 5만원 온라인 결제 시 적용되는 정책을 확인하고 싶습니다",
  pension: "퇴직연금 중도인출 조건과 관련된 정책을 확인하고 싶습니다",
};

interface ScenarioInputProps {
  domain: DomainConfig;
  onSubmit: (query: string) => void;
  loading: boolean;
}

export function ScenarioInput({ domain, onSubmit, loading }: ScenarioInputProps) {
  const [query, setQuery] = useState("");
  const scenarios = QUICK_SCENARIOS[domain.id] ?? [];
  const placeholder = PLACEHOLDERS[domain.id] ?? "시나리오를 입력하세요";

  function handleSubmit() {
    const text = query.trim();
    if (text) onSubmit(text);
  }

  function handleQuick(scenario: string) {
    setQuery(scenario);
    onSubmit(scenario);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">시나리오 검색 — {domain.name}</h2>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {domain.stats.policies.toLocaleString()} policies
        </span>
      </div>

      <div className="flex gap-2">
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          rows={2}
          className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
        />
        <button
          onClick={handleSubmit}
          disabled={loading || !query.trim()}
          className={cn(
            "self-end rounded-lg px-4 py-2 text-sm font-medium transition-colors",
            loading || !query.trim()
              ? "bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed"
              : "bg-indigo-600 text-white hover:bg-indigo-700",
          )}
        >
          {loading ? "검색 중..." : "검색"}
        </button>
      </div>

      {/* Quick scenarios */}
      <div className="flex flex-wrap gap-2">
        {scenarios.map((s) => (
          <button
            key={s}
            onClick={() => handleQuick(s)}
            disabled={loading}
            className="text-xs px-3 py-1.5 rounded-full border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
