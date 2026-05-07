/// <reference types="vite/client" />

import type { UsageData } from '../../../shared/types'

declare global {
  interface Window {
    claudeWidget: {
      onUsageUpdate: (callback: (data: UsageData) => void) => void
      removeUsageListeners: () => void
    }
  }
}
