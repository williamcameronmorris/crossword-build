# Clue & Co.

A daily 5x5 mini crossword with an archive of 500 puzzles. Static Vite + React app, deployed on Vercel.

## Run & Operate

- `pnpm dev` — local dev server
- `pnpm build` — production build to `artifacts/crossword-game/dist/public`
- `pnpm typecheck` — TypeScript check
- `pnpm generate` — rebuild puzzles 31-500 (keeps 1-30), rotate clues, attach hints (~10 min). Bumps the bank version, which clears players' in-progress saves for 31-500
- `pnpm --filter @workspace/crossword-game run hints` — re-attach hints from `tools/hints.jsonl` without touching grids

## Where things live

- `artifacts/crossword-game/src/Game.tsx` — one solve: board, typing, check/reveal, results
- `artifacts/crossword-game/src/puzzles.ts` — puzzle numbering, chunked loading, daily puzzle by date
- `artifacts/crossword-game/src/storage.ts` — saved progress, best times, day streak (localStorage)
- `artifacts/crossword-game/src/game.css` — all styles; color tokens at the top
- `artifacts/crossword-game/tools/` — puzzle generator, clued word bank, hint bank (`hints.jsonl`), handmade puzzles
- `artifacts/crossword-game/public/puzzles/` — generated bank, 100 puzzles per JSON chunk

## Architecture decisions

- No backend: puzzles are pre-generated static JSON, so there is no server to run or pay for.
- Puzzle N is fixed forever (shareable via `?p=N`); the daily puzzle is days since Oct 4, 2026, looping at the end of the bank.
- Revealed squares make a solve "assisted": it doesn't count toward streak or best time.
- To add puzzles: edit `tools/wordbank.jsonl` or `tools/handmade.json`, then `pnpm generate`. The fill has a time budget per grid, so any regeneration reshuffles existing puzzles; once players have history, generate extra chunks and append them instead of replacing the bank.
