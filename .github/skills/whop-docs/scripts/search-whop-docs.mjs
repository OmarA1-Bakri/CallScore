#!/usr/bin/env node

// @ts-nocheck
/* global console, fetch, process */

const indexUrl = process.env.WHOP_DOCS_INDEX_URL || "https://docs.whop.com/llms.txt";
const query = process.argv.slice(2).join(" ").trim().toLowerCase();

if (!query) {
  console.error('Usage: node .github/skills/whop-docs/scripts/search-whop-docs.mjs "webhook membership"');
  process.exit(1);
}

const terms = query.split(/\s+/).filter(Boolean);
const DEFAULT_RESULT_LIMIT = 20;

function resultLimit() {
  const parsed = Number.parseInt(process.env.WHOP_DOCS_RESULT_LIMIT || "", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_RESULT_LIMIT;
}

function extractEntries(markdown) {
  const entries = [];
  const linkPattern = /^- \[([^\]]+)\]\(([^)]+)\)(?::\s*(.*))?$/;

  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim();
    const match = line.match(linkPattern);
    if (!match) continue;

    entries.push({
      title: match[1].replace(/\s+/g, " ").trim(),
      url: match[2],
      description: (match[3] || "").replace(/\s+/g, " ").trim(),
    });
  }

  return entries;
}

function scoreEntry(entry) {
  const haystack = `${entry.title} ${entry.description} ${entry.url}`.toLowerCase();
  let score = 0;

  for (const term of terms) {
    if (entry.title.toLowerCase().includes(term)) score += 5;
    if (entry.url.toLowerCase().includes(term)) score += 3;
    if (entry.description.toLowerCase().includes(term)) score += 2;
  }

  if (terms.every((term) => haystack.includes(term))) score += 8;
  return score;
}

let markdown;
try {
  const response = await fetch(indexUrl, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${indexUrl}: ${response.status} ${response.statusText}`);
  }
  markdown = await response.text();
} catch (error) {
  if (error instanceof Error && error.name === "TimeoutError") {
    throw new Error(`Timed out fetching ${indexUrl}`);
  }
  throw error;
}

const results = extractEntries(markdown)
  .map((entry) => ({ ...entry, score: scoreEntry(entry) }))
  .filter((entry) => entry.score > 0)
  .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
  .slice(0, resultLimit());

if (results.length === 0) {
  console.log(`No matches for: ${query}`);
  process.exit(0);
}

for (const [index, result] of results.entries()) {
  console.log(`${index + 1}. ${result.title}`);
  console.log(`   ${result.url}`);
  if (result.description) console.log(`   ${result.description}`);
}
