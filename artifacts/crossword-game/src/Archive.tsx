import { useMemo, useState } from 'react';
import { CheckCircle, X } from '@phosphor-icons/react';
import { pickNextPuzzle, scanArchive } from './storage';

type Props = {
  count: number;
  currentId: number;
  dailyId: number;
  onClose: () => void;
  onPick: (id: number) => void;
};

const PAGE = 60;

export function Archive({ count, currentId, dailyId, onClose, onPick }: Props) {
  const { solved, started } = useMemo(scanArchive, []);
  const [filter, setFilter] = useState<'all' | 'unsolved'>('all');
  const [shown, setShown] = useState(PAGE);

  const ids = useMemo(() => {
    const all = Array.from({ length: count }, (_, i) => i + 1);
    return filter === 'all' ? all : all.filter((id) => !solved.has(id));
  }, [count, filter, solved]);

  const pickRandom = () => {
    const id = pickNextPuzzle(count, currentId, -1);
    if (id !== null) onPick(id);
  };

  return (
    <div className="cc-scrim" role="dialog" aria-modal="true" aria-labelledby="cc-archive-title" onClick={onClose}>
      <div className="cc-sheet cc-archive" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="cc-sheet-close" onClick={onClose} aria-label="Close">
          <X size={18} weight="bold" />
        </button>
        <h2 id="cc-archive-title" className="cc-sheet-title">The archive</h2>
        <p className="cc-sheet-sub">
          {solved.size} of {count} solved
        </p>

        <div className="cc-archive-bar">
          <div className="cc-tabs" role="tablist">
            {(['all', 'unsolved'] as const).map((f) => (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={filter === f}
                className={filter === f ? 'is-active' : ''}
                onClick={() => {
                  setFilter(f);
                  setShown(PAGE);
                }}
              >
                {f === 'all' ? 'All' : 'Unsolved'}
              </button>
            ))}
          </div>
          <div className="cc-archive-quick">
            <button type="button" className="cc-link" onClick={() => onPick(dailyId)}>
              Today
            </button>
            <button type="button" className="cc-link" onClick={pickRandom}>
              Surprise me
            </button>
          </div>
        </div>

        <ol className="cc-archive-grid">
          {ids.slice(0, shown).map((id) => (
            <li key={id}>
              <button
                type="button"
                className={[
                  id === currentId && 'is-current',
                  solved.has(id) && 'is-solved',
                  started.has(id) && 'is-started',
                  id === dailyId && 'is-daily',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => onPick(id)}
                aria-label={`Puzzle ${id}${solved.has(id) ? ', solved' : started.has(id) ? ', in progress' : ''}${id === dailyId ? ", today's puzzle" : ''}`}
              >
                {solved.has(id) ? <CheckCircle size={16} weight="fill" /> : id}
              </button>
            </li>
          ))}
        </ol>
        {shown < ids.length && (
          <button type="button" className="cc-btn cc-btn-quiet cc-btn-wide" onClick={() => setShown((s) => s + PAGE * 2)}>
            Show more
          </button>
        )}
      </div>
    </div>
  );
}
