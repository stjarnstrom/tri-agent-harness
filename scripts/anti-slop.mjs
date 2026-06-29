#!/usr/bin/env node
// Anti-slop weekly garbage collection script.
// Run every Friday: identifies friction points from the past week's PRs,
// then helps convert recurring issues into automated guardrails.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const __dirname = import.meta.dirname;
const ROOT = join(__dirname, '..');
const GC_DIR = join(ROOT, '.gc-cache');
const REPORT_FILE = join(GC_DIR, 'weekly-report.jsonl');

// Ensure cache directory exists.
if (!existsSync(GC_DIR)) {
  mkdirSync(GC_DIR, { recursive: true });
}

function loadReport() {
  if (existsSync(REPORT_FILE)) {
    return readFileSync(REPORT_FILE, 'utf-8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }
  return [];
}

function saveReport(entries) {
  writeFileSync(REPORT_FILE, entries.map((e) => JSON.stringify(e)).join('\n') + '\n');
}

function getWeekStart() {
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  const diffToMonday = (day + 6) % 7; // days since Monday
  const monday = new Date(now);
  monday.setDate(now.getDate() - diffToMonday);
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString().split('T')[0];
}

console.log('=== Harness Anti-Slop Weekly GC ===\n');
console.log(`Week starting: ${getWeekStart()}\n`);

// Load previous entries to find recurring patterns.
const allEntries = loadReport();
const thisWeeksEntries = allEntries.filter((e) => e.week >= getWeekStart());

if (thisWeeksEntries.length === 0) {
  console.log('No issues logged this week.\n');
  console.log('To log an issue, run:');
  console.log('  echo \'{"week":"...","category":"lint|review|merge-conflict|prompt-ambiguity","description":"...","fix":"..."}\' >> .gc-cache/weekly-report.jsonl\n');
  console.log('At end of week, review duplicates to identify patterns for automation.');
  process.exit(0);
}

// Group by category and description to find recurring issues.
const groups = new Map();
for (const entry of thisWeeksEntries) {
  const key = `${entry.category}:${entry.description}`;
  if (!groups.has(key)) {
    groups.set(key, []);
  }
  groups.get(key).push(entry);
}

console.log('Recurring issues found:\n');
for (const [key, entries] of groups) {
  if (entries.length > 1) {
    const [{ category, description, fix }] = entries;
    console.log(`  [${category}] "${description}" — ${entries.length} times`);
    console.log(`    Suggested fix: ${fix || 'Automate this into a lint rule or review persona.'}\n`);
  }
}

const duplicates = [...groups.entries()].filter(([, v]) => v.length > 1).length;
console.log(`\nTotal recurring issues: ${duplicates}`);
if (duplicates > 0) {
  console.log('\nThis week\'s action items:');
  for (const [key, entries] of groups) {
    if (entries.length > 1) {
      const [category, description] = key.split(':');
      console.log(`  - Convert "${description}" into a ${category === 'lint' ? 'custom lint rule' : category === 'review' ? 'review persona checklist item' : 'process improvement'}`);
    }
  }
}
