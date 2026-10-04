import { memo } from 'react';
import { Backspace } from '@phosphor-icons/react';

const ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];

type Props = {
  onLetter: (letter: string) => void;
  onBackspace: () => void;
};

/**
 * On-screen keyboard for touch devices. The native iOS/Android keyboard only opens on a direct
 * focus inside a tap and covers half the board, so phones get this instead. Hidden on
 * desktops with a real keyboard (see .cc-keys in game.css).
 */
export const Keys = memo(function Keys({ onLetter, onBackspace }: Props) {
  // pointerdown fires on touch without the click delay; preventDefault stops focus and text selection.
  const press = (action: () => void) => (e: React.PointerEvent) => {
    e.preventDefault();
    action();
  };

  return (
    <div className="cc-keys" role="group" aria-label="Keyboard">
      {ROWS.map((row, i) => (
        <div key={row} className="cc-keys-row">
          {row.split('').map((letter) => (
            <button key={letter} type="button" className="cc-key" onPointerDown={press(() => onLetter(letter))} aria-label={letter}>
              {letter}
            </button>
          ))}
          {i === ROWS.length - 1 && (
            <button type="button" className="cc-key cc-key-wide" onPointerDown={press(onBackspace)} aria-label="Delete">
              <Backspace size={22} weight="bold" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
});
