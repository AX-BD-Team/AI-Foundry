import { Card, CardContent } from '@/components/ui/card';

interface CoverageCardProps {
  label: string;
  labelEn: string;
  value: number;
  target?: number;
  pass?: boolean;
  icon?: React.ReactNode;
}

export function CoverageCard({ label, labelEn, value, target, pass, icon }: CoverageCardProps) {
  const pct = Math.round(value * 100) / 100;
  const circumference = 2 * Math.PI * 36;
  const dashOffset = circumference - (circumference * Math.min(pct, 100)) / 100;

  const getColor = () => {
    if (pass !== undefined) return pass ? '#22C55E' : '#EF4444';
    if (pct >= 80) return '#22C55E';
    if (pct >= 50) return '#F59E0B';
    return '#EF4444';
  };

  const color = getColor();

  return (
    <Card className="shadow-sm">
      <CardContent className="p-6">
        <div className="flex items-center gap-4">
          <div className="relative w-20 h-20 shrink-0">
            <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
              <circle
                cx="40" cy="40" r="36"
                fill="none"
                stroke="var(--border)"
                strokeWidth="6"
              />
              <circle
                cx="40" cy="40" r="36"
                fill="none"
                stroke={color}
                strokeWidth="6"
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
                strokeLinecap="round"
                className="transition-all duration-500"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-sm font-bold" style={{ color }}>{pct}%</span>
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{label}</div>
            <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>{labelEn}</div>
            {target !== undefined && (
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  Target: {target}%
                </span>
                {pass !== undefined && (
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                    style={{
                      backgroundColor: pass ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                      color: pass ? '#22C55E' : '#EF4444',
                    }}
                  >
                    {pass ? 'PASS' : 'FAIL'}
                  </span>
                )}
              </div>
            )}
          </div>
          {icon && (
            <div className="shrink-0 opacity-20">{icon}</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
