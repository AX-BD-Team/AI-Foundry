import { useState } from "react";
import { ChevronDown } from "lucide-react";

interface CollapsibleSectionProps {
  icon: React.ElementType;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

export function CollapsibleSection({
  icon: Icon,
  title,
  subtitle,
  children,
  defaultOpen = false,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="rounded-lg border overflow-hidden" style={{ borderColor: "var(--border)" }}>
      <button
        type="button"
        className="w-full flex items-center gap-3 p-4 text-left transition-colors"
        style={{ backgroundColor: open ? "var(--bg-secondary)" : "transparent" }}
        onClick={() => setOpen((v) => !v)}
      >
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: "color-mix(in srgb, var(--accent) 15%, transparent)" }}
        >
          <Icon className="w-4 h-4" style={{ color: "var(--accent)" }} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            {title}
          </h3>
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{subtitle}</p>
        </div>
        <ChevronDown
          className="w-4 h-4 flex-shrink-0 transition-transform duration-200"
          style={{
            color: "var(--text-secondary)",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </button>
      {open && (
        <div className="p-4 pt-0">
          {children}
        </div>
      )}
    </section>
  );
}
