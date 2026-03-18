import { useDomain } from "@/contexts/DomainContext";
import { DOMAINS } from "@/types/demo";
import { cn } from "@/lib/cn";

function getDomainStyles(domainId: string, isSelected: boolean) {
  if (domainId === "giftvoucher") {
    return isSelected
      ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 ring-1 ring-emerald-200 dark:ring-emerald-800 shadow-sm"
      : "border-gray-200 dark:border-gray-700 hover:border-emerald-300 dark:hover:border-emerald-700";
  }
  return isSelected
    ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 ring-1 ring-indigo-200 dark:ring-indigo-800 shadow-sm"
    : "border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-700";
}

function getDomainAccentDot(domainId: string) {
  return domainId === "giftvoucher" ? "bg-emerald-500" : "bg-indigo-500";
}

export function DomainSelector() {
  const { domain, setDomainById } = useDomain();

  return (
    <div className="flex gap-3">
      {DOMAINS.map((d) => {
        const isSelected = domain.id === d.id;
        return (
          <button
            key={d.id}
            onClick={() => setDomainById(d.id)}
            className={cn(
              "flex items-center gap-3 rounded-xl border-2 px-5 py-3.5 text-left transition-all",
              getDomainStyles(d.id, isSelected),
            )}
          >
            <span className="text-3xl leading-none">{d.emoji}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">{d.name}</span>
                <span className={cn("w-1.5 h-1.5 rounded-full", isSelected ? getDomainAccentDot(d.id) : "bg-transparent")} />
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{d.description}</div>
            </div>
            <div className="flex flex-col gap-1 ml-2">
              <span className="rounded-md bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-[11px] font-mono text-gray-600 dark:text-gray-400 text-right">
                {d.stats.policies.toLocaleString()} policies
              </span>
              <span className="rounded-md bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-[11px] font-mono text-gray-600 dark:text-gray-400 text-right">
                {d.stats.skills.toLocaleString()} skills
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
