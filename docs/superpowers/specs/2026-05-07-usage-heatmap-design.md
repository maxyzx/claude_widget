# Usage Heatmap — Design Spec

**Date:** 2026-05-07  
**Status:** Approved

---

## Overview

Add a GitHub-style calendar heatmap to the claude-widget, accessible via a new `H` tab button in the header alongside the existing D / W / M period switcher. The heatmap shows the last 90 days (~13 weeks) of Claude usage, with cell color intensity driven by **total token count** (input + output + cache creation + cache read) per day.

---

## Data Model

### New type in `src/shared/types.ts`

```ts
export interface HeatmapDay {
  date: string            // YYYY-MM-DD
  totalTokens: number     // input + output + cacheCreation + cacheRead
  estimatedCostUsd: number
}
```

### Extension to `UsageData`

```ts
export interface UsageData {
  // ...existing fields...
  heatmapData: HeatmapDay[]  // last 90 days with activity, sorted chronologically; days with zero usage are absent
}
```

---

## Backend — `src/main/file-watcher.ts`

### New accumulator type

```ts
interface HeatmapAccumulator {
  seen: Set<string>
  dayData: Map<string, { totalTokens: number; estimatedCostUsd: number }>
}
```

### Changes to `processFileForPeriods`

- Add a 4th parameter: `heatmapAcc: HeatmapAccumulator`
- In the existing per-entry loop, after binning into the period accumulators, also update `heatmapAcc.dayData` keyed by `YYYY-MM-DD`:
  - Dedup via `heatmapAcc.seen` (same `messageId:requestId` key as the other accumulators)
  - Accumulate `totalTokens = input + output + cacheCreation + cacheRead` and `estimatedCostUsd`

### Changes to `startFileWatcher`

- Declare `heatmapAcc` alongside `dailyAcc`, `weeklyAcc`, `monthlyAcc`
- Pass it to every `processFileForPeriods` call (startup scan and watcher callbacks)

### Changes to `buildSnapshot`

After building the three period totals, compute `heatmapData`:

1. Compute cutoff: `today - 89 days` (inclusive → 90 days total)
2. Filter `heatmapAcc.dayData` to entries where `date >= cutoffStr`
3. Map to `HeatmapDay[]`, sort chronologically
4. Include as `heatmapData` in the returned `UsageData`

---

## Frontend — `src/renderer/src/components/UsageWidget.tsx`

### Period type

```ts
type Period = 'day' | 'week' | 'month' | 'heatmap'
```

Add `heatmap: 'H'` to `PERIOD_LABELS` and `heatmap: 'No usage in last 90 days'` to `PERIOD_EMPTY`.

### Height calculation

```ts
const HEATMAP_HEIGHT = 210
// BASE_HEIGHT (79) + month labels (18) + grid 7×12px (84) + hover line (24) + padding (5)

function calcHeight(rowCount: number, period: Period): number {
  if (period === 'heatmap') return HEATMAP_HEIGHT
  return Math.min(MAX_HEIGHT, BASE_HEIGHT + (rowCount === 0 ? EMPTY_HEIGHT : rowCount * ROW_HEIGHT))
}
```

### `HeatmapGrid` component

Props: `data: HeatmapDay[]`

**Layout:**
- 13 columns (weeks, oldest → current left → right)
- 7 rows (Sun at top, Sat at bottom — matching GitHub convention)
- Cell: 10×10px with 2px gap (12px per step)
- Day-label column: 10px wide, showing single-char initials S M T W T F S
- Month labels: text row above grid, placed at the column where a new month begins

**Color levels** (based on `totalTokens / maxTokens` across the 90-day window):

| Level | Condition | Color |
|-------|-----------|-------|
| 0 | 0 tokens | `#1e1e2e` |
| 1 | 1–25% | `#1b3a30` |
| 2 | 26–50% | `#276652` |
| 3 | 51–75% | `#3a9974` |
| 4 | 76–100% | `#4ecca3` |

**Interaction:**
- Full grid wrapped in `WebkitAppRegion: 'no-drag'` so cells are hoverable
- `useState<HeatmapDay | null>` tracks the hovered day
- A single info line below the grid renders: `"May 6 — 123.4K tokens · $0.42"` when a day is hovered, empty text otherwise

**Empty state:** When `data` is empty, render the standard empty-state message centered in the heatmap area.

### `UsageWidget` integration

- Add `'heatmap'` branch to the period-selector render
- When `period === 'heatmap'`, render `<HeatmapGrid data={data.heatmapData} />` in place of the model/day rows
- Pass updated `period` to `calcHeight`

---

## Error handling & edge cases

- Days with no data are simply absent from `heatmapData`; the grid renders them as level-0 cells
- If `heatmapData` is entirely empty, the empty-state message is shown
- The 90-day cutoff is computed fresh each time `buildSnapshot` runs (no caching of the cutoff date)
- `maxTokens = 0` guard: all cells render as level-0 when there is no data

---

## Testing

- **`tests/file-watcher.test.ts`**: add cases verifying that `heatmapData` is populated correctly, respects the 90-day cutoff, deduplicates entries, and handles an empty project directory
- **`UsageWidget` tests**: add a case for rendering the `'heatmap'` period (snapshot or behaviour test)
- No changes needed to `tests/usage-parser.test.ts`

---

## Files changed

| File | Change |
|------|--------|
| `src/shared/types.ts` | Add `HeatmapDay`; extend `UsageData` |
| `src/main/file-watcher.ts` | Add `HeatmapAccumulator`, extend `processFileForPeriods`, update `buildSnapshot` |
| `src/renderer/src/components/UsageWidget.tsx` | Add `HeatmapGrid`, extend `Period` type, update `calcHeight` |
| `tests/file-watcher.test.ts` | New test cases for heatmap accumulation |
| `src/renderer/src/components/UsageWidget.test.tsx` | New test case for heatmap period |
