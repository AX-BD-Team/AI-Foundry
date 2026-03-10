import type { LucideIcon } from "lucide-react";

interface MetricCardProps {
  icon: LucideIcon;
  label: string;
  count: number;
  color: string; // hex or CSS color
  explanation?: string; // "이 수치가 의미하는 것" 한 줄 설명
}

export function MetricCard({ icon: Icon, label, count, color, explanation }: MetricCardProps) {
  return (
    <div
      className="p-4 rounded-lg border"
      style={{
        borderColor: "var(--border)",
        backgroundColor: `color-mix(in srgb, ${color} 10%, transparent)`,
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: `color-mix(in srgb, ${color} 20%, transparent)` }}
        >
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
        <div>
          <div className="text-2xl font-bold" style={{ color }}>
            {count.toLocaleString()}
          </div>
          <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
            {label}
          </div>
        </div>
      </div>
      {explanation && (
        <div
          className="mt-2 pt-2 border-t text-[0.65rem] leading-relaxed"
          style={{ borderColor: `color-mix(in srgb, ${color} 20%, transparent)`, color: "var(--text-secondary)" }}
        >
          {explanation}
        </div>
      )}
    </div>
  );
}
