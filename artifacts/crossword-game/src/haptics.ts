import { readFlag, writeFlag } from './storage';

// Key-press haptics.
// iOS: Safari has no vibrate API, but it plays the system tick when a finger toggles an
// <input switch>. Programmatic clicks don't count (tested on iOS 27), so each on-screen key
// carries an invisible switch the finger actually lands on (see Keys.tsx).
// Android: navigator.vibrate, called from that same switch's change event.

const KEY = 'clue_co_haptics_enabled';
let enabled = readFlag(KEY, true);

export const getHapticsEnabled = () => enabled;

export function setHapticsEnabled(next: boolean) {
  enabled = next;
  writeFlag(KEY, next);
}

export function vibrateTick() {
  if (enabled && typeof navigator.vibrate === 'function') navigator.vibrate(8);
}
