export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
}

export interface SessionData {
  sessionId: string
  projectSlug: string
  model: string
  startedAt: number
  tokens: TokenUsage
  estimatedCostUsd: number
}

export interface ModelDayStats {
  model: string
  tokens: TokenUsage
  estimatedCostUsd: number
  contextPercent: number
}

export interface DayBreakdown {
  date: string           // YYYY-MM-DD
  estimatedCostUsd: number
}

export interface HeatmapDay {
  date: string             // YYYY-MM-DD
  totalTokens: number      // input + output + cacheCreation + cacheRead
  estimatedCostUsd: number
}

export interface PeriodTotals {
  tokens: TokenUsage
  estimatedCostUsd: number
  modelBreakdown: ModelDayStats[]
  dailyBreakdown: DayBreakdown[]  // per-day cost within this period, sorted chronologically
}

export interface UsageData {
  activeSessions: SessionData[]
  todayTotals: PeriodTotals & { sessionCount: number; messageCount: number }
  weeklyTotals: PeriodTotals
  monthlyTotals: PeriodTotals
  heatmapData: HeatmapDay[]  // last 90 days with activity, sorted chronologically
  contextPercent: number
  lastUpdated: number
}

export const MODEL_PRICING: Record<string, {
  input: number; output: number; cacheWrite: number; cacheRead: number
}> = {
  'claude-sonnet-4-6': { input: 3.00, output: 15.00, cacheWrite: 3.75,  cacheRead: 0.30 },
  'claude-opus-4-7':   { input: 5.00, output: 25.00, cacheWrite: 6.25,  cacheRead: 0.50 },
  'claude-haiku-4-5':  { input: 1.00, output: 5.00,  cacheWrite: 1.25,  cacheRead: 0.10 },
  default:             { input: 3.00, output: 15.00, cacheWrite: 3.75,  cacheRead: 0.30 }
}

// Normalize model names with date suffixes (e.g. claude-haiku-4-5-20251001 → claude-haiku-4-5)
export function normalizeModelName(model: string): string {
  for (const key of Object.keys(MODEL_PRICING)) {
    if (key !== 'default' && model.startsWith(key)) return key
  }
  return model
}

export const MODEL_MAX_CONTEXT: Record<string, number> = {
  'claude-sonnet-4-6': 200_000,
  'claude-opus-4-7':   200_000,
  'claude-haiku-4-5':  200_000,
  default:             200_000
}

export interface AppSettings {
  alwaysOnTop: boolean
  claudeDataPath: string   // empty string = use default (~/.claude)
  shortcuts: {
    day: string
    week: string
    month: string
    heatmap: string
  }
}

export const DEFAULT_SETTINGS: AppSettings = {
  alwaysOnTop: true,
  claudeDataPath: '',
  shortcuts: {
    day: 'CommandOrControl+1',
    week: 'CommandOrControl+2',
    month: 'CommandOrControl+3',
    heatmap: 'CommandOrControl+4'
  }
}

export interface StoreSchema {
  windowPos: { x: number; y: number }
  settings: AppSettings
}
