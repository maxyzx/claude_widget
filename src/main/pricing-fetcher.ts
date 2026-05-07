import { MODEL_PRICING } from '../shared/types'

const LITELLM_URL =
  'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json'

interface LiteLLMEntry {
  input_cost_per_token?: number
  output_cost_per_token?: number
  cache_creation_input_token_cost?: number
  cache_read_input_token_cost?: number
}

// Fetch latest Claude model pricing from LiteLLM and merge into MODEL_PRICING.
// Returns true if at least one model was updated.
export async function fetchAndUpdatePricing(): Promise<boolean> {
  try {
    const res = await fetch(LITELLM_URL, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return false
    const data = (await res.json()) as Record<string, LiteLLMEntry>
    const M = 1_000_000
    let updated = 0
    for (const [model, entry] of Object.entries(data)) {
      if (!model.startsWith('claude-')) continue
      if (entry.input_cost_per_token == null) continue
      MODEL_PRICING[model] = {
        input: entry.input_cost_per_token * M,
        output: (entry.output_cost_per_token ?? 0) * M,
        cacheWrite: (entry.cache_creation_input_token_cost ?? 0) * M,
        cacheRead: (entry.cache_read_input_token_cost ?? 0) * M,
      }
      updated++
    }
    return updated > 0
  } catch {
    return false
  }
}
