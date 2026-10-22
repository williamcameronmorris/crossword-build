#!/usr/bin/env node
// Re-picks clues so a repeated answer gets a different clue each time it appears.
//
//   node tools/dedupe-clues.mjs
//
// Puzzles up to index.json's keptThrough are left untouched (players may have solved them);
// their clues still count as "used". Grids never change. Run tools/add-hints.mjs afterwards.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { slotsFor } from './grid.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, '..', 'public', 'puzzles');

const bank = new Map();
for (const line of readFileSync(join(here, 'wordbank.jsonl'), 'utf8').split('\n')) {
  if (!line.trim()) continue;
  const { w, c } = JSON.parse(line);
  bank.set(w, c);
}

const { count, chunkSize, keptThrough = 0 } = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'));
const chunks = [];
for (let i = 0; i * chunkSize < count; i += 1) chunks.push(JSON.parse(readFileSync(join(dir, `${i}.json`), 'utf8')));

const used = new Map(); // "WORD|clue" -> times
const bump = (w, c) => used.set(`${w}|${c}`, (used.get(`${w}|${c}`) ?? 0) + 1);
let changed = 0;

for (const puzzles of chunks) {
  for (const p of puzzles) {
    const { across, down } = slotsFor(p.rows);
    const word = (s) => s.cells.map(([r, c]) => p.rows[r][c]).join('');
    for (const [slots, clues] of [[across, p.across], [down, p.down]]) {
      slots.forEach((s, i) => {
        const w = word(s);
        if (p.id > keptThrough) {
          // Least-used option; keep the current clue on ties so nothing churns needlessly.
          const options = [clues[i], ...(bank.get(w) ?? []).filter((c) => c !== clues[i])];
          const best = options.reduce((a, b) => ((used.get(`${w}|${b}`) ?? 0) < (used.get(`${w}|${a}`) ?? 0) ? b : a));
          if (best !== clues[i]) {
            clues[i] = best;
            changed += 1;
          }
        }
        bump(w, clues[i]);
      });
    }
  }
}

chunks.forEach((puzzles, i) => writeFileSync(join(dir, `${i}.json`), JSON.stringify(puzzles)));
const repeats = [...used.values()].reduce((a, n) => a + Math.max(0, n - 1), 0);
console.log(`Changed ${changed} clues. Same word + same clue repeats left: ${repeats}.`);
