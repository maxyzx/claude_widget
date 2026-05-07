import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useUsageData } from './use-usage-data'
import type { UsageData } from '../../../shared/types'

const emptyPeriod = {
  tokens: { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 },
  estimatedCostUsd: 0,
  modelBreakdown: [],
  dailyBreakdown: []
}

const mockUsage: UsageData = {
  activeSessions: [],
  todayTotals: {
    tokens: { inputTokens: 100, outputTokens: 50, cacheCreationTokens: 0, cacheReadTokens: 0 },
    estimatedCostUsd: 0.42,
    sessionCount: 1,
    messageCount: 10,
    modelBreakdown: [],
    dailyBreakdown: []
  },
  weeklyTotals: emptyPeriod,
  monthlyTotals: emptyPeriod,
  heatmapData: [],
  contextPercent: 42,
  lastUpdated: Date.now()
}

// Mock window.require to simulate Electron's ipcRenderer in jsdom
let ipcHandler: ((_: unknown, d: UsageData) => void) | null = null
const mockIpcRenderer = {
  on: vi.fn((_channel: string, handler: (_: unknown, d: UsageData) => void) => {
    ipcHandler = handler
  }),
  removeListener: vi.fn(),
  invoke: vi.fn().mockResolvedValue(null)
}

beforeEach(() => {
  ipcHandler = null
  mockIpcRenderer.on.mockClear()
  mockIpcRenderer.removeListener.mockClear()
  mockIpcRenderer.invoke.mockClear()
  ;(window as any).require = vi.fn(() => ({ ipcRenderer: mockIpcRenderer }))
})

describe('useUsageData', () => {
  it('returns empty state initially', () => {
    const { result } = renderHook(() => useUsageData())
    expect(result.current.contextPercent).toBe(0)
  })

  it('updates state when IPC fires', () => {
    const { result } = renderHook(() => useUsageData())
    act(() => { ipcHandler?.(null, mockUsage) })
    expect(result.current.contextPercent).toBe(42)
    expect(result.current.todayTotals.estimatedCostUsd).toBe(0.42)
  })
})
