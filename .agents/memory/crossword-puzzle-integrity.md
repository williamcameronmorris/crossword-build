---
name: Crossword puzzle integrity
description: Rules for keeping generated crossword rounds semantically valid in both directions.
---

Each playable crossword round should be built from a validated crossing grid: every Down run must form a real answer with its own clue, entry lengths may vary through blocked cells, and no answer may repeat anywhere between Across and Down.

**Why:** Arbitrary row strings can produce letter sequences that look like a crossword visually but are not solvable or clueable vertically; symmetric word squares also unintentionally repeat every answer in both directions.

**How to apply:** Prefer curated blocked grids for new rounds, derive entries from the grid, and validate the complete combined answer set whenever puzzle content changes.