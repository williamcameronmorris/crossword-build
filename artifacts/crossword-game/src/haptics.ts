import { readFlag, writeFlag } from './storage';

// A light tap for each key press.
// Android: navigator.vibrate. iOS Safari has no vibrate API, but toggling a hidden
// <input switch> (iOS 18+) plays the system's selection haptic, so we click one.

const KEY = 'clue_co_haptics_enabled';
let enabled = readFlag(KEY, true);
let iosToggle: HTMLLabelElement | null = null;

export const getHapticsEnabled = () => enabled;

export function setHapticsEnabled(next: boolean) {
  enabled = next;
  writeFlag(KEY, next);
}

export function tapHaptic() {
  if (!enabled) return;
  if (typeof navigator.vibrate === 'function') {
    navigator.vibrate(8);
    return;
  }
  if (!iosToggle) {
    iosToggle = document.createElement('label');
    iosToggle.setAttribute('aria-hidden', 'true');
    // Rendered off-screen (not display:none) so the switch is a live, interactive control.
    iosToggle.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;pointer-events:none';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    iosToggle.appendChild(input);
    document.body.appendChild(iosToggle);
  }
  iosToggle.click();
}
