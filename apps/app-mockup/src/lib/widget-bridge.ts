/**
 * Widget Bridge — iframe ↔ parent 통신 프로토콜 및 srcdoc 조립.
 * Design Doc: AIF-DSGN-024 §3.1 + §5 Security Model
 */

import type { ThemeVariables } from "./widget-theme";
import { buildThemeStyle, SVG_UTILITY_CLASSES, RESET_CSS } from "./widget-theme";

/** Widget 콘텐츠 유형 */
export type WidgetType = "chart" | "graph" | "diagram" | "table" | "form" | "markdown";

/** iframe → parent Bridge 액션 */
export type BridgeAction =
  | { type: "resize"; height: number }
  | { type: "action"; name: string; payload: Record<string, unknown> }
  | { type: "error"; message: string }
  | { type: "ready" };

/**
 * Bridge 스크립트 — iframe 내부에서 실행되어 parent와 postMessage 통신을 수행.
 * - window.__bridge.action(name, payload): 위젯 내부 사용자 액션 → parent 전달
 * - ResizeObserver: widget-root 높이 변경 감지 → parent에 resize 이벤트 전송
 * - 에러 핸들링: window.onerror → parent에 error 이벤트 전송
 * - 테마 동기화: parent의 theme-update 메시지를 수신하여 CSS 변수 업데이트
 */
export const BRIDGE_SCRIPT = `
(function() {
  var ORIGIN = '*';
  var root = document.getElementById('widget-root');
  if (!root) return;

  window.parent.postMessage({ type: 'ready' }, ORIGIN);

  var ro = new ResizeObserver(function(entries) {
    for (var i = 0; i < entries.length; i++) {
      var height = Math.ceil(entries[i].contentRect.height) + 16;
      window.parent.postMessage({ type: 'resize', height: height }, ORIGIN);
    }
  });
  ro.observe(root);

  window.onerror = function(msg) {
    window.parent.postMessage({ type: 'error', message: String(msg) }, ORIGIN);
  };

  window.__bridge = {
    action: function(name, payload) {
      window.parent.postMessage(
        { type: 'action', name: name, payload: payload || {} },
        ORIGIN
      );
    }
  };

  window.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'theme-update') {
      var vars = event.data.variables;
      var docEl = document.documentElement;
      for (var key in vars) {
        if (Object.prototype.hasOwnProperty.call(vars, key)) {
          docEl.style.setProperty(key, vars[key]);
        }
      }
      if (event.data.isDark) {
        docEl.classList.add('dark');
      } else {
        docEl.classList.remove('dark');
      }
    }
  });
})();
`;

/** CSP 정책 유형별 분기 — 외부 리소스를 완전 차단하면서 인라인 스크립트/스타일만 허용 */
export function getCSPPolicy(type: WidgetType): string {
  const base = "default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:;";

  switch (type) {
    case "chart":
    case "graph":
    case "table":
    case "diagram":
      return `${base} script-src 'unsafe-inline';`;
    case "markdown":
      return base;
    case "form":
      return base;
    default:
      return base;
  }
}

/** CSP 메타 태그 문자열 생성 */
export function buildCSPMeta(type: WidgetType): string {
  return `<meta http-equiv="Content-Security-Policy" content="${getCSPPolicy(type)}">`;
}

/** AI 생성 HTML을 srcdoc에 주입하기 전에 위험 요소를 제거한다 */
export function sanitizeWidgetContent(html: string): { sanitized: string; warnings: string[] } {
  const warnings: string[] = [];
  let sanitized = html;

  if (new Blob([html]).size > 50_000) {
    return { sanitized: "", warnings: ["Content exceeds 50KB limit"] };
  }

  sanitized = sanitized.replace(/<meta[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi, () => {
    warnings.push("Removed meta refresh tag");
    return "";
  });

  sanitized = sanitized.replace(/<base[^>]*>/gi, () => {
    warnings.push("Removed base tag");
    return "";
  });

  sanitized = sanitized.replace(/window\.(open|location)\s*[=(]/g, (match) => {
    warnings.push(`Removed ${match}`);
    return "/* blocked */void(";
  });

  return { sanitized, warnings };
}

/**
 * 완전한 srcdoc HTML 문서를 5개 레이어로 조립한다.
 * L1: CSP 메타 태그
 * L2: 테마 CSS 변수 + 리셋 + SVG 유틸리티
 * L3: 위젯 콘텐츠 (sanitized)
 * L4: Bridge 스크립트
 * L5: 리소스 제한 (maxHeight 등은 iframe 속성으로 처리)
 */
export function assembleSrcdoc(
  content: string,
  type: WidgetType,
  themeVars: ThemeVariables,
  isDark: boolean,
): string {
  const { sanitized } = sanitizeWidgetContent(content);
  const cspMeta = buildCSPMeta(type);
  const themeStyle = buildThemeStyle(themeVars, isDark);
  const needsScript = type !== "markdown" && type !== "form";

  return `<!DOCTYPE html>
<html class="${isDark ? "dark" : ""}">
<head>
  <meta charset="utf-8">
  ${cspMeta}
  <style>${RESET_CSS}</style>
  <style>${themeStyle}</style>
  <style>${SVG_UTILITY_CLASSES}</style>
</head>
<body>
  <div id="widget-root">${sanitized}</div>
  ${needsScript ? `<script>${BRIDGE_SCRIPT}</script>` : ""}
</body>
</html>`;
}
