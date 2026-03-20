#!/usr/bin/env node

/**
 * scan.mjs — Skill Inventory Scanner
 *
 * Scans user/project/plugin scopes for Claude Code skills and commands,
 * builds or updates skill-catalog.json with manual tagging preservation.
 *
 * Usage:
 *   node skill-framework/scripts/scan.mjs [--scope user|project|plugin|all] [--output path]
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, basename, dirname, join, relative } from 'node:path';
import { homedir } from 'node:os';
import { classifyByKeywords, loadKeywordsMap } from './classify.mjs';

// ---------------------------------------------------------------------------
// CLI Argument Parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

function getArg(name, defaultValue) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1 || idx + 1 >= args.length) return defaultValue;
  return args[idx + 1];
}

const scope = getArg('scope', 'all');
const autoClassify = args.includes('--auto-classify');
const threshold = parseFloat(getArg('threshold', '0.2'));
const projectRoot = resolve(process.cwd());
const defaultOutput = join(projectRoot, 'skill-framework', 'data', 'skill-catalog.json');
const outputPath = resolve(getArg('output', defaultOutput));

const VALID_SCOPES = ['user', 'project', 'plugin', 'all'];
if (!VALID_SCOPES.includes(scope)) {
  console.error(`Error: Invalid scope "${scope}". Use one of: ${VALID_SCOPES.join(', ')}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// YAML Frontmatter Parser (no external deps)
// ---------------------------------------------------------------------------

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};

  const yaml = match[1];
  const result = {};
  let currentKey = null;
  let currentValue = '';
  let isMultiline = false;

  for (const line of yaml.split('\n')) {
    // Multiline scalar continuation (indented lines under `key: |` or `key: >`)
    if (isMultiline) {
      if (/^\s+/.test(line)) {
        currentValue += (currentValue ? '\n' : '') + line.replace(/^\s+/, '');
        continue;
      } else {
        // End of multiline
        if (currentKey) result[currentKey] = currentValue.trim();
        isMultiline = false;
        currentKey = null;
        currentValue = '';
      }
    }

    // Simple key: value
    const kvMatch = line.match(/^(\w[\w-]*)\s*:\s*(.*)/);
    if (kvMatch) {
      currentKey = kvMatch[1];
      const rawValue = kvMatch[2].trim();

      if (rawValue === '|' || rawValue === '>') {
        isMultiline = true;
        currentValue = '';
      } else if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
        // Inline array: [a, b, c]
        result[currentKey] = rawValue
          .slice(1, -1)
          .split(',')
          .map(s => s.trim().replace(/^["']|["']$/g, ''))
          .filter(Boolean);
      } else if (rawValue === 'true') {
        result[currentKey] = true;
      } else if (rawValue === 'false') {
        result[currentKey] = false;
      } else if (rawValue === '') {
        // Could be start of a block sequence
        result[currentKey] = '';
      } else {
        result[currentKey] = rawValue.replace(/^["']|["']$/g, '');
      }
    }

    // Block sequence item: - value
    if (/^\s+-\s+/.test(line) && currentKey) {
      const item = line.replace(/^\s+-\s+/, '').trim();
      if (!Array.isArray(result[currentKey])) {
        result[currentKey] = [];
      }
      result[currentKey].push(item);
    }
  }

  // Flush last multiline
  if (isMultiline && currentKey) {
    result[currentKey] = currentValue.trim();
  }

  return result;
}

// ---------------------------------------------------------------------------
// File System Helpers
// ---------------------------------------------------------------------------

function globFiles(dir, pattern) {
  const results = [];
  if (!existsSync(dir)) return results;

  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...globFiles(fullPath, pattern));
      } else if (entry.isFile() && matchPattern(entry.name, pattern)) {
        results.push(fullPath);
      }
    }
  } catch {
    // Permission denied or other FS error — skip silently
  }

  return results;
}

function matchPattern(filename, pattern) {
  // Simple glob: supports * wildcard
  const regex = new RegExp(
    '^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$'
  );
  return regex.test(filename);
}

function dirHasChild(dirPath, childName) {
  try {
    return existsSync(join(dirPath, childName));
  } catch {
    return false;
  }
}

function safeReadFile(filePath) {
  try {
    return readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Scan Logic
// ---------------------------------------------------------------------------

function scanUserCommands() {
  const dir = join(homedir(), '.claude', 'commands');
  const files = globFiles(dir, 'ax-*.md');
  return files.map(filePath => {
    const content = safeReadFile(filePath);
    if (!content) return null;

    const fm = parseFrontmatter(content);
    const id = fm.name || basename(filePath, '.md');

    return {
      id,
      name: fm.name || basename(filePath, '.md'),
      scope: 'user',
      type: 'command',
      path: filePath,
      category: 'uncategorized',
      tags: [],
      description: typeof fm.description === 'string' ? fm.description.split('\n')[0].trim() : '',
      hasGotchas: /^##\s+Gotchas/mi.test(content),
      hasReferences: false,
      hasScripts: false,
      qualityScore: 0,
      dependencies: [],
      dependedBy: [],
      usageCount: 0,
      lastUsedAt: null,
      source: 'ax',
      addedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }).filter(Boolean);
}

function scanSkillDir(dir, scopeType, sourceLabel) {
  const results = [];
  if (!existsSync(dir)) return results;

  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const skillDir = join(dir, entry.name);
      const skillMd = join(skillDir, 'SKILL.md');

      if (!existsSync(skillMd)) continue;

      const content = safeReadFile(skillMd);
      if (!content) continue;

      const fm = parseFrontmatter(content);
      const id = fm.name || entry.name;

      results.push({
        id,
        name: fm.name || entry.name,
        scope: scopeType,
        type: 'skill',
        path: skillMd,
        category: 'uncategorized',
        tags: [],
        description: typeof fm.description === 'string' ? fm.description.split('\n')[0].trim() : '',
        hasGotchas: /^##\s+Gotchas/mi.test(content),
        hasReferences: dirHasChild(skillDir, 'references'),
        hasScripts: dirHasChild(skillDir, 'scripts'),
        qualityScore: 0,
        dependencies: [],
        dependedBy: [],
        usageCount: 0,
        lastUsedAt: null,
        source: sourceLabel,
        addedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
  } catch {
    // skip
  }

  return results;
}

function scanPluginSkills() {
  const pluginsDir = join(homedir(), '.claude', 'plugins');
  const results = [];
  if (!existsSync(pluginsDir)) return results;

  const skillFiles = globFiles(pluginsDir, 'SKILL.md');

  for (const filePath of skillFiles) {
    const content = safeReadFile(filePath);
    if (!content) continue;

    const fm = parseFrontmatter(content);
    const skillDir = dirname(filePath);
    const skillName = fm.name || basename(skillDir);

    // Determine plugin name from path structure
    // e.g., ~/.claude/plugins/marketplaces/.../plugins/{pluginName}/skills/{skillName}/SKILL.md
    const relPath = relative(pluginsDir, filePath);
    const parts = relPath.split('/');
    // Find 'plugins' segment to extract plugin name
    const pluginsIdx = parts.indexOf('plugins', 1);
    const pluginName = pluginsIdx >= 0 && pluginsIdx + 1 < parts.length
      ? parts[pluginsIdx + 1]
      : parts[0];

    const id = `${pluginName}:${skillName}`;

    results.push({
      id,
      name: fm.name || skillName,
      scope: 'plugin',
      type: 'skill',
      path: filePath,
      category: 'uncategorized',
      tags: [],
      description: typeof fm.description === 'string' ? fm.description.split('\n')[0].trim() : '',
      hasGotchas: /^##\s+Gotchas/mi.test(content),
      hasReferences: dirHasChild(skillDir, 'references'),
      hasScripts: dirHasChild(skillDir, 'scripts'),
      qualityScore: 0,
      dependencies: [],
      dependedBy: [],
      usageCount: 0,
      lastUsedAt: null,
      source: pluginName,
      addedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Merge Logic (preserve manual tagging)
// ---------------------------------------------------------------------------

function loadExistingCatalog(path) {
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.warn(`⚠️  Warning: Could not parse existing catalog (${err.message}). Creating backup and starting fresh.`);
    try {
      writeFileSync(`${path}.bak`, readFileSync(path));
      console.log(`   Backup saved to ${path}.bak`);
    } catch {
      // ignore backup failure
    }
    return null;
  }
}

function mergeSkills(scanned, existing) {
  if (!existing) return scanned;

  const existingMap = new Map();
  for (const skill of existing) {
    existingMap.set(skill.id, skill);
  }

  const scannedIds = new Set(scanned.map(s => s.id));

  // Update scanned skills with preserved manual fields
  const merged = scanned.map(skill => {
    const prev = existingMap.get(skill.id);
    if (prev) {
      return {
        ...skill,
        // Preserve manual tagging
        category: prev.category || skill.category,
        tags: prev.tags && prev.tags.length > 0 ? prev.tags : skill.tags,
        // Preserve metrics
        usageCount: prev.usageCount || 0,
        lastUsedAt: prev.lastUsedAt || null,
        // Preserve timestamps
        addedAt: prev.addedAt || skill.addedAt,
        updatedAt: new Date().toISOString(),
        // Preserve manual quality overrides
        qualityScore: prev.qualityScore || skill.qualityScore,
        // Preserve dependencies
        dependencies: prev.dependencies && prev.dependencies.length > 0 ? prev.dependencies : skill.dependencies,
        dependedBy: prev.dependedBy && prev.dependedBy.length > 0 ? prev.dependedBy : skill.dependedBy,
      };
    }
    return skill;
  });

  // Mark deleted skills (exist in old catalog but not in scan)
  for (const [id, prev] of existingMap) {
    if (!scannedIds.has(id)) {
      merged.push({
        ...prev,
        deleted: true,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  return merged;
}

// ---------------------------------------------------------------------------
// Load Categories
// ---------------------------------------------------------------------------

function loadCategories() {
  const catPath = join(projectRoot, 'skill-framework', 'data', 'categories.json');
  if (!existsSync(catPath)) {
    console.warn('⚠️  Warning: categories.json not found. Using empty categories.');
    return [];
  }
  try {
    return JSON.parse(readFileSync(catPath, 'utf-8'));
  } catch {
    console.warn('⚠️  Warning: Could not parse categories.json.');
    return [];
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  console.log('🔍 Skill Framework — Inventory Scanner');
  console.log(`   Scope: ${scope}`);
  console.log(`   Output: ${outputPath}`);
  console.log('');

  const allSkills = [];
  const summary = { user: 0, project: 0, plugin: 0 };

  // Scan user scope
  if (scope === 'all' || scope === 'user') {
    const commands = scanUserCommands();
    const userSkills = scanSkillDir(
      join(homedir(), '.claude', 'skills'),
      'user',
      'ax'
    );
    summary.user = commands.length + userSkills.length;
    allSkills.push(...commands, ...userSkills);
    console.log(`   ✅ User commands: ${commands.length}`);
    console.log(`   ✅ User skills:   ${userSkills.length}`);
  }

  // Scan project scope
  if (scope === 'all' || scope === 'project') {
    const projectSkills = scanSkillDir(
      join(projectRoot, '.claude', 'skills'),
      'project',
      basename(projectRoot)
    );
    summary.project = projectSkills.length;
    allSkills.push(...projectSkills);
    console.log(`   ✅ Project skills: ${projectSkills.length}`);
  }

  // Scan plugin scope
  if (scope === 'all' || scope === 'plugin') {
    const pluginSkills = scanPluginSkills();
    summary.plugin = pluginSkills.length;
    allSkills.push(...pluginSkills);
    console.log(`   ✅ Plugin skills:  ${pluginSkills.length}`);
  }

  // Load existing catalog and merge
  const existingCatalog = loadExistingCatalog(outputPath);
  const existingSkills = existingCatalog?.skills || null;
  const merged = mergeSkills(allSkills, existingSkills);

  // Auto-classify uncategorized skills
  if (autoClassify) {
    const keywordsMap = loadKeywordsMap(projectRoot);
    if (Object.keys(keywordsMap).length === 0) {
      console.warn('\n   ⚠️  Auto-classify skipped: keywords map unavailable.');
    } else {
      let classified = 0;
    for (const skill of merged) {
      if (skill.deleted) continue;
      if (skill.category !== 'uncategorized') continue;
      if (skill.autoClassified === false) continue; // manually set to uncategorized — skip
      const result = classifyByKeywords(skill, keywordsMap);
      if (result.confidence >= threshold) {
        skill.category = result.category;
        skill.autoClassified = true;
        skill.classifyConfidence = result.confidence;
        classified++;
      }
    }
    console.log(`\n   🏷️  Auto-classified: ${classified} skills (threshold: ${threshold})`);
    }
  }

  // Count uncategorized
  const uncategorized = merged.filter(s => s.category === 'uncategorized' && !s.deleted).length;
  const active = merged.filter(s => !s.deleted).length;
  const deleted = merged.filter(s => s.deleted).length;

  // Load categories
  const categories = loadCategories();

  // Build catalog
  const catalog = {
    version: '1.0.0',
    updatedAt: new Date().toISOString(),
    generatedBy: 'scan.mjs',
    categories,
    skills: merged,
  };

  // Write output
  writeFileSync(outputPath, JSON.stringify(catalog, null, 2) + '\n', 'utf-8');

  // Summary
  console.log('');
  console.log('─────────────────────────────────────────');
  console.log('📊 Scan Summary');
  console.log('─────────────────────────────────────────');
  console.log(`   User:    ${summary.user} skills`);
  console.log(`   Project: ${summary.project} skills`);
  console.log(`   Plugin:  ${summary.plugin} skills`);
  console.log(`   ─────────────────────────`);
  console.log(`   Total:   ${active} active, ${deleted} deleted`);
  console.log(`   Uncategorized: ${uncategorized}`);
  console.log('─────────────────────────────────────────');
  console.log(`\n✅ Catalog written to: ${outputPath}`);
}

main();
