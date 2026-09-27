import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowRight, Check, ChevronRight, HelpCircle, Lightbulb, RotateCcw, Sparkles, Trophy, X } from 'lucide-react';
import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

type Direction = 'across' | 'down';
type Cell = { row: number; col: number };
type Entry = { number: number; direction: Direction; answer: string; clue: string; cells: Cell[] };
type Puzzle = { id: number; rows: string[]; across: Entry[]; down: Entry[]; cellNumbers: Record<string, number> };

const queryClient = new QueryClient();
const keyFor = (row: number, col: number) => `${row}-${col}`;
const sameCell = (a: Cell | null, b: Cell) => !!a && a.row === b.row && a.col === b.col;

function createGridPuzzle(id: number, rawRows: string[], acrossClues: string[], downClues: string[]): Puzzle {
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
  return { id, rows, across, down, cellNumbers };
}

const referencePuzzle = createGridPuzzle(
  14,
  ['IS#DO', 'THEIR', '#AVE#', 'OMEGA', 'HE#ON'],
  ['Exists, briefly', 'Perform', 'Belonging to them', 'Greeting, in Latin', 'Last Greek letter', 'Male pronoun', 'Operating'],
  ['Pronoun for a thing', 'Embarrassment', 'San Diego, for one', 'Choice connector', 'Day before today', 'Exclamation', 'Indefinite article'],
);

const puzzles: Puzzle[] = [
  referencePuzzle,
  createGridPuzzle(
    15,
    ['IT#OH', 'SHAME', '#EVE#', 'DIEGO', 'OR#AN'],
    ['Pronoun for a thing', 'Exclamation', 'Embarrassment', 'Day before today', 'San Diego, for one', 'Choice connector', 'Indefinite article'],
    ['Exists, briefly', 'Belonging to them', 'Greeting, in Latin', 'Last Greek letter', 'Male pronoun', 'Perform', 'Operating'],
  ),
  createGridPuzzle(
    16,
    ['OH#DO', 'NEVER', '#LIL#', 'ALPHA', 'TO#IN'],
    ['Exclamation', 'Perform', 'At no time', 'Little, informally', 'First Greek letter', 'Toward', 'Fashionable'],
    ['Operating', 'Greeting', 'Indian capital', 'Choice connector', 'Important person, briefly', 'Location preposition', 'Indefinite article'],
  ),
  createGridPuzzle(
    17,
    ['ON#AT', 'HELLO', '#VIP#', 'DELHI', 'OR#AN'],
    ['Operating', 'Location preposition', 'Greeting', 'Important person, briefly', 'Indian capital', 'Choice connector', 'Indefinite article'],
    ['Exclamation', 'At no time', 'First Greek letter', 'Toward', 'Little, informally', 'Perform', 'Fashionable'],
  ),
];

function Home() {
  const captureRef = useRef<HTMLInputElement>(null);
  const [puzzleIndex, setPuzzleIndex] = useState(0);
  const [letters, setLetters] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Cell>({ row: 0, col: 0 });
  const [direction, setDirection] = useState<Direction>('across');
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [completed, setCompleted] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

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
  const puzzleLabel = String(14 + puzzleIndex).padStart(3, '0');

  const selectedEntry = useMemo(() => {
    const entry = allEntries.find((item) => item.direction === direction && item.cells.some((cell) => sameCell(selected, cell)));
    return entry ?? acrossEntries[0];
  }, [direction, selected]);

  const cellEntry = (cell: Cell, wantedDirection = direction) => allEntries.find((entry) => entry.direction === wantedDirection && entry.cells.some((entryCell) => sameCell(entryCell, cell)));
  const focusCapture = () => captureRef.current?.focus();

  const switchDirection = (nextDirection: Direction) => {
    const nextEntries = nextDirection === 'across' ? acrossEntries : downEntries;
    const matchingEntry = nextEntries.find((entry) => entry.cells.some((entryCell) => sameCell(selected, entryCell)));
    setDirection(nextDirection);
    setSelected(matchingEntry ? selected : nextEntries[0].cells[0]);
    focusCapture();
  };

  const selectCell = (cell: Cell) => {
    if (isBlock(cell.row, cell.col)) return;
    if (sameCell(selected, cell)) {
      const otherDirection = direction === 'across' ? 'down' : 'across';
      if (cellEntry(cell, otherDirection)) setDirection(otherDirection);
    } else {
      setSelected(cell);
      if (!cellEntry(cell, direction)) {
        const otherDirection = direction === 'across' ? 'down' : 'across';
        setDirection(cellEntry(cell, otherDirection) ? otherDirection : 'across');
      }
    }
    focusCapture();
  };

  const selectEntry = (entry: Entry) => {
    setDirection(entry.direction);
    setSelected(entry.cells[0]);
    focusCapture();
  };

  const moveBy = (cell: Cell, deltaRow: number, deltaCol: number) => {
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
  };

  const moveWithinEntry = (offset: number) => {
    const index = selectedEntry.cells.findIndex((cell) => sameCell(selected, cell));
    const next = selectedEntry.cells[index + offset];
    if (next) setSelected(next);
  };

  const updateLetter = (value: string) => {
    const letter = value.toUpperCase().replace(/[^A-Z]/g, '').slice(-1);
    if (!letter || isBlock(selected.row, selected.col)) return;
    const cellKey = keyFor(selected.row, selected.col);
    setLetters((current) => ({ ...current, [cellKey]: letter }));
    setChecked((current) => { const next = new Set(current); next.delete(cellKey); return next; });
    moveWithinEntry(1);
  };

  const clearCurrent = () => {
    const cellKey = keyFor(selected.row, selected.col);
    if (letters[cellKey]) {
      setLetters((current) => { const next = { ...current }; delete next[cellKey]; return next; });
    } else moveWithinEntry(-1);
    setChecked((current) => { const next = new Set(current); next.delete(cellKey); return next; });
  };

  const checkPuzzle = () => {
    const incorrect = new Set<string>();
    allPlayableCells.forEach((cell) => {
      const key = keyFor(cell.row, cell.col);
      if (letters[key] && letters[key] !== solution[cell.row][cell.col]) incorrect.add(key);
    });
    setChecked(incorrect);
  };

  const revealCurrent = () => {
    const cellKey = keyFor(selected.row, selected.col);
    const correct = solution[selected.row][selected.col];
    setLetters((current) => ({ ...current, [cellKey]: correct }));
    setRevealed((current) => new Set(current).add(cellKey));
    setChecked((current) => { const next = new Set(current); next.delete(cellKey); return next; });
    moveWithinEntry(1);
  };

  const resetPuzzle = (nextPuzzle = false) => {
    if (nextPuzzle) setPuzzleIndex((current) => current + 1);
    setLetters({});
    setChecked(new Set());
    setRevealed(new Set());
    setCompleted(false);
    setSelected({ row: 0, col: 0 });
    setDirection('across');
    focusCapture();
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.length === 1 && /^[a-z]$/i.test(event.key)) {
        event.preventDefault();
        updateLetter(event.key);
      } else if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault();
        clearCurrent();
      } else if (event.key === 'ArrowLeft') { event.preventDefault(); moveBy(selected, 0, -1); setDirection('across'); }
      else if (event.key === 'ArrowRight') { event.preventDefault(); moveBy(selected, 0, 1); setDirection('across'); }
      else if (event.key === 'ArrowUp') { event.preventDefault(); moveBy(selected, -1, 0); setDirection('down'); }
      else if (event.key === 'ArrowDown') { event.preventDefault(); moveBy(selected, 1, 0); setDirection('down'); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  useEffect(() => {
    const solved = allPlayableCells.every((cell) => letters[keyFor(cell.row, cell.col)] === solution[cell.row][cell.col]);
    if (solved && Object.keys(letters).length >= allPlayableCells.length) setCompleted(true);
  }, [letters, allPlayableCells, solution]);

  return (
    <main className="game-shell" onPointerDown={focusCapture}>
      <input ref={captureRef} className="key-capture" aria-label="Type your crossword answer" data-testid="input-answer" autoFocus inputMode="text" />
      <div className="topbar">
        <div className="brand-lockup" data-testid="text-brand">
          <span className="brand-mark" aria-hidden="true"><span /><span /><span /><span /></span>
          <span>CLUE <i>&</i> CO</span>
        </div>
        <div className="top-actions">
           <span className="date-chip"><span className="live-dot" /> DAILY {puzzleLabel}</span>
          <button type="button" className="icon-button" onClick={() => setShowHelp((value) => !value)} aria-label="How to play" data-testid="button-help"><HelpCircle size={21} strokeWidth={2.1} /></button>
        </div>
      </div>

      <section className="intro-row">
        <div>
          <p className="eyebrow"><Sparkles size={13} /> THE LITTLE DAILY</p>
          <h1>Good morning,<br /><em>word person.</em></h1>
          <p className="subtitle">A tiny puzzle to warm up your brain.</p>
        </div>
        <div className="progress-stamp" aria-label={`${Object.keys(letters).length} of ${allPlayableCells.length} cells filled`} data-testid="status-progress">
          <span>{String(Object.keys(letters).length).padStart(2, '0')}</span>
          <small>/ {allPlayableCells.length}</small>
        </div>
      </section>

      {showHelp && <div className="help-popover" role="status"><strong>How to play</strong><span>Tap a square to choose a word. Tap again to switch direction. Type, or use the arrows to wander.</span><button type="button" onClick={() => setShowHelp(false)} aria-label="Close help"><X size={16} /></button></div>}

      <section className="play-area">
        <div className="board-wrap">
           <div className="board-label"><span>PUZZLE {puzzleLabel}</span><span>5 × 5</span></div>
          <div className="crossword-board" role="grid" aria-label="5 by 5 crossword puzzle" data-testid="crossword-board">
            {solution.map((row, rowIndex) => row.map((value, colIndex) => {
              const cell = { row: rowIndex, col: colIndex };
              const key = keyFor(rowIndex, colIndex);
              if (value === '#') return <div key={key} className="block-cell" aria-hidden="true" />;
              const isSelected = sameCell(selected, cell);
              const inWord = selectedEntry.cells.some((entryCell) => sameCell(entryCell, cell));
              return <button key={key} type="button" role="gridcell" className={`board-cell ${isSelected ? 'is-selected' : ''} ${inWord ? 'in-word' : ''} ${checked.has(key) ? 'is-wrong' : ''} ${revealed.has(key) ? 'is-revealed' : ''}`} onClick={() => selectCell(cell)} aria-label={`Row ${rowIndex + 1}, column ${colIndex + 1}${letters[key] ? `, ${letters[key]}` : ''}`} data-testid={`cell-${rowIndex}-${colIndex}`}>
                 {currentPuzzle.cellNumbers[key] && <span className="cell-number">{currentPuzzle.cellNumbers[key]}</span>}
                <span className="cell-letter">{letters[key] ?? ''}</span>
              </button>;
            }))}
          </div>
          <div className="board-footnote"><span><span className="key-dot" /> Tap twice to switch direction</span><span>Type to fill</span></div>
        </div>

        <aside className="clues-panel">
          <div className="clue-tabs" role="tablist" aria-label="Clue direction">
             <button type="button" className={direction === 'across' ? 'active' : ''} onClick={() => switchDirection('across')} role="tab" aria-selected={direction === 'across'} data-testid="tab-across"><ArrowRight size={16} /> Across</button>
             <button type="button" className={direction === 'down' ? 'active' : ''} onClick={() => switchDirection('down')} role="tab" aria-selected={direction === 'down'} data-testid="tab-down"><ArrowDown size={16} /> Down</button>
          </div>
          <div className="clue-list">
            {(direction === 'across' ? acrossEntries : downEntries).map((entry) => <button type="button" key={`${entry.direction}-${entry.number}`} className={`clue-row ${selectedEntry.number === entry.number && selectedEntry.direction === entry.direction ? 'active' : ''}`} onClick={() => selectEntry(entry)} data-testid={`clue-${entry.direction}-${entry.number}`}>
              <strong>{entry.number}</strong><span>{entry.clue}</span><ChevronRight size={17} />
            </button>)}
          </div>
          <div className="entry-card">
            <span className="entry-direction">{selectedEntry.number} {selectedEntry.direction.toUpperCase()}</span>
            <div className="entry-slots">{selectedEntry.cells.map((cell) => <span key={keyFor(cell.row, cell.col)} className={sameCell(selected, cell) ? 'active' : ''}>{letters[keyFor(cell.row, cell.col)] || '·'}</span>)}</div>
          </div>
        </aside>
      </section>

      <section className="control-deck">
        <button type="button" className="utility-button" onClick={checkPuzzle} data-testid="button-check"><Check size={17} /> Check</button>
        <button type="button" className="utility-button" onClick={() => resetPuzzle()} data-testid="button-reset"><RotateCcw size={17} /> Reset</button>
        <button type="button" className="utility-button hint-button" onClick={revealCurrent} data-testid="button-reveal"><Lightbulb size={17} /> Reveal one</button>
        <div className="keyboard-hint"><span>⌘</span> <span>ARROWS</span> TO MOVE <span>·</span> <span>DEL</span> TO CLEAR</div>
      </section>

      {completed && <div className="completion-card" role="status" data-testid="status-complete">
        <div className="completion-icon"><Trophy size={27} /></div>
        <div><p className="eyebrow">PUZZLE COMPLETE</p><h2>That little click.</h2><p>Nicely done. Come back tomorrow for another five-minute win.</p></div>
         <button type="button" onClick={() => resetPuzzle(true)} className="again-button" data-testid="button-play-again">Next puzzle <ChevronRight size={18} /></button>
      </div>}

      <footer className="footer-note"><span>MADE FOR THE CURIOUS</span><span className="footer-rule" /><span>NO RUSH. JUST CLUES.</span></footer>
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