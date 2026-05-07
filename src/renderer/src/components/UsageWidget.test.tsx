import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { UsageWidget } from './UsageWidget'
import type { UsageData } from '../../../shared/types'

const emptyPeriod = {
  tokens: { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 },
  estimatedCostUsd: 0,
  modelBreakdown: [],
  dailyBreakdown: []
}

const base: UsageData = {
  activeSessions: [],
  todayTotals: { ...emptyPeriod, sessionCount: 0, messageCount: 0 },
  weeklyTotals: emptyPeriod,
  monthlyTotals: emptyPeriod,
  heatmapData: [],
  contextPercent: 0,
  lastUpdated: Date.now()
}

const withModels: UsageData = {
  activeSessions: [{ sessionId: 's1', projectSlug: 'p', model: 'claude-sonnet-4-6', startedAt: 0, tokens: { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 }, estimatedCostUsd: 0 }],
  todayTotals: {
    tokens: { inputTokens: 1000, outputTokens: 5000, cacheCreationTokens: 2000, cacheReadTokens: 0 },
    estimatedCostUsd: 22.31,
    sessionCount: 2,
    messageCount: 30,
    modelBreakdown: [
      { model: 'claude-sonnet-4-6', tokens: { inputTokens: 1000, outputTokens: 5000, cacheCreationTokens: 2000, cacheReadTokens: 0 }, estimatedCostUsd: 21.87, contextPercent: 4 },
      { model: 'claude-haiku-4-5',  tokens: { inputTokens: 200,  outputTokens: 800,  cacheCreationTokens: 0,    cacheReadTokens: 0 }, estimatedCostUsd: 0.44,  contextPercent: 1 }
    ],
    dailyBreakdown: [{ date: '2026-05-07', estimatedCostUsd: 22.31 }]
  },
  weeklyTotals: {
    tokens: { inputTokens: 5000, outputTokens: 20000, cacheCreationTokens: 8000, cacheReadTokens: 0 },
    estimatedCostUsd: 89.50,
    modelBreakdown: [
      { model: 'claude-sonnet-4-6', tokens: { inputTokens: 5000, outputTokens: 20000, cacheCreationTokens: 8000, cacheReadTokens: 0 }, estimatedCostUsd: 89.50, contextPercent: 16 }
    ],
    dailyBreakdown: [
      { date: '2026-05-05', estimatedCostUsd: 30.10 },
      { date: '2026-05-06', estimatedCostUsd: 37.20 },
      { date: '2026-05-07', estimatedCostUsd: 22.20 }
    ]
  },
  monthlyTotals: {
    tokens: { inputTokens: 20000, outputTokens: 80000, cacheCreationTokens: 32000, cacheReadTokens: 0 },
    estimatedCostUsd: 358.00,
    modelBreakdown: [
      { model: 'claude-sonnet-4-6', tokens: { inputTokens: 20000, outputTokens: 80000, cacheCreationTokens: 32000, cacheReadTokens: 0 }, estimatedCostUsd: 358.00, contextPercent: 26 }
    ],
    dailyBreakdown: [
      { date: '2026-01', estimatedCostUsd: 120.50 },
      { date: '2026-04', estimatedCostUsd: 98.30 },
      { date: '2026-05', estimatedCostUsd: 89.70 }
    ]
  },
  heatmapData: [],
  contextPercent: 4,
  lastUpdated: Date.now()
}

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

describe('UsageWidget', () => {
  it('shows total cost', () => {
    render(<UsageWidget data={withModels} />)
    expect(screen.getByText('$22.31')).toBeTruthy()
  })

  it('shows short model names', () => {
    render(<UsageWidget data={withModels} />)
    expect(screen.getByText('Sonnet 4.6')).toBeTruthy()
    expect(screen.getByText('Haiku 4.5')).toBeTruthy()
  })

  it('shows per-model costs', () => {
    render(<UsageWidget data={withModels} />)
    expect(screen.getByText('$21.87')).toBeTruthy()
    expect(screen.getByText('$0.44')).toBeTruthy()
  })

  it('shows live indicator when active session exists', () => {
    const { container } = render(<UsageWidget data={withModels} />)
    expect(container.textContent).toContain('●')
  })

  it('hides live indicator when no active sessions', () => {
    const { container } = render(<UsageWidget data={base} />)
    expect(container.textContent).not.toContain('●')
  })

  it('shows empty state when no model breakdown', () => {
    render(<UsageWidget data={base} />)
    expect(screen.getByText('No usage today')).toBeTruthy()
  })

  it('switches to weekly day breakdown when W is clicked', () => {
    render(<UsageWidget data={withModels} />)
    fireEvent.click(screen.getByText('W'))
    expect(screen.getByText('$89.50')).toBeTruthy()
    // 2026-05-05 is Tuesday → "May 5 (T)"
    expect(screen.getByText('May 5 (T)')).toBeTruthy()
  })

  it('switches to monthly breakdown when M is clicked', () => {
    render(<UsageWidget data={withModels} />)
    fireEvent.click(screen.getByText('M'))
    expect(screen.getByText('$358.00')).toBeTruthy()
    expect(screen.getByText('2026-01')).toBeTruthy()
    expect(screen.getByText('2026-05')).toBeTruthy()
  })

  it('shows correct empty label per period', () => {
    render(<UsageWidget data={base} />)
    fireEvent.click(screen.getByText('W'))
    expect(screen.getByText('No usage this week')).toBeTruthy()
    fireEvent.click(screen.getByText('M'))
    expect(screen.getByText('No usage this month')).toBeTruthy()
  })

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

  it('switches period when switch-view event is received', async () => {
    let switchCallback: ((view: string) => void) | null = null
    ;(window as any).claudeWidget = {
      ...(window as any).claudeWidget,
      resizeWindow: vi.fn(),
      onSwitchView: (cb: (view: string) => void) => { switchCallback = cb },
      removeSwitchViewListeners: vi.fn(),
    }

    render(<UsageWidget data={base} />)

    expect(screen.getByRole('button', { name: 'D' })).toBeInTheDocument()

    // Simulate shortcut firing the switch-view IPC
    ;(switchCallback as ((view: string) => void) | null)?.('week')
    await waitFor(() => {
      expect(screen.getByText('No usage this week')).toBeInTheDocument()
    })
  })

  it('clicking gear button shows settings panel', async () => {
    ;(window as any).claudeWidget = {
      resizeWindow: vi.fn(),
      onSwitchView: vi.fn(),
      removeSwitchViewListeners: vi.fn(),
      getSettings: vi.fn().mockResolvedValue({
        alwaysOnTop: true,
        claudeDataPath: '',
        shortcuts: { day: 'CommandOrControl+1', week: 'CommandOrControl+2', month: 'CommandOrControl+3', heatmap: 'CommandOrControl+4' }
      }),
    }
    render(<UsageWidget data={base} />)
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    await waitFor(() => expect(screen.getByText('Always on Top')).toBeInTheDocument())
    expect(screen.queryByText('D')).not.toBeInTheDocument()
  })

  it('clicking back button returns to main view', async () => {
    ;(window as any).claudeWidget = {
      resizeWindow: vi.fn(),
      onSwitchView: vi.fn(),
      removeSwitchViewListeners: vi.fn(),
      getSettings: vi.fn().mockResolvedValue({
        alwaysOnTop: true,
        claudeDataPath: '',
        shortcuts: { day: 'CommandOrControl+1', week: 'CommandOrControl+2', month: 'CommandOrControl+3', heatmap: 'CommandOrControl+4' }
      }),
    }
    render(<UsageWidget data={base} />)
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    await waitFor(() => screen.getByRole('button', { name: 'Back' }))
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'D' })).toBeInTheDocument())
  })
})
