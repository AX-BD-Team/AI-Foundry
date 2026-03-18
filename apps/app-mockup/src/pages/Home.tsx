import { useState } from "react";
import { MockupHeader } from "@/components/shared/MockupHeader";
import { PolicyEngineDemo } from "@/components/demo/policy/PolicyEngineDemo";
import { SkillInvokerDemo } from "@/components/demo/skill/SkillInvokerDemo";
import { OntologyExplorerDemo } from "@/components/demo/ontology/OntologyExplorerDemo";
import { DeliverablePreviewDemo } from "@/components/demo/deliverable/DeliverablePreviewDemo";
import { useDomain } from "@/contexts/DomainContext";
import { cn } from "@/lib/cn";

const TABS = [
  { id: "policy", label: "정책 엔진", emoji: "📋" },
  { id: "skill", label: "Skill 호출", emoji: "🔧" },
  { id: "ontology", label: "온톨로지", emoji: "🌐" },
  { id: "deliverable", label: "산출물", emoji: "📄" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function getDomainAccentClass(domainId: string): string {
  return domainId === "giftvoucher" ? "bg-emerald-600" : "bg-indigo-600";
}

function getDomainBorderClass(domainId: string): string {
  return domainId === "giftvoucher"
    ? "border-emerald-500 text-emerald-700 dark:text-emerald-300"
    : "border-indigo-500 text-indigo-700 dark:text-indigo-300";
}

function getDomainBgClass(domainId: string): string {
  return domainId === "giftvoucher"
    ? "bg-emerald-50 dark:bg-emerald-950/40"
    : "bg-indigo-50 dark:bg-indigo-950/40";
}

export function Home() {
  const [activeTab, setActiveTab] = useState<TabId>("policy");
  const { domain } = useDomain();

  return (
    <div className="min-h-screen bg-[#FAFAF8] dark:bg-[#0F0F0F] text-gray-900 dark:text-gray-100">
      <MockupHeader />

      {/* Domain Context Indicator */}
      <div className={cn("border-b", getDomainBgClass(domain.id))}>
        <div className="mx-auto max-w-7xl px-6 py-2.5 flex items-center gap-3">
          <div className={cn("w-2 h-2 rounded-full", getDomainAccentClass(domain.id))} />
          <span className={cn("text-sm font-medium", getDomainBorderClass(domain.id))}>
            현재 도메인: {domain.emoji} {domain.name} ({domain.organizationId})
          </span>
          <div className="page-divider flex-1 mx-3" />
          <span className="text-xs text-gray-400 dark:text-gray-500 font-mono">
            {domain.stats.policies.toLocaleString()} policies &middot; {domain.stats.skills.toLocaleString()} skills &middot; {domain.stats.terms.toLocaleString()} terms
          </span>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-6 py-8">
        {/* Page Title */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-50">
            {domain.emoji} {domain.name}
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {domain.description}
          </p>
        </div>

        {/* Divider */}
        <div className="page-divider mb-6" />

        {/* Tab bar — pill style */}
        <div className="flex gap-1.5 rounded-xl bg-gray-100/80 dark:bg-gray-800/60 p-1.5 mb-8">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium transition-all",
                activeTab === tab.id
                  ? cn(
                      "shadow-sm",
                      domain.id === "giftvoucher"
                        ? "bg-white dark:bg-gray-700 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-200 dark:ring-emerald-800"
                        : "bg-white dark:bg-gray-700 text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-200 dark:ring-indigo-800",
                    )
                  : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-white/50 dark:hover:bg-gray-700/50",
              )}
            >
              <span className="text-base">{tab.emoji}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div key={`${domain.id}-${activeTab}`}>
          {activeTab === "policy" && (
            <div id="demo-policy">
              <PolicyEngineDemo />
            </div>
          )}
          {activeTab === "skill" && (
            <div id="demo-skill">
              <SkillInvokerDemo />
            </div>
          )}
          {activeTab === "ontology" && (
            <div id="demo-ontology">
              <OntologyExplorerDemo />
            </div>
          )}
          {activeTab === "deliverable" && (
            <div id="demo-deliverable">
              <DeliverablePreviewDemo />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
