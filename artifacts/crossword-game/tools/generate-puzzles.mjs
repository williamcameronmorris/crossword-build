#!/usr/bin/env node
// Builds the puzzle bank served from public/puzzles/.
//
//   node tools/generate-puzzles.mjs [count=500] [seed=1]
//
// Reads tools/wordbank.jsonl ({"w":"BASIL","c":["clue","clue"]} per line) and
// tools/handmade.json (puzzles written by hand, kept first in the bank), fills
// symmetric 5x5 grids with backtracking, and writes chunked JSON.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'public', 'puzzles');
const COUNT = Number(process.argv[2] ?? 500);
const SEED = Number(process.argv[3] ?? 1);
const CHUNK = 100;
const N = 5;

// --- seeded RNG -------------------------------------------------------------
function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(SEED);
const shuffle = (arr) => {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

// --- grid geometry (shared with the app via the same numbering rules) --------
export function slotsFor(rows) {
  const open = (r, c) => r >= 0 && r < N && c >= 0 && c < N && rows[r][c] !== '#';
  const across = [];
  const down = [];
  let number = 1;
  for (let r = 0; r < N; r += 1) {
    for (let c = 0; c < N; c += 1) {
      if (!open(r, c)) continue;
      const a = !open(r, c - 1) && open(r, c + 1);
      const d = !open(r - 1, c) && open(r + 1, c);
      if (!a && !d) continue;
      if (a) {
        const cells = [];
        for (let k = c; open(r, k); k += 1) cells.push([r, k]);
        across.push({ number, cells });
      }
      if (d) {
        const cells = [];
        for (let k = r; open(k, c); k += 1) cells.push([k, c]);
        down.push({ number, cells });
      }
      number += 1;
    }
  }
  return { across, down };
}

// Every 180-degree-symmetric block layout where all entries are 3+ letters,
// every white cell is checked both ways, and the white cells are connected.
function enumeratePatterns() {
  const pairs = [];
  const seen = new Set();
  for (let i = 0; i < N * N; i += 1) {
    const j = N * N - 1 - i;
    const key = Math.min(i, j);
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push(i === j ? [i] : [i, j]);
  }
  const patterns = [];
  for (let mask = 0; mask < 1 << pairs.length; mask += 1) {
    const blocks = new Set();
    pairs.forEach((p, idx) => {
      if (mask & (1 << idx)) p.forEach((cell) => blocks.add(cell));
    });
    if (blocks.size > 6) continue;
    const rows = Array.from({ length: N }, (_, r) =>
      Array.from({ length: N }, (_, c) => (blocks.has(r * N + c) ? '#' : '.')).join(''),
    );
    if (isValidPattern(rows)) patterns.push(rows);
  }
  return patterns;
}

function isValidPattern(rows) {
  const { across, down } = slotsFor(rows);
  const covered = { a: new Set(), d: new Set() };
  for (const s of across) {
    if (s.cells.length < 3) return false;
    s.cells.forEach(([r, c]) => covered.a.add(r * N + c));
  }
  for (const s of down) {
    if (s.cells.length < 3) return false;
    s.cells.forEach(([r, c]) => covered.d.add(r * N + c));
  }
  const white = [];
  for (let r = 0; r < N; r += 1) for (let c = 0; c < N; c += 1) if (rows[r][c] !== '#') white.push(r * N + c);
  // Lone white runs of 1-2 letters would be unclued, so every cell must sit in both directions.
  if (!white.every((i) => covered.a.has(i) && covered.d.has(i))) return false;
  const stack = [white[0]];
  const reached = new Set(stack);
  while (stack.length) {
    const i = stack.pop();
    const r = Math.floor(i / N);
    const c = i % N;
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nr = r + dr;
      const nc = c + dc;
      const ni = nr * N + nc;
      if (nr < 0 || nr >= N || nc < 0 || nc >= N || rows[nr][nc] === '#' || reached.has(ni)) continue;
      reached.add(ni);
      stack.push(ni);
    }
  }
  return reached.size === white.length;
}

// --- word bank ----------------------------------------------------------------
const bank = new Map();
for (const line of readFileSync(join(here, 'wordbank.jsonl'), 'utf8').split('\n')) {
  if (!line.trim()) continue;
  const { w, c } = JSON.parse(line);
  if (/^[A-Z]{3,5}$/.test(w) && Array.isArray(c) && c.length) bank.set(w, c);
}
const byLength = new Map([[3, []], [4, []], [5, []]]);
for (const w of bank.keys()) byLength.get(w.length).push(w);

// Index: length -> position -> letter -> Set(words)
const index = new Map();
for (const [len, words] of byLength) {
  const perPos = Array.from({ length: len }, () => new Map());
  for (const w of words) {
    for (let i = 0; i < len; i += 1) {
      if (!perPos[i].has(w[i])) perPos[i].set(w[i], []);
      perPos[i].get(w[i]).push(w);
    }
  }
  index.set(len, perPos);
}

const usage = new Map();
const MAX_USES = { 3: 6, 4: 4, 5: 3 };

function candidates(pattern, used) {
  const len = pattern.length;
  let pool = null;
  for (let i = 0; i < len; i += 1) {
    if (pattern[i] === '.') continue;
    const list = index.get(len)[i].get(pattern[i]) ?? [];
    if (!pool || list.length < pool.length) pool = list;
  }
  pool ??= byLength.get(len);
  return pool.filter((w) => {
    if (used.has(w) || (usage.get(w) ?? 0) >= MAX_USES[len]) return false;
    for (let i = 0; i < len; i += 1) if (pattern[i] !== '.' && pattern[i] !== w[i]) return false;
    return true;
  });
}

function fill(patternRows, budgetMs = 400) {
  const grid = patternRows.map((r) => r.split(''));
  const { across, down } = slotsFor(patternRows);
  const slots = [...across, ...down];
  const used = new Set();
  const deadline = Date.now() + budgetMs;
  const read = (s) => s.cells.map(([r, c]) => grid[r][c]).join('');

  const solve = () => {
    if (Date.now() > deadline) return false;
    let best = null;
    let bestCands = null;
    for (const s of slots) {
      const p = read(s);
      if (!p.includes('.')) continue;
      const cands = candidates(p, used);
      if (!best || cands.length < bestCands.length) {
        best = s;
        bestCands = cands;
        if (!cands.length) return false;
      }
    }
    if (!best) {
      // Completed slots formed by crossings must also be real, unique words.
      const words = slots.map(read);
      return words.every((w) => bank.has(w)) && new Set(words).size === words.length;
    }
    const before = best.cells.map(([r, c]) => grid[r][c]);
    for (const w of shuffle(bestCands.slice(0, 400))) {
      best.cells.forEach(([r, c], i) => (grid[r][c] = w[i]));
      used.add(w);
      if (solve()) return true;
      used.delete(w);
      best.cells.forEach(([r, c], i) => (grid[r][c] = before[i]));
    }
    return false;
  };
  return solve() ? grid.map((r) => r.join('')) : null;
}

// --- build --------------------------------------------------------------------
function toPuzzle(id, rows, clueFor) {
  const { across, down } = slotsFor(rows);
  const word = (s) => s.cells.map(([r, c]) => rows[r][c]).join('');
  return {
    id,
    rows,
    across: across.map((s) => clueFor(word(s))),
    down: down.map((s) => clueFor(word(s))),
  };
}

const puzzles = [];
const handmade = JSON.parse(readFileSync(join(here, 'handmade.json'), 'utf8'));
for (const p of handmade) {
  puzzles.push({ id: puzzles.length + 1, rows: p.rows, across: p.across, down: p.down, title: p.title });
}

const patterns = enumeratePatterns();
const fingerprints = new Set(puzzles.map((p) => p.rows.join('')));
let attempts = 0;
while (puzzles.length < COUNT && attempts < COUNT * 60) {
  attempts += 1;
  // Favor layouts with a few blocks: open grids rarely fill from a curated list.
  const pattern = patterns[Math.floor(rand() * patterns.length)];
  const rows = fill(pattern);
  if (!rows || fingerprints.has(rows.join(''))) continue;
  fingerprints.add(rows.join(''));
  const { across, down } = slotsFor(rows);
  for (const s of [...across, ...down]) {
    const w = s.cells.map(([r, c]) => rows[r][c]).join('');
    usage.set(w, (usage.get(w) ?? 0) + 1);
  }
  puzzles.push(
    toPuzzle(puzzles.length + 1, rows, (w) => {
      const clues = bank.get(w);
      return clues[Math.floor(rand() * clues.length)];
    }),
  );
  if (puzzles.length % 50 === 0) console.log(`  ${puzzles.length} puzzles (${attempts} attempts)`);
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
for (let i = 0; i < puzzles.length; i += CHUNK) {
  writeFileSync(join(outDir, `${i / CHUNK}.json`), JSON.stringify(puzzles.slice(i, i + CHUNK)));
}
writeFileSync(join(outDir, 'index.json'), JSON.stringify({ count: puzzles.length, chunkSize: CHUNK }));

const distinct = new Set(puzzles.flatMap((p) => slotsFor(p.rows).across.concat(slotsFor(p.rows).down).map((s) => s.cells.map(([r, c]) => p.rows[r][c]).join(''))));
console.log(`Wrote ${puzzles.length} puzzles from ${patterns.length} layouts, ${bank.size} bank words, ${distinct.size} distinct answers used.`);
