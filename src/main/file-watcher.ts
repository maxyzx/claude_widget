import chokidar from 'chokidar'
import { readFileSync, statSync, readdirSync } from 'fs'
import { homedir } from 'os'
import { join, resolve } from 'path'
import type { TokenUsage, UsageData, SessionData, PeriodTotals, ModelDayStats, HeatmapDay } from '../shared/types'
import { normalizeModelName } from '../shared/types'
import { parseJSONLLine, accumulateTokens, computeCost, computeContextPercent } from './usage-parser'

export function buildEmptyTokenUsage(): TokenUsage {
  return { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 }
}

export function readNewLines(filePath: string, fromOffset: number): { lines: string[]; newOffset: number } {
  try {
    const stat = statSync(filePath)
    if (stat.size <= fromOffset) return { lines: [], newOffset: fromOffset }
    const buf = readFileSync(filePath)
    const chunk = buf.slice(fromOffset, stat.size).toString('utf8')
    const lines = chunk.split('\n').filter(l => l.trim().length > 0)
    return { lines, newOffset: stat.size }
  } catch {
    return { lines: [], newOffset: fromOffset }
  }
}

export function isSessionAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function readActiveSessions(claudeDir: string): Map<string, { pid: number; cwd: string; startedAt: number }> {
  const sessionsDir = join(claudeDir, 'sessions')
  const result = new Map()
  try {
    const files: string[] = readdirSync(sessionsDir).filter((f: string) => f.endsWith('.json'))
    for (const f of files) {
      try {
        const data = JSON.parse(readFileSync(join(sessionsDir, f), 'utf8'))
        if (data.sessionId && isSessionAlive(data.pid)) {
          result.set(data.sessionId, { pid: data.pid, cwd: data.cwd, startedAt: data.startedAt })
        }
      } catch { /* skip malformed */ }
    }
  } catch { /* sessions dir missing */ }
  return result
}

export function cwdToProjectSlug(cwd: string): string {
  return cwd.replace(/[/_.]/g, '-')
}

interface PeriodAccumulator {
  seen: Set<string>
  modelTotals: Map<string, { tokens: TokenUsage; estimatedCostUsd: number }>
  dayTotals: Map<string, number>  // YYYY-MM-DD → cost
}

function createAccumulator(): PeriodAccumulator {
  return { seen: new Set(), modelTotals: new Map(), dayTotals: new Map() }
}

export interface HeatmapAccumulator {
  seen: Set<string>
  dayData: Map<string, { totalTokens: number; estimatedCostUsd: number }>
}

function createHeatmapAccumulator(): HeatmapAccumulator {
  return { seen: new Set(), dayData: new Map() }
}

function accumulateIntoPeriod(
  acc: PeriodAccumulator,
  dedupKey: string | null,
  model: string,
  tokens: TokenUsage,
  dateStr: string
): void {
  if (dedupKey) {
    if (acc.seen.has(dedupKey)) return
    acc.seen.add(dedupKey)
  }
  const cost = computeCost(tokens, model)
  const existing = acc.modelTotals.get(model) ?? { tokens: buildEmptyTokenUsage(), estimatedCostUsd: 0 }
  acc.modelTotals.set(model, {
    tokens: accumulateTokens(existing.tokens, tokens),
    estimatedCostUsd: existing.estimatedCostUsd + cost
  })
  acc.dayTotals.set(dateStr, (acc.dayTotals.get(dateStr) ?? 0) + cost)
}

// Compute ISO Monday date string (YYYY-MM-DD) for the current UTC week
function getWeekStartStr(): string {
  const now = new Date()
  const day = now.getUTCDay() // 0=Sun
  const daysToMonday = day === 0 ? 6 : day - 1
  const monday = new Date(now)
  monday.setUTCDate(now.getUTCDate() - daysToMonday)
  return monday.toISOString().slice(0, 10)
}


function buildPeriodTotals(acc: PeriodAccumulator): PeriodTotals {
  let tokens = buildEmptyTokenUsage()
  let estimatedCostUsd = 0
  const modelBreakdown: ModelDayStats[] = []
  for (const [model, data] of acc.modelTotals.entries()) {
    tokens = accumulateTokens(tokens, data.tokens)
    estimatedCostUsd += data.estimatedCostUsd
    modelBreakdown.push({
      model,
      tokens: data.tokens,
      estimatedCostUsd: data.estimatedCostUsd,
      contextPercent: computeContextPercent(data.tokens, model)
    })
  }
  modelBreakdown.sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd)

  const dailyBreakdown = Array.from(acc.dayTotals.entries())
    .map(([date, cost]) => ({ date, estimatedCostUsd: cost }))
    .sort((a, b) => a.date.localeCompare(b.date))

  return { tokens, estimatedCostUsd, modelBreakdown, dailyBreakdown }
}

// Single-pass processing: bin each entry into daily/weekly/monthly accumulators.
// Monthly covers all history (no cutoff); its dayTotals keys are YYYY-MM (grouped by month).
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
  const currentOffset = fileOffsets.get(filePath) ?? 0
  const { lines, newOffset } = readNewLines(filePath, currentOffset)
  fileOffsets.set(filePath, newOffset)

  for (const line of lines) {
    let entry: Record<string, unknown>
    try { entry = JSON.parse(line) } catch { continue }
    if (entry.type !== 'assistant') continue
    const ts = typeof entry.timestamp === 'string' ? entry.timestamp : ''
    const dateStr = ts.slice(0, 10)
    if (!dateStr) continue

    const msg = entry.message as Record<string, unknown> | undefined
    if (!msg?.usage) continue

    const messageId = typeof msg.id === 'string' ? msg.id : null
    const requestId = typeof entry.requestId === 'string' ? entry.requestId : null
    const dedupKey = messageId && requestId ? `${messageId}:${requestId}` : null

    const u = msg.usage as Record<string, number>
    const model = normalizeModelName((typeof msg.model === 'string' ? msg.model : null) ?? 'default')
    const tokens: TokenUsage = {
      inputTokens: u.input_tokens ?? 0,
      outputTokens: u.output_tokens ?? 0,
      cacheCreationTokens: u.cache_creation_input_tokens ?? 0,
      cacheReadTokens: u.cache_read_input_tokens ?? 0
    }

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
  }
}

function scanSessionFile(
  filePath: string,
  offsets: Map<string, number>
): { tokens: TokenUsage; model: string; newOffset: number } {
  const currentOffset = offsets.get(filePath) ?? 0
  const { lines, newOffset } = readNewLines(filePath, currentOffset)
  let tokens = buildEmptyTokenUsage()
  let model = 'claude-sonnet-4-6'
  for (const line of lines) {
    const parsed = parseJSONLLine(line)
    if (!parsed) continue
    model = parsed.model
    tokens = accumulateTokens(tokens, parsed.tokens)
  }
  return { tokens, model, newOffset }
}

type OnUpdateFn = (data: UsageData) => void

export interface FileWatcher {
  stop: () => void
  forceUpdate: () => void
}

export function startFileWatcher(onUpdate: OnUpdateFn, claudeDataPath?: string): FileWatcher {
  const CLAUDE_DIR = claudeDataPath || join(homedir(), '.claude')
  const projectsDir = join(CLAUDE_DIR, 'projects')
  const fileOffsets = new Map<string, number>()
  const sessionTokens = new Map<string, { tokens: TokenUsage; model: string }>()
  const allFileOffsets = new Map<string, number>()

  const todayStr = new Date().toISOString().slice(0, 10)
  const weekStartStr = getWeekStartStr()

  const dailyAcc = createAccumulator()
  const weeklyAcc = createAccumulator()
  const monthlyAcc = createAccumulator()
  const heatmapAcc = createHeatmapAccumulator()

  // Startup scan: recursively process all JSONL files into all three period accumulators
  try {
    const allJsonlFiles = readdirSync(projectsDir, { recursive: true, encoding: 'utf8' }) as string[]
    for (const rel of allJsonlFiles) {
      if (!rel.endsWith('.jsonl')) continue
      processFileForPeriods(
        resolve(projectsDir, rel),
        allFileOffsets,
        dailyAcc, weeklyAcc, monthlyAcc,
        heatmapAcc,
        todayStr, weekStartStr
      )
    }
  } catch { /* projects dir missing */ }

  const buildSnapshot = (): UsageData => {
    const activeSessions = readActiveSessions(CLAUDE_DIR)
    const todayStr2 = new Date().toISOString().slice(0, 10)
    const sessions: SessionData[] = []

    for (const [sessionId, meta] of activeSessions) {
      const slug = cwdToProjectSlug(meta.cwd)
      const sessionFile = join(projectsDir, slug, `${sessionId}.jsonl`)
      const { tokens: newTokens, model, newOffset } = scanSessionFile(sessionFile, fileOffsets)
      fileOffsets.set(sessionFile, newOffset)

      const existing = sessionTokens.get(sessionId) ?? { tokens: buildEmptyTokenUsage(), model }
      const accumulated = accumulateTokens(existing.tokens, newTokens)
      sessionTokens.set(sessionId, { tokens: accumulated, model })

      sessions.push({
        sessionId,
        projectSlug: slug,
        model,
        startedAt: meta.startedAt,
        tokens: accumulated,
        estimatedCostUsd: computeCost(accumulated, model)
      })
    }

    let messageCount = 0
    try {
      const cache = JSON.parse(readFileSync(join(CLAUDE_DIR, 'stats-cache.json'), 'utf8'))
      const today = cache.dailyActivity?.find((d: { date: string }) => d.date === todayStr2)
      messageCount = today?.messageCount ?? 0
    } catch { /* ignore */ }

    const primarySession = sessions[0]
    const contextPercent = primarySession
      ? computeContextPercent(primarySession.tokens, primarySession.model)
      : 0

    const dayTotals = buildPeriodTotals(dailyAcc)

    const cutoff = new Date()
    cutoff.setUTCDate(cutoff.getUTCDate() - 90)
    const cutoffStr = cutoff.toISOString().slice(0, 10)

    const heatmapData: HeatmapDay[] = Array.from(heatmapAcc.dayData.entries())
      .filter(([date]) => date >= cutoffStr)
      .map(([date, { totalTokens, estimatedCostUsd }]) => ({ date, totalTokens, estimatedCostUsd }))
      .sort((a, b) => a.date.localeCompare(b.date))

    return {
      activeSessions: sessions,
      todayTotals: { ...dayTotals, sessionCount: sessions.length, messageCount },
      weeklyTotals: buildPeriodTotals(weeklyAcc),
      monthlyTotals: buildPeriodTotals(monthlyAcc),
      heatmapData,
      contextPercent,
      lastUpdated: Date.now()
    }
  }

  const forceUpdate = (): void => onUpdate(buildSnapshot())

  forceUpdate()

  const watcher = chokidar.watch(`${projectsDir}/**/*.jsonl`, {
    ignoreInitial: true,
    persistent: true,
    usePolling: false
  })

  watcher.on('change', (filePath: string) => {
    processFileForPeriods(filePath, allFileOffsets, dailyAcc, weeklyAcc, monthlyAcc, heatmapAcc, todayStr, weekStartStr)
    onUpdate(buildSnapshot())
  })
  watcher.on('add', (filePath: string) => {
    processFileForPeriods(filePath, allFileOffsets, dailyAcc, weeklyAcc, monthlyAcc, heatmapAcc, todayStr, weekStartStr)
    onUpdate(buildSnapshot())
  })

  return {
    stop: () => { watcher.close() },
    forceUpdate,
  }
}
