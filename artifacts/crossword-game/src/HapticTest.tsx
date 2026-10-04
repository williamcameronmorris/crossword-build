import { useRef, useState } from 'react';

// Temporary diagnostic page (?haptics-test). Isolates which iOS haptic route works on a real phone.
// Remove once haptics are confirmed.
const css = (rule: string): React.CSSProperties => {
  const [prop, value] = rule.split(':');
  const key = prop.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
  return { [key]: key === 'opacity' ? Number(value) : value } as React.CSSProperties;
};

export function HapticTest() {
  const visibleRef = useRef<HTMLInputElement>(null);
  const [log, setLog] = useState<string[]>([]);
  const note = (msg: string) => setLog((l) => [`${new Date().toLocaleTimeString()}  ${msg}`, ...l].slice(0, 8));

  const clickHidden = () => {
    const label = document.createElement('label');
    label.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    label.appendChild(input);
    document.body.appendChild(label);
    label.click();
    label.remove();
    note('C: clicked an off-screen switch');
  };

  return (
    <main className="cc-shell" style={{ gap: 20, userSelect: 'text', WebkitUserSelect: 'text' }}>
      <p className="cc-wordmark-static" style={{ fontSize: 30 }}>
        Haptics test
      </p>
      <p className="cc-sheet-sub">Tap each one and note which you can feel.</p>

      <label style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 17 }}>
        <input type="checkbox" {...{ switch: '' }} ref={visibleRef} onChange={() => note('A: tapped the real switch')} />
        A. Tap this switch directly
      </label>

      <button type="button" className="cc-btn" onClick={() => { visibleRef.current?.click(); note('B: button clicked the visible switch'); }}>
        B. Button that flips switch A
      </button>

      <button type="button" className="cc-btn" onClick={clickHidden}>
        C. Button that flips a hidden switch
      </button>

      <label className="cc-key" style={{ position: 'relative', height: 56, flex: 'none', width: '100%' }}>
        E. Fake key, switch opacity 0
        <input
          type="checkbox"
          {...{ switch: '' }}
          onChange={() => note('E: tapped')}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', margin: 0, ...css('opacity:0') }}
        />
      </label>

      <label className="cc-key" style={{ position: 'relative', height: 56, flex: 'none', width: '100%' }}>
        F. Fake key, switch nearly invisible (2%)
        <input
          type="checkbox"
          {...{ switch: '' }}
          onChange={() => note('F: tapped')}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', margin: 0, ...css('opacity:0.02') }}
        />
      </label>

      <button
        type="button"
        className="cc-btn cc-btn-quiet"
        onClick={() => {
          const has = typeof navigator.vibrate === 'function';
          if (has) navigator.vibrate(30);
          note(`D: vibrate ${has ? 'exists, called' : 'not available'}`);
        }}
      >
        D. navigator.vibrate
      </button>

      <pre style={{ fontFamily: 'var(--mono)', fontSize: 12, whiteSpace: 'pre-wrap', color: 'var(--muted)' }}>
        {navigator.userAgent}
        {'\n\n'}
        {log.join('\n')}
      </pre>
    </main>
  );
}
