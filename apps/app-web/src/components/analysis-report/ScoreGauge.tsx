/**
 * ScoreGauge — circular gauge with score label
 * Used in Executive Summary to show overall readiness score.
 */

interface ScoreGaugeProps {
  score: number;       // 0–100
  label: string;       // e.g. "활용 준비도"
  size?: number;       // px, default 120
}

function getScoreColor(score: number): string {
  if (score >= 80) return "#10b981";
  if (score >= 50) return "#f59e0b";
  return "#ef4444";
}

function getScoreLabel(score: number): string {
  if (score >= 80) return "활용 가능";
  if (score >= 50) return "조건부 활용";
  return "보완 필요";
}

export function ScoreGauge({ score, label, size = 120 }: ScoreGaugeProps) {
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(Math.max(score, 0), 100);
  const dashOffset = circumference * (1 - progress / 100);
  const color = getScoreColor(score);

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          {/* Background track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--border)"
            strokeWidth={strokeWidth}
          />
          {/* Progress arc */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            className="transition-all duration-700"
          />
        </svg>
        {/* Center label */}
        <div
          className="absolute inset-0 flex flex-col items-center justify-center"
        >
          <span className="text-2xl font-bold" style={{ color }}>{score}</span>
          <span className="text-[0.6rem]" style={{ color: "var(--text-secondary)" }}>/100</span>
        </div>
      </div>
      <span className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
        {label}
      </span>
      <span
        className="text-[0.65rem] px-2 py-0.5 rounded-full"
        style={{ backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`, color }}
      >
        {getScoreLabel(score)}
      </span>
    </div>
  );
}
