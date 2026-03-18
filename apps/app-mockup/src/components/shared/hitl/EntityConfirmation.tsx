/**
 * EntityConfirmation — HITL component for confirming entity mapping.
 * Design Doc: AIF-DSGN-024 §3.6
 *
 * Displays candidate entities sorted by similarity and lets the user
 * select the correct mapping or skip.
 */

import { useState } from "react";
import { cn } from "@/lib/cn";

export interface EntityCandidate {
  id: string;
  name: string;
  definition: string;
  similarity: number;
}

export interface EntityConfirmationProps {
  entityName: string;
  candidates: EntityCandidate[];
  onSelect: (candidateId: string) => void;
  onSkip: () => void;
}

/** Sort candidates by similarity descending (pure helper, exported for testing). */
export function sortCandidatesBySimilarity(
  candidates: readonly EntityCandidate[],
): EntityCandidate[] {
  return [...candidates].sort((a, b) => b.similarity - a.similarity);
}

function similarityBadge(score: number) {
  const pct = `${(score * 100).toFixed(0)}%`;
  const color =
    score >= 0.8
      ? "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300"
      : score >= 0.5
        ? "bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300"
        : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400";
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", color)}>
      {pct}
    </span>
  );
}

export function EntityConfirmation({
  entityName,
  candidates,
  onSelect,
  onSkip,
}: EntityConfirmationProps) {
  const sorted = sortCandidatesBySimilarity(candidates);
  const [selectedId, setSelectedId] = useState<string | null>(
    sorted[0]?.id ?? null,
  );

  return (
    <div className="rounded-lg border border-purple-200 dark:border-purple-800 bg-white dark:bg-gray-900 shadow-sm">
      {/* Header */}
      <div className="border-b border-purple-100 dark:border-purple-900 px-4 py-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          엔티티 매핑 확인: <span className="text-purple-600 dark:text-purple-400">{entityName}</span>
        </h3>
      </div>

      {/* Candidates */}
      <div className="px-4 py-3 space-y-2">
        {sorted.map((c) => (
          <label
            key={c.id}
            className={cn(
              "flex items-start gap-3 rounded-md border p-3 cursor-pointer transition-colors",
              selectedId === c.id
                ? "border-purple-400 dark:border-purple-600 bg-purple-50 dark:bg-purple-950"
                : "border-gray-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-700",
            )}
          >
            <input
              type="radio"
              name="entity-candidate"
              value={c.id}
              checked={selectedId === c.id}
              onChange={() => setSelectedId(c.id)}
              className="mt-0.5 accent-purple-600"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {c.name}
                </span>
                {similarityBadge(c.similarity)}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {c.definition}
              </p>
            </div>
          </label>
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-2 border-t border-purple-100 dark:border-purple-900 px-4 py-3">
        <button
          type="button"
          disabled={selectedId == null}
          onClick={() => { if (selectedId != null) onSelect(selectedId); }}
          className={cn(
            "flex-1 rounded-md px-4 py-2 text-sm font-medium text-white transition-colors",
            selectedId != null
              ? "bg-purple-600 hover:bg-purple-700"
              : "bg-gray-400 cursor-not-allowed",
          )}
        >
          선택
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="rounded-md border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          건너뛰기
        </button>
      </div>
    </div>
  );
}
