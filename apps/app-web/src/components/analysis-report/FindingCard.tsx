import { useState } from "react";
import { ChevronDown, ChevronUp, CheckCircle, XCircle, Edit3 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import type { DiagnosisFinding } from "@ai-foundry/types";
import { SeverityBadge } from "./SeverityBadge";
import { reviewFinding } from "@/api/analysis";
import { useOrganization } from "@/contexts/OrganizationContext";

const TYPE_LABELS: Record<string, string> = {
  missing: "누락",
  duplicate: "중복",
  overspec: "오버스펙",
  inconsistency: "불일치",
};

interface FindingCardProps {
  finding: DiagnosisFinding;
  documentId: string;
  onReviewComplete?: (() => void) | undefined;
}

export function FindingCard({
  finding,
  documentId,
  onReviewComplete,
}: FindingCardProps) {
  const { organizationId } = useOrganization();
  const [expanded, setExpanded] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [comment, setComment] = useState("");

  async function handleReview(action: "accept" | "reject" | "modify") {
    setReviewing(true);
    try {
      const res = await reviewFinding(organizationId, documentId, finding.findingId, {
        action,
        ...(comment ? { comment } : {}),
      });
      if (res.success) {
        toast.success(`소견이 ${action === "accept" ? "승인" : action === "reject" ? "거부" : "수정"}되었습니다.`);
        onReviewComplete?.();
      } else {
        toast.error("리뷰 실패: " + res.error.message);
      }
    } catch {
      toast.error("리뷰 API 호출 실패");
    } finally {
      setReviewing(false);
    }
  }

  const statusColor =
    finding.hitlStatus === "accepted" ? "#22C55E"
    : finding.hitlStatus === "rejected" ? "#EF4444"
    : finding.hitlStatus === "modified" ? "#F59E0B"
    : "#9CA3AF";

  return (
    <Card className="transition-all">
      {/* Collapsed header */}
      <CardContent className="p-4">
        <div
          className="flex items-start gap-3 cursor-pointer"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="text-xs">
                {TYPE_LABELS[finding.type] ?? finding.type}
              </Badge>
              <SeverityBadge severity={finding.severity} />
              <Badge
                variant="outline"
                className="text-xs"
                style={{ borderColor: statusColor, color: statusColor }}
              >
                {finding.hitlStatus}
              </Badge>
            </div>
            <p className="text-sm" style={{ color: "var(--text-primary)" }}>
              {finding.finding}
            </p>
            <div className="flex items-center gap-4 text-xs" style={{ color: "var(--text-secondary)" }}>
              <span>신뢰도: {(finding.confidence * 100).toFixed(0)}%</span>
              {finding.relatedProcesses.length > 0 && (
                <span>관련 프로세스: {finding.relatedProcesses.length}개</span>
              )}
            </div>
          </div>
          <button className="p-1">
            {expanded
              ? <ChevronUp className="w-4 h-4" style={{ color: "var(--text-secondary)" }} />
              : <ChevronDown className="w-4 h-4" style={{ color: "var(--text-secondary)" }} />
            }
          </button>
        </div>

        {/* Expanded detail */}
        {expanded && (
          <div className="mt-4 pt-4 border-t space-y-4" style={{ borderColor: "var(--border)" }}>
            {/* Evidence */}
            <div>
              <div className="text-xs font-semibold mb-1" style={{ color: "var(--text-secondary)" }}>
                근거 (Evidence)
              </div>
              <p className="text-sm" style={{ color: "var(--text-primary)" }}>
                {finding.evidence}
              </p>
            </div>

            {/* Recommendation */}
            <div>
              <div className="text-xs font-semibold mb-1" style={{ color: "var(--text-secondary)" }}>
                권고 사항 (Recommendation)
              </div>
              <p className="text-sm" style={{ color: "var(--text-primary)" }}>
                {finding.recommendation}
              </p>
            </div>

            {/* Related processes */}
            {finding.relatedProcesses.length > 0 && (
              <div>
                <div className="text-xs font-semibold mb-1" style={{ color: "var(--text-secondary)" }}>
                  관련 프로세스
                </div>
                <div className="flex flex-wrap gap-1">
                  {finding.relatedProcesses.map((p) => (
                    <Badge key={p} variant="outline" className="text-xs">{p}</Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Reviewer info */}
            {finding.reviewedBy && (
              <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                리뷰: {finding.reviewedBy}
                {finding.reviewedAt && ` (${new Date(finding.reviewedAt).toLocaleString("ko-KR")})`}
                {finding.reviewerComment && ` — "${finding.reviewerComment}"`}
              </div>
            )}

            {/* HITL Actions */}
            {finding.hitlStatus === "pending" && (
              <div className="space-y-3 pt-2">
                <Textarea
                  placeholder="리뷰 코멘트 (선택)"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={2}
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={reviewing}
                    onClick={() => void handleReview("accept")}
                    className="gap-1"
                  >
                    <CheckCircle className="w-3.5 h-3.5" /> 승인
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={reviewing}
                    onClick={() => void handleReview("reject")}
                    className="gap-1"
                  >
                    <XCircle className="w-3.5 h-3.5" /> 거부
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={reviewing}
                    onClick={() => void handleReview("modify")}
                    className="gap-1"
                  >
                    <Edit3 className="w-3.5 h-3.5" /> 수정
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
