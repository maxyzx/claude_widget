import React, { useEffect, useState } from 'react'
import type { UsageData, ModelDayStats, DayBreakdown, PeriodTotals, HeatmapDay } from '../../../shared/types'
import claudeWidgetLogo from '../assets/claude-widget.svg'
import arrowLeftIcon from '../assets/arrow-small-left.svg'
import settingsIcon from '../assets/settings-sliders.svg'
import { SettingsPanel } from './SettingsPanel'

const cw = (): any => (window as any).claudeWidget

type Period = 'day' | 'week' | 'month' | 'heatmap'
const PERIOD_LABELS: Record<Period, string> = { day: 'D', week: 'W', month: 'M', heatmap: 'H' }
const PERIOD_EMPTY: Record<Exclude<Period, 'heatmap'>, string> = {
  day: 'No usage today',
  week: 'No usage this week',
  month: 'No usage this month'
}

const DAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

const MAX_HEIGHT = 310

function dayLabel(date: string, period: Period): string {
  if (period === 'month') return date
  const d = new Date(date + 'T12:00:00Z')
  const monthDay = d.toLocaleDateString('en', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  return `${monthDay} (${DAY_INITIALS[d.getUTCDay()]})`
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

function modelShortName(model: string): string {
  const withoutPrefix = model.replace(/^claude-/, '')
  const parts = withoutPrefix.split('-')
  if (parts.length < 2) return model
  const name = parts[0].charAt(0).toUpperCase() + parts[0].slice(1)
  return `${name} ${parts.slice(1).join('.')}`
}

const CELL_SIZE = 20
const CELL_GAP = 2
const WEEK_STRIDE = CELL_SIZE + CELL_GAP
const LEVEL_COLORS = ['#1e1e2e', '#1b3a30', '#276652', '#3a9974', '#4ecca3']

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
    <div data-testid="heatmap-grid" className="no-drag">
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
          {DAY_INITIALS.map((lbl, i) => (
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
          : ' '}
      </div>
    </div>
  )
}

const TRAFFIC_BTN: React.CSSProperties = {
  width: 12, height: 12, borderRadius: '50%', border: 'none',
  padding: 0, cursor: 'pointer', flexShrink: 0,
}

function TrafficLights(): React.JSX.Element {
  return (
    <div className="no-drag" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <button className="no-drag" onClick={() => cw()?.closeWindow()} style={{ ...TRAFFIC_BTN, background: '#ff5f57' }} />
      <button className="no-drag" onClick={() => cw()?.minimizeWindow()} style={{ ...TRAFFIC_BTN, background: '#ffbd2e' }} />
      <button className="no-drag" onClick={() => cw()?.zoomWindow()} style={{ ...TRAFFIC_BTN, background: '#28ca41' }} />
    </div>
  )
}

function ModelRow({ m, totalCost }: { m: ModelDayStats; totalCost: number }): React.JSX.Element {
  const barPct = totalCost > 0 ? Math.min(100, (m.estimatedCostUsd / totalCost) * 100) : 0
  const totalTok = m.tokens.inputTokens + m.tokens.outputTokens + m.tokens.cacheCreationTokens
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0' }}>
      <span style={{ color: '#c8c8e8', minWidth: 88, fontSize: 13 }}>{modelShortName(m.model)}</span>
      <div style={{ flex: 1, background: '#1e1e2e', borderRadius: 3, height: 3 }}>
        <div style={{ width: `${barPct}%`, height: 3, background: '#4ecca3', borderRadius: 3, transition: 'width 0.4s ease', minWidth: barPct > 0 ? 3 : 0 }} />
      </div>
      <span style={{ color: '#888', minWidth: 36, textAlign: 'right', fontSize: 12 }}>{formatTokens(totalTok)}</span>
      <span style={{ color: '#4ecca3', minWidth: 46, textAlign: 'right', fontSize: 13, fontWeight: 600 }}>${m.estimatedCostUsd.toFixed(2)}</span>
    </div>
  )
}

function DayRow({ d, maxCost, period }: { d: DayBreakdown; maxCost: number; period: Period }): React.JSX.Element {
  const barPct = maxCost > 0 ? Math.min(100, (d.estimatedCostUsd / maxCost) * 100) : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0' }}>
      <span style={{ color: '#c8c8e8', minWidth: period === 'week' ? 86 : 60, fontSize: 13 }}>{dayLabel(d.date, period)}</span>
      <div style={{ flex: 1, background: '#1e1e2e', borderRadius: 3, height: 3 }}>
        <div style={{ width: `${barPct}%`, height: 3, background: '#7c83fd', borderRadius: 3, transition: 'width 0.4s ease', minWidth: barPct > 0 ? 3 : 0 }} />
      </div>
      <span style={{ color: '#7c83fd', minWidth: 46, textAlign: 'right', fontSize: 13, fontWeight: 600 }}>${d.estimatedCostUsd.toFixed(2)}</span>
    </div>
  )
}

interface UsageWidgetProps {
  data: UsageData
}

export function UsageWidget({ data }: UsageWidgetProps): React.JSX.Element {
  const { todayTotals, weeklyTotals, monthlyTotals, activeSessions } = data
  const isLive = activeSessions.length > 0
  const [period, setPeriod] = useState<Period>('day')
  const [view, setView] = useState<'main' | 'settings'>('main')

  const totals: PeriodTotals = period === 'day' ? todayTotals : period === 'week' ? weeklyTotals : monthlyTotals
  const { modelBreakdown, dailyBreakdown } = totals
  const heatmapGridStart = (() => {
    const t = new Date()
    const d = new Date(t)
    d.setUTCDate(t.getUTCDate() - t.getUTCDay() - 12 * 7)
    return d.toISOString().slice(0, 10)
  })()
  const estimatedCostUsd = period === 'heatmap'
    ? data.heatmapData.filter(d => d.date >= heatmapGridStart).reduce((sum, d) => sum + d.estimatedCostUsd, 0)
    : totals.estimatedCostUsd

  const rows = period === 'day' ? modelBreakdown : period === 'heatmap' ? [] : dailyBreakdown
  const maxDayCost = dailyBreakdown.length > 0 ? Math.max(...dailyBreakdown.map(d => d.estimatedCostUsd)) : 0

  useEffect(() => {
    cw()?.resizeWindow(MAX_HEIGHT)
  }, [])

  useEffect(() => {
    cw()?.onSwitchView((view: string) => {
      if (['day', 'week', 'month', 'heatmap'].includes(view)) {
        setPeriod(view as Period)
      }
    })
    return () => cw()?.removeSwitchViewListeners()
  }, [])

  return (
    <div className="drag" style={{
      width: '100%', height: '100%', boxSizing: 'border-box', padding: 16,
      background: 'rgba(13, 13, 23, 0.94)',
      border: '1px solid rgba(124,131,253,0.20)',
      borderRadius: 16,
      fontFamily: 'system-ui, -apple-system, sans-serif',
      color: '#e0e0e0',
      backdropFilter: 'blur(14px)',
      userSelect: 'none',
      display: 'flex', flexDirection: 'column', gap: 0
    }}>

      {/* Traffic lights + gear/back */}
      <div style={{ display: 'flex', alignItems: 'center', paddingBottom: 8, marginBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <TrafficLights />
        <span style={{ flex: 1 }} />
        {view === 'settings' ? (
          <button
            aria-label="Back"
            className="no-drag"
            onClick={() => setView('main')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', display: 'flex', alignItems: 'center' }}
          >
            <img src={arrowLeftIcon} style={{ width: 14, height: 14, filter: 'invert(1) opacity(0.8)' }} alt="" />
          </button>
        ) : (
          <button
            aria-label="Settings"
            className="no-drag"
            onClick={() => setView('settings')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', display: 'flex', alignItems: 'center' }}
          >
            <img src={settingsIcon} style={{ width: 14, height: 14, filter: 'invert(1) opacity(0.8)' }} alt="" />
          </button>
        )}
      </div>

      {view === 'settings' ? (
        <SettingsPanel />
      ) : (
        <>
          {/* Logo + tabs + cost */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <img src={claudeWidgetLogo} style={{ height: 18, width: 18, borderRadius: 4 }} alt="" />
            <div className="no-drag" style={{ display: 'flex', gap: 2 }}>
              {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
                <button key={p} onClick={() => setPeriod(p)} style={{
                  background: period === p ? 'rgba(124,131,253,0.25)' : 'transparent',
                  border: 'none', borderRadius: 4,
                  color: period === p ? '#7c83fd' : '#444',
                  cursor: 'pointer', fontSize: 12, fontWeight: 700, padding: '2px 6px', transition: 'all 0.15s',
                }}>
                  {PERIOD_LABELS[p]}
                </button>
              ))}
            </div>
            <span style={{ flex: 1 }} />
            <span style={{ color: '#4ecca3', fontSize: 18, fontWeight: 600, letterSpacing: '-0.5px' }}>
              ${estimatedCostUsd.toFixed(2)}
            </span>
            {isLive && period === 'day' && <span style={{ color: '#4ecca3', fontSize: 8, marginLeft: 2 }}>●</span>}
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '10px 0 6px' }} />

          {/* Model / day rows */}
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {period === 'heatmap' ? (
          <HeatmapGrid data={data.heatmapData} />
        ) : rows.length === 0 ? (
          <div style={{ color: '#444', fontSize: 12, textAlign: 'center', padding: '10px 0' }}>
            {PERIOD_EMPTY[period as keyof typeof PERIOD_EMPTY]}
          </div>
        ) : period === 'day' ? (
          modelBreakdown.map(m => <ModelRow key={m.model} m={m} totalCost={estimatedCostUsd} />)
        ) : (
          dailyBreakdown.map(d => <DayRow key={d.date} d={d} maxCost={maxDayCost} period={period} />)
        )}
          </div>
        </>
      )}
    </div>
  )
}
