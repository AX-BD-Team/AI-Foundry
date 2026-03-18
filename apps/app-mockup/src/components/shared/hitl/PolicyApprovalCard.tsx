/**
 * PolicyApprovalCard — HITL component for policy approval within an agent flow.
 * Design Doc: AIF-DSGN-024 §3.5
 *
 * Displays policy details (condition-criteria-outcome triple) and collects
 * reviewer decision: approved / rejected / modified.
 */

import { useState } from "react";
import { cn } from "@/lib/cn";

export interface PolicyApprovalCardProps {
  policyTitle: string;
  condition: string;
  criteria: string;
  outcome: string;
  policyCode: string;
  confidence?: number | undefined;
  onDecision: (decision: "approved" | "rejected" | "modified", comment?: string) => void;
}

function confidenceBadge(score: number) {
  const label = `${(score * 100).toFixed(0)}%`;
  if (score > 0.7) {
    return (
      <span className="inline-flex items-center rounded-full bg-green-100 dark:bg-green-900 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:text-green-300">
        {label}
      </span>
    );
  }
  if (score >= 0.5) {
    return (
      <span className="inline-flex items-center rounded-full bg-yellow-100 dark:bg-yellow-900 px-2.5 py-0.5 text-xs font-medium text-yellow-700 dark:text-yellow-300">
        {label}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-red-100 dark:bg-red-900 px-2.5 py-0.5 text-xs font-medium text-red-700 dark:text-red-300">
      {label}
    </span>
  );
}

export function PolicyApprovalCard({
  policyTitle,
  condition,
  criteria,
  outcome,
  policyCode,
  confidence,
  onDecision,
}: PolicyApprovalCardProps) {
  const [comment, setComment] = useState("");

  return (
    <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-white dark:bg-gray-900 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-blue-100 dark:border-blue-900 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-base">&#x2696;&#xFE0F;</span>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            정책 승인 요청
          </h3>
        </div>
        {confidence != null && confidenceBadge(confidence)}
      </div>

      {/* Body */}
      <div className="px-4 py-4 space-y-4">
        {/* Policy ID & Title */}
        <div>
          <span className="text-xs font-mono text-gray-400 dark:text-gray-500">
            {policyCode}
          </span>
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mt-0.5">
            {policyTitle}
          </p>
        </div>

        {/* Condition-Criteria-Outcome Triple */}
        <div className="rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-3 space-y-2 text-sm">
          <div>
            <span className="font-medium text-blue-600 dark:text-blue-400">IF: </span>
            <span className="text-gray-700 dark:text-gray-300">{condition}</span>
          </div>
          <div>
            <span className="font-medium text-purple-600 dark:text-purple-400">기준: </span>
            <span className="text-gray-700 dark:text-gray-300">{criteria}</span>
          </div>
          <div>
            <span className="font-medium text-green-600 dark:text-green-400">THEN: </span>
            <span className="text-gray-700 dark:text-gray-300">{outcome}</span>
          </div>
        </div>

        {/* Comment */}
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="코멘트 (선택사항)"
          rows={2}
          className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />

        {/* Actions */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onDecision("approved", comment || undefined)}
            className={cn(
              "flex-1 rounded-md px-4 py-2 text-sm font-medium text-white transition-colors",
              "bg-green-600 hover:bg-green-700",
            )}
          >
            승인
          </button>
          <button
            type="button"
            onClick={() => onDecision("rejected", comment || undefined)}
            className={cn(
              "flex-1 rounded-md px-4 py-2 text-sm font-medium text-white transition-colors",
              "bg-red-600 hover:bg-red-700",
            )}
          >
            반려
          </button>
          <button
            type="button"
            onClick={() => onDecision("modified", comment || undefined)}
            className={cn(
              "flex-1 rounded-md px-4 py-2 text-sm font-medium text-white transition-colors",
              "bg-yellow-600 hover:bg-yellow-700",
            )}
          >
            수정 요청
          </button>
        </div>
      </div>
    </div>
  );
}
