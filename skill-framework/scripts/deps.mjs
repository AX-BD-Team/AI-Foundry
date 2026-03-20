#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ---------------------------------------------------------------------------
// CLI Argument Parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const subcommand = args[0];

function getArg(name, defaultValue) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1 || idx + 1 >= args.length) return defaultValue;
  return args[idx + 1];
}

const catalogPath = resolve(getArg('catalog', 'skill-framework/data/skill-catalog.json'));

function loadCatalog() {
  try {
    const raw = readFileSync(catalogPath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error(`Error: Could not load catalog at ${catalogPath} (${err.message})`);
    process.exit(1);
  }
}

function getActiveSkillsWithDeps(catalog) {
  return (catalog.skills || []).filter(s => !s.deleted && s.dependencies && s.dependencies.length > 0);
}

function getAllActiveSkills(catalog) {
  return (catalog.skills || []).filter(s => !s.deleted);
}

// ---------------------------------------------------------------------------
// graph — Mermaid flowchart
// ---------------------------------------------------------------------------

function cmdGraph() {
  const catalog = loadCatalog();
  const allActive = getAllActiveSkills(catalog);
  const withDeps = getActiveSkillsWithDeps(catalog);

  console.log('graph LR');
  for (const skill of withDeps) {
    for (const dep of skill.dependencies) {
      console.log(`  ${skill.id} --> ${dep}`);
    }
  }

  const withoutDeps = allActive.length - withDeps.length;
  console.log('');
  console.log(`Skills with deps: ${withDeps.length}/${allActive.length}, without: ${withoutDeps}/${allActive.length}`);
}

// ---------------------------------------------------------------------------
// check — Cycle detection (DFS)
// ---------------------------------------------------------------------------

function buildAdjacencyList(catalog) {
  const graph = new Map();
  const allActive = getAllActiveSkills(catalog);
  for (const skill of allActive) {
    if (!graph.has(skill.id)) graph.set(skill.id, []);
    for (const dep of (skill.dependencies || [])) {
      graph.get(skill.id).push(dep);
      if (!graph.has(dep)) graph.set(dep, []);
    }
  }
  return graph;
}

function hasCycle(graph) {
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
  for (const node of graph.keys()) {
    if (!visited.has(node) && dfs(node)) return true;
  }
  return false;
}

function cmdCheck() {
  const catalog = loadCatalog();
  const graph = buildAdjacencyList(catalog);

  if (hasCycle(graph)) {
    console.error('❌ Cycle detected in dependency graph!');
    process.exit(1);
  } else {
    console.log('✅ No cycles detected. Dependency graph is a DAG.');
    process.exit(0);
  }
}

// ---------------------------------------------------------------------------
// list — Markdown table
// ---------------------------------------------------------------------------

function cmdList() {
  const catalog = loadCatalog();
  const allActive = getAllActiveSkills(catalog);
  const skillFilter = getArg('skill', null);

  // Build dependedBy map
  const dependedByMap = new Map();
  for (const skill of allActive) {
    for (const dep of (skill.dependencies || [])) {
      if (!dependedByMap.has(dep)) dependedByMap.set(dep, []);
      dependedByMap.get(dep).push(skill.id);
    }
  }

  const skills = skillFilter
    ? allActive.filter(s => s.id === skillFilter)
    : allActive;

  console.log('| Skill | Dependencies | Depended By |');
  console.log('|-------|-------------|-------------|');

  for (const skill of skills) {
    const deps = (skill.dependencies || []).join(', ') || '-';
    const depBy = (dependedByMap.get(skill.id) || []).join(', ') || '-';
    console.log(`| ${skill.id} | ${deps} | ${depBy} |`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

switch (subcommand) {
  case 'graph':
    cmdGraph();
    break;
  case 'check':
    cmdCheck();
    break;
  case 'list':
    cmdList();
    break;
  default:
    console.error(`Unknown command: ${subcommand || '(none)'}`);
    console.error('Available commands: graph, check, list');
    process.exit(1);
}
