import { MODEL_PRICING, MODEL_MAX_CONTEXT, normalizeModelName } from '../shared/types'
import type { TokenUsage } from '../shared/types'

interface ParsedLine {
  model: string
  tokens: TokenUsage
}

export function parseJSONLLine(line: string): ParsedLine | null {
  try {
    const entry = JSON.parse(line)
    if (entry.type !== 'assistant') return null
    const msg = entry.message
    if (!msg?.usage) return null
    const u = msg.usage
    return {
      model: normalizeModelName(msg.model ?? 'default'),
      tokens: {
        inputTokens: u.input_tokens ?? 0,
        outputTokens: u.output_tokens ?? 0,
        cacheCreationTokens: u.cache_creation_input_tokens ?? 0,
        cacheReadTokens: u.cache_read_input_tokens ?? 0
      }
    }
  } catch {
    return null
  }
}

export function computeCost(tokens: TokenUsage, model: string): number {
  const pricing = MODEL_PRICING[normalizeModelName(model)] ?? MODEL_PRICING['default']
  const M = 1_000_000
  return (
    (tokens.inputTokens * pricing.input) / M +
    (tokens.outputTokens * pricing.output) / M +
    (tokens.cacheCreationTokens * pricing.cacheWrite) / M +
    (tokens.cacheReadTokens * pricing.cacheRead) / M
  )
}

export function computeContextPercent(tokens: TokenUsage, model: string): number {
  const maxContext = MODEL_MAX_CONTEXT[normalizeModelName(model)] ?? MODEL_MAX_CONTEXT['default']
  const used = tokens.inputTokens + tokens.cacheCreationTokens
  return Math.min(100, Math.round((used / maxContext) * 100))
}

export function accumulateTokens(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheCreationTokens: a.cacheCreationTokens + b.cacheCreationTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens
  }
}
