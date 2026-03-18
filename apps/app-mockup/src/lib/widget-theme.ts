/**
 * Widget Theme — iframe 내부에 주입할 CSS 변수 및 유틸리티 클래스.
 * Design Doc: AIF-DSGN-024 §6 Theme System
 */

/** 테마 CSS 변수 맵 (--aif-* 접두사로 호스트 앱과 충돌 방지) */
export interface ThemeVariables {
  "--aif-primary": string;
  "--aif-bg": string;
  "--aif-bg-secondary": string;
  "--aif-text": string;
  "--aif-text-secondary": string;
  "--aif-accent": string;
  "--aif-success": string;
  "--aif-danger": string;
  "--aif-border": string;
  "--aif-font-body": string;
  "--aif-font-mono": string;
  "--aif-radius": string;
  [key: string]: string;
}

const LIGHT_THEME: ThemeVariables = {
  "--aif-primary": "#1A365D",
  "--aif-bg": "#FFFFFF",
  "--aif-bg-secondary": "#F7FAFC",
  "--aif-text": "#1A202C",
  "--aif-text-secondary": "#718096",
  "--aif-accent": "#F6AD55",
  "--aif-success": "#48BB78",
  "--aif-danger": "#F56565",
  "--aif-border": "#E2E8F0",
  "--aif-font-body": "'Inter', system-ui, sans-serif",
  "--aif-font-mono": "'IBM Plex Mono', 'Fira Code', monospace",
  "--aif-radius": "8px",
};

const DARK_THEME: ThemeVariables = {
  "--aif-primary": "#90CDF4",
  "--aif-bg": "#1A202C",
  "--aif-bg-secondary": "#2D3748",
  "--aif-text": "#E2E8F0",
  "--aif-text-secondary": "#A0AEC0",
  "--aif-accent": "#ED8936",
  "--aif-success": "#68D391",
  "--aif-danger": "#FC8181",
  "--aif-border": "#4A5568",
  "--aif-font-body": "'Inter', system-ui, sans-serif",
  "--aif-font-mono": "'IBM Plex Mono', 'Fira Code', monospace",
  "--aif-radius": "8px",
};

/** 현재 테마 상태에서 iframe용 ThemeVariables를 추출한다 */
export function extractThemeVariables(isDark: boolean): ThemeVariables {
  return isDark ? { ...DARK_THEME } : { ...LIGHT_THEME };
}

/** ThemeVariables를 CSS :root 선언 문자열로 변환한다 */
export function buildThemeStyle(vars: ThemeVariables, isDark: boolean): string {
  const cssVars = Object.entries(vars)
    .map(([key, value]) => `  ${key}: ${value};`)
    .join("\n");

  return `:root {\n${cssVars}\n}\n\nbody {\n  background: var(--aif-bg);\n  color: var(--aif-text);\n  font-family: var(--aif-font-body);\n  margin: 0;\n  padding: 8px;\n  line-height: 1.6;\n}\n\n${isDark ? "html { color-scheme: dark; }" : ""}`;
}

/** SVG 유틸리티 클래스 — iframe 내부의 SVG 요소에서 공통으로 사용 */
export const SVG_UTILITY_CLASSES = `
.c-primary { fill: var(--aif-primary); stroke: var(--aif-primary); }
.c-accent { fill: var(--aif-accent); stroke: var(--aif-accent); }
.c-success { fill: var(--aif-success); stroke: var(--aif-success); }
.c-danger { fill: var(--aif-danger); stroke: var(--aif-danger); }
.c-text { fill: var(--aif-text); }
.c-text-secondary { fill: var(--aif-text-secondary); }
.c-border { stroke: var(--aif-border); }
.t-mono { font-family: var(--aif-font-mono); }
.bg-surface { fill: var(--aif-bg-secondary); }

text { fill: var(--aif-text); font-family: var(--aif-font-body); }
a { color: var(--aif-primary); }

table { border-collapse: collapse; width: 100%; }
th, td { padding: 8px 12px; border: 1px solid var(--aif-border); text-align: left; }
th { background: var(--aif-bg-secondary); font-weight: 600; }
tr:nth-child(even) td { background: var(--aif-bg-secondary); }

code, pre { font-family: var(--aif-font-mono); background: var(--aif-bg-secondary); border-radius: var(--aif-radius); padding: 2px 6px; }
pre { padding: 12px; overflow-x: auto; }
`;

/** CSS 리셋 — iframe 내부의 브라우저 기본 스타일 초기화 */
export const RESET_CSS = `
*, *::before, *::after { box-sizing: border-box; }
body { margin: 0; padding: 8px; }
img, svg { max-width: 100%; height: auto; }
`;
