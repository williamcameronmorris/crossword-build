import { localDateKey } from './puzzles';

// localStorage can throw (private mode, blocked storage), so every access is guarded.
function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: progress just won't persist */
  }
}

export type SavedProgress = {
  letters: Record<string, string>;
  revealed: string[];
  seconds: number;
  completed: boolean;
  /** Checks, hints and reveals used. Only a reveal makes a solve "assisted": no record, streak reset. */
  hints: number;
  /** Entries whose second clue has been shown, e.g. "a1", "d4". */
  hinted: string[];
};

const progressKey = (id: number) => `clue_co_save_${id}`;
const bestKey = (id: number) => `clue_co_best_${id}`;

export function loadProgress(id: number): SavedProgress | null {
  const raw = read(progressKey(id));
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    return {
      letters: data.letters && typeof data.letters === 'object' ? data.letters : {},
      revealed: Array.isArray(data.revealed) ? data.revealed : [],
      seconds: typeof data.seconds === 'number' ? data.seconds : 0,
      completed: !!data.completed,
      hints: typeof data.hints === 'number' ? data.hints : 0,
      hinted: Array.isArray(data.hinted) ? data.hinted : [],
    };
  } catch {
    return null;
  }
}

export function saveProgress(id: number, progress: SavedProgress) {
  write(progressKey(id), JSON.stringify(progress));
}

export function clearProgress(id: number) {
  write(progressKey(id), null);
}

export function loadBest(id: number): number | null {
  const raw = read(bestKey(id));
  return raw ? Number.parseInt(raw, 10) : null;
}

/** Records a time and returns true if it beat the previous best. */
export function recordBest(id: number, seconds: number): boolean {
  const best = loadBest(id);
  if (best !== null && best <= seconds) return false;
  write(bestKey(id), String(seconds));
  return true;
}

/** Career numbers across every puzzle: fastest and average clean solve, and how many. */
export function loadStats(): { fastest: number | null; average: number | null; cleanSolves: number } {
  const times: number[] = [];
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key?.startsWith('clue_co_best_')) continue;
      const t = Number.parseInt(localStorage.getItem(key) ?? '', 10);
      if (Number.isFinite(t)) times.push(t);
    }
  } catch {
    /* storage unavailable */
  }
  if (!times.length) return { fastest: null, average: null, cleanSolves: 0 };
  return {
    fastest: Math.min(...times),
    average: Math.round(times.reduce((a, b) => a + b, 0) / times.length),
    cleanSolves: times.length,
  };
}

/** Puzzle ids with saved progress, split by solved and started. Read once when the archive opens. */
export function scanArchive(): { solved: Set<number>; started: Set<number> } {
  const solved = new Set<number>();
  const started = new Set<number>();
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      const match = key?.match(/^clue_co_save_(\d+)$/);
      if (!match) continue;
      const id = Number(match[1]);
      if (loadProgress(id)?.completed) solved.add(id);
      else started.add(id);
    }
  } catch {
    /* ignore */
  }
  return { solved, started };
}

/**
 * The next puzzle to offer: today's if it's still open, otherwise a random puzzle never opened
 * on this device, then any unfinished one. Returns null once every puzzle is solved.
 */
export function pickNextPuzzle(count: number, currentId: number, dailyId: number): number | null {
  const { solved, started } = scanArchive();
  if (dailyId > 0 && dailyId !== currentId && !solved.has(dailyId)) return dailyId;
  const random = (ids: number[]) => (ids.length ? ids[Math.floor(Math.random() * ids.length)] : null);
  const all = Array.from({ length: count }, (_, i) => i + 1).filter((id) => id !== currentId);
  return random(all.filter((id) => !solved.has(id) && !started.has(id))) ?? random(all.filter((id) => !solved.has(id)));
}

// --- streak: consecutive calendar days with at least one unassisted solve ---

type StreakState = { count: number; last: string | null };

function yesterdayKey() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return localDateKey(d);
}

function loadStreakState(): StreakState {
  try {
    const data = JSON.parse(read('clue_co_streak_v2') ?? '');
    if (typeof data.count === 'number') return { count: data.count, last: data.last ?? null };
  } catch {
    /* fall through */
  }
  return { count: 0, last: null };
}

/** The streak as it stands today (0 if the chain was broken before yesterday). */
export function currentStreak(): number {
  const { count, last } = loadStreakState();
  return last === localDateKey() || last === yesterdayKey() ? count : 0;
}

export function recordSolveForStreak(): number {
  const state = loadStreakState();
  const today = localDateKey();
  if (state.last === today) return state.count;
  const count = state.last === yesterdayKey() ? state.count + 1 : 1;
  write('clue_co_streak_v2', JSON.stringify({ count, last: today }));
  return count;
}

// --- solve streak: consecutive puzzles finished without a reveal ---

export function currentSolveStreak(): number {
  return Number.parseInt(read('clue_co_solve_streak') ?? '0', 10) || 0;
}

/** Clean solve extends the run; a solve with reveals ends it. Returns the new count. */
export function recordSolveStreak(clean: boolean): number {
  const next = clean ? currentSolveStreak() + 1 : 0;
  write('clue_co_solve_streak', String(next));
  return next;
}

export function readFlag(key: string, fallback: boolean) {
  const raw = read(key);
  return raw === null ? fallback : raw === 'true';
}

export function writeFlag(key: string, value: boolean) {
  write(key, String(value));
}
