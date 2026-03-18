/**
 * WidgetRenderer — AI가 생성한 HTML/SVG를 Sandboxed iframe에서 안전하게 렌더링.
 * Design Doc: AIF-DSGN-024 §3.1 WidgetRenderer.tsx
 *
 * 보안: sandbox="allow-scripts" (NO allow-same-origin)
 * 통신: postMessage bridge (BridgeAction schema 검증)
 * 테마: CSS 변수 주입 + 실시간 동기화 (postMessage)
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { assembleSrcdoc, type BridgeAction, type WidgetType } from "@/lib/widget-bridge";
import type { ThemeVariables } from "@/lib/widget-theme";

export interface WidgetRendererProps {
  content: string;
  type: WidgetType;
  themeVariables: ThemeVariables;
  isDark: boolean;
  onAction: (action: BridgeAction) => void;
  maxHeight?: number | undefined;
  isLoading?: boolean | undefined;
  errorMessage?: string | undefined;
}

const LOADING_PHRASES = [
  "시각화 준비 중...",
  "데이터 분석 중...",
  "렌더링 중...",
  "차트 생성 중...",
  "거의 완료...",
];

export function WidgetRenderer({
  content,
  type,
  themeVariables,
  isDark,
  onAction,
  maxHeight = 600,
  isLoading = false,
  errorMessage,
}: WidgetRendererProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeHeight, setIframeHeight] = useState(200);
  const [isReady, setIsReady] = useState(false);
  const [loadingPhrase, setLoadingPhrase] = useState(0);

  // Skeleton loading phrase cycling
  useEffect(() => {
    if (!isLoading) return;
    const timer = setInterval(() => {
      setLoadingPhrase((prev) => (prev + 1) % LOADING_PHRASES.length);
    }, 1500);
    return () => clearInterval(timer);
  }, [isLoading]);

  // postMessage 이벤트 수신
  const handleMessage = useCallback(
    (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;

      const data = event.data as Record<string, unknown> | null;
      if (!data || typeof data !== "object" || !("type" in data)) return;

      const msgType = data["type"];

      if (msgType === "resize") {
        const height = Number(data["height"]);
        if (!Number.isFinite(height)) return;
        const clamped = Math.max(50, Math.min(height + 8, maxHeight));
        setIframeHeight(clamped);
        onAction({ type: "resize", height: clamped });
        return;
      }

      if (msgType === "ready") {
        setIsReady(true);
        onAction({ type: "ready" });
        return;
      }

      if (msgType === "error") {
        const message = typeof data["message"] === "string" ? data["message"] : "Unknown error";
        onAction({ type: "error", message });
        return;
      }

      if (msgType === "action") {
        const name = typeof data["name"] === "string" ? data["name"] : "";
        const payload = (typeof data["payload"] === "object" && data["payload"] !== null)
          ? data["payload"] as Record<string, unknown>
          : {};
        onAction({ type: "action", name, payload });
      }
    },
    [onAction, maxHeight],
  );

  useEffect(() => {
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [handleMessage]);

  // srcdoc 조립 및 imperative 할당
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !content) return;

    setIsReady(false);
    const srcdoc = assembleSrcdoc(content, type, themeVariables, isDark);
    iframe.srcdoc = srcdoc;
  }, [content, type, themeVariables, isDark]);

  // 테마 실시간 동기화 (postMessage 방식 — 위젯 상태 유지)
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow || !isReady) return;

    iframe.contentWindow.postMessage(
      { type: "theme-update", variables: themeVariables, isDark },
      "*",
    );
  }, [themeVariables, isDark, isReady]);

  // Error state
  if (errorMessage) {
    return (
      <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950 p-6 text-center">
        <div className="text-red-600 dark:text-red-400 text-sm font-medium mb-1">
          렌더링 오류
        </div>
        <p className="text-red-500 dark:text-red-300 text-xs">{errorMessage}</p>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-8">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
          <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
        </div>
        <p className="text-center text-sm text-gray-400 dark:text-gray-500 mt-4">
          {LOADING_PHRASES[loadingPhrase]}
        </p>
      </div>
    );
  }

  // Empty state
  if (!content) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-600 p-8 text-center text-gray-400 dark:text-gray-500 text-sm">
        시각화 콘텐츠를 선택해주세요
      </div>
    );
  }

  return (
    <div className={cn("rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-900")}>
      <iframe
        ref={iframeRef}
        sandbox="allow-scripts"
        style={{
          width: "100%",
          height: iframeHeight,
          border: "none",
          maxHeight,
          display: "block",
        }}
        title="AI Generated Widget"
        referrerPolicy="no-referrer"
      />
    </div>
  );
}
