import { describe, it, expect } from "vitest";
import {
  assembleSrcdoc,
  BRIDGE_SCRIPT,
  getCSPPolicy,
  sanitizeWidgetContent,
  buildCSPMeta,
} from "../widget-bridge";
import { extractThemeVariables } from "../widget-theme";

describe("Widget Bridge", () => {
  describe("assembleSrcdoc", () => {
    const themeVars = extractThemeVariables(false);

    it("returns valid HTML with DOCTYPE", () => {
      const html = assembleSrcdoc("<p>Test</p>", "chart", themeVars, false);
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("<html");
      expect(html).toContain("</html>");
    });

    it("includes CSP meta tag", () => {
      const html = assembleSrcdoc("<p>Test</p>", "chart", themeVars, false);
      expect(html).toContain('http-equiv="Content-Security-Policy"');
    });

    it("includes bridge script for chart type", () => {
      const html = assembleSrcdoc("<p>Test</p>", "chart", themeVars, false);
      expect(html).toContain("__bridge");
      expect(html).toContain("ResizeObserver");
    });

    it("does NOT include bridge script for markdown type", () => {
      const html = assembleSrcdoc("<p>Test</p>", "markdown", themeVars, false);
      expect(html).not.toContain("<script>");
    });

    it("includes theme CSS variables", () => {
      const html = assembleSrcdoc("<p>Test</p>", "table", themeVars, false);
      expect(html).toContain("--aif-primary");
      expect(html).toContain("--aif-bg");
      expect(html).toContain("--aif-text");
    });

    it("wraps content in widget-root div", () => {
      const html = assembleSrcdoc("<p>Hello</p>", "chart", themeVars, false);
      expect(html).toContain('<div id="widget-root"><p>Hello</p></div>');
    });

    it("adds dark class to html element when isDark=true", () => {
      const html = assembleSrcdoc("<p>Test</p>", "chart", themeVars, true);
      expect(html).toContain('<html class="dark">');
    });

    it("does not add dark class when isDark=false", () => {
      const html = assembleSrcdoc("<p>Test</p>", "chart", themeVars, false);
      expect(html).toContain('<html class="">');
    });
  });

  describe("getCSPPolicy", () => {
    it("allows inline scripts for chart type", () => {
      const csp = getCSPPolicy("chart");
      expect(csp).toContain("script-src 'unsafe-inline'");
    });

    it("allows inline scripts for graph type", () => {
      const csp = getCSPPolicy("graph");
      expect(csp).toContain("script-src 'unsafe-inline'");
    });

    it("allows inline scripts for diagram type", () => {
      const csp = getCSPPolicy("diagram");
      expect(csp).toContain("script-src 'unsafe-inline'");
    });

    it("does NOT allow scripts for markdown type", () => {
      const csp = getCSPPolicy("markdown");
      expect(csp).not.toContain("script-src");
    });

    it("blocks external resources for all types", () => {
      const types = ["chart", "graph", "diagram", "table", "markdown", "form"] as const;
      for (const type of types) {
        const csp = getCSPPolicy(type);
        expect(csp).toContain("default-src 'none'");
      }
    });
  });

  describe("buildCSPMeta", () => {
    it("returns a valid meta tag", () => {
      const meta = buildCSPMeta("chart");
      expect(meta).toMatch(/^<meta http-equiv="Content-Security-Policy" content="[^"]+">$/);
    });
  });

  describe("sanitizeWidgetContent", () => {
    it("removes meta refresh tags", () => {
      const html = '<meta http-equiv="refresh" content="0;url=evil.com"><p>Safe</p>';
      const { sanitized, warnings } = sanitizeWidgetContent(html);
      expect(sanitized).not.toContain("refresh");
      expect(sanitized).toContain("<p>Safe</p>");
      expect(warnings.length).toBeGreaterThan(0);
    });

    it("removes base tags", () => {
      const html = '<base href="https://evil.com"><p>Content</p>';
      const { sanitized, warnings } = sanitizeWidgetContent(html);
      expect(sanitized).not.toContain("<base");
      expect(warnings).toContain("Removed base tag");
    });

    it("blocks window.open patterns", () => {
      const html = '<button onclick="window.open(\'evil.com\')">Click</button>';
      const { sanitized, warnings } = sanitizeWidgetContent(html);
      expect(sanitized).not.toContain("window.open(");
      expect(warnings.length).toBeGreaterThan(0);
    });

    it("blocks window.location patterns", () => {
      const html = '<script>window.location = "evil.com"</script>';
      const { sanitized } = sanitizeWidgetContent(html);
      expect(sanitized).not.toContain("window.location =");
    });

    it("rejects content exceeding 50KB", () => {
      const html = "x".repeat(51_000);
      const { sanitized, warnings } = sanitizeWidgetContent(html);
      expect(sanitized).toBe("");
      expect(warnings[0]).toContain("50KB");
    });

    it("passes through safe content unchanged", () => {
      const html = "<div><p>Normal content</p></div>";
      const { sanitized, warnings } = sanitizeWidgetContent(html);
      expect(sanitized).toBe(html);
      expect(warnings).toHaveLength(0);
    });
  });

  describe("BRIDGE_SCRIPT", () => {
    it("contains ResizeObserver setup", () => {
      expect(BRIDGE_SCRIPT).toContain("ResizeObserver");
    });

    it("contains postMessage ready event", () => {
      expect(BRIDGE_SCRIPT).toContain("'ready'");
    });

    it("contains window.__bridge.action function", () => {
      expect(BRIDGE_SCRIPT).toContain("__bridge");
      expect(BRIDGE_SCRIPT).toContain("action");
    });

    it("contains theme-update listener", () => {
      expect(BRIDGE_SCRIPT).toContain("theme-update");
    });

    it("contains error handler", () => {
      expect(BRIDGE_SCRIPT).toContain("onerror");
    });
  });

  describe("Theme variables", () => {
    it("light and dark themes return different primary colors", () => {
      const light = extractThemeVariables(false);
      const dark = extractThemeVariables(true);
      expect(light["--aif-primary"]).not.toBe(dark["--aif-primary"]);
    });

    it("light and dark themes return different background colors", () => {
      const light = extractThemeVariables(false);
      const dark = extractThemeVariables(true);
      expect(light["--aif-bg"]).not.toBe(dark["--aif-bg"]);
    });

    it("both themes include font variables", () => {
      const light = extractThemeVariables(false);
      const dark = extractThemeVariables(true);
      expect(light["--aif-font-body"]).toBeTruthy();
      expect(dark["--aif-font-body"]).toBeTruthy();
    });
  });
});
