# Usage Heatmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a GitHub-style calendar heatmap (last 90 days, color = total tokens) to the widget as a new 'H' tab alongside D/W/M.

**Architecture:** A new `HeatmapAccumulator` in `file-watcher.ts` tracks daily token totals across all history; `buildSnapshot` slices it to 90 days and attaches it to `UsageData.heatmapData`. The renderer adds `period === 'heatmap'` and a `HeatmapGrid` component that renders a 13-week × 7-row colored grid with a hover info line.

**Tech Stack:** Electron, React 18, TypeScript, Vitest, @testing-library/react

---

### Task 1: Extend shared types and update empty fixtures

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/renderer/src/hooks/use-usage-data.ts`

- [ ] **Step 1: Add `HeatmapDay` to `src/shared/types.ts`**

Insert after the `DayBreakdown` interface (after line 27):

```ts
export interface HeatmapDay {
  date: string             // YYYY-MM-DD
  totalTokens: number      // input + output + cacheCreation + cacheRead
  estimatedCostUsd: number
}
```

Then add `heatmapData: HeatmapDay[]` to `UsageData`:

```ts
export interface UsageData {
  activeSessions: SessionData[]
  todayTotals: PeriodTotals & { sessionCount: number; messageCount: number }
  weeklyTotals: PeriodTotals
  monthlyTotals: PeriodTotals
  heatmapData: HeatmapDay[]  // last 90 days with activity, sorted chronologically
  contextPercent: number
  lastUpdated: number
}
```

- [ ] **Step 2: Update `EMPTY_USAGE` in `src/renderer/src/hooks/use-usage-data.ts`**

Add `heatmapData: []` to `EMPTY_USAGE`:

```ts
const EMPTY_USAGE: UsageData = {
  activeSessions: [],
  todayTotals: { ...EMPTY_PERIOD, sessionCount: 0, messageCount: 0 },
  weeklyTotals: EMPTY_PERIOD,
  monthlyTotals: EMPTY_PERIOD,
  heatmapData: [],
  contextPercent: 0,
  lastUpdated: 0
}
```

- [ ] **Step 3: Run typecheck — expect errors in `file-watcher.ts` and test fixtures**

```bash
cd /Users/manhnguyen/Documents/projects/claude_widget && npm run typecheck
```

Expected: TypeScript errors in `src/main/file-watcher.ts` (buildSnapshot missing `heatmapData`) and `src/renderer/src/components/UsageWidget.test.tsx` (test fixtures missing `heatmapData`). These will be fixed in their respective tasks.

- [ ] **Step 4: Commit**

```bash
git add src/shared/types.ts src/renderer/src/hooks/use-usage-data.ts
git commit -m "feat: add HeatmapDay type and heatmapData field to UsageData"
```

---

### Task 2: Implement heatmap accumulator in file-watcher (TDD)

**Files:**
- Modify: `src/main/file-watcher.ts`
- Modify: `tests/file-watcher.test.ts`

- [ ] **Step 1: Write failing tests in `tests/file-watcher.test.ts`**

Add the import for `HeatmapAccumulator` at the top (it doesn't exist yet — TypeScript will error here, which is expected):

```ts
import { readNewLines, isSessionAlive, buildEmptyTokenUsage, cwdToProjectSlug, processFileForPeriods } from '../src/main/file-watcher'
import type { HeatmapAccumulator } from '../src/main/file-watcher'
```

Update the existing `processFileForToday` helper to pass a dummy heatmap accumulator as the new 4th accumulator parameter (will also fail until implementation):

```ts
function processFileForToday(
  file: string,
  today: string,
  offsets: Map<string, number>,
  modelTotals: Map<string, { tokens: TokenUsage; estimatedCostUsd: number }>
): void {
  const daily = { seen: new Set<string>(), modelTotals, dayTotals: new Map<string, number>() }
  const weekly = { seen: new Set<string>(), modelTotals: new Map(), dayTotals: new Map<string, number>() }
  const monthly = { seen: new Set<string>(), modelTotals: new Map(), dayTotals: new Map<string, number>() }
  const heatmap: HeatmapAccumulator = { seen: new Set(), dayData: new Map() }
  processFileForPeriods(file, offsets, daily, weekly, monthly, heatmap, today, today)
}
```

Add a new helper and describe block at the end of the file:

```ts
function processFileForHeatmap(
  file: string,
  offsets: Map<string, number>
): Map<string, { totalTokens: number; estimatedCostUsd: number }> {
  const dummy = { seen: new Set<string>(), modelTotals: new Map(), dayTotals: new Map<string, number>() }
  const heatmap: HeatmapAccumulator = { seen: new Set(), dayData: new Map() }
  const anyDate = new Date().toISOString().slice(0, 10)
  processFileForPeriods(file, offsets, dummy, dummy, dummy, heatmap, anyDate, anyDate)
  return heatmap.dayData
}

function makeAssistantLineWithId(model: string, date: string, msgId: string, reqId: string, inputTokens = 100, outputTokens = 50): string {
  return JSON.stringify({
    type: 'assistant',
    timestamp: `${date}T10:00:00.000Z`,
    requestId: reqId,
    message: {
      id: msgId,
      model,
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0
      }
    }
  })
}

describe('processFileForPeriods heatmap accumulator', () => {
  const TODAY = new Date().toISOString().split('T')[0]
  const YESTERDAY = new Date(Date.now() - 86_400_000).toISOString().split('T')[0]

  it('accumulates total tokens for a single day', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hm-'))
    const file = join(dir, 'session.jsonl')
    writeFileSync(file,
      makeAssistantLineWithId('claude-sonnet-4-6', TODAY, 'msg-1', 'req-1', 100, 50) + '\n' +
      makeAssistantLineWithId('claude-sonnet-4-6', TODAY, 'msg-2', 'req-2', 200, 80) + '\n'
    )

    const dayData = processFileForHeatmap(file, new Map())

    expect(dayData.has(TODAY)).toBe(true)
    expect(dayData.get(TODAY)!.totalTokens).toBe(430) // (100+50) + (200+80)
    expect(dayData.get(TODAY)!.estimatedCostUsd).toBeGreaterThan(0)
  })

  it('tracks different days in separate entries', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hm-'))
    const file = join(dir, 'session.jsonl')
    writeFileSync(file,
      makeAssistantLineWithId('claude-sonnet-4-6', TODAY, 'msg-1', 'req-1') + '\n' +
      makeAssistantLineWithId('claude-sonnet-4-6', YESTERDAY, 'msg-2', 'req-2') + '\n'
    )

    const dayData = processFileForHeatmap(file, new Map())

    expect(dayData.has(TODAY)).toBe(true)
    expect(dayData.has(YESTERDAY)).toBe(true)
    expect(dayData.get(TODAY)!.totalTokens).toBe(150)
    expect(dayData.get(YESTERDAY)!.totalTokens).toBe(150)
  })

  it('deduplicates entries with the same messageId + requestId', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hm-'))
    const file = join(dir, 'session.jsonl')
    const line = makeAssistantLineWithId('claude-sonnet-4-6', TODAY, 'msg-dup', 'req-dup', 100, 50)
    writeFileSync(file, line + '\n' + line + '\n')

    const dayData = processFileForHeatmap(file, new Map())

    expect(dayData.get(TODAY)!.totalTokens).toBe(150) // counted once only
  })

  it('accumulates entries without ids (no dedup key) without dropping them', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hm-'))
    const file = join(dir, 'session.jsonl')
    // No message.id or requestId — dedupKey will be null
    const line = JSON.stringify({
      type: 'assistant',
      timestamp: `${TODAY}T10:00:00.000Z`,
      message: { model: 'claude-sonnet-4-6', usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } }
    })
    writeFileSync(file, line + '\n' + line + '\n')

    const dayData = processFileForHeatmap(file, new Map())

    // Both are accumulated because no dedup key
    expect(dayData.get(TODAY)!.totalTokens).toBe(300)
  })
})
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd /Users/manhnguyen/Documents/projects/claude_widget && npm test 2>&1 | tail -20
```

Expected: TypeScript compilation errors — `HeatmapAccumulator` not found, `processFileForPeriods` expected 7 arguments.

- [ ] **Step 3: Add `HeatmapAccumulator` interface and `createHeatmapAccumulator` to `src/main/file-watcher.ts`**

Add after the `PeriodAccumulator` interface (around line 58):

```ts
export interface HeatmapAccumulator {
  seen: Set<string>
  dayData: Map<string, { totalTokens: number; estimatedCostUsd: number }>
}

function createHeatmapAccumulator(): HeatmapAccumulator {
  return { seen: new Set(), dayData: new Map() }
}
```

- [ ] **Step 4: Extend `processFileForPeriods` signature and add heatmap accumulation**

Change the function signature to add `heatmap: HeatmapAccumulator` as the 6th parameter (after `monthly`, before `todayStr`):

```ts
export function processFileForPeriods(
  filePath: string,
  fileOffsets: Map<string, number>,
  daily: PeriodAccumulator,
  weekly: PeriodAccumulator,
  monthly: PeriodAccumulator,
  heatmap: HeatmapAccumulator,
  todayStr: string,
  weekStartStr: string
): void {
```

Inside the entry loop, after the existing `accumulateIntoPeriod` calls at the bottom, add heatmap accumulation. The full loop body should end with:

```ts
    // Heatmap: all dates at per-day granularity, independent dedup
    if (!dedupKey || !heatmap.seen.has(dedupKey)) {
      if (dedupKey) heatmap.seen.add(dedupKey)
      const totalTokens =
        tokens.inputTokens + tokens.outputTokens +
        tokens.cacheCreationTokens + tokens.cacheReadTokens
      const cost = computeCost(tokens, model)
      const existing = heatmap.dayData.get(dateStr) ?? { totalTokens: 0, estimatedCostUsd: 0 }
      heatmap.dayData.set(dateStr, {
        totalTokens: existing.totalTokens + totalTokens,
        estimatedCostUsd: existing.estimatedCostUsd + cost
      })
    }

    // Monthly: all history, grouped by YYYY-MM
    accumulateIntoPeriod(monthly, dedupKey, model, tokens, dateStr.slice(0, 7))
    if (dateStr >= weekStartStr) accumulateIntoPeriod(weekly, dedupKey, model, tokens, dateStr)
    if (dateStr === todayStr) accumulateIntoPeriod(daily, dedupKey, model, tokens, dateStr)
```

- [ ] **Step 5: Update `startFileWatcher` to declare and use `heatmapAcc`**

In `startFileWatcher`, after the `monthlyAcc` declaration (around line 202), add:

```ts
  const heatmapAcc = createHeatmapAccumulator()
```

Pass it to every `processFileForPeriods` call. There are three: the startup scan and two watcher callbacks (`change` and `add`). Each call currently looks like:

```ts
processFileForPeriods(filePath, allFileOffsets, dailyAcc, weeklyAcc, monthlyAcc, todayStr, weekStartStr)
```

Change each to:

```ts
processFileForPeriods(filePath, allFileOffsets, dailyAcc, weeklyAcc, monthlyAcc, heatmapAcc, todayStr, weekStartStr)
```

- [ ] **Step 6: Update `buildSnapshot` to produce `heatmapData`**

First, add `HeatmapDay` to the existing import at the top of `file-watcher.ts`:

```ts
import type { TokenUsage, UsageData, SessionData, PeriodTotals, ModelDayStats, HeatmapDay } from '../shared/types'
```

In `buildSnapshot`, after `const dayTotals = buildPeriodTotals(dailyAcc)`, add:

```ts
    const cutoff = new Date()
    cutoff.setUTCDate(cutoff.getUTCDate() - 89)
    const cutoffStr = cutoff.toISOString().slice(0, 10)

    const heatmapData: HeatmapDay[] = Array.from(heatmapAcc.dayData.entries())
      .filter(([date]) => date >= cutoffStr)
      .map(([date, { totalTokens, estimatedCostUsd }]) => ({ date, totalTokens, estimatedCostUsd }))
      .sort((a, b) => a.date.localeCompare(b.date))
```

Then add `heatmapData` to the returned object:

```ts
    return {
      activeSessions: sessions,
      todayTotals: { ...dayTotals, sessionCount: sessions.length, messageCount },
      weeklyTotals: buildPeriodTotals(weeklyAcc),
      monthlyTotals: buildPeriodTotals(monthlyAcc),
      heatmapData,
      contextPercent,
      lastUpdated: Date.now()
    }
```

- [ ] **Step 7: Run tests — confirm all pass**

```bash
cd /Users/manhnguyen/Documents/projects/claude_widget && npm test 2>&1 | tail -20
```

Expected: all tests pass, including the 4 new heatmap accumulator tests.

- [ ] **Step 8: Run typecheck for node**

```bash
cd /Users/manhnguyen/Documents/projects/claude_widget && npm run typecheck:node
```

Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add src/main/file-watcher.ts tests/file-watcher.test.ts
git commit -m "feat: add HeatmapAccumulator and daily token tracking to file-watcher"
```

---

### Task 3: Implement HeatmapGrid and H tab in renderer (TDD)

**Files:**
- Modify: `src/renderer/src/components/UsageWidget.test.tsx`
- Modify: `src/renderer/src/components/UsageWidget.tsx`

- [ ] **Step 1: Update test fixtures to include `heatmapData`**

In `UsageWidget.test.tsx`, update `base` to add `heatmapData: []`:

```ts
const base: UsageData = {
  activeSessions: [],
  todayTotals: { ...emptyPeriod, sessionCount: 0, messageCount: 0 },
  weeklyTotals: emptyPeriod,
  monthlyTotals: emptyPeriod,
  heatmapData: [],
  contextPercent: 0,
  lastUpdated: Date.now()
}
```

Update `withModels` to add `heatmapData: []`:

```ts
const withModels: UsageData = {
  // ...all existing fields unchanged...
  heatmapData: [],
  // ...
}
```

Add a new fixture `withHeatmap` after `withModels` (compute dates at definition time):

```ts
const todayStr = new Date().toISOString().slice(0, 10)
const fiveDaysAgoStr = (() => {
  const d = new Date(); d.setUTCDate(d.getUTCDate() - 5); return d.toISOString().slice(0, 10)
})()

const withHeatmap: UsageData = {
  ...withModels,
  heatmapData: [
    { date: fiveDaysAgoStr, totalTokens: 50_000, estimatedCostUsd: 5.00 },
    { date: todayStr, totalTokens: 150_000, estimatedCostUsd: 15.00 }
  ]
}
```

- [ ] **Step 2: Write failing renderer tests**

Append to the `describe('UsageWidget', ...)` block:

```ts
  it('renders an H tab button', () => {
    render(<UsageWidget data={base} />)
    expect(screen.getByText('H')).toBeTruthy()
  })

  it('clicking H shows heatmap grid', () => {
    render(<UsageWidget data={withHeatmap} />)
    fireEvent.click(screen.getByText('H'))
    expect(screen.getByTestId('heatmap-grid')).toBeTruthy()
  })

  it('shows empty state in heatmap view when no data', () => {
    render(<UsageWidget data={base} />)
    fireEvent.click(screen.getByText('H'))
    expect(screen.getByText('No usage in last 90 days')).toBeTruthy()
  })

  it('switching from H back to D restores model rows', () => {
    render(<UsageWidget data={withModels} />)
    fireEvent.click(screen.getByText('H'))
    fireEvent.click(screen.getByText('D'))
    expect(screen.getByText('Sonnet 4.6')).toBeTruthy()
  })
```

- [ ] **Step 3: Run renderer tests — confirm new tests fail**

```bash
cd /Users/manhnguyen/Documents/projects/claude_widget && npm run test:renderer 2>&1 | tail -30
```

Expected: existing tests pass; the 4 new tests fail (`H` not rendered, `heatmap-grid` not found, etc.).

- [ ] **Step 4: Extend `Period` type and period maps in `UsageWidget.tsx`**

Change the Period type and constants:

```ts
type Period = 'day' | 'week' | 'month' | 'heatmap'
const PERIOD_LABELS: Record<Period, string> = { day: 'D', week: 'W', month: 'M', heatmap: 'H' }
const PERIOD_EMPTY: Record<Period, string> = {
  day: 'No usage today',
  week: 'No usage this week',
  month: 'No usage this month',
  heatmap: 'No usage in last 90 days'
}
```

Add to the imports at the top of the file:

```ts
import type { UsageData, ModelDayStats, DayBreakdown, PeriodTotals, HeatmapDay } from '../../../shared/types'
```

- [ ] **Step 5: Add `HEATMAP_HEIGHT` constant and update `calcHeight`**

Add after the existing constants (near `MAX_HEIGHT`):

```ts
const HEATMAP_HEIGHT = 210
```

Update `calcHeight` signature and body:

```ts
function calcHeight(rowCount: number, period: Period): number {
  if (period === 'heatmap') return HEATMAP_HEIGHT
  return Math.min(MAX_HEIGHT, BASE_HEIGHT + (rowCount === 0 ? EMPTY_HEIGHT : rowCount * ROW_HEIGHT))
}
```

- [ ] **Step 6: Add grid-building helpers and `HeatmapGrid` component**

Add these before the `ModelRow` component:

```ts
const CELL_SIZE = 10
const CELL_GAP = 2
const WEEK_STRIDE = CELL_SIZE + CELL_GAP
const LEVEL_COLORS = ['#1e1e2e', '#1b3a30', '#276652', '#3a9974', '#4ecca3']
const DAY_LABELS_HEATMAP = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

function tokenLevel(tokens: number, maxTokens: number): 0 | 1 | 2 | 3 | 4 {
  if (tokens === 0 || maxTokens === 0) return 0
  const pct = tokens / maxTokens
  if (pct <= 0.25) return 1
  if (pct <= 0.50) return 2
  if (pct <= 0.75) return 3
  return 4
}

interface GridCell {
  date: string
  totalTokens: number
  estimatedCostUsd: number
  isFuture: boolean
}

function buildGrid(data: HeatmapDay[]): {
  grid: GridCell[][]
  monthLabels: { weekIdx: number; label: string }[]
  maxTokens: number
} {
  const dataMap = new Map(data.map(d => [d.date, d]))
  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)
  const todayDow = today.getUTCDay()

  // Sunday of the current week, then back 12 more weeks = grid start
  const startDate = new Date(today)
  startDate.setUTCDate(today.getUTCDate() - todayDow - 12 * 7)

  const grid: GridCell[][] = []
  const monthLabels: { weekIdx: number; label: string }[] = []
  let prevMonth = -1

  for (let w = 0; w < 13; w++) {
    const weekStart = new Date(startDate)
    weekStart.setUTCDate(startDate.getUTCDate() + w * 7)
    const month = weekStart.getUTCMonth()
    if (month !== prevMonth) {
      monthLabels.push({
        weekIdx: w,
        label: weekStart.toLocaleDateString('en', { month: 'short', timeZone: 'UTC' })
      })
      prevMonth = month
    }

    const week: GridCell[] = []
    for (let d = 0; d < 7; d++) {
      const cellDate = new Date(startDate)
      cellDate.setUTCDate(startDate.getUTCDate() + w * 7 + d)
      const dateStr = cellDate.toISOString().slice(0, 10)
      const isFuture = dateStr > todayStr
      const day = dataMap.get(dateStr)
      week.push({
        date: dateStr,
        totalTokens: day?.totalTokens ?? 0,
        estimatedCostUsd: day?.estimatedCostUsd ?? 0,
        isFuture
      })
    }
    grid.push(week)
  }

  const maxTokens = data.length > 0 ? Math.max(...data.map(d => d.totalTokens)) : 0
  return { grid, monthLabels, maxTokens }
}

function formatHoverDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z')
  return d.toLocaleDateString('en', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

function HeatmapGrid({ data }: { data: HeatmapDay[] }): React.JSX.Element {
  const [hovered, setHovered] = useState<GridCell | null>(null)
  const { grid, monthLabels, maxTokens } = buildGrid(data)
  const gridWidth = 13 * WEEK_STRIDE - CELL_GAP

  if (data.length === 0) {
    return (
      <div style={{ color: '#444', fontSize: 12, textAlign: 'center', padding: '10px 0' }}>
        No usage in last 90 days
      </div>
    )
  }

  return (
    <div data-testid="heatmap-grid" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
      {/* Month labels */}
      <div style={{ position: 'relative', width: gridWidth, height: 14, marginLeft: 14, marginBottom: 4 }}>
        {monthLabels.map(({ weekIdx, label }) => (
          <span key={weekIdx} style={{
            position: 'absolute', left: weekIdx * WEEK_STRIDE,
            fontSize: 9, color: '#666', whiteSpace: 'nowrap'
          }}>{label}</span>
        ))}
      </div>

      {/* Grid */}
      <div style={{ display: 'flex', gap: 0 }}>
        {/* Day-of-week labels: only show M, W, F (indices 1,3,5) for spacing */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: CELL_GAP, marginRight: 4, width: 10 }}>
          {DAY_LABELS_HEATMAP.map((lbl, i) => (
            <div key={i} style={{ height: CELL_SIZE, fontSize: 8, color: '#555', lineHeight: `${CELL_SIZE}px` }}>
              {i % 2 === 1 ? lbl : ''}
            </div>
          ))}
        </div>

        {/* Week columns */}
        {grid.map((week, wi) => (
          <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap: CELL_GAP, marginRight: CELL_GAP }}>
            {week.map((cell, di) => (
              <div
                key={di}
                style={{
                  width: CELL_SIZE, height: CELL_SIZE, borderRadius: 2,
                  background: cell.isFuture ? 'transparent' : LEVEL_COLORS[tokenLevel(cell.totalTokens, maxTokens)],
                  cursor: !cell.isFuture && cell.totalTokens > 0 ? 'pointer' : 'default'
                }}
                onMouseEnter={() => setHovered(!cell.isFuture && cell.totalTokens > 0 ? cell : null)}
                onMouseLeave={() => setHovered(null)}
              />
            ))}
          </div>
        ))}
      </div>

      {/* Hover info line */}
      <div style={{ height: 18, marginTop: 6, fontSize: 11, color: '#888', textAlign: 'center' }}>
        {hovered
          ? `${formatHoverDate(hovered.date)} — ${formatTokens(hovered.totalTokens)} tokens · $${hovered.estimatedCostUsd.toFixed(2)}`
          : ' '}
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Update `UsageWidget` body to handle heatmap period**

In the `UsageWidget` function body, update `rows` and `estimatedCostUsd`:

```ts
  const totals: PeriodTotals = period === 'day' ? todayTotals : period === 'week' ? weeklyTotals : monthlyTotals
  const { modelBreakdown, dailyBreakdown } = totals
  const estimatedCostUsd = period === 'heatmap'
    ? data.heatmapData.reduce((sum, d) => sum + d.estimatedCostUsd, 0)
    : totals.estimatedCostUsd

  const rows = period === 'day' ? modelBreakdown : period === 'heatmap' ? [] : dailyBreakdown
  const maxDayCost = dailyBreakdown.length > 0 ? Math.max(...dailyBreakdown.map(d => d.estimatedCostUsd)) : 0
```

Update the `useEffect` to pass `period` to `calcHeight`:

```ts
  useEffect(() => {
    cw()?.resizeWindow(calcHeight(rows.length, period))
  }, [rows.length, period])
```

Update the rows rendering section (the `<div style={{ overflowY: ... }}>` block) to handle heatmap:

```tsx
      <div style={{ overflowY: rows.length * ROW_HEIGHT > MAX_HEIGHT - BASE_HEIGHT ? 'auto' : 'visible' }}>
        {period === 'heatmap' ? (
          <HeatmapGrid data={data.heatmapData} />
        ) : rows.length === 0 ? (
          <div style={{ color: '#444', fontSize: 12, textAlign: 'center', padding: '10px 0' }}>
            {PERIOD_EMPTY[period]}
          </div>
        ) : period === 'day' ? (
          modelBreakdown.map(m => <ModelRow key={m.model} m={m} totalCost={estimatedCostUsd} />)
        ) : (
          dailyBreakdown.map(d => <DayRow key={d.date} d={d} maxCost={maxDayCost} period={period} />)
        )}
      </div>
```

- [ ] **Step 8: Run renderer tests — confirm all pass**

```bash
cd /Users/manhnguyen/Documents/projects/claude_widget && npm run test:renderer 2>&1 | tail -30
```

Expected: all tests pass, including the 4 new heatmap tests.

- [ ] **Step 9: Run full typecheck**

```bash
cd /Users/manhnguyen/Documents/projects/claude_widget && npm run typecheck
```

Expected: no errors.

- [ ] **Step 10: Run all tests**

```bash
cd /Users/manhnguyen/Documents/projects/claude_widget && npm run test:all 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 11: Commit**

```bash
git add src/renderer/src/components/UsageWidget.tsx src/renderer/src/components/UsageWidget.test.tsx
git commit -m "feat: add HeatmapGrid component and H tab to UsageWidget"
```
