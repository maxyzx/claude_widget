import { describe, it, expect } from 'vitest'
import { parseJSONLLine, computeCost, computeContextPercent, accumulateTokens } from '../src/main/usage-parser'
import type { TokenUsage } from '../src/shared/types'

describe('parseJSONLLine', () => {
  it('returns null for non-assistant messages', () => {
    const line = JSON.stringify({ type: 'user', message: {} })
    expect(parseJSONLLine(line)).toBeNull()
  })

  it('returns null for malformed JSON', () => {
    expect(parseJSONLLine('not-json')).toBeNull()
  })

  it('extracts token usage from assistant message', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: {
        model: 'claude-sonnet-4-6',
        usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 200, cache_read_input_tokens: 30 }
      }
    })
    expect(parseJSONLLine(line)).toEqual({
      model: 'claude-sonnet-4-6',
      tokens: { inputTokens: 100, outputTokens: 50, cacheCreationTokens: 200, cacheReadTokens: 30 }
    })
  })

  it('returns null when usage field is missing', () => {
    const line = JSON.stringify({ type: 'assistant', message: { model: 'claude-sonnet-4-6' } })
    expect(parseJSONLLine(line)).toBeNull()
  })
})

describe('computeCost', () => {
  it('computes cost correctly for sonnet pricing', () => {
    const tokens: TokenUsage = { inputTokens: 1_000_000, outputTokens: 1_000_000, cacheCreationTokens: 1_000_000, cacheReadTokens: 1_000_000 }
    expect(computeCost(tokens, 'claude-sonnet-4-6')).toBeCloseTo(22.05, 5)
  })

  it('uses default pricing for unknown model', () => {
    const tokens: TokenUsage = { inputTokens: 1_000_000, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 }
    expect(computeCost(tokens, 'unknown-model')).toBeCloseTo(3.00, 5)
  })
})

describe('computeContextPercent', () => {
  it('returns percent of context window used', () => {
    const tokens: TokenUsage = { inputTokens: 50_000, outputTokens: 1_000, cacheCreationTokens: 50_000, cacheReadTokens: 0 }
    expect(computeContextPercent(tokens, 'claude-sonnet-4-6')).toBe(50)
  })

  it('caps at 100', () => {
    const tokens: TokenUsage = { inputTokens: 200_000, outputTokens: 0, cacheCreationTokens: 200_000, cacheReadTokens: 0 }
    expect(computeContextPercent(tokens, 'claude-sonnet-4-6')).toBe(100)
  })
})

describe('accumulateTokens', () => {
  it('sums two TokenUsage objects', () => {
    const a: TokenUsage = { inputTokens: 10, outputTokens: 5, cacheCreationTokens: 3, cacheReadTokens: 2 }
    const b: TokenUsage = { inputTokens: 20, outputTokens: 10, cacheCreationTokens: 6, cacheReadTokens: 4 }
    expect(accumulateTokens(a, b)).toEqual({ inputTokens: 30, outputTokens: 15, cacheCreationTokens: 9, cacheReadTokens: 6 })
  })
})
