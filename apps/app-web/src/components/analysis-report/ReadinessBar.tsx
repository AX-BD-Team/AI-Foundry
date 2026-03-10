/**
 * ReadinessBar — horizontal stacked bar showing ✅/⚠️/❌ proportions
 * Used in Executive Summary as a traffic-light-style visualization.
 */

interface ReadinessSegment {
  label: string;
  pct: number;         // 0–100
  color: string;
  icon: string;        // emoji prefix
}

interface ReadinessBarProps {
  segments: ReadinessSegment[];
}

export function ReadinessBar({ segments }: ReadinessBarProps) {
  return (
    <div className="space-y-2">
      {/* Stacked bar */}
      <div className="flex h-6 rounded-full overflow-hidden">
        {segments.map((seg, i) => (
          <div
            key={i}
            className="flex items-center justify-center text-[0.6rem] font-bold text-white transition-all duration-500"
            style={{ width: `${seg.pct}%`, backgroundColor: seg.color }}
          >
            {seg.pct >= 15 ? `${seg.pct}%` : ""}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4">
        {segments.map((seg, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <div
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: seg.color }}
            />
            <span className="text-xs" style={{ color: "var(--text-primary)" }}>
              {seg.icon} {seg.label}
            </span>
            <span className="text-xs font-semibold" style={{ color: seg.color }}>
              {seg.pct}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
