import { useState, useEffect } from 'react'
import type { UsageData } from '../../../shared/types'

const EMPTY_PERIOD = {
  tokens: { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 },
  estimatedCostUsd: 0,
  modelBreakdown: [],
  dailyBreakdown: []
}

const EMPTY_USAGE: UsageData = {
  activeSessions: [],
  todayTotals: { ...EMPTY_PERIOD, sessionCount: 0, messageCount: 0 },
  weeklyTotals: EMPTY_PERIOD,
  monthlyTotals: EMPTY_PERIOD,
  heatmapData: [],
  contextPercent: 0,
  lastUpdated: 0
}

export function useUsageData(): UsageData {
  const [data, setData] = useState<UsageData>(EMPTY_USAGE)

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ipc = (window as any).require?.('electron')?.ipcRenderer
    if (!ipc) return

    const handler = (_: unknown, d: UsageData): void => setData(d)
    ipc.on('usage-update', handler)

    // Pull initial snapshot — did-finish-load can fire before this effect runs
    ipc.invoke('get-usage').then((d: UsageData | null) => { if (d) setData(d) })

    return () => ipc.removeListener('usage-update', handler)
  }, [])

  return data
}
