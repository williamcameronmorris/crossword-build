#!/usr/bin/env node
// Builds the puzzle bank served from public/puzzles/.
//
//   node tools/generate-puzzles.mjs [count=500] [seed=1] [freeze=30] [maxUses=2]
//
// The first `freeze` puzzles of the current bank are kept exactly as they are (players may have
// solved them); everything after is rebuilt. Every answer appears at most `maxUses` times across
// the whole bank, and repeated answers rotate through their clues so a clue isn't reused.
//
// Reads tools/wordbank.jsonl ({"w":"BASIL","c":["clue","clue"]} per line) and
// tools/handmade.json (puzzles written by hand, kept first in the bank), fills
// symmetric 5x5 grids with backtracking, and writes chunked JSON.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { slotsFor } from './grid.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'public', 'puzzles');
const COUNT = Number(process.argv[2] ?? 500);
const SEED = Number(process.argv[3] ?? 1);
const FREEZE = Number(process.argv[4] ?? 30);
let MAX_USES = Number(process.argv[5] ?? 2);
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
const clueUsage = new Map(); // "WORD|clue" -> times used

function candidates(pattern, used) {
  const len = pattern.length;
  let pool = null;
  for (let i = 0; i < len; i += 1) {
    if (pattern[i] === '.') continue;
    const list = index.get(len)[i].get(pattern[i]) ?? [];
    if (!pool || list.length < pool.length) pool = list;
  }
  pool ??= byLength.get(len);
  const ok = pool.filter((w) => {
    if (used.has(w) || (usage.get(w) ?? 0) >= MAX_USES) return false;
    for (let i = 0; i < len; i += 1) if (pattern[i] !== '.' && pattern[i] !== w[i]) return false;
    return true;
  });
  // Fresh words first: shuffle, then stable-sort by how often each has been used.
  return shuffle(ok).sort((a, b) => (usage.get(a) ?? 0) - (usage.get(b) ?? 0));
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
      // Crossings can complete a slot without it going through candidates(), so the reuse cap
      // has to be enforced here too.
      const words = slots.map(read);
      return (
        words.every((w) => bank.has(w) && (usage.get(w) ?? 0) < MAX_USES) && new Set(words).size === words.length
      );
    }
    const before = best.cells.map(([r, c]) => grid[r][c]);
    for (const w of bestCands.slice(0, 400)) {
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

const wordsOf = (rows) => {
  const { across, down } = slotsFor(rows);
  return [...across, ...down].map((s) => s.cells.map(([r, c]) => rows[r][c]).join(''));
};

const puzzles = [];
let existing = [];
let previousVersion = 1;
try {
  const { count, chunkSize, version } = JSON.parse(readFileSync(join(outDir, 'index.json'), 'utf8'));
  previousVersion = version ?? 1;
  for (let i = 0; i * chunkSize < count; i += 1) existing = existing.concat(JSON.parse(readFileSync(join(outDir, `${i}.json`), 'utf8')));
} catch {
  existing = JSON.parse(readFileSync(join(here, 'handmade.json'), 'utf8')).map((p, i) => ({ id: i + 1, ...p }));
}
for (const p of existing.slice(0, FREEZE)) {
  puzzles.push(p);
  const words = wordsOf(p.rows);
  const clues = [...p.across, ...p.down];
  words.forEach((w, i) => {
    usage.set(w, (usage.get(w) ?? 0) + 1);
    clueUsage.set(`${w}|${clues[i]}`, (clueUsage.get(`${w}|${clues[i]}`) ?? 0) + 1);
  });
}
console.log(`  kept ${puzzles.length} existing puzzles unchanged`);

// Least-used clue for this word, so a repeated answer gets a different clue each time.
const pickClue = (w) => {
  const clues = shuffle([...bank.get(w)]);
  clues.sort((a, b) => (clueUsage.get(`${w}|${a}`) ?? 0) - (clueUsage.get(`${w}|${b}`) ?? 0));
  clueUsage.set(`${w}|${clues[0]}`, (clueUsage.get(`${w}|${clues[0]}`) ?? 0) + 1);
  return clues[0];
};

const patterns = enumeratePatterns();
// Three-letter slots drain the small pool of 3-letter words fastest, so favor layouts with fewer.
const weights = patterns.map((rows) => 1 / (1 + wordsOf(rows.map((r) => r.replace(/\./g, 'A'))).filter((w) => w.length === 3).length));
const totalWeight = weights.reduce((a, b) => a + b, 0);
const pickPattern = () => {
  let x = rand() * totalWeight;
  for (let i = 0; i < patterns.length; i += 1) if ((x -= weights[i]) <= 0) return patterns[i];
  return patterns[patterns.length - 1];
};

const fingerprints = new Set(puzzles.map((p) => p.rows.join('')));
let attempts = 0;
let misses = 0;
while (puzzles.length < COUNT && attempts < COUNT * 200) {
  attempts += 1;
  const rows = fill(pickPattern());
  if (!rows || fingerprints.has(rows.join(''))) {
    // Late in the run the unused words stop fitting together; loosen the cap a notch rather than stall.
    if ((misses += 1) >= 300) {
      MAX_USES += 1;
      misses = 0;
      console.log(`  raising maxUses to ${MAX_USES} at puzzle ${puzzles.length + 1}`);
    }
    continue;
  }
  misses = 0;
  fingerprints.add(rows.join(''));
  for (const w of wordsOf(rows)) usage.set(w, (usage.get(w) ?? 0) + 1);
  puzzles.push(toPuzzle(puzzles.length + 1, rows, pickClue));
  if (puzzles.length % 50 === 0) console.log(`  ${puzzles.length} puzzles (${attempts} attempts)`);
}
if (puzzles.length < COUNT) console.log(`  stopped at ${puzzles.length}: the bank can't fill more under maxUses=${MAX_USES}`);

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
for (let i = 0; i < puzzles.length; i += CHUNK) {
  writeFileSync(join(outDir, `${i / CHUNK}.json`), JSON.stringify(puzzles.slice(i, i + CHUNK)));
}
// The app drops saved progress for rebuilt puzzles (id > keptThrough) when the version changes.
writeFileSync(
  join(outDir, 'index.json'),
  JSON.stringify({ count: puzzles.length, chunkSize: CHUNK, version: previousVersion + 1, keptThrough: FREEZE }),
);

const distinct = new Set(puzzles.flatMap((p) => slotsFor(p.rows).across.concat(slotsFor(p.rows).down).map((s) => s.cells.map(([r, c]) => p.rows[r][c]).join(''))));
console.log(`Wrote ${puzzles.length} puzzles from ${patterns.length} layouts, ${bank.size} bank words, ${distinct.size} distinct answers used.`);
