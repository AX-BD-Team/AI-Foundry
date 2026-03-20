#!/usr/bin/env node

/**
 * refactor.mjs — Skill Framework Batch Refactoring Tool
 *
 * Analyzes skills against lint rules and optionally auto-fixes fixable issues.
 * Dry-run by default; use --fix to apply changes.
 *
 * Usage:
 *   node skill-framework/scripts/refactor.mjs [--fix] [--scope user|project|all] [--catalog path]
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { resolve, join, dirname, basename } from 'node:path';
import { parseArgs } from 'node:util';

// ── CLI args ────────────────────────────────────────────────────────

const { values } = parseArgs({
  options: {
    fix:     { type: 'boolean', default: false },
    scope:   { type: 'string',  default: 'all' },
    catalog: { type: 'string',  default: 'skill-framework/data/skill-catalog.json' },
  },
  strict: false,
});

const catalogPath = resolve(values.catalog);
const rulesPath   = resolve('skill-framework/data/lint-rules.json');
const scopeFilter = values.scope;
const doFix       = values.fix;

// ── Load catalog & rules ────────────────────────────────────────────

let catalog;
try {
  catalog = JSON.parse(readFileSync(catalogPath, 'utf-8'));
} catch (err) {
  console.error(`Error: Cannot read ${catalogPath} — ${err.message}`);
  process.exit(1);
}

let lintRules;
try {
  lintRules = JSON.parse(readFileSync(rulesPath, 'utf-8'));
} catch (err) {
  console.error(`Error: Cannot read ${rulesPath} — ${err.message}`);
  process.exit(1);
}

const ruleMap = Object.fromEntries(lintRules.map(r => [r.id, r]));

// ── Filter skills ───────────────────────────────────────────────────

let targetSkills = catalog.skills.filter(s => s.scope !== 'plugin' && !s.deleted);

if (scopeFilter !== 'all') {
  targetSkills = targetSkills.filter(s => s.scope === scopeFilter);
}

// ── Read skill file (best effort) ───────────────────────────────────

function readSkillFile(skill) {
  if (!skill.path) return '';
  try {
    return readFileSync(resolve(skill.path), 'utf-8');
  } catch {
    return '';
  }
}

// ── Analyze a single skill → issues array ───────────────────────────

const TRIGGER_KEYWORDS = ['use when', 'triggers', 'trigger', '사용', 'use this', 'use proactively'];
const KEBAB_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function analyzeSkill(skill, fileContent) {
  const issues = [];

  // has-gotchas (fixable)
  if (ruleMap['has-gotchas'] && fileContent) {
    const lower = fileContent.toLowerCase();
    if (!lower.includes('## gotchas') && !lower.includes('gotchas')) {
      issues.push({ ...ruleMap['has-gotchas'], fixable: true });
    }
  }

  // folder-structure (fixable for type=skill only)
  if (ruleMap['folder-structure'] && skill.type === 'skill') {
    if (!skill.hasReferences && !skill.hasScripts) {
      issues.push({ ...ruleMap['folder-structure'], fixable: true });
    }
  }

  // has-description (not fixable)
  if (ruleMap['has-description']) {
    if (!skill.description || skill.description.trim() === '') {
      issues.push({ ...ruleMap['has-description'], fixable: false });
    }
  }

  // description-trigger (not fixable)
  if (ruleMap['description-trigger'] && skill.description) {
    const descLower = skill.description.toLowerCase();
    const hasTrigger = TRIGGER_KEYWORDS.some(kw => descLower.includes(kw));
    if (!hasTrigger) {
      issues.push({ ...ruleMap['description-trigger'], fixable: false });
    }
  }

  // single-category (not fixable — lint --fix handles this)
  if (ruleMap['single-category']) {
    if (!skill.category || skill.category === 'uncategorized') {
      issues.push({ ...ruleMap['single-category'], fixable: false });
    }
  }

  // name-kebab (not fixable)
  if (ruleMap['name-kebab']) {
    const idPart = skill.id.includes(':') ? skill.id.split(':').pop() : skill.id;
    if (!KEBAB_RE.test(idPart)) {
      issues.push({ ...ruleMap['name-kebab'], fixable: false });
    }
  }

  return issues;
}

// ── Fix: append Gotchas section ─────────────────────────────────────

function fixGotchas(skillPath) {
  if (!skillPath || !existsSync(resolve(skillPath))) return false;
  const content = readFileSync(resolve(skillPath), 'utf-8');
  const lower = content.toLowerCase();
  if (lower.includes('## gotchas') || lower.includes('## gotchas')) return false;

  appendFileSync(resolve(skillPath), '\n\n---\n\n## Gotchas\n\n- TODO: 이 스킬 사용 시 주의사항을 작성하세요\n');
  return true;
}

// ── Fix: create references/ directory ───────────────────────────────

function fixFolderStructure(skillDir) {
  if (!skillDir) return false;
  const refsDir = join(resolve(skillDir), 'references');
  if (existsSync(refsDir)) return false;

  mkdirSync(refsDir, { recursive: true });
  writeFileSync(join(refsDir, 'README.md'), '# References\n\nTODO: 참고 자료를 추가하세요\n');
  return true;
}

// ── Main ────────────────────────────────────────────────────────────

function main() {
  const rows = [];
  let totalIssues = 0;
  let totalFixable = 0;
  let totalFixed = 0;

  for (const skill of targetSkills) {
    const content = readSkillFile(skill);
    const issues = analyzeSkill(skill, content);

    if (issues.length === 0) continue;

    const fixableCount = issues.filter(i => i.fixable).length;
    let fixedCount = 0;

    if (doFix) {
      for (const issue of issues) {
        if (!issue.fixable) continue;

        if (issue.id === 'has-gotchas' && fixGotchas(skill.path)) {
          fixedCount++;
        }
        if (issue.id === 'folder-structure') {
          const skillDir = skill.path ? dirname(resolve(skill.path)) : null;
          if (skillDir && fixFolderStructure(skillDir)) {
            fixedCount++;
          }
        }
      }
    }

    rows.push({
      name: skill.id,
      type: skill.type || '-',
      issues: issues.length,
      fixable: fixableCount,
      fixed: fixedCount,
    });

    totalIssues += issues.length;
    totalFixable += fixableCount;
    totalFixed += fixedCount;
  }

  // ── Markdown report ─────────────────────────────────────────────

  console.log('## Refactoring Report');
  console.log('');
  console.log(`Mode: ${doFix ? '--fix (applied)' : 'dry-run (no changes)'}`);
  console.log(`Scope: ${scopeFilter}`);
  console.log('');

  if (rows.length === 0) {
    console.log('No issues found. All skills are clean!');
  } else {
    console.log('| Skill | Type | Issues | Fixable | Fixed |');
    console.log('|-------|------|:------:|:-------:|:-----:|');
    for (const r of rows) {
      console.log(`| ${r.name} | ${r.type} | ${r.issues} | ${r.fixable} | ${r.fixed} |`);
    }
  }

  console.log('');
  console.log(`Total: ${targetSkills.length} skills, ${totalIssues} issues, ${totalFixable} fixable, ${totalFixed} fixed`);
}

main();
