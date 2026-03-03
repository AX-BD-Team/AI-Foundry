import { useState } from "react";
import { RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { LlmProvider, LlmTier } from "@/api/analysis";

const PROVIDERS: { value: LlmProvider; label: string; color: string }[] = [
  { value: "anthropic", label: "Anthropic (Claude)", color: "#9333EA" },
  { value: "openai", label: "OpenAI (GPT)", color: "#10A37F" },
  { value: "google", label: "Google (Gemini)", color: "#4285F4" },
  { value: "workers-ai", label: "Workers AI (Llama)", color: "#F48120" },
];

const TIERS: { value: LlmTier; label: string; description: string }[] = [
  { value: "sonnet", label: "Sonnet / 고품질", description: "정밀 분석 (느림, 높은 품질)" },
  { value: "haiku", label: "Haiku / 경량", description: "빠른 분석 (빠름, 합리적 품질)" },
];

interface ReanalysisPopoverProps {
  currentProvider?: string;
  currentModel?: string;
  onReanalyze: (provider: LlmProvider, tier: LlmTier) => Promise<void>;
  disabled?: boolean;
}

export function ReanalysisPopover({
  currentProvider,
  currentModel,
  onReanalyze,
  disabled,
}: ReanalysisPopoverProps) {
  const [open, setOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<LlmProvider>(
    (currentProvider as LlmProvider) || "anthropic"
  );
  const [selectedTier, setSelectedTier] = useState<LlmTier>("sonnet");
  const [loading, setLoading] = useState(false);

  async function handleReanalyze() {
    setLoading(true);
    try {
      await onReanalyze(selectedProvider, selectedTier);
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs"
          disabled={disabled}
        >
          <RefreshCw className="w-3.5 h-3.5" />
          다른 모델로 재분석
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <div className="space-y-4">
          <div>
            <h4
              className="text-sm font-semibold mb-1"
              style={{ color: "var(--text-primary)" }}
            >
              모델 변경 재분석
            </h4>
            {currentModel && (
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                현재: {currentModel} ({currentProvider})
              </p>
            )}
          </div>

          {/* Provider Selection */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">Provider</Label>
            <div className="grid grid-cols-2 gap-1.5">
              {PROVIDERS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors border"
                  style={{
                    backgroundColor:
                      selectedProvider === p.value
                        ? `${p.color}15`
                        : "transparent",
                    borderColor:
                      selectedProvider === p.value
                        ? `${p.color}40`
                        : "var(--border)",
                    color:
                      selectedProvider === p.value
                        ? p.color
                        : "var(--text-secondary)",
                  }}
                  onClick={() => setSelectedProvider(p.value)}
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: p.color }}
                  />
                  {p.label.split(" ")[0]}
                </button>
              ))}
            </div>
          </div>

          {/* Tier Selection */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">Tier</Label>
            <div className="space-y-1.5">
              {TIERS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  className="flex items-center justify-between w-full px-3 py-2 rounded-md text-xs transition-colors border"
                  style={{
                    backgroundColor:
                      selectedTier === t.value
                        ? "rgba(59, 130, 246, 0.08)"
                        : "transparent",
                    borderColor:
                      selectedTier === t.value
                        ? "rgba(59, 130, 246, 0.4)"
                        : "var(--border)",
                    color: "var(--text-primary)",
                  }}
                  onClick={() => setSelectedTier(t.value)}
                >
                  <span className="font-medium">{t.label}</span>
                  <span style={{ color: "var(--text-secondary)" }}>
                    {t.description}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Action */}
          <div className="flex items-center justify-between pt-1">
            <p
              className="text-[11px]"
              style={{ color: "var(--text-secondary)" }}
            >
              기존 분석 결과가 교체됩니다
            </p>
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => void handleReanalyze()}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              {loading ? "분석 중..." : "재분석 실행"}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
