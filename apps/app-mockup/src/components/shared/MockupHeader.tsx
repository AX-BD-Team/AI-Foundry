import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { useDomain } from "@/contexts/DomainContext";
import { DomainSelector } from "./DomainSelector";
import { cn } from "@/lib/cn";

export function MockupHeader() {
  const { theme, toggleTheme } = useTheme();
  const { domain } = useDomain();

  const accentBarClass = domain.id === "giftvoucher"
    ? "border-t-[3px] border-t-emerald-600"
    : "border-t-[3px] border-t-indigo-600";

  return (
    <header
      className={cn(
        "border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] px-6 py-4",
        accentBarClass,
      )}
    >
      <div className="mx-auto max-w-7xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-gray-50">
              AI Foundry
            </h1>
            <span className="rounded-full bg-gray-100 dark:bg-gray-800 px-3 py-1 text-[11px] font-medium text-gray-500 dark:text-gray-400 tracking-wide uppercase">
              Working Mock-up
            </span>
            {/* Stats bar — muted and compact */}
            <div className="hidden md:flex items-center gap-2 ml-2">
              {([
                { label: "Policies", value: domain.stats.policies },
                { label: "Skills", value: domain.stats.skills },
                { label: "Terms", value: domain.stats.terms },
              ] as const).map((item) => (
                <span
                  key={item.label}
                  className="inline-flex items-center gap-1 text-[11px] text-gray-400 dark:text-gray-500"
                >
                  <span className="font-mono">{item.value.toLocaleString()}</span>
                  <span className="lowercase">{item.label}</span>
                </span>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleTheme}
              className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 dark:text-gray-500 transition-colors"
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {theme === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </button>
            <span className="text-[11px] text-gray-400 dark:text-gray-600 hidden sm:inline">
              Powered by AI Foundry
            </span>
          </div>
        </div>
        <DomainSelector />
      </div>
    </header>
  );
}
