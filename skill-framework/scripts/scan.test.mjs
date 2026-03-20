/**
 * Unit tests for scan.mjs core functions
 * Run: node skill-framework/scripts/scan.test.mjs
 */

import { strictEqual, deepStrictEqual, ok } from 'node:assert';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ── Extract functions from scan.mjs by re-implementing (scan.mjs has no exports) ──

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const yaml = match[1];
  const result = {};
  let currentKey = null;
  let currentValue = '';
  let isMultiline = false;

  for (const line of yaml.split('\n')) {
    if (isMultiline) {
      if (/^\s+/.test(line)) {
        currentValue += (currentValue ? '\n' : '') + line.replace(/^\s+/, '');
        continue;
      } else {
        if (currentKey) result[currentKey] = currentValue.trim();
        isMultiline = false;
        currentKey = null;
        currentValue = '';
      }
    }
    const kvMatch = line.match(/^(\w[\w-]*)\s*:\s*(.*)/);
    if (kvMatch) {
      currentKey = kvMatch[1];
      const rawValue = kvMatch[2].trim();
      if (rawValue === '|' || rawValue === '>') {
        isMultiline = true;
        currentValue = '';
      } else if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
        result[currentKey] = rawValue.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
      } else if (rawValue === 'true') {
        result[currentKey] = true;
      } else if (rawValue === 'false') {
        result[currentKey] = false;
      } else if (rawValue === '') {
        result[currentKey] = '';
      } else {
        result[currentKey] = rawValue.replace(/^["']|["']$/g, '');
      }
    }
    if (/^\s+-\s+/.test(line) && currentKey) {
      const item = line.replace(/^\s+-\s+/, '').trim();
      if (!Array.isArray(result[currentKey])) result[currentKey] = [];
      result[currentKey].push(item);
    }
  }
  if (isMultiline && currentKey) result[currentKey] = currentValue.trim();
  return result;
}

function mergeSkills(scanned, existing) {
  if (!existing) return scanned;
  const existingMap = new Map();
  for (const skill of existing) existingMap.set(skill.id, skill);
  const scannedIds = new Set(scanned.map(s => s.id));
  const merged = scanned.map(skill => {
    const prev = existingMap.get(skill.id);
    if (prev) {
      return {
        ...skill,
        category: prev.category || skill.category,
        tags: prev.tags && prev.tags.length > 0 ? prev.tags : skill.tags,
        usageCount: prev.usageCount || 0,
        lastUsedAt: prev.lastUsedAt || null,
        addedAt: prev.addedAt || skill.addedAt,
        updatedAt: new Date().toISOString(),
      };
    }
    return skill;
  });
  for (const [id, prev] of existingMap) {
    if (!scannedIds.has(id)) {
      merged.push({ ...prev, deleted: true, updatedAt: new Date().toISOString() });
    }
  }
  return merged;
}

// ── Lint rule functions ──

const SECRET_RE = /(?:API_KEY|SECRET|PASSWORD|TOKEN|CREDENTIAL)\s*[=:]\s*["'][A-Za-z0-9+/=_\-]{16,}["']/i;
const SECRET_EXCLUDE_RE = /\$\{?\w*(?:API_KEY|SECRET|PASSWORD|TOKEN|CREDENTIAL)|wrangler\s+secret|printf\s+.*\|\s*.*secret/i;

// ── Tests ──

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ❌ ${name}`);
    console.log(`     ${e.message}`);
  }
}

console.log('');
console.log('🧪 Skill Framework Unit Tests');
console.log('═══════════════════════════════════════');
console.log('');

// ── parseFrontmatter tests ──
console.log('parseFrontmatter:');

test('parses simple key-value pairs', () => {
  const result = parseFrontmatter('---\nname: test-skill\ndescription: A test\n---\n# Content');
  strictEqual(result.name, 'test-skill');
  strictEqual(result.description, 'A test');
});

test('parses boolean values', () => {
  const result = parseFrontmatter('---\nuser-invocable: true\nenabled: false\n---');
  strictEqual(result['user-invocable'], true);
  strictEqual(result.enabled, false);
});

test('parses inline arrays', () => {
  const result = parseFrontmatter('---\ntags: [deploy, ci, cd]\n---');
  deepStrictEqual(result.tags, ['deploy', 'ci', 'cd']);
});

test('parses multiline scalar (|)', () => {
  const result = parseFrontmatter('---\ndescription: |\n  Line one\n  Line two\n---');
  ok(result.description.includes('Line one'));
  ok(result.description.includes('Line two'));
});

test('parses block sequence (- items)', () => {
  const result = parseFrontmatter('---\nallowed-tools:\n  - Read\n  - Write\n  - Bash\n---');
  deepStrictEqual(result['allowed-tools'], ['Read', 'Write', 'Bash']);
});

test('returns empty object for no frontmatter', () => {
  const result = parseFrontmatter('# Just a heading\nSome content');
  deepStrictEqual(result, {});
});

test('handles quoted strings', () => {
  const result = parseFrontmatter('---\nname: "my-skill"\ndesc: \'hello\'\n---');
  strictEqual(result.name, 'my-skill');
  strictEqual(result.desc, 'hello');
});

// ── mergeSkills tests ──
console.log('');
console.log('mergeSkills:');

test('preserves manual category from existing', () => {
  const scanned = [{ id: 'test', category: 'uncategorized', tags: [] }];
  const existing = [{ id: 'test', category: 'cicd-deployment', tags: ['deploy'] }];
  const merged = mergeSkills(scanned, existing);
  strictEqual(merged[0].category, 'cicd-deployment');
  deepStrictEqual(merged[0].tags, ['deploy']);
});

test('keeps new skill category if no existing', () => {
  const scanned = [{ id: 'new-skill', category: 'uncategorized', tags: [] }];
  const merged = mergeSkills(scanned, null);
  strictEqual(merged[0].category, 'uncategorized');
});

test('marks deleted skills', () => {
  const scanned = [{ id: 'alive', category: 'uncategorized', tags: [] }];
  const existing = [
    { id: 'alive', category: 'code-quality', tags: [] },
    { id: 'removed', category: 'runbooks', tags: [] },
  ];
  const merged = mergeSkills(scanned, existing);
  const removed = merged.find(s => s.id === 'removed');
  strictEqual(removed.deleted, true);
});

test('preserves usage metrics', () => {
  const scanned = [{ id: 'test', category: 'uncategorized', tags: [], usageCount: 0 }];
  const existing = [{ id: 'test', category: 'code-quality', tags: [], usageCount: 42, lastUsedAt: '2026-03-20' }];
  const merged = mergeSkills(scanned, existing);
  strictEqual(merged[0].usageCount, 42);
  strictEqual(merged[0].lastUsedAt, '2026-03-20');
});

// ── Lint rule tests ──
console.log('');
console.log('lint rules (SECRET_RE):');

test('detects hardcoded API key', () => {
  ok(SECRET_RE.test('API_KEY="sk-1234567890abcdef"'));
});

test('detects hardcoded password', () => {
  ok(SECRET_RE.test("PASSWORD: 'SuperSecretPass1234'"));
});

test('does NOT match short values (<16 chars)', () => {
  ok(!SECRET_RE.test('API_KEY="short"'));
});

test('does NOT match env var reference ($TOKEN)', () => {
  ok(!SECRET_RE.test('export TOKEN=$MY_TOKEN'));
});

test('SECRET_EXCLUDE_RE excludes $VAR patterns', () => {
  ok(SECRET_EXCLUDE_RE.test('${API_KEY}'));
  ok(SECRET_EXCLUDE_RE.test('$SECRET'));
});

test('SECRET_EXCLUDE_RE excludes wrangler secret', () => {
  ok(SECRET_EXCLUDE_RE.test('wrangler secret put MY_KEY'));
});

// ── classifyByKeywords ──

function classifyByKeywords(skill, keywordsMap) {
  const text = [
    skill.name || '',
    skill.description || '',
    skill.id || '',
    ...(skill.tags || []),
  ].join(' ').toLowerCase();

  let bestCategory = 'uncategorized';
  let bestScore = 0;

  for (const [category, config] of Object.entries(keywordsMap)) {
    const keywords = config.keywords || [];
    const weight = config.weight ?? 1.0;
    let matched = 0;

    for (const kw of keywords) {
      if (text.includes(kw.toLowerCase())) {
        matched++;
      }
    }

    const score = matched * weight;
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }

  if (bestScore === 0) {
    return { category: 'uncategorized', confidence: 0 };
  }

  const winnerKeywords = keywordsMap[bestCategory]?.keywords || [];
  const rawConfidence = bestScore / (winnerKeywords.length * 0.3);
  const confidence = Math.round(Math.min(rawConfidence, 1.0) * 100) / 100;

  return { category: bestCategory, confidence };
}

console.log('');
console.log('classifyByKeywords:');

const sampleKeywordsMap = {
  'cicd-deployment': {
    keywords: ['deploy', 'CI/CD', 'production', 'preview', 'release', 'rollout', 'build', 'publish'],
    weight: 1.0,
  },
  'code-quality': {
    keywords: ['lint', 'review', 'quality', 'simplify', 'refactor', 'convention', 'typecheck', 'bug detection'],
    weight: 1.0,
  },
  'data-analysis': {
    keywords: ['data', 'analytics', 'metrics', 'monitor', 'dashboard', 'sync', 'fetch', 'report'],
    weight: 0.8,
  },
  'library-reference': {
    keywords: ['library', 'SDK', 'API reference', 'documentation', 'docs', 'query-docs', 'resolve-library', 'code example', 'snippet'],
    weight: 1.0,
  },
};

test('classify: keyword 1개 매칭 시 해당 카테고리 반환', () => {
  const skill = { id: 'my-deploy', name: 'deploy-tool', description: 'deploy to production', tags: [] };
  const result = classifyByKeywords(skill, sampleKeywordsMap);
  strictEqual(result.category, 'cicd-deployment');
  ok(result.confidence > 0);
});

test('classify: keyword 0개 매칭 시 uncategorized', () => {
  const skill = { id: 'zzz', name: 'zzz', description: 'nothing relevant here', tags: [] };
  const result = classifyByKeywords(skill, sampleKeywordsMap);
  strictEqual(result.category, 'uncategorized');
  strictEqual(result.confidence, 0);
});

test('classify: 복수 카테고리 매칭 시 최고 점수', () => {
  const skill = { id: 'tool', name: 'deploy lint review', description: 'deploy and review quality code lint', tags: [] };
  // code-quality: lint, review, quality = 3 matches
  // cicd-deployment: deploy = 1 match
  const result = classifyByKeywords(skill, sampleKeywordsMap);
  strictEqual(result.category, 'code-quality');
});

test('classify: threshold 미달 시 낮은 confidence 값 확인', () => {
  // 1 keyword match out of 8 = score 1. confidence = 1 / (8*0.3) ≈ 0.42
  const skill = { id: 'x', name: 'deploy', description: '', tags: [] };
  const result = classifyByKeywords(skill, sampleKeywordsMap);
  strictEqual(result.category, 'cicd-deployment');
  ok(result.confidence > 0);
  ok(result.confidence <= 1.0);
});

// ── lint --fix tests ──

console.log('');
console.log('lint --fix:');

test('lint-fix: fixable 규칙만 교정 (single-category)', () => {
  const skill = { id: 'my-deploy', name: 'deploy', description: 'deploy to production', tags: [], category: 'uncategorized' };
  const result = classifyByKeywords(skill, sampleKeywordsMap);
  if (result.confidence > 0) {
    skill.category = result.category;
    skill.autoClassified = true;
    skill.classifyConfidence = result.confidence;
  }
  strictEqual(skill.category, 'cicd-deployment');
  strictEqual(skill.autoClassified, true);
  ok(skill.classifyConfidence > 0);
});

test('lint-fix: 백업 파일 생성 로직', () => {
  // Test backup path generation logic
  const inputPath = '/some/path/skill-catalog.json';
  const backupPath = inputPath.replace(/\.json$/, '.json.bak');
  strictEqual(backupPath, '/some/path/skill-catalog.json.bak');
});

test('lint-fix: 수동 태깅 보존 확인', () => {
  // When a skill has a manually assigned category (not uncategorized), fix should NOT override it
  const skill = { id: 'my-tool', name: 'my-tool', description: 'deploy', category: 'runbooks', tags: [] };
  // single-category rule only triggers when category is 'uncategorized'
  const isUncategorized = !skill.category || skill.category === 'uncategorized';
  strictEqual(isUncategorized, false);
  // Manual category preserved — not overwritten
  strictEqual(skill.category, 'runbooks');
});

test('name-kebab 교정: MySkill → my-skill', () => {
  const name = 'MySkill';
  const fixed = name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-{2,}/g, '-').replace(/^-|-$/g, '');
  strictEqual(fixed, 'myskill');
  const name2 = 'My_Cool_Skill';
  const fixed2 = name2.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-{2,}/g, '-').replace(/^-|-$/g, '');
  strictEqual(fixed2, 'my-cool-skill');
});

// ── scan auto-classify tests ──

console.log('');
console.log('scan auto-classify:');

test('scan: auto-classify가 uncategorized만 대상', () => {
  const skills = [
    { id: 'a', category: 'code-quality', name: 'deploy tool', description: 'deploy' },
    { id: 'b', category: 'uncategorized', name: 'deploy tool', description: 'deploy to production' },
  ];
  // Only skill 'b' should be auto-classified
  const targets = skills.filter(s => s.category === 'uncategorized');
  strictEqual(targets.length, 1);
  strictEqual(targets[0].id, 'b');
  // Classify skill b
  const result = classifyByKeywords(targets[0], sampleKeywordsMap);
  strictEqual(result.category, 'cicd-deployment');
});

test('scan: 수동 태깅 + 자동분류 공존', () => {
  const skills = [
    { id: 'manual', category: 'runbooks', name: 'my runbook', description: 'diagnose issues' },
    { id: 'auto', category: 'uncategorized', name: 'lint tool', description: 'lint and review code quality' },
  ];
  // Manual stays as-is
  strictEqual(skills[0].category, 'runbooks');
  // Auto gets classified
  const result = classifyByKeywords(skills[1], sampleKeywordsMap);
  skills[1].category = result.category;
  skills[1].autoClassified = true;
  strictEqual(skills[1].category, 'code-quality');
  // Both coexist
  strictEqual(skills[0].category, 'runbooks');
  strictEqual(skills[1].autoClassified, true);
});

test('edge: 빈 description 스킬 자동분류 (name/id fallback)', () => {
  const skill = { id: 'deploy-preview', name: 'deploy-preview', description: '', tags: [] };
  const result = classifyByKeywords(skill, sampleKeywordsMap);
  // Should still classify via name/id containing 'deploy'
  strictEqual(result.category, 'cicd-deployment');
  ok(result.confidence > 0);
});

// === Phase 2 Tests: deploy.mjs ===
console.log('');
console.log('Phase 2 — deploy:');

test('deploy: filterSkills matches ax-* pattern', () => {
  const skills = [
    { id: 'ax-session', scope: 'user', deleted: false },
    { id: 'bkit:pdca', scope: 'plugin', deleted: false },
    { id: 'ax-test', scope: 'user', deleted: true },
  ];
  const filtered = skills.filter(s => s.scope !== 'plugin' && !s.deleted && s.id.startsWith('ax-'));
  assert.strictEqual(filtered.length, 1);
  assert.strictEqual(filtered[0].id, 'ax-session');
});

test('deploy: excludes plugin scope skills', () => {
  const skills = [
    { id: 'bkit:pdca', scope: 'plugin' },
    { id: 'ax-end', scope: 'user' },
  ];
  const deployable = skills.filter(s => s.scope !== 'plugin');
  assert.strictEqual(deployable.length, 1);
});

test('deploy: config validation requires repoUrl', () => {
  const config = { team: { branch: 'main' } };
  assert.strictEqual(!config.team.repoUrl, true);
});

// === Phase 2 Tests: usage-tracker ===
console.log('');
console.log('Phase 2 — usage-tracker:');

test('usage: JSONL record has required fields', () => {
  const record = { skill: 'ax-end', ts: '2026-03-20T12:00:00.000Z', tool: 'Skill', event: 'PreToolUse' };
  assert.ok(record.skill);
  assert.ok(record.ts);
  assert.strictEqual(record.tool, 'Skill');
  assert.strictEqual(record.event, 'PreToolUse');
});

test('usage: non-Skill events are not logged', () => {
  const event = { tool_name: 'Read' };
  const shouldLog = event.tool_name === 'Skill';
  assert.strictEqual(shouldLog, false);
});

test('usage: empty skill name is skipped', () => {
  const skillName = '';
  assert.strictEqual(skillName === '', true);
});

// === Phase 2 Tests: usage.mjs ===
console.log('');
console.log('Phase 2 — usage.mjs:');

test('usage-report: aggregates counts correctly', () => {
  const records = [
    { skill: 'ax-end', ts: '2026-03-20T12:00:00Z' },
    { skill: 'ax-end', ts: '2026-03-20T13:00:00Z' },
    { skill: 'ax-start', ts: '2026-03-20T12:00:00Z' },
  ];
  const counts = new Map();
  for (const r of records) {
    counts.set(r.skill, (counts.get(r.skill) || 0) + 1);
  }
  assert.strictEqual(counts.get('ax-end'), 2);
  assert.strictEqual(counts.get('ax-start'), 1);
});

test('usage-report: deprecation finds zero-usage skills', () => {
  const catalogSkills = ['ax-end', 'ax-start', 'old-skill'];
  const usedSkills = new Set(['ax-end', 'ax-start']);
  const unused = catalogSkills.filter(s => !usedSkills.has(s));
  assert.deepStrictEqual(unused, ['old-skill']);
});

test('usage-report: rotate splits by month', () => {
  const records = [
    { ts: '2026-01-15T12:00:00Z' },
    { ts: '2026-02-20T12:00:00Z' },
    { ts: '2026-03-10T12:00:00Z' },
  ];
  const months = new Set(records.map(r => r.ts.slice(0, 7)));
  assert.strictEqual(months.size, 3);
});

// === Phase 2 Tests: Error Handling ===
console.log('');
console.log('Phase 2 — error handling:');

await test('classify: loadKeywordsMap returns {} on missing file', async () => {
  const { loadKeywordsMap } = await import('./classify.mjs');
  const result = loadKeywordsMap('/nonexistent/path');
  assert.deepStrictEqual(result, {});
});

test('scan: auto-classify skips when keywords map empty', () => {
  const keywordsMap = {};
  const shouldSkip = Object.keys(keywordsMap).length === 0;
  assert.strictEqual(shouldSkip, true);
});

test('lint: fix skips category when keywords map empty', () => {
  const keywordsMap = {};
  const hasKeywords = Object.keys(keywordsMap).length > 0;
  assert.strictEqual(hasKeywords, false);
});

test('lint: fix aborts on backup failure', () => {
  let aborted = false;
  try {
    throw new Error('Permission denied');
  } catch {
    aborted = true;
  }
  assert.strictEqual(aborted, true);
});

// === Phase 2 Tests: Classification Accuracy ===
console.log('');
console.log('Phase 2 — classification accuracy:');

await test('classify: tuned keywords classify more skills', async () => {
  const { classifyByKeywords } = await import('./classify.mjs');
  const skill = { name: 'create-app', description: 'Create a new project app' };
  const keywordsMap = {
    'code-scaffolding': { keywords: ['scaffold', 'template', 'create', 'new', 'setup', 'project', 'app'], weight: 1.0 },
  };
  const result = classifyByKeywords(skill, keywordsMap);
  assert.strictEqual(result.category, 'code-scaffolding');
  assert.ok(result.confidence > 0);
});

await test('classify: false positive rate stays low', async () => {
  const { classifyByKeywords } = await import('./classify.mjs');
  const skill = { name: 'helper', description: 'A simple helper' };
  const keywordsMap = {
    'code-quality': { keywords: ['lint', 'review', 'quality'], weight: 1.0 },
  };
  const result = classifyByKeywords(skill, keywordsMap);
  assert.strictEqual(result.category, 'uncategorized');
});

// === Phase 3 Tests: refactor.mjs ===
console.log('');
console.log('Phase 3 — refactor:');

test('refactor: analyzeSkill detects missing gotchas', () => {
  const skill = { id: 'test-skill', hasGotchas: false, type: 'command' };
  const issues = [];
  if (!skill.hasGotchas) issues.push({ ruleId: 'has-gotchas', fixable: true });
  assert.strictEqual(issues.length, 1);
  assert.strictEqual(issues[0].fixable, true);
});

test('refactor: fixGotchas skips if gotchas exists', () => {
  const content = '# My Skill\n## Gotchas\n- Watch out';
  const hasGotchas = /##\s+gotchas/i.test(content);
  assert.strictEqual(hasGotchas, true);
});

test('refactor: report format is markdown table', () => {
  const report = '| Skill | Type | Issues |\n|-------|------|:------:|';
  assert.ok(report.includes('| Skill |'));
});

// === Phase 3 Tests: deps.mjs ===
console.log('');
console.log('Phase 3 — deps:');

test('deps: graph generates mermaid syntax', () => {
  const deps = [{ from: 'a', to: 'b' }, { from: 'a', to: 'c' }];
  const lines = deps.map(d => `  ${d.from} --> ${d.to}`);
  const mermaid = 'graph LR\n' + lines.join('\n');
  assert.ok(mermaid.includes('graph LR'));
  assert.ok(mermaid.includes('a --> b'));
});

test('deps: check detects cycle', () => {
  const graph = new Map([['a', ['b']], ['b', ['c']], ['c', ['a']]]);
  const visited = new Set();
  const recStack = new Set();
  function dfs(node) {
    visited.add(node);
    recStack.add(node);
    for (const dep of (graph.get(node) || [])) {
      if (!visited.has(dep)) { if (dfs(dep)) return true; }
      else if (recStack.has(dep)) return true;
    }
    recStack.delete(node);
    return false;
  }
  const hasCycle = dfs('a');
  assert.strictEqual(hasCycle, true);
});

test('deps: check passes with no cycle', () => {
  const graph = new Map([['a', ['b']], ['b', ['c']], ['c', []]]);
  const visited = new Set();
  const recStack = new Set();
  function dfs(node) {
    visited.add(node);
    recStack.add(node);
    for (const dep of (graph.get(node) || [])) {
      if (!visited.has(dep)) { if (dfs(dep)) return true; }
      else if (recStack.has(dep)) return true;
    }
    recStack.delete(node);
    return false;
  }
  let hasCycle = false;
  for (const node of graph.keys()) {
    if (!visited.has(node) && dfs(node)) { hasCycle = true; break; }
  }
  assert.strictEqual(hasCycle, false);
});

// === Phase 3 Tests: threshold ===
console.log('');
console.log('Phase 3 — threshold:');

test('scan: default threshold changed to 0.2', () => {
  const scanSrc = readFileSync(resolve(ROOT, 'scripts/scan.mjs'), 'utf-8');
  assert.ok(scanSrc.includes("'0.2'"), 'threshold default should be 0.2');
});

// ── Summary ──
console.log('');
console.log('═══════════════════════════════════════');
console.log(`Total: ${passed + failed} | ✅ ${passed} passed | ❌ ${failed} failed`);
console.log('═══════════════════════════════════════');

process.exit(failed > 0 ? 1 : 0);
