// Shared grid geometry: entry numbering and slots, matching src/puzzles.ts.
export function slotsFor(rows) {
  const N = rows.length;
  const open = (r, c) => r >= 0 && r < N && c >= 0 && c < N && rows[r][c] !== '#';
  const across = [];
  const down = [];
  let number = 1;
  for (let r = 0; r < N; r += 1) {
    for (let c = 0; c < N; c += 1) {
      if (!open(r, c)) continue;
      const a = !open(r, c - 1) && open(r, c + 1);
      const d = !open(r - 1, c) && open(r + 1, c);
      if (!a && !d) continue;
      if (a) {
        const cells = [];
        for (let k = c; open(r, k); k += 1) cells.push([r, k]);
        across.push({ number, cells });
      }
      if (d) {
        const cells = [];
        for (let k = r; open(k, c); k += 1) cells.push([k, c]);
        down.push({ number, cells });
      }
      number += 1;
    }
  }
  return { across, down };
}

