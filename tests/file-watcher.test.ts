import { describe, it, expect } from 'vitest'
import { readNewLines, isSessionAlive, buildEmptyTokenUsage, cwdToProjectSlug, processFileForPeriods } from '../src/main/file-watcher'
import type { HeatmapAccumulator } from '../src/main/file-watcher'
import { writeFileSync, readFileSync, mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { TokenUsage } from '../src/shared/types'

// Helper: run processFileForPeriods targeting only the daily accumulator
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

describe('readNewLines', () => {
  it('reads lines added after a given byte offset', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fwtest-'))
    const file = join(dir, 'session.jsonl')
    writeFileSync(file, 'line1\nline2\n')
    const { lines: first, newOffset } = readNewLines(file, 0)
    expect(first).toEqual(['line1', 'line2'])
    writeFileSync(file, 'line1\nline2\nline3\n')
    const { lines: second } = readNewLines(file, newOffset)
    expect(second).toEqual(['line3'])
  })

  it('returns empty array when no new content', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fwtest-'))
    const file = join(dir, 'session.jsonl')
    writeFileSync(file, 'line1\n')
    const { lines, newOffset } = readNewLines(file, 0)
    const { lines: second } = readNewLines(file, newOffset)
    expect(second).toEqual([])
  })
})

describe('buildEmptyTokenUsage', () => {
  it('returns zeroed token usage', () => {
    expect(buildEmptyTokenUsage()).toEqual({
      inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0
    })
  })
})

describe('isSessionAlive', () => {
  it('returns true for the current process', () => {
    expect(isSessionAlive(process.pid)).toBe(true)
  })

  it('returns false for invalid PID', () => {
    expect(isSessionAlive(999999999)).toBe(false)
  })
})

describe('cwdToProjectSlug', () => {
  it('converts absolute path with slashes to dashes', () => {
    expect(cwdToProjectSlug('/Users/alice/Documents/projects/claude_widget'))
      .toBe('-Users-alice-Documents-projects-claude-widget')
  })

  it('replaces dots and underscores as well as slashes', () => {
    expect(cwdToProjectSlug('/home/user/my.project_name'))
      .toBe('-home-user-my-project-name')
  })

  it('handles simple paths', () => {
    expect(cwdToProjectSlug('/simple/path')).toBe('-simple-path')
  })
})

describe('processFileForToday', () => {
  const TODAY = new Date().toISOString().split('T')[0]
  const YESTERDAY = new Date(Date.now() - 86_400_000).toISOString().split('T')[0]

  function makeAssistantLine(model: string, date: string, tokens: Partial<TokenUsage> = {}): string {
    return JSON.stringify({
      type: 'assistant',
      timestamp: `${date}T10:00:00.000Z`,
      message: {
        model,
        usage: {
          input_tokens: tokens.inputTokens ?? 100,
          output_tokens: tokens.outputTokens ?? 50,
          cache_creation_input_tokens: tokens.cacheCreationTokens ?? 0,
          cache_read_input_tokens: tokens.cacheReadTokens ?? 0
        }
      }
    })
  }

  it('accumulates tokens for today entries by model', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fwtest-'))
    const file = join(dir, 'session.jsonl')
    writeFileSync(file, [
      makeAssistantLine('claude-sonnet-4-6', TODAY),
      makeAssistantLine('claude-sonnet-4-6', TODAY, { inputTokens: 200 }),
    ].join('\n') + '\n')

    const offsets = new Map<string, number>()
    const modelTotals = new Map<string, { tokens: TokenUsage; estimatedCostUsd: number }>()
    processFileForToday(file, TODAY, offsets, modelTotals)

    const sonnet = modelTotals.get('claude-sonnet-4-6')
    expect(sonnet).toBeDefined()
    expect(sonnet!.tokens.inputTokens).toBe(300) // 100 + 200
    expect(sonnet!.tokens.outputTokens).toBe(100) // 50 + 50
    expect(sonnet!.estimatedCostUsd).toBeGreaterThan(0)
  })

  it('ignores entries from other days', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fwtest-'))
    const file = join(dir, 'session.jsonl')
    writeFileSync(file, makeAssistantLine('claude-sonnet-4-6', YESTERDAY) + '\n')

    const offsets = new Map<string, number>()
    const modelTotals = new Map<string, { tokens: TokenUsage; estimatedCostUsd: number }>()
    processFileForToday(file, TODAY, offsets, modelTotals)

    expect(modelTotals.size).toBe(0)
  })

  it('only reads new lines on second call using offsets', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fwtest-'))
    const file = join(dir, 'session.jsonl')
    writeFileSync(file, makeAssistantLine('claude-sonnet-4-6', TODAY) + '\n')

    const offsets = new Map<string, number>()
    const modelTotals = new Map<string, { tokens: TokenUsage; estimatedCostUsd: number }>()
    processFileForToday(file, TODAY, offsets, modelTotals)

    // Append a second line
    const existing = readFileSync(file, 'utf8')
    writeFileSync(file, existing + makeAssistantLine('claude-haiku-4-5', TODAY) + '\n')
    processFileForToday(file, TODAY, offsets, modelTotals)

    expect(modelTotals.has('claude-haiku-4-5')).toBe(true)
    expect(modelTotals.get('claude-sonnet-4-6')!.tokens.inputTokens).toBe(100) // not 200
  })

  it('ignores non-assistant lines', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fwtest-'))
    const file = join(dir, 'session.jsonl')
    writeFileSync(file, JSON.stringify({ type: 'user', timestamp: `${TODAY}T10:00:00.000Z`, message: {} }) + '\n')

    const offsets = new Map<string, number>()
    const modelTotals = new Map<string, { tokens: TokenUsage; estimatedCostUsd: number }>()
    processFileForToday(file, TODAY, offsets, modelTotals)

    expect(modelTotals.size).toBe(0)
  })
})

function processFileForHeatmap(
  file: string,
  offsets: Map<string, number>
): Map<string, { totalTokens: number; estimatedCostUsd: number }> {
  const dummy1 = { seen: new Set<string>(), modelTotals: new Map(), dayTotals: new Map<string, number>() }
  const dummy2 = { seen: new Set<string>(), modelTotals: new Map(), dayTotals: new Map<string, number>() }
  const dummy3 = { seen: new Set<string>(), modelTotals: new Map(), dayTotals: new Map<string, number>() }
  const heatmap: HeatmapAccumulator = { seen: new Set(), dayData: new Map() }
  const anyDate = new Date().toISOString().slice(0, 10)
  processFileForPeriods(file, offsets, dummy1, dummy2, dummy3, heatmap, anyDate, anyDate)
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
