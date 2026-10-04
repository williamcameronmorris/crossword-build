import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  CaretLeft,
  CaretRight,
  Check,
  DotsThree,
  Eye,
  Keyboard,
  Lightbulb,
  ListBullets,
  Pause,
  Play,
  Question,
  ArrowCounterClockwise,
  ShareNetwork,
  SpeakerHigh,
  SpeakerSlash,
  SquaresFour,
  X,
} from '@phosphor-icons/react';
import {
  getSoundEnabled,
  playBackspace,
  playClueSwitch,
  playIncorrectBuzzer,
  playKeyClick,
  playVictoryFanfare,
  setSoundEnabled,
} from './audio';
import { fireConfetti } from './confetti';
import { type Cell, type Direction, type Entry, type Puzzle, keyFor, sameCell } from './puzzles';
import {
  clearProgress,
  currentStreak,
  loadBest,
  loadProgress,
  recordBest,
  recordSolveForStreak,
  saveProgress,
} from './storage';
import { Archive } from './Archive';

type Props = {
  puzzle: Puzzle;
  count: number;
  dailyId: number;
  onOpenPuzzle: (id: number) => void;
};

export function formatTime(totalSeconds: number) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

const puzzleLabel = (id: number) => `No. ${String(id).padStart(3, '0')}`;

/** One solve of one puzzle. Rendered with key={puzzle.id}, so all state starts fresh per puzzle. */
export function Game({ puzzle, count, dailyId, onOpenPuzzle }: Props) {
  const saved = useMemo(() => loadProgress(puzzle.id), [puzzle.id]);
  const [letters, setLetters] = useState<Record<string, string>>(() => saved?.letters ?? {});
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set(saved?.revealed ?? []));
  const [wrong, setWrong] = useState<Set<string>>(new Set());
  const [seconds, setSeconds] = useState(() => saved?.seconds ?? 0);
  const [hints, setHints] = useState(() => saved?.hints ?? 0);
  const [completed, setCompleted] = useState(() => saved?.completed ?? false);
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [selected, setSelected] = useState<Cell>(() => puzzle.cells[0]);
  const [direction, setDirection] = useState<Direction>('across');
  const [panel, setPanel] = useState<'keyboard' | 'clues'>('keyboard');
  const [menu, setMenu] = useState<'assist' | 'more' | null>(null);
  const [modal, setModal] = useState<'archive' | 'help' | 'result' | null>(() => (saved?.completed ? 'result' : null));
  const [soundOn, setSoundOn] = useState(getSoundEnabled);
  const [streak, setStreak] = useState(currentStreak);
  const [best, setBest] = useState(() => loadBest(puzzle.id));
  const [newBest, setNewBest] = useState(false);
  const [shaking, setShaking] = useState(false);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const wasFull = useRef(puzzle.cells.every((c) => !!(saved?.letters ?? {})[keyFor(c.row, c.col)]));

  const solutionAt = useCallback((cell: Cell) => puzzle.rows[cell.row][cell.col], [puzzle]);
  const isBlock = useCallback(
    (row: number, col: number) => row < 0 || col < 0 || row >= puzzle.size || col >= puzzle.size || puzzle.rows[row][col] === '#',
    [puzzle],
  );
  const entryAt = useCallback(
    (cell: Cell, dir: Direction) => (dir === 'across' ? puzzle.across : puzzle.down).find((e) => e.cells.some((c) => sameCell(c, cell))),
    [puzzle],
  );
  const activeEntry = entryAt(selected, direction) ?? entryAt(selected, direction === 'across' ? 'down' : 'across')!;
  const activeDirection = activeEntry.direction;
  const orderedEntries = useMemo(() => [...puzzle.across, ...puzzle.down], [puzzle]);
  const assisted = revealed.size > 0;
  const playing = !completed && !paused;

  const focusInput = () => {
    // Defer so the tap that triggered this doesn't immediately steal focus back.
    requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
  };

  const begin = useCallback(() => setStarted(true), []);

  // --- timer: runs only while playing and the tab is visible ---------------
  useEffect(() => {
    if (!started || !playing) return;
    const id = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [started, playing]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden && started && !completed) setPaused(true);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [started, completed]);

  // --- persistence -------------------------------------------------------
  useEffect(() => {
    if (!started && !completed && Object.keys(letters).length === 0) return;
    saveProgress(puzzle.id, { letters, revealed: [...revealed], seconds, completed, hints });
  }, [puzzle.id, letters, revealed, seconds, completed, hints, started]);

  // --- navigation -------------------------------------------------------
  const selectEntry = useCallback((entry: Entry, cell?: Cell) => {
    setDirection(entry.direction);
    const target = cell ?? entry.cells.find((c) => !letters[keyFor(c.row, c.col)]) ?? entry.cells[0];
    setSelected(target);
    playClueSwitch();
    begin();
  }, [letters, begin]);

  const jumpEntry = useCallback(
    (delta: 1 | -1) => {
      const i = orderedEntries.indexOf(activeEntry);
      const next = orderedEntries[(i + delta + orderedEntries.length) % orderedEntries.length];
      selectEntry(next);
    },
    [orderedEntries, activeEntry, selectEntry],
  );

  const toggleDirection = useCallback(() => {
    const other = activeDirection === 'across' ? 'down' : 'across';
    if (entryAt(selected, other)) {
      setDirection(other);
      playClueSwitch();
    }
    begin();
  }, [activeDirection, entryAt, selected, begin]);

  const tapCell = (cell: Cell) => {
    if (sameCell(cell, selected)) {
      toggleDirection();
    } else {
      setSelected(cell);
      if (!entryAt(cell, direction)) setDirection(direction === 'across' ? 'down' : 'across');
      playClueSwitch();
      begin();
    }
    setPanel('keyboard');
    focusInput();
  };

  const moveBy = useCallback(
    (dRow: number, dCol: number) => {
      const wanted: Direction = dRow === 0 ? 'across' : 'down';
      if (activeDirection !== wanted && entryAt(selected, wanted)) {
        setDirection(wanted);
        return;
      }
      let { row, col } = selected;
      do {
        row += dRow;
        col += dCol;
      } while (row >= 0 && col >= 0 && row < puzzle.size && col < puzzle.size && isBlock(row, col));
      if (!isBlock(row, col)) setSelected({ row, col });
    },
    [activeDirection, entryAt, selected, isBlock, puzzle.size],
  );

  // --- typing -----------------------------------------------------------
  const clearWrong = (keys: string[]) =>
    setWrong((current) => {
      if (!keys.some((k) => current.has(k))) return current;
      const next = new Set(current);
      keys.forEach((k) => next.delete(k));
      return next;
    });

  const typeLetter = useCallback(
    (raw: string) => {
      const letter = raw.toUpperCase().replace(/[^A-Z]/g, '').slice(-1);
      if (!letter || !playing) return;
      const key = keyFor(selected.row, selected.col);
      if (revealed.has(key)) {
        // Revealed letters are locked; just move on.
      } else {
        playKeyClick();
        setLetters((current) => ({ ...current, [key]: letter }));
        clearWrong([key]);
      }
      begin();

      const filled = { ...letters, [key]: revealed.has(key) ? letters[key] : letter };
      const idx = activeEntry.cells.findIndex((c) => sameCell(c, selected));
      const after = activeEntry.cells.slice(idx + 1);
      const nextEmpty = after.find((c) => !filled[keyFor(c.row, c.col)]);
      if (nextEmpty) {
        setSelected(nextEmpty);
        return;
      }
      const wordDone = activeEntry.cells.every((c) => filled[keyFor(c.row, c.col)]);
      if (!wordDone) {
        // Wrap to the first gap earlier in this word.
        setSelected(activeEntry.cells.find((c) => !filled[keyFor(c.row, c.col)])!);
        return;
      }
      // Word complete: go to the next entry that still has a gap.
      const i = orderedEntries.indexOf(activeEntry);
      for (let step = 1; step <= orderedEntries.length; step += 1) {
        const candidate = orderedEntries[(i + step) % orderedEntries.length];
        const gap = candidate.cells.find((c) => !filled[keyFor(c.row, c.col)]);
        if (gap) {
          setDirection(candidate.direction);
          setSelected(gap);
          return;
        }
      }
      if (after.length) setSelected(after[0]);
    },
    [playing, selected, revealed, letters, activeEntry, orderedEntries, begin],
  );

  const backspace = useCallback(() => {
    if (!playing) return;
    playBackspace();
    const key = keyFor(selected.row, selected.col);
    if (letters[key] && !revealed.has(key)) {
      setLetters(({ [key]: _, ...rest }) => rest);
      clearWrong([key]);
      return;
    }
    const idx = activeEntry.cells.findIndex((c) => sameCell(c, selected));
    if (idx > 0) {
      const prev = activeEntry.cells[idx - 1];
      const prevKey = keyFor(prev.row, prev.col);
      setSelected(prev);
      if (!revealed.has(prevKey)) {
        setLetters(({ [prevKey]: _, ...rest }) => rest);
        clearWrong([prevKey]);
      }
    }
  }, [playing, selected, letters, revealed, activeEntry]);

  // Physical keyboards. The hidden input below covers mobile soft keyboards.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (modal || e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^[a-z]$/i.test(e.key)) {
        e.preventDefault();
        typeLetter(e.key);
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        backspace();
      } else if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault();
        jumpEntry(e.shiftKey ? -1 : 1);
      } else if (e.key === ' ') {
        e.preventDefault();
        toggleDirection();
      } else if (e.key.startsWith('Arrow')) {
        e.preventDefault();
        const [dr, dc] = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[e.key] ?? [0, 0];
        moveBy(dr, dc);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [modal, typeLetter, backspace, jumpEntry, toggleDirection, moveBy]);

  const onNativeInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value.length === 0) backspace();
    else typeLetter(value.replace(/[^a-zA-Z]/g, '').slice(-1));
  };

  // --- completion ---------------------------------------------------------
  useEffect(() => {
    if (completed) return;
    const full = puzzle.cells.every((c) => !!letters[keyFor(c.row, c.col)]);
    const justFilled = full && !wasFull.current;
    wasFull.current = full;
    if (!full) return;
    const solved = puzzle.cells.every((c) => letters[keyFor(c.row, c.col)] === solutionAt(c));
    if (solved) {
      setCompleted(true);
      setMenu(null);
      playVictoryFanfare();
      fireConfetti();
      if (!assisted) {
        setStreak(recordSolveForStreak());
        const beat = recordBest(puzzle.id, seconds);
        setNewBest(beat);
        setBest(loadBest(puzzle.id));
      }
      window.setTimeout(() => setModal('result'), 650);
    } else if (justFilled) {
      playIncorrectBuzzer();
      setShaking(true);
      window.setTimeout(() => setShaking(false), 500);
    }
  }, [letters, completed, puzzle, solutionAt, assisted, seconds]);

  // --- check & reveal -----------------------------------------------------
  const check = (cells: Cell[]) => {
    setHints((h) => h + 1);
    const bad = cells.map((c) => keyFor(c.row, c.col)).filter((k, i) => letters[k] && letters[k] !== solutionAt(cells[i]));
    setWrong((current) => {
      const next = new Set(current);
      cells.forEach((c) => next.delete(keyFor(c.row, c.col)));
      bad.forEach((k) => next.add(k));
      return next;
    });
    setMenu(null);
    focusInput();
  };

  const reveal = (cells: Cell[]) => {
    setHints((h) => h + 1);
    setLetters((current) => {
      const next = { ...current };
      cells.forEach((c) => (next[keyFor(c.row, c.col)] = solutionAt(c)));
      return next;
    });
    setRevealed((current) => {
      const next = new Set(current);
      cells.forEach((c) => {
        const k = keyFor(c.row, c.col);
        if (letters[k] !== solutionAt(c)) next.add(k);
      });
      return next;
    });
    clearWrong(cells.map((c) => keyFor(c.row, c.col)));
    setMenu(null);
    begin();
    focusInput();
  };

  const restart = () => {
    clearProgress(puzzle.id);
    setLetters({});
    setRevealed(new Set());
    setWrong(new Set());
    setSeconds(0);
    setHints(0);
    setCompleted(false);
    setStarted(false);
    setPaused(false);
    setNewBest(false);
    setModal(null);
    setMenu(null);
    setSelected(puzzle.cells[0]);
    setDirection('across');
    wasFull.current = false;
    focusInput();
  };

  // --- misc UI ------------------------------------------------------------
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [menu]);

  // Keep the board pinned while iOS shows its keyboard.
  useEffect(() => {
    const sync = () => {
      const h = window.visualViewport?.height ?? window.innerHeight;
      document.documentElement.style.setProperty('--vv-height', `${h}px`);
      if (window.scrollY !== 0) window.scrollTo(0, 0);
    };
    sync();
    window.visualViewport?.addEventListener('resize', sync);
    window.addEventListener('resize', sync);
    return () => {
      window.visualViewport?.removeEventListener('resize', sync);
      window.removeEventListener('resize', sync);
    };
  }, []);

  useEffect(() => {
    if (!modal && playing && panel === 'keyboard') focusInput();
  }, [modal, playing, panel]);

  const share = async () => {
    const url = `${window.location.origin}${window.location.pathname}?p=${puzzle.id}`;
    const text = `Clue & Co. ${puzzleLabel(puzzle.id)} solved in ${formatTime(seconds)}${hints === 0 ? ', no hints' : ''}.`;
    try {
      if (navigator.share) {
        await navigator.share({ text, url });
        return;
      }
      await navigator.clipboard.writeText(`${text}\n${url}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      /* share sheet dismissed */
    }
  };

  const toggleSound = () => {
    setSoundOn((on) => {
      setSoundEnabled(!on);
      return !on;
    });
    setMenu(null);
  };

  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const isDaily = puzzle.id === dailyId;
  const highlighted = new Set(activeEntry.cells.map((c) => keyFor(c.row, c.col)));

  return (
    <main className="cc-shell">
      <input
        ref={inputRef}
        className="cc-input-trap"
        type="text"
        inputMode="text"
        autoCapitalize="characters"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="next"
        aria-label="Type a letter"
        value=" "
        onChange={onNativeInput}
      />

      <header className="cc-masthead">
        <button type="button" className="cc-wordmark" onClick={() => setModal('archive')} aria-label="Open the puzzle archive">
          Clue <em>&amp;</em> Co.
        </button>
        <nav className="cc-actions">
          <button
            type="button"
            className={`cc-icon-btn ${panel === 'clues' ? 'is-on' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              setPanel((p) => (p === 'clues' ? 'keyboard' : 'clues'));
            }}
            aria-label={panel === 'clues' ? 'Show keyboard' : 'Show all clues'}
          >
            {panel === 'clues' ? <Keyboard size={20} weight="bold" /> : <ListBullets size={20} weight="bold" />}
          </button>
          <div className="cc-menu-anchor">
            <button
              type="button"
              className={`cc-icon-btn ${menu === 'assist' ? 'is-on' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                setMenu((m) => (m === 'assist' ? null : 'assist'));
              }}
              aria-label="Check and reveal"
              aria-expanded={menu === 'assist'}
              disabled={completed}
            >
              <Lightbulb size={20} weight="bold" />
            </button>
            {menu === 'assist' && (
              <div className="cc-menu" role="menu" onClick={(e) => e.stopPropagation()}>
                <p className="cc-menu-label">Check</p>
                <button type="button" role="menuitem" onClick={() => check([selected])}>
                  <Check size={16} weight="bold" /> Square
                </button>
                <button type="button" role="menuitem" onClick={() => check(activeEntry.cells)}>
                  <Check size={16} weight="bold" /> Word
                </button>
                <button type="button" role="menuitem" onClick={() => check(puzzle.cells)}>
                  <Check size={16} weight="bold" /> Puzzle
                </button>
                <p className="cc-menu-label">Reveal</p>
                <button type="button" role="menuitem" onClick={() => reveal([selected])}>
                  <Eye size={16} weight="bold" /> Square
                </button>
                <button type="button" role="menuitem" onClick={() => reveal(activeEntry.cells)}>
                  <Eye size={16} weight="bold" /> Word
                </button>
                <button type="button" role="menuitem" onClick={() => reveal(puzzle.cells)}>
                  <Eye size={16} weight="bold" /> Puzzle
                </button>
                <p className="cc-menu-note">Reveals don't count toward your streak or best time.</p>
              </div>
            )}
          </div>
          <div className="cc-menu-anchor">
            <button
              type="button"
              className={`cc-icon-btn ${menu === 'more' ? 'is-on' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                setMenu((m) => (m === 'more' ? null : 'more'));
              }}
              aria-label="More options"
              aria-expanded={menu === 'more'}
            >
              <DotsThree size={22} weight="bold" />
            </button>
            {menu === 'more' && (
              <div className="cc-menu" role="menu" onClick={(e) => e.stopPropagation()}>
                <button type="button" role="menuitem" onClick={() => { setModal('archive'); setMenu(null); }}>
                  <SquaresFour size={16} weight="bold" /> Archive
                </button>
                <button type="button" role="menuitem" onClick={restart}>
                  <ArrowCounterClockwise size={16} weight="bold" /> Restart puzzle
                </button>
                <button type="button" role="menuitem" onClick={toggleSound}>
                  {soundOn ? <SpeakerHigh size={16} weight="bold" /> : <SpeakerSlash size={16} weight="bold" />}
                  Sound {soundOn ? 'on' : 'off'}
                </button>
                <button type="button" role="menuitem" onClick={() => { setModal('help'); setMenu(null); }}>
                  <Question size={16} weight="bold" /> How to play
                </button>
              </div>
            )}
          </div>
        </nav>
      </header>

      <div className="cc-dateline">
        <span className="cc-dateline-id">{puzzleLabel(puzzle.id)}</span>
        <span className="cc-dateline-date">{isDaily ? today : 'From the archive'}</span>
        <button
          type="button"
          className={`cc-timer ${paused ? 'is-paused' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            if (!completed) setPaused((p) => !p);
          }}
          aria-label={paused ? 'Resume' : `Pause. Time ${formatTime(seconds)}`}
        >
          {paused ? <Play size={12} weight="fill" /> : <Pause size={12} weight="fill" />}
          <span>{formatTime(seconds)}</span>
        </button>
      </div>

      <section className="cc-board-wrap">
        <div
          className={`cc-board ${shaking ? 'is-shaking' : ''} ${paused ? 'is-hidden' : ''} ${completed ? 'is-solved' : ''}`}
          role="grid"
          aria-label={`Crossword ${puzzleLabel(puzzle.id)}`}
          style={{ gridTemplateColumns: `repeat(${puzzle.size}, 1fr)` }}
        >
          {puzzle.rows.flatMap((rowText, row) =>
            rowText.split('').map((ch, col) => {
              const key = keyFor(row, col);
              if (ch === '#') return <div key={key} className="cc-cell is-block" aria-hidden="true" />;
              const cell = { row, col };
              const isSel = sameCell(cell, selected);
              const classes = [
                'cc-cell',
                isSel && 'is-selected',
                !isSel && highlighted.has(key) && 'in-word',
                wrong.has(key) && 'is-wrong',
                revealed.has(key) && 'is-revealed',
              ]
                .filter(Boolean)
                .join(' ');
              return (
                <button
                  key={key}
                  type="button"
                  role="gridcell"
                  className={classes}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => tapCell(cell)}
                  aria-label={`Row ${row + 1}, column ${col + 1}${letters[key] ? `, ${letters[key]}` : ', empty'}`}
                >
                  {puzzle.cellNumbers[key] && <span className="cc-cell-num">{puzzle.cellNumbers[key]}</span>}
                  <span className="cc-cell-letter">{letters[key] ?? ''}</span>
                </button>
              );
            }),
          )}
        </div>
        {paused && (
          <button type="button" className="cc-paused" onClick={() => setPaused(false)}>
            <span className="cc-paused-title">Paused</span>
            <span className="cc-paused-sub">Tap to keep solving</span>
          </button>
        )}
      </section>

      <div className="cc-cluebar">
        <button type="button" className="cc-step" onMouseDown={(e) => e.preventDefault()} onClick={() => jumpEntry(-1)} aria-label="Previous clue">
          <CaretLeft size={18} weight="bold" />
        </button>
        <button
          type="button"
          className="cc-cluebar-body"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            toggleDirection();
            focusInput();
          }}
          aria-label={`${activeEntry.number} ${activeEntry.direction}: ${activeEntry.clue}. Tap to switch direction.`}
        >
          <span className="cc-cluebar-label">
            {activeEntry.number} {activeEntry.direction}
          </span>
          <span className="cc-cluebar-text">{activeEntry.clue}</span>
        </button>
        <button type="button" className="cc-step" onMouseDown={(e) => e.preventDefault()} onClick={() => jumpEntry(1)} aria-label="Next clue">
          <CaretRight size={18} weight="bold" />
        </button>
      </div>

      {/* Always rendered: a sidebar on wide screens, a toggled panel on phones. */}
      <section className={`cc-cluelist ${panel === 'clues' ? 'is-open' : ''}`} aria-label="All clues">
          {(['across', 'down'] as const).map((dir) => (
            <div key={dir} className="cc-cluelist-col">
              <h2>{dir}</h2>
              <ol>
                {(dir === 'across' ? puzzle.across : puzzle.down).map((entry) => {
                  const done = entry.cells.every((c) => letters[keyFor(c.row, c.col)]);
                  const active = entry === activeEntry;
                  return (
                    <li key={entry.number}>
                      <button
                        type="button"
                        className={`${active ? 'is-active' : ''} ${done ? 'is-done' : ''}`}
                        onClick={() => {
                          selectEntry(entry);
                          setPanel('keyboard');
                          focusInput();
                        }}
                      >
                        <span className="cc-cluelist-num">{entry.number}</span>
                        <span>{entry.clue}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </section>

      {modal === 'result' && (
        <div className="cc-scrim" role="dialog" aria-modal="true" aria-labelledby="cc-result-title" onClick={() => setModal(null)}>
          <div className="cc-sheet" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="cc-sheet-close" onClick={() => setModal(null)} aria-label="Close">
              <X size={18} weight="bold" />
            </button>
            <p className="cc-eyebrow">{puzzleLabel(puzzle.id)}</p>
            <h2 id="cc-result-title" className="cc-sheet-title">
              {assisted ? 'Finished.' : newBest ? 'New best.' : 'Solved.'}
            </h2>
            <p className="cc-sheet-sub">
              {assisted
                ? 'Revealed squares keep this one off your record. Try a fresh one.'
                : hints === 0
                  ? 'Clean solve. No checks, no reveals.'
                  : `Solved with ${hints} ${hints === 1 ? 'check' : 'checks'}.`}
            </p>
            <dl className="cc-stats">
              <div>
                <dt>Time</dt>
                <dd>{formatTime(seconds)}</dd>
              </div>
              <div>
                <dt>Best</dt>
                <dd>{best !== null ? formatTime(best) : '--'}</dd>
              </div>
              <div>
                <dt>Streak</dt>
                <dd>
                  {streak} {streak === 1 ? 'day' : 'days'}
                </dd>
              </div>
            </dl>
            <div className="cc-sheet-actions">
              <button type="button" className="cc-btn cc-btn-quiet" onClick={share}>
                <ShareNetwork size={16} weight="bold" /> {copied ? 'Copied' : 'Share'}
              </button>
              <button type="button" className="cc-btn" onClick={() => onOpenPuzzle(puzzle.id >= count ? 1 : puzzle.id + 1)}>
                Next puzzle <ArrowRight size={16} weight="bold" />
              </button>
            </div>
            <button type="button" className="cc-link" onClick={() => setModal('archive')}>
              Browse the archive
            </button>
          </div>
        </div>
      )}

      {modal === 'archive' && (
        <Archive
          count={count}
          currentId={puzzle.id}
          dailyId={dailyId}
          onClose={() => setModal(null)}
          onPick={(id) => {
            setModal(null);
            if (id !== puzzle.id) onOpenPuzzle(id);
          }}
        />
      )}

      {modal === 'help' && (
        <div className="cc-scrim" role="dialog" aria-modal="true" aria-labelledby="cc-help-title" onClick={() => setModal(null)}>
          <div className="cc-sheet" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="cc-sheet-close" onClick={() => setModal(null)} aria-label="Close">
              <X size={18} weight="bold" />
            </button>
            <h2 id="cc-help-title" className="cc-sheet-title">How to play</h2>
            <dl className="cc-help">
              <div>
                <dt>Fill the grid</dt>
                <dd>Tap a square and type. Tap it again, or tap the clue bar, to switch between across and down.</dd>
              </div>
              <div>
                <dt>Move around</dt>
                <dd>
                  The arrows beside the clue jump between words. On a keyboard, use <kbd>Tab</kbd>, <kbd>Enter</kbd>, the arrow keys and <kbd>Space</kbd>.
                </dd>
              </div>
              <div>
                <dt>Stuck?</dt>
                <dd>The light bulb checks or reveals a square, word or puzzle. Reveals keep a solve off your streak and best time.</dd>
              </div>
              <div>
                <dt>One a day</dt>
                <dd>A new puzzle every day, and {count} in the archive. Solve at least one a day to build your streak.</dd>
              </div>
            </dl>
            <button type="button" className="cc-btn cc-btn-wide" onClick={() => setModal(null)}>
              Start solving
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
