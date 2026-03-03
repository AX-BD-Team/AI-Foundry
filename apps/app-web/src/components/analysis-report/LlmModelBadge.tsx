import { Bot } from "lucide-react";

const PROVIDER_STYLES: Record<string, { bg: string; color: string; border: string }> = {
  anthropic: {
    bg: "rgba(147, 51, 234, 0.1)",
    color: "#9333EA",
    border: "rgba(147, 51, 234, 0.3)",
  },
  openai: {
    bg: "rgba(16, 163, 127, 0.1)",
    color: "#10A37F",
    border: "rgba(16, 163, 127, 0.3)",
  },
  google: {
    bg: "rgba(66, 133, 244, 0.1)",
    color: "#4285F4",
    border: "rgba(66, 133, 244, 0.3)",
  },
  "workers-ai": {
    bg: "rgba(244, 129, 32, 0.1)",
    color: "#F48120",
    border: "rgba(244, 129, 32, 0.3)",
  },
};

const DEFAULT_STYLE = {
  bg: "rgba(107, 114, 128, 0.1)",
  color: "#6B7280",
  border: "rgba(107, 114, 128, 0.3)",
};

interface LlmModelBadgeProps {
  provider: string | null | undefined;
  model: string | null | undefined;
}

export function LlmModelBadge({ provider, model }: LlmModelBadgeProps) {
  if (!model) return null;

  const providerStyle = provider ? PROVIDER_STYLES[provider] : undefined;
  const style = providerStyle ?? DEFAULT_STYLE;

  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
      style={{
        backgroundColor: style.bg,
        color: style.color,
        border: `1px solid ${style.border}`,
      }}
    >
      <Bot className="w-3 h-3" />
      {model}
    </span>
  );
}
