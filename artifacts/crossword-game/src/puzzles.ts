export type Direction = 'across' | 'down';
export type Cell = { row: number; col: number };
export type Entry = { number: number; direction: Direction; answer: string; clue: string; cells: Cell[] };

/** Shape of a puzzle as stored in public/puzzles/*.json (see tools/generate-puzzles.mjs). */
type RawPuzzle = { id: number; rows: string[]; across: string[]; down: string[] };

export type Puzzle = {
  id: number;
  size: number;
  rows: string[];
  across: Entry[];
  down: Entry[];
  cellNumbers: Record<string, number>;
  /** Every fillable cell, in reading order. */
  cells: Cell[];
};

export const keyFor = (row: number, col: number) => `${row}-${col}`;
export const sameCell = (a: Cell, b: Cell) => a.row === b.row && a.col === b.col;

function buildPuzzle(raw: RawPuzzle): Puzzle {
  const { rows } = raw;
  const size = rows.length;
  const open = (r: number, c: number) => r >= 0 && r < size && c >= 0 && c < size && rows[r][c] !== '#';
  const run = (r: number, c: number, dr: number, dc: number) => {
    const cells: Cell[] = [];
    while (open(r, c)) {
      cells.push({ row: r, col: c });
      r += dr;
      c += dc;
    }
    return cells;
  };

  const across: Entry[] = [];
  const down: Entry[] = [];
  const cellNumbers: Record<string, number> = {};
  const cells: Cell[] = [];
  let number = 1;
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      if (!open(r, c)) continue;
      cells.push({ row: r, col: c });
      const startsAcross = !open(r, c - 1) && open(r, c + 1);
      const startsDown = !open(r - 1, c) && open(r + 1, c);
      if (!startsAcross && !startsDown) continue;
      cellNumbers[keyFor(r, c)] = number;
      for (const [direction, list, clues, dr, dc] of [
        ['across', across, raw.across, 0, 1],
        ['down', down, raw.down, 1, 0],
      ] as const) {
        if (direction === 'across' ? !startsAcross : !startsDown) continue;
        const entryCells = run(r, c, dr, dc);
        list.push({
          number,
          direction,
          cells: entryCells,
          answer: entryCells.map((cell) => rows[cell.row][cell.col]).join(''),
          clue: clues[list.length] ?? '',
        });
      }
      number += 1;
    }
  }
  return { id: raw.id, size, rows, across, down, cellNumbers, cells };
}

// --- loading ---------------------------------------------------------------
// The bank is split into chunks of ~100 puzzles so a visit downloads ~15 KB, not the whole archive.

const base = `${import.meta.env.BASE_URL}puzzles/`;
type BankIndex = { count: number; chunkSize: number };

let indexPromise: Promise<BankIndex> | null = null;
const chunkCache = new Map<number, Promise<RawPuzzle[]>>();

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url} (${res.status})`);
  return res.json() as Promise<T>;
}

export function loadBankIndex(): Promise<BankIndex> {
  indexPromise ??= fetchJson<BankIndex>(`${base}index.json`).catch((error) => {
    indexPromise = null;
    throw error;
  });
  return indexPromise;
}

function loadChunk(chunk: number): Promise<RawPuzzle[]> {
  let promise = chunkCache.get(chunk);
  if (!promise) {
    promise = fetchJson<RawPuzzle[]>(`${base}${chunk}.json`).catch((error) => {
      chunkCache.delete(chunk);
      throw error;
    });
    chunkCache.set(chunk, promise);
  }
  return promise;
}

export async function loadPuzzle(id: number): Promise<Puzzle> {
  const { chunkSize } = await loadBankIndex();
  const chunk = Math.floor((id - 1) / chunkSize);
  const raw = (await loadChunk(chunk))[(id - 1) % chunkSize];
  if (!raw) throw new Error(`Puzzle ${id} not found`);
  return buildPuzzle(raw);
}

/** Warm the cache for the puzzle after this one so "Next" is instant. */
export function prefetchPuzzle(id: number) {
  loadBankIndex()
    .then(({ count, chunkSize }) => {
      if (id <= count) void loadChunk(Math.floor((id - 1) / chunkSize));
    })
    .catch(() => {});
}

// --- daily puzzle ------------------------------------------------------------

const LAUNCH = new Date(2026, 9, 4); // Oct 4, 2026 is No. 1

export function localDateKey(date = new Date()) {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

/** Today's puzzle number. Cycles back to No. 1 once the bank runs out. */
export function dailyPuzzleId(count: number, today = new Date()) {
  const start = new Date(LAUNCH.getFullYear(), LAUNCH.getMonth(), LAUNCH.getDate());
  const now = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.round((now.getTime() - start.getTime()) / 86_400_000);
  return (((days % count) + count) % count) + 1;
}
