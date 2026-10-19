#!/usr/bin/env node
// Attaches a hint (second clue, different angle) to every entry in public/puzzles/*.json.
//
//   node tools/add-hints.mjs
//
// Reads tools/hints.jsonl ({"w":"APPLE","h":"Record label founded by the Beatles"} per line) and
// writes acrossHints/downHints arrays next to across/down. Safe to re-run; grids and clues are untouched.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { slotsFor } from './grid.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, '..', 'public', 'puzzles');

const hints = new Map();
for (const line of readFileSync(join(here, 'hints.jsonl'), 'utf8').split('\n')) {
  if (!line.trim()) continue;
  const { w, h } = JSON.parse(line);
  if (w && h) hints.set(w, h);
}

const missing = new Set();
let entries = 0;
for (const file of readdirSync(dir).filter((f) => /^\d+\.json$/.test(f))) {
  const path = join(dir, file);
  const puzzles = JSON.parse(readFileSync(path, 'utf8'));
  for (const p of puzzles) {
    const { across, down } = slotsFor(p.rows);
    const word = (s) => s.cells.map(([r, c]) => p.rows[r][c]).join('');
    const lookup = (s) => {
      entries += 1;
      const w = word(s);
      if (!hints.has(w)) missing.add(w);
      return hints.get(w) ?? null;
    };
    p.acrossHints = across.map(lookup);
    p.downHints = down.map(lookup);
  }
  writeFileSync(path, JSON.stringify(puzzles));
}

console.log(`Added hints to ${entries} entries from ${hints.size} hint words.`);
if (missing.size) console.log(`No hint yet for ${missing.size} words: ${[...missing].sort().join(' ')}`);
