/**
 * Mock-up — Working Mock-up 사이트 iframe 임베드.
 * AIF-REQ-019: 추출 결과물(Skill, 정책, 온톨로지) 기반 핵심 엔진 동작 검증.
 */

import { ExternalLink } from "lucide-react";

const MOCKUP_URL = "https://ai-foundry-mockup-blt.pages.dev";

export default function MockupPage() {
  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1
            className="text-2xl font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            Working Mock-up
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            추출된 Skill · 정책 · 온톨로지 기반 핵심 엔진 동작 검증
          </p>
        </div>
        <a
          href={MOCKUP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors hover:bg-accent/10"
          style={{ color: "var(--accent)" }}
        >
          <ExternalLink className="w-4 h-4" />
          새 탭에서 열기
        </a>
      </div>

      {/* Iframe */}
      <div className="flex-1 rounded-lg border overflow-hidden bg-white dark:bg-zinc-950">
        <iframe
          src={MOCKUP_URL}
          title="AI Foundry Working Mock-up"
          className="w-full h-full border-0"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        />
      </div>
    </div>
  );
}
