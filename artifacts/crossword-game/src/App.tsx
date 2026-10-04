import { useCallback, useEffect, useState } from 'react';
import { Game } from './Game';
import { HapticTest } from './HapticTest';
import { type Puzzle, dailyPuzzleId, loadBankIndex, loadPuzzle, prefetchPuzzle } from './puzzles';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; puzzle: Puzzle; count: number; dailyId: number };

/** ?p=42 opens puzzle 42 (shared links); no param opens today's puzzle. */
function requestedId(): number | null {
  const raw = new URLSearchParams(window.location.search).get('p');
  const id = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(id) && id > 0 ? id : null;
}

export default function App() {
  const [state, setState] = useState<State>({ status: 'loading' });

  const open = useCallback(async (id: number | null) => {
    try {
      const { count } = await loadBankIndex();
      const dailyId = dailyPuzzleId(count);
      const target = id && id <= count ? id : dailyId;
      const puzzle = await loadPuzzle(target);
      setState({ status: 'ready', puzzle, count, dailyId });
      prefetchPuzzle(target + 1);
    } catch (error) {
      setState({ status: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  }, []);

  useEffect(() => {
    void open(requestedId());
    const onPop = () => void open(requestedId());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [open]);

  const navigate = useCallback(
    (id: number) => {
      const url = new URL(window.location.href);
      url.searchParams.set('p', String(id));
      window.history.pushState(null, '', url);
      void open(id);
    },
    [open],
  );

  if (new URLSearchParams(window.location.search).has('haptics-test')) return <HapticTest />;

  if (state.status === 'loading') {
    return (
      <main className="cc-shell cc-center" aria-busy="true">
        <p className="cc-wordmark-static">
          Clue <em>&amp;</em> Co.
        </p>
      </main>
    );
  }

  if (state.status === 'error') {
    return (
      <main className="cc-shell cc-center">
        <p className="cc-wordmark-static">
          Clue <em>&amp;</em> Co.
        </p>
        <p className="cc-sheet-sub">The puzzle didn't load. Check your connection.</p>
        <button type="button" className="cc-btn" onClick={() => void open(requestedId())}>
          Try again
        </button>
      </main>
    );
  }

  return <Game key={state.puzzle.id} puzzle={state.puzzle} count={state.count} dailyId={state.dailyId} onOpenPuzzle={navigate} />;
}
