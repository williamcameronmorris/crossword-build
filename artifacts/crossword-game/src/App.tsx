import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowRight, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Clock, Compass, Delete, Flame, Grid, HelpCircle, Lightbulb, Pause, Play, RotateCcw, Share2, Shuffle, Sparkles, Trophy, Volume2, VolumeX, X, Zap } from 'lucide-react';
import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { getSoundEnabled, playBackspace, playClueSwitch, playKeyClick, playVictoryFanfare, setSoundEnabled } from './audio';

type Direction = 'across' | 'down';
type Cell = { row: number; col: number };
type Entry = { number: number; direction: Direction; answer: string; clue: string; cells: Cell[] };
type Puzzle = {
  id: number;
  theme: string;
  themeIcon: string;
  title: string;
  rows: string[];
  across: Entry[];
  down: Entry[];
  cellNumbers: Record<string, number>;
};

const queryClient = new QueryClient();
const keyFor = (row: number, col: number) => `${row}-${col}`;
const sameCell = (a: Cell | null, b: Cell) => !!a && a.row === b.row && a.col === b.col;

function createGridPuzzle(
  id: number,
  theme: string,
  themeIcon: string,
  title: string,
  rawRows: string[],
  acrossClues: string[],
  downClues: string[],
): Puzzle {
  const rows = rawRows.map((row) => row.toUpperCase().padEnd(5, '#').slice(0, 5));
  if (rows.length !== 5 || rows.some((row) => row.length !== 5)) {
    throw new Error(`Puzzle ${id} must be a 5 by 5 grid.`);
  }

  const cellNumbers: Record<string, number> = {};
  let nextNumber = 1;
  const across: Entry[] = [];
  const down: Entry[] = [];

  const getCells = (row: number, col: number, direction: Direction) => {
    const cells: Cell[] = [];
    let currentRow = row;
    let currentCol = col;
    while (currentRow < 5 && currentCol < 5 && rows[currentRow][currentCol] !== '#') {
      cells.push({ row: currentRow, col: currentCol });
      if (direction === 'across') currentCol += 1;
      else currentRow += 1;
    }
    return cells;
  };

  for (let row = 0; row < 5; row += 1) {
    for (let col = 0; col < 5; col += 1) {
      if (rows[row][col] === '#') continue;
      const startsAcross = (col === 0 || rows[row][col - 1] === '#') && col + 1 < 5 && rows[row][col + 1] !== '#';
      const startsDown = (row === 0 || rows[row - 1][col] === '#') && row + 1 < 5 && rows[row + 1][col] !== '#';
      if (!startsAcross && !startsDown) continue;

      const number = nextNumber;
      nextNumber += 1;
      cellNumbers[keyFor(row, col)] = number;
      if (startsAcross) {
        const cells = getCells(row, col, 'across');
        across.push({ number, direction: 'across', answer: cells.map((cell) => rows[cell.row][cell.col]).join(''), clue: acrossClues[across.length], cells });
      }
      if (startsDown) {
        const cells = getCells(row, col, 'down');
        down.push({ number, direction: 'down', answer: cells.map((cell) => rows[cell.row][cell.col]).join(''), clue: downClues[down.length], cells });
      }
    }
  }

  const answers = [...across, ...down].map((entry) => entry.answer);
  const duplicates = answers.filter((answer, index) => answers.indexOf(answer) !== index);
  if (duplicates.length > 0 || across.some((entry) => !entry.clue) || down.some((entry) => !entry.clue)) {
    throw new Error(`Puzzle ${id} has duplicate answers or missing clues.`);
  }
  return { id, theme, themeIcon, title, rows, across, down, cellNumbers };
}

const puzzles: Puzzle[] = [
  createGridPuzzle(
    1,
    'Grand Slam',
    '🏆',
    'Championship Court',
    ['##FIT', 'GRAND', 'YOURS', 'MINE#', 'SLAM#'],
    [
      'In good physical shape',
      'With 5th Across, four runs in baseball or four major tennis titles',
      'Not mine, but ___',
      'Personal claim or possession',
      'See 2nd Across',
    ],
    [
      'Counterpart of flora in biology',
      'Stage when vivid dreams occur, for short',
      'Six-point football scores, briefly',
      'Facilities with weights and treadmills',
      'Stir up or agitate, as waters',
    ],
  ),
  createGridPuzzle(
    2,
    'World & Wanderlust',
    '🗺️',
    'Globe Trotter',
    ['PETS#', 'EXIT#', 'ATBAT', 'CRETE', 'HATED'],
    [
      'Dogs and cats ... or less commonly, frogs and rats',
      'Highway off-ramp',
      'Chance to hit a homer in baseball',
      'Largest island of Greece, in the Aegean',
      'Strongly disliked',
    ],
    [
      'Fruit featured on a Georgia license plate',
      'The "E" of ESP',
      'Plateau region on the north side of Mount Everest',
      "Governor's constitutional realm",
      'Danson of "The Good Place"',
    ],
  ),
  createGridPuzzle(
    3,
    'Alpine Retreat',
    '🏕️',
    'Cabin & Campfire',
    ['#CATS', 'BASIL', 'OBAMA', 'BIDET', 'SNARE'],
    [
      'Attendees of the Jellicle Ball, on Broadway',
      'Fragrant herb topping on a pizza margherita',
      'President who wrote "A Promised Land"',
      'Bathroom fixture popular in Europe and Japan',
      'Rattling kind of drum in a marching band',
    ],
    [
      'Cozy timber home nestled in the woods',
      'Carne ___ (grilled beef taco filling)',
      'Countdown tool in the Clock app',
      'Fine-grained rock used for rustic roofing',
      'Floats up and down gently on the water',
    ],
  ),
  createGridPuzzle(
    4,
    'Shakespeare & Song',
    '🎭',
    'Padua & Pop',
    ['OOPS#', 'KHAKI', 'ABDUL', 'YOULL', '#YAKS'],
    [
      '"Sorry about that!" slip',
      'Chino cloth material that rhymes with "tacky"',
      'Paula who judged on "American Idol"',
      '"___ never believe this ..."',
      'Long-haired Himalayan beasts of burden',
    ],
    [
      'Acceptable or "just fine"',
      '"Well, this oughta be good!"',
      'Italian city where "The Taming of the Shrew" is set',
      'Lurk or sneak around stealthily',
      'Troubles or ailments of society',
    ],
  ),
  createGridPuzzle(
    5,
    'Symphony & Story',
    '🎻',
    'Strings & Spiders',
    ['#WEB#', 'BOXUP', 'AMIGO', 'CELLO', 'KNEEL'],
    [
      'What fills the Venn diagram of "Spider-Man" and "the Internet"',
      'Pack, as a mover might',
      '"Adios, ___!" (pal)',
      'Large stringed instrument played with an endpin',
      'Prepare to pop the question',
    ],
    [
      'Alcott\'s classic "Little ___"',
      'Banished person unwelcome at home',
      'Military brass instrument played for Reveille',
      'Support politically or financially',
      'Site of cannonballs and bellyflops',
    ],
  ),
  createGridPuzzle(
    6,
    'Autumn Canvas',
    '🍂',
    'Maine Maple',
    ['#GAG#', 'UMBER', 'MAINE', 'SIDED', '#LES#'],
    [
      'Running joke or comedic bit',
      'Earth brown pigment that turns gold if you change the "U" to an "A"',
      'Pine Tree State that shares first and last letters with "MOOSE"',
      'Joined teams or aligned with',
      '"___ Misérables" (classic Hugo work)',
    ],
    [
      'Google app with a red and white envelope logo',
      'Endure or tolerate ("___ by the rules")',
      'Hereditary units that determine traits',
      'Hesitant filler sounds',
      'Vibrant autumn foliage hue for a sugar maple',
    ],
  ),
  createGridPuzzle(
    7,
    'Cosmic Greek',
    '🌌',
    'Alpha & Omega',
    ['IS#DO', 'THEIR', '#AVE#', 'OMEGA', 'HE#ON'],
    [
      'Exists, briefly',
      'Perform',
      'Belonging to them',
      'Greeting, in Latin',
      'Last Greek letter',
      'Male pronoun',
      'Operating',
    ],
    [
      'Pronoun for a thing',
      'Embarrassment',
      'San Diego, for one',
      'Choice connector',
      'Day before today',
      'Exclamation',
      'Indefinite article',
    ],
  ),
  createGridPuzzle(
    8,
    'Global Gateway',
    '🌏',
    'Capital Journey',
    ['ON#AT', 'HELLO', '#VIP#', 'DELHI', 'OR#AN'],
    [
      'Operating',
      'Location preposition',
      'Greeting',
      'Important person, briefly',
      'Indian capital',
      'Choice connector',
      'Indefinite article',
    ],
    [
      'Exclamation',
      'At no time',
      'First Greek letter',
      'Toward',
      'Little, informally',
      'Perform',
      'Fashionable',
    ],
  ),
  createGridPuzzle(
    9,
    'Silver Screen',
    '🎬',
    'Hollywood Premiere',
    ['#RORY', 'MOVIE', 'ELIZA', 'GENZ#', 'AXE##'],
    [
      'Golfer McIlroy or Gilmore girl',
      'What a best-selling novel might be adapted into',
      'Doolittle of "My Fair Lady"',
      'Digital native generation born in the early 2000s',
      'Tool for a Paul Bunyan woodcutter',
    ],
    [
      'Luxury watch brand with a crown logo',
      'Sheep-like, analogous to bovine or canine',
      'Magnetic charisma, in modern slang',
      'Affirmative vote in Congress',
      'Blockbuster prefix with hit or byte',
    ],
  ),
  createGridPuzzle(
    10,
    'Culinary Craft',
    '🍕',
    'Kitchen & Cask',
    ['QUACK', 'UNCLE', 'IDIOT', 'RUNTO', 'KEGS#'],
    [
      'Noise heard in an Aflac commercial',
      '___ Fester, classic Addams Family character',
      'Total fool or blockhead',
      'Total, as mounting expenses',
      'Party containers tapped for cold draft beverages',
    ],
    [
      'Unique personality trait or eccentric mannerism',
      'Excessive or unwarranted, as pressure',
      'Scoring 100% on a test',
      'Lumps formed in rich cream or milk',
      'High-fat, low-carb culinary regimen',
    ],
  ),
  createGridPuzzle(
    11,
    'Botanical Garden',
    '🌿',
    'Spring Bloom & Broth',
    ['#BART', '#LMAO', 'FOAMY', 'OOZE#', 'XMEN#'],
    [
      "San Francisco's rapid transit system",
      'Texter\'s "that\'s hilarious!" acronym',
      'Like beer fresh from the tap',
      'Flow slowly, like warm honey',
      'Mutant superhero team in Marvel comics',
    ],
    [
      'Open petals, as a garden rose',
      'Astonish and fill with wonder',
      'Japanese noodle dish in savory broth',
      'Plaything tucked into a Happy Meal',
      'Clever woodland animal (Vulpes vulpes)',
    ],
  ),
  createGridPuzzle(
    12,
    'Coastal Breeze',
    '🌊',
    'Pacific Surf & Shore',
    ['OBVI#', 'FEET#', 'FALSE', '#CMON', '#HAND'],
    [
      '"That\'s a total no-brainer!," slangily',
      '5,280 in a statute mile',
      'F choice on an exam',
      '"Give me a break!"',
      'Orange "don\'t walk" crosswalk signal',
    ],
    [
      'Brand of bug spray with an exclamation point',
      'Long ___, sunny Pacific coast getaway',
      'Brainy mystery-solver in an orange turtleneck',
      '"Let\'s do this thing!"',
      'Finish line or final chapter',
    ],
  ),
];

function formatTime(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function fireConfetti() {
  const canvas = document.createElement('canvas');
  canvas.style.position = 'fixed';
  canvas.style.inset = '0';
  canvas.style.width = '100vw';
  canvas.style.height = '100vh';
  canvas.style.pointerEvents = 'none';
  canvas.style.zIndex = '9999';
  document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const particles: Array<{
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    color: string;
    rotation: number;
    vr: number;
    opacity: number;
  }> = [];

  const colors = ['#ec715f', '#53b8a5', '#e9c46a', '#2a9d8f', '#292640', '#e76f51'];

  for (let i = 0; i < 90; i++) {
    particles.push({
      x: canvas.width / 2 + (Math.random() - 0.5) * 200,
      y: canvas.height * 0.45,
      vx: (Math.random() - 0.5) * 14,
      vy: -Math.random() * 14 - 4,
      size: Math.random() * 9 + 5,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * 360,
      vr: (Math.random() - 0.5) * 10,
      opacity: 1,
    });
  }

  let frame = 0;
  const render = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = false;

    particles.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.45; // gravity
      p.rotation += p.vr;
      p.opacity -= 0.009;

      if (p.opacity > 0) {
        alive = true;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.globalAlpha = Math.max(0, p.opacity);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      }
    });

    frame++;
    if (alive && frame < 180) {
      requestAnimationFrame(render);
    } else {
      canvas.remove();
    }
  };

  requestAnimationFrame(render);
}

function Home() {
  const captureRef = useRef<HTMLInputElement>(null);
  const [puzzleIndex, setPuzzleIndex] = useState(() => {
    const saved = localStorage.getItem('clue_co_puzzle_idx');
    return saved ? parseInt(saved, 10) : 0;
  });
  const [letters, setLetters] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Cell>({ row: 0, col: 0 });
  const [direction, setDirection] = useState<Direction>('across');
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [completed, setCompleted] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showKeyboard, setShowKeyboard] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth <= 640;
    }
    return false;
  });
  const [showThemesModal, setShowThemesModal] = useState(false);
  const [soundOn, setSoundOn] = useState(() => getSoundEnabled());
  const [isNewRecord, setIsNewRecord] = useState(false);
  const [personalBest, setPersonalBest] = useState<number | null>(null);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [copiedShare, setCopiedShare] = useState(false);
  const [streak, setStreak] = useState(() => {
    return parseInt(localStorage.getItem('clue_co_streak') || '1', 10);
  });

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    setSoundEnabled(next);
  };

  const currentPuzzle = puzzles[puzzleIndex % puzzles.length];
  const solution = useMemo(() => currentPuzzle.rows.map((row) => row.split('')), [currentPuzzle]);
  const acrossEntries = currentPuzzle.across;
  const downEntries = currentPuzzle.down;
  const allEntries = useMemo(() => [...acrossEntries, ...downEntries], [acrossEntries, downEntries]);
  const allPlayableCells = useMemo(
    () => Array.from(new Map(allEntries.flatMap((entry) => entry.cells).map((cell) => [keyFor(cell.row, cell.col), cell])).values()),
    [allEntries],
  );
  const isBlock = (row: number, col: number) => solution[row][col] === '#';
  const puzzleLabel = String(currentPuzzle.id).padStart(3, '0');

  // Load saved puzzle state
  useEffect(() => {
    const saved = localStorage.getItem(`clue_co_save_${currentPuzzle.id}`);
    if (saved) {
      try {
        const data = JSON.parse(saved);
        if (data.letters && typeof data.letters === 'object') {
          setLetters(data.letters);
        } else {
          setLetters({});
        }
        if (typeof data.seconds === 'number') setTimerSeconds(data.seconds);
        if (data.completed) setCompleted(true);
        else setCompleted(false);
      } catch {
        setLetters({});
        setTimerSeconds(0);
        setCompleted(false);
      }
    } else {
      setLetters({});
      setTimerSeconds(0);
      setCompleted(false);
    }
    setChecked(new Set());
    setRevealed(new Set());
    setTimerRunning(false);
    setIsPaused(false);
    setHintsUsed(0);

    // Load personal best
    const savedBest = localStorage.getItem(`clue_co_best_${currentPuzzle.id}`);
    setPersonalBest(savedBest ? parseInt(savedBest, 10) : null);
    setIsNewRecord(false);

    // Find first non-block cell
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        if (currentPuzzle.rows[r][c] !== '#') {
          setSelected({ row: r, col: c });
          return;
        }
      }
    }
  }, [puzzleIndex, currentPuzzle.id, currentPuzzle.rows]);

  // Save current puzzle state
  useEffect(() => {
    if (Object.keys(letters).length > 0) {
      localStorage.setItem(
        `clue_co_save_${currentPuzzle.id}`,
        JSON.stringify({
          letters,
          seconds: timerSeconds,
          completed,
        }),
      );
    }
  }, [letters, timerSeconds, completed, currentPuzzle.id]);

  // Timer interval
  useEffect(() => {
    if (!timerRunning || isPaused || completed) return;
    const interval = window.setInterval(() => {
      setTimerSeconds((sec) => sec + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [timerRunning, isPaused, completed]);

  const selectedEntry = useMemo(() => {
    const entry = allEntries.find((item) => item.direction === direction && item.cells.some((cell) => sameCell(selected, cell)));
    return entry ?? acrossEntries[0];
  }, [allEntries, direction, selected, acrossEntries]);

  const cellEntry = useCallback(
    (cell: Cell, wantedDirection = direction) =>
      allEntries.find((entry) => entry.direction === wantedDirection && entry.cells.some((entryCell) => sameCell(entryCell, cell))),
    [allEntries, direction],
  );

  const focusCapture = useCallback(() => {
    if (!isPaused && !completed) {
      captureRef.current?.focus();
      if (!timerRunning) setTimerRunning(true);
    }
  }, [isPaused, completed, timerRunning]);

  const switchDirection = useCallback(
    (nextDirection?: Direction) => {
      const targetDir = nextDirection || (direction === 'across' ? 'down' : 'across');
      const nextEntries = targetDir === 'across' ? acrossEntries : downEntries;
      const matchingEntry = nextEntries.find((entry) => entry.cells.some((entryCell) => sameCell(selected, entryCell)));
      setDirection(targetDir);
      if (!matchingEntry) {
        setSelected(nextEntries[0].cells[0]);
      }
      playClueSwitch();
      focusCapture();
    },
    [direction, acrossEntries, downEntries, selected, focusCapture],
  );

  const selectCell = useCallback(
    (cell: Cell) => {
      if (isBlock(cell.row, cell.col)) return;
      if (sameCell(selected, cell)) {
        switchDirection();
      } else {
        setSelected(cell);
        if (!cellEntry(cell, direction)) {
          const otherDirection = direction === 'across' ? 'down' : 'across';
          setDirection(cellEntry(cell, otherDirection) ? otherDirection : 'across');
        }
      }
      focusCapture();
    },
    [selected, isBlock, switchDirection, cellEntry, direction, focusCapture],
  );

  const selectEntry = useCallback(
    (entry: Entry) => {
      setDirection(entry.direction);
      setSelected(entry.cells[0]);
      playClueSwitch();
      focusCapture();
    },
    [focusCapture],
  );

  // Jump to next or previous clue entry
  const jumpToEntry = useCallback(
    (delta: 1 | -1) => {
      const activeList = direction === 'across' ? acrossEntries : downEntries;
      const currentIndex = activeList.findIndex((e) => e.number === selectedEntry.number);
      let nextIndex = currentIndex + delta;
      if (nextIndex >= activeList.length) {
        // switch list
        const otherList = direction === 'across' ? downEntries : acrossEntries;
        setDirection(direction === 'across' ? 'down' : 'across');
        setSelected(otherList[0].cells[0]);
      } else if (nextIndex < 0) {
        const otherList = direction === 'across' ? downEntries : acrossEntries;
        setDirection(direction === 'across' ? 'down' : 'across');
        setSelected(otherList[otherList.length - 1].cells[0]);
      } else {
        setSelected(activeList[nextIndex].cells[0]);
      }
      playClueSwitch();
      focusCapture();
    },
    [direction, acrossEntries, downEntries, selectedEntry, focusCapture],
  );

  const moveBy = useCallback(
    (cell: Cell, deltaRow: number, deltaCol: number) => {
      let row = cell.row + deltaRow;
      let col = cell.col + deltaCol;
      while (row >= 0 && row < 5 && col >= 0 && col < 5) {
        if (!isBlock(row, col)) {
          setSelected({ row, col });
          return;
        }
        row += deltaRow;
        col += deltaCol;
      }
    },
    [isBlock],
  );

  const updateLetter = useCallback(
    (value: string) => {
      const letter = value.toUpperCase().replace(/[^A-Z]/g, '').slice(-1);
      if (!letter || isBlock(selected.row, selected.col)) return;

      playKeyClick();
      if (!timerRunning) setTimerRunning(true);

      const cellKey = keyFor(selected.row, selected.col);
      setLetters((current) => ({ ...current, [cellKey]: letter }));
      setChecked((current) => {
        const next = new Set(current);
        next.delete(cellKey);
        return next;
      });

      // Auto-advance logic:
      // 1. Check for the next empty cell in this entry
      const index = selectedEntry.cells.findIndex((cell) => sameCell(selected, cell));
      const remainingCells = selectedEntry.cells.slice(index + 1);
      const nextEmpty = remainingCells.find((c) => !letters[keyFor(c.row, c.col)]);

      if (nextEmpty) {
        setSelected(nextEmpty);
      } else if (index + 1 < selectedEntry.cells.length) {
        setSelected(selectedEntry.cells[index + 1]);
      } else {
        // Check if there are unfilled cells in other clues
        const hasUnfilled = allPlayableCells.some((c) => !letters[keyFor(c.row, c.col)] && keyFor(c.row, c.col) !== cellKey);
        if (hasUnfilled) {
          jumpToEntry(1);
        }
      }
    },
    [selected, selectedEntry, letters, allPlayableCells, jumpToEntry, timerRunning, isBlock],
  );

  const clearCurrent = useCallback(() => {
    playBackspace();
    const cellKey = keyFor(selected.row, selected.col);
    if (letters[cellKey]) {
      // Clear current cell, stay in place
      setLetters((current) => {
        const next = { ...current };
        delete next[cellKey];
        return next;
      });
    } else {
      // Empty cell: step back 1 in the entry and clear that one
      const index = selectedEntry.cells.findIndex((cell) => sameCell(selected, cell));
      if (index > 0) {
        const prevCell = selectedEntry.cells[index - 1];
        const prevKey = keyFor(prevCell.row, prevCell.col);
        setSelected(prevCell);
        setLetters((current) => {
          const next = { ...current };
          delete next[prevKey];
          return next;
        });
      }
    }
    setChecked((current) => {
      const next = new Set(current);
      next.delete(cellKey);
      return next;
    });
  }, [selected, letters, selectedEntry]);

  const checkPuzzle = useCallback(() => {
    setHintsUsed((h) => h + 1);
    const incorrect = new Set<string>();
    allPlayableCells.forEach((cell) => {
      const key = keyFor(cell.row, cell.col);
      if (letters[key] && letters[key] !== solution[cell.row][cell.col]) incorrect.add(key);
    });
    setChecked(incorrect);
  }, [allPlayableCells, letters, solution]);

  const revealCurrent = useCallback(() => {
    setHintsUsed((h) => h + 1);
    const cellKey = keyFor(selected.row, selected.col);
    const correct = solution[selected.row][selected.col];
    setLetters((current) => ({ ...current, [cellKey]: correct }));
    setRevealed((current) => new Set(current).add(cellKey));
    setChecked((current) => {
      const next = new Set(current);
      next.delete(cellKey);
      return next;
    });

    const index = selectedEntry.cells.findIndex((cell) => sameCell(selected, cell));
    if (index + 1 < selectedEntry.cells.length) {
      setSelected(selectedEntry.cells[index + 1]);
    }
  }, [selected, solution, selectedEntry]);

  const resetPuzzle = useCallback(
    (nextPuzzle = false, targetIdx?: number) => {
      const nextIdx =
        targetIdx !== undefined
          ? ((targetIdx % puzzles.length) + puzzles.length) % puzzles.length
          : nextPuzzle
          ? (puzzleIndex + 1) % puzzles.length
          : puzzleIndex;
      const targetPuzzle = puzzles[nextIdx];

      if (!nextPuzzle && targetIdx === undefined) {
        localStorage.removeItem(`clue_co_save_${targetPuzzle.id}`);
      }

      setLetters({});
      setCompleted(false);
      setChecked(new Set());
      setRevealed(new Set());
      setTimerSeconds(0);
      setHintsUsed(0);
      setIsPaused(false);
      setShowThemesModal(false);

      if (nextPuzzle || targetIdx !== undefined) {
        setPuzzleIndex(nextIdx);
        localStorage.setItem('clue_co_puzzle_idx', String(nextIdx));
      }
      setTimerRunning(true);
      focusCapture();
    },
    [puzzleIndex, focusCapture],
  );

  // Physical Keyboard Listener
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (completed || isPaused) return;

      if (event.key.length === 1 && /^[a-z]$/i.test(event.key)) {
        event.preventDefault();
        updateLetter(event.key);
      } else if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault();
        clearCurrent();
      } else if (event.key === 'Tab') {
        event.preventDefault();
        jumpToEntry(event.shiftKey ? -1 : 1);
      } else if (event.key === ' ') {
        event.preventDefault();
        switchDirection();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        if (direction === 'down' && cellEntry(selected, 'across')) setDirection('across');
        moveBy(selected, 0, -1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        if (direction === 'down' && cellEntry(selected, 'across')) setDirection('across');
        moveBy(selected, 0, 1);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        if (direction === 'across' && cellEntry(selected, 'down')) setDirection('down');
        moveBy(selected, -1, 0);
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (direction === 'across' && cellEntry(selected, 'down')) setDirection('down');
        moveBy(selected, 1, 0);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [completed, isPaused, updateLetter, clearCurrent, jumpToEntry, switchDirection, moveBy, selected, direction, cellEntry]);

  // Completion check
  useEffect(() => {
    if (completed) return;
    const filledCount = allPlayableCells.filter((cell) => !!letters[keyFor(cell.row, cell.col)]).length;
    if (filledCount === allPlayableCells.length) {
      const solved = allPlayableCells.every((cell) => letters[keyFor(cell.row, cell.col)] === solution[cell.row][cell.col]);
      if (solved) {
        setCompleted(true);
        setTimerRunning(false);
        fireConfetti();
        playVictoryFanfare();
        const nextStreak = streak + 1;
        setStreak(nextStreak);
        localStorage.setItem('clue_co_streak', String(nextStreak));

        // Personal best check
        const savedBestStr = localStorage.getItem(`clue_co_best_${currentPuzzle.id}`);
        const currentBest = savedBestStr ? parseInt(savedBestStr, 10) : null;
        if (currentBest === null || timerSeconds < currentBest) {
          localStorage.setItem(`clue_co_best_${currentPuzzle.id}`, String(timerSeconds));
          setPersonalBest(timerSeconds);
          setIsNewRecord(true);
        } else {
          setIsNewRecord(false);
        }
      }
    }
  }, [letters, allPlayableCells, solution, completed, streak, timerSeconds, currentPuzzle.id]);

  const handleShare = () => {
    const text = `Clue & Co Mini #${puzzleLabel} • ${currentPuzzle.themeIcon} ${currentPuzzle.theme}\n⏱️ ${formatTime(timerSeconds)}${hintsUsed === 0 ? ' ⭐ Flawless' : ''}\n🔥 ${streak} Day Streak\nPlay: https://clueandco.app`;
    navigator.clipboard.writeText(text).then(() => {
      setCopiedShare(true);
      setTimeout(() => setCopiedShare(false), 2500);
    });
  };

  return (
    <main className="game-shell" onPointerDown={focusCapture}>
      {/* Native Keyboard Capture Input */}
      <input
        ref={captureRef}
        className="key-capture"
        aria-label="Type your crossword answer"
        data-testid="input-answer"
        autoFocus
        inputMode="text"
        autoCapitalize="characters"
        autoCorrect="off"
        autoComplete="off"
        spellCheck="false"
      />

      {/* Top Bar with Brand, Theme Selector, Live Timer, Streak, and Help */}
      <div className="topbar">
        <div className="brand-lockup" data-testid="text-brand">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </span>
          <span>
            CLUE <i>&</i> CO
          </span>
        </div>

        <div className="top-actions">
          {/* Theme Selector Chip & Quick Arrows */}
          <div className="theme-nav-group">
            <button
              type="button"
              className="theme-chip-btn"
              onClick={() => setShowThemesModal(true)}
              title="Browse Puzzles & Themes"
              data-testid="button-theme-selector"
            >
              <span className="theme-icon-badge">{currentPuzzle.themeIcon}</span>
              <span className="theme-name-text">{currentPuzzle.theme}</span>
              <ChevronDown size={14} className="theme-arrow" />
            </button>
            <div className="theme-arrow-controls">
              <button
                type="button"
                className="theme-arrow-btn"
                onClick={() => resetPuzzle(false, ((puzzleIndex - 1) % puzzles.length + puzzles.length) % puzzles.length)}
                title="Previous Theme"
                aria-label="Previous Theme"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                type="button"
                className="theme-arrow-btn"
                onClick={() => resetPuzzle(false, (puzzleIndex + 1) % puzzles.length)}
                title="Next Theme"
                aria-label="Next Theme"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>

          {/* Live Timer Chip */}
          <div className="timer-chip" data-testid="status-timer">
            <Clock size={14} className={timerRunning && !isPaused ? 'timer-icon-pulse' : ''} />
            <span>{formatTime(timerSeconds)}</span>
            {!completed && (
              <button
                type="button"
                className="timer-pause-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsPaused((p) => !p);
                }}
                title={isPaused ? 'Resume Timer' : 'Pause Timer'}
                aria-label={isPaused ? 'Resume Timer' : 'Pause Timer'}
              >
                {isPaused ? <Play size={12} /> : <Pause size={12} />}
              </button>
            )}
          </div>

          {/* Daily Streak */}
          <span className="streak-chip" title="Current Daily Streak">
            <Flame size={14} className="streak-flame" /> {streak}
          </span>

          {/* Sound Toggle Button */}
          <button
            type="button"
            className={`icon-button sound-toggle-btn ${soundOn ? 'sound-on' : 'sound-muted'}`}
            onClick={(e) => {
              e.stopPropagation();
              toggleSound();
            }}
            title={soundOn ? 'Mute Sounds' : 'Unmute Sounds'}
            aria-label={soundOn ? 'Mute Sounds' : 'Unmute Sounds'}
            data-testid="button-sound-toggle"
          >
            {soundOn ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>

          <button
            type="button"
            className="icon-button"
            onClick={(e) => {
              e.stopPropagation();
              setShowHelp((value) => !value);
            }}
            aria-label="How to play"
            data-testid="button-help"
          >
            <HelpCircle size={19} strokeWidth={2.1} />
          </button>
        </div>
      </div>

      <section className="intro-row">
        <div>
          <p className="eyebrow">
            <span className="theme-eyebrow-icon">{currentPuzzle.themeIcon}</span> THEME: {currentPuzzle.theme.toUpperCase()}
          </p>
          <h1>
            {currentPuzzle.title}.
          </h1>
          <p className="subtitle">Mini crossword #{puzzleLabel} • Endless themed solves</p>
        </div>
        <div className="progress-stamp" aria-label={`${Object.keys(letters).length} of ${allPlayableCells.length} cells filled`} data-testid="status-progress">
          <span>{String(Object.keys(letters).length).padStart(2, '0')}</span>
          <small>/ {allPlayableCells.length}</small>
        </div>
      </section>

      {showHelp && (
        <div className="help-popover" role="status">
          <strong>How to play</strong>
          <span>
            • <strong>Tap or Click</strong> any cell to select a word. Tap again to switch Across/Down.<br />
            • <strong>Spacebar</strong> toggles direction.<br />
            • <strong>Tab / Shift+Tab</strong> jumps between clues.<br />
            • <strong>Backspace</strong> clears letters and steps backward.
          </span>
          <button type="button" onClick={() => setShowHelp(false)} aria-label="Close help">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Main Play Area */}
      <section className="play-area">
        <div className="board-wrap">
          {/* Pinned Active Clue Banner directly above the board */}
          <div className="pinned-clue-bar" onClick={() => switchDirection()} title="Click to switch Across/Down" role="region" aria-label="Current clue">
            <button
              type="button"
              className="clue-nav-btn"
              onClick={(e) => {
                e.stopPropagation();
                jumpToEntry(-1);
              }}
              aria-label="Previous clue"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="pinned-clue-text">
              <span className="pinned-clue-badge">
                {selectedEntry.number} {selectedEntry.direction.toUpperCase()}
              </span>
              <span className="pinned-clue-content">{selectedEntry.clue}</span>
            </div>
            <button
              type="button"
              className="clue-nav-btn"
              onClick={(e) => {
                e.stopPropagation();
                jumpToEntry(1);
              }}
              aria-label="Next clue"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          <div className="board-container-relative">
            {/* Pause Overlay */}
            {isPaused && (
              <div
                className="pause-overlay"
                onClick={() => {
                  setIsPaused(false);
                  focusCapture();
                }}
              >
                <div className="pause-modal">
                  <Play size={32} />
                  <h3>Game Paused</h3>
                  <p>Tap anywhere to resume your solve</p>
                </div>
              </div>
            )}

            <div className={`crossword-board ${isPaused ? 'board-paused' : ''}`} role="grid" aria-label="5 by 5 crossword puzzle" data-testid="crossword-board">
              {solution.map((row, rowIndex) =>
                row.map((value, colIndex) => {
                  const cell = { row: rowIndex, col: colIndex };
                  const key = keyFor(rowIndex, colIndex);
                  if (value === '#') return <div key={key} className="block-cell" aria-hidden="true" />;
                  const isSelected = sameCell(selected, cell);
                  const inWord = selectedEntry.cells.some((entryCell) => sameCell(entryCell, cell));
                  return (
                    <button
                      key={key}
                      type="button"
                      role="gridcell"
                      className={`board-cell ${isSelected ? 'is-selected' : ''} ${inWord ? 'in-word' : ''} ${checked.has(key) ? 'is-wrong' : ''} ${revealed.has(key) ? 'is-revealed' : ''}`}
                      onClick={() => selectCell(cell)}
                      aria-label={`Row ${rowIndex + 1}, column ${colIndex + 1}${letters[key] ? `, ${letters[key]}` : ''}`}
                      data-testid={`cell-${rowIndex}-${colIndex}`}
                    >
                      {currentPuzzle.cellNumbers[key] && <span className="cell-number">{currentPuzzle.cellNumbers[key]}</span>}
                      <span className="cell-letter">{letters[key] ?? ''}</span>
                    </button>
                  );
                }),
              )}
            </div>
          </div>

          <div className="board-footnote">
            <span>
              <span className="key-dot" /> Space to toggle direction · Tab for next clue
            </span>
            <button
              type="button"
              className="toggle-soft-kbd-btn"
              onClick={(e) => {
                e.stopPropagation();
                setShowKeyboard((k) => !k);
              }}
            >
              {showKeyboard ? 'Hide Keypad' : 'Show Keypad'}
            </button>
          </div>

          {/* On-Screen Mobile Keyboard (QWERTY) */}
          {showKeyboard && (
            <div className="soft-keyboard" role="toolbar" aria-label="Crossword On-Screen Keyboard">
              <div className="kbd-row">
                {['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'].map((char) => (
                  <button key={char} type="button" className="kbd-key" onClick={() => updateLetter(char)}>
                    {char}
                  </button>
                ))}
              </div>
              <div className="kbd-row">
                {['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'].map((char) => (
                  <button key={char} type="button" className="kbd-key" onClick={() => updateLetter(char)}>
                    {char}
                  </button>
                ))}
              </div>
              <div className="kbd-row">
                <button type="button" className="kbd-key kbd-fn" onClick={() => jumpToEntry(-1)} aria-label="Previous Clue">
                  <ChevronLeft size={16} />
                </button>
                {['Z', 'X', 'C', 'V', 'B', 'N', 'M'].map((char) => (
                  <button key={char} type="button" className="kbd-key" onClick={() => updateLetter(char)}>
                    {char}
                  </button>
                ))}
                <button type="button" className="kbd-key kbd-fn" onClick={clearCurrent} aria-label="Backspace">
                  <Delete size={17} />
                </button>
                <button type="button" className="kbd-key kbd-fn" onClick={() => jumpToEntry(1)} aria-label="Next Clue">
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Clues Sidebar */}
        <aside className="clues-panel">
          <div className="clue-tabs" role="tablist" aria-label="Clue direction">
            <button
              type="button"
              className={direction === 'across' ? 'active' : ''}
              onClick={() => switchDirection('across')}
              role="tab"
              aria-selected={direction === 'across'}
              data-testid="tab-across"
            >
              <ArrowRight size={16} /> Across
            </button>
            <button
              type="button"
              className={direction === 'down' ? 'active' : ''}
              onClick={() => switchDirection('down')}
              role="tab"
              aria-selected={direction === 'down'}
              data-testid="tab-down"
            >
              <ArrowDown size={16} /> Down
            </button>
          </div>
          <div className="clue-list">
            {(direction === 'across' ? acrossEntries : downEntries).map((entry) => (
              <button
                type="button"
                key={`${entry.direction}-${entry.number}`}
                className={`clue-row ${selectedEntry.number === entry.number && selectedEntry.direction === entry.direction ? 'active' : ''}`}
                onClick={() => selectEntry(entry)}
                data-testid={`clue-${entry.direction}-${entry.number}`}
              >
                <strong>{entry.number}</strong>
                <span>{entry.clue}</span>
                <ChevronRight size={17} />
              </button>
            ))}
          </div>

          <div className="entry-card">
            <span className="entry-direction">
              {selectedEntry.number} {selectedEntry.direction.toUpperCase()}
            </span>
            <div className="entry-slots">
              {selectedEntry.cells.map((cell) => (
                <span key={keyFor(cell.row, cell.col)} className={sameCell(selected, cell) ? 'active' : ''}>
                  {letters[keyFor(cell.row, cell.col)] || '·'}
                </span>
              ))}
            </div>
          </div>
        </aside>
      </section>

      {/* Control Deck */}
      <section className="control-deck">
        <button type="button" className="utility-button" onClick={checkPuzzle} data-testid="button-check">
          <Check size={16} /> Check
        </button>
        <button type="button" className="utility-button" onClick={() => resetPuzzle()} data-testid="button-reset">
          <RotateCcw size={16} /> Reset
        </button>
        <button type="button" className="utility-button hint-button" onClick={revealCurrent} data-testid="button-reveal">
          <Lightbulb size={16} /> Reveal letter
        </button>
        <div className="keyboard-hint">
          <span>⌘</span> <span>TAB</span> NEXT CLUE <span>·</span> <span>SPACE</span> TOGGLE <span>·</span> <span>DEL</span> CLEAR
        </div>
      </section>

      {/* Celebratory Completion Modal */}
      {completed && (
        <div className="completion-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="congrats-title">
          <div className="completion-modal-card" data-testid="status-complete">
            <div className="completion-icon-large">
              <span className="completion-theme-emoji">{currentPuzzle.themeIcon}</span>
            </div>

            {isNewRecord && (
              <div className="new-record-banner" data-testid="status-new-record">
                <Zap size={15} className="new-record-zap" /> NEW PERSONAL BEST!
              </div>
            )}

            <p className="eyebrow">{currentPuzzle.theme.toUpperCase()} • PUZZLE #{puzzleLabel} COMPLETED!</p>
            <h2 id="congrats-title">{currentPuzzle.title}</h2>
            <p className="completion-subtext">You conquered this theme in record time with boundless curiosity.</p>

            <div className="completion-stats-grid">
              <div className="stat-box">
                <span className="stat-label">SOLVE TIME</span>
                <span className="stat-value">{formatTime(timerSeconds)}</span>
              </div>
              <div className="stat-box">
                <span className="stat-label">PERSONAL BEST</span>
                <span className="stat-value pb-highlight">
                  ⚡ {personalBest !== null ? formatTime(personalBest) : formatTime(timerSeconds)}
                </span>
              </div>
              <div className="stat-box">
                <span className="stat-label">HINTS USED</span>
                <span className="stat-value">{hintsUsed === 0 ? '⭐ Flawless' : `${hintsUsed} used`}</span>
              </div>
              <div className="stat-box">
                <span className="stat-label">DAILY STREAK</span>
                <span className="stat-value">🔥 {streak} days</span>
              </div>
            </div>

            <div className="completion-actions">
              <button type="button" onClick={handleShare} className="share-button" data-testid="button-share">
                <Share2 size={16} /> {copiedShare ? 'Copied!' : 'Share Result'}
              </button>
              <button
                type="button"
                onClick={() => resetPuzzle(true)}
                className="again-button-primary"
                data-testid="button-play-again"
              >
                Next Theme <ChevronRight size={18} />
              </button>
            </div>

            <button
              type="button"
              className="browse-themes-link"
              onClick={() => setShowThemesModal(true)}
              data-testid="button-browse-themes"
            >
              <Compass size={14} /> Browse all themes
            </button>
          </div>
        </div>
      )}

      {/* Infinite Theme Gallery Modal */}
      {showThemesModal && (
        <div className="theme-modal-backdrop" onClick={() => setShowThemesModal(false)} role="dialog" aria-modal="true" aria-labelledby="theme-gallery-title">
          <div className="theme-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="theme-modal-header">
              <div>
                <p className="eyebrow"><Sparkles size={13} /> INFINITE CATALOG</p>
                <h2 id="theme-gallery-title">Choose a Theme</h2>
                <p className="theme-modal-subtitle">Pick any theme to play immediately. No daily limits, ever.</p>
              </div>
              <button
                type="button"
                className="icon-button close-btn"
                onClick={() => setShowThemesModal(false)}
                aria-label="Close theme picker"
                data-testid="button-close-themes"
              >
                <X size={18} />
              </button>
            </div>

            <div className="theme-modal-actions">
              <button
                type="button"
                className="random-theme-btn"
                onClick={() => {
                  const randomIdx = Math.floor(Math.random() * puzzles.length);
                  resetPuzzle(false, randomIdx);
                }}
                data-testid="button-random-theme"
              >
                <Shuffle size={16} /> Play Random Theme
              </button>
            </div>

            <div className="theme-grid">
              {puzzles.map((p, idx) => {
                const isCurrent = idx === puzzleIndex % puzzles.length;
                const saved = localStorage.getItem(`clue_co_save_${p.id}`);
                const best = localStorage.getItem(`clue_co_best_${p.id}`);
                const bestSeconds = best ? parseInt(best, 10) : null;
                let isSolved = false;
                if (saved) {
                  try {
                    isSolved = !!JSON.parse(saved).completed;
                  } catch {}
                }
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={`theme-card ${isCurrent ? 'active' : ''}`}
                    onClick={() => resetPuzzle(false, idx)}
                    data-testid={`theme-card-${p.id}`}
                  >
                    <div className="theme-card-top">
                      <span className="theme-card-icon">{p.themeIcon}</span>
                      <div className="theme-badges-group">
                        {bestSeconds !== null && (
                          <span className="pb-chip" title={`Personal Best: ${formatTime(bestSeconds)}`}>
                            ⚡ {formatTime(bestSeconds)}
                          </span>
                        )}
                        {isSolved && (
                          <span className="solved-badge" title="Completed">
                            <CheckCircle2 size={13} /> Solved
                          </span>
                        )}
                        {isCurrent && !isSolved && (
                          <span className="current-badge">Playing</span>
                        )}
                      </div>
                    </div>
                    <div className="theme-card-body">
                      <h4>{p.theme}</h4>
                      <p>{p.title}</p>
                    </div>
                    <div className="theme-card-footer">
                      <span>5×5 Mini</span>
                      <span className="play-arrow">Play →</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <footer className="footer-note">
        <span>MADE FOR THE CURIOUS</span>
        <span className="footer-rule" />
        <span>NO RUSH. JUST CLUES.</span>
      </footer>
    </main>
  );
}

function Router() {
  return <RoutedErrorBoundary><Switch><Route path="/" component={Home} /><Route component={NotFound} /></Switch></RoutedErrorBoundary>;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;