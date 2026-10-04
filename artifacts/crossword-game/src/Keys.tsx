import { memo, type ReactNode } from 'react';
import { Backspace } from '@phosphor-icons/react';
import { vibrateTick } from './haptics';

const ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];

type Props = {
  onLetter: (letter: string) => void;
  onBackspace: () => void;
  haptics: boolean;
};

/**
 * On-screen keyboard for touch devices. The native iOS/Android keyboard only opens on a direct
 * focus inside a tap and covers half the board, so phones get this instead. Hidden on
 * desktops with a real keyboard (see .cc-keys in game.css).
 */
export const Keys = memo(function Keys({ onLetter, onBackspace, haptics }: Props) {
  const key = (label: string, action: () => void, content: ReactNode, wide = false) => (
    <label
      key={label}
      className={`cc-key ${wide ? 'cc-key-wide' : ''}`}
      role="button"
      aria-label={label}
      // Input happens on pointerdown so fast typing never waits for the tap to finish.
      onPointerDown={action}
    >
      {content}
      {/* Invisible switch covering the key: on iOS, a finger toggling a switch plays the system haptic. */}
      {haptics && (
        <input type="checkbox" {...{ switch: '' }} className="cc-key-haptic" tabIndex={-1} aria-hidden="true" onChange={vibrateTick} />
      )}
    </label>
  );

  return (
    <div className="cc-keys" role="group" aria-label="Keyboard">
      {ROWS.map((row, i) => (
        <div key={row} className="cc-keys-row">
          {row.split('').map((letter) => key(letter, () => onLetter(letter), letter))}
          {i === ROWS.length - 1 && key('Delete', onBackspace, <Backspace size={22} weight="bold" />, true)}
        </div>
      ))}
    </div>
  );
});
