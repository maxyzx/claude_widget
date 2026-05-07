import { ipcMain, BrowserWindow, globalShortcut, dialog } from 'electron'
import { join } from 'path'
import { homedir } from 'os'
import Store from 'electron-store'
import { startFileWatcher } from './file-watcher'
import { fetchAndUpdatePricing } from './pricing-fetcher'
import type { UsageData, AppSettings, StoreSchema } from '../shared/types'
import { DEFAULT_SETTINGS } from '../shared/types'

type ViewKey = keyof AppSettings['shortcuts']
const ALL_VIEWS: ViewKey[] = ['day', 'week', 'month', 'heatmap']

function mergeSettings(stored: Partial<AppSettings> | undefined): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    shortcuts: { ...DEFAULT_SETTINGS.shortcuts, ...stored?.shortcuts }
  }
}

export function setupIpcHandlers(
  mainWindow: BrowserWindow,
  store: Store<StoreSchema>
): () => void {
  let latestSnapshot: UsageData | null = null

  const getSettings = (): AppSettings => mergeSettings(store.get('settings') as Partial<AppSettings> | undefined)
  const saveSettings = (patch: Partial<AppSettings>) => {
    const current = getSettings()
    store.set('settings', { ...current, ...patch })
  }
  const resolveDataPath = (s: AppSettings): string =>
    s.claudeDataPath || join(homedir(), '.claude')

  const onUpdate = (data: UsageData) => {
    latestSnapshot = data
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send('usage-update', data)
  }

  let watcher = startFileWatcher(onUpdate, resolveDataPath(getSettings()))

  fetchAndUpdatePricing().then((updated) => {
    if (updated) watcher.forceUpdate()
  })

  mainWindow.webContents.on('did-finish-load', () => {
    if (latestSnapshot && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('usage-update', latestSnapshot)
    }
  })

  // Register all global shortcuts
  const registerShortcuts = (settings: AppSettings) => {
    for (const view of ALL_VIEWS) {
      globalShortcut.register(settings.shortcuts[view], () => {
        if (!mainWindow.isDestroyed()) mainWindow.webContents.send('switch-view', view)
      })
    }
  }
  registerShortcuts(getSettings())

  // Existing handlers
  ipcMain.handle('get-usage', () => latestSnapshot)

  ipcMain.on('resize-window', (_event, height: number) => {
    if (!mainWindow.isDestroyed()) {
      const { width } = mainWindow.getBounds()
      mainWindow.setContentSize(width, Math.round(height))
    }
  })

  ipcMain.on('window-close', () => {
    if (!mainWindow.isDestroyed()) mainWindow.close()
  })

  ipcMain.on('window-minimize', () => {
    if (!mainWindow.isDestroyed()) mainWindow.minimize()
  })

  ipcMain.on('window-zoom', () => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize()
    }
  })

  // Settings handlers
  ipcMain.handle('get-settings', () => getSettings())

  ipcMain.on('set-always-on-top', (_event, enabled: boolean) => {
    saveSettings({ alwaysOnTop: enabled })
    if (!mainWindow.isDestroyed()) mainWindow.setAlwaysOnTop(enabled)
  })

  ipcMain.on('set-claude-path', (_event, path: string) => {
    saveSettings({ claudeDataPath: path })
    watcher.stop()
    watcher = startFileWatcher(onUpdate, path || join(homedir(), '.claude'))
    watcher.forceUpdate()
  })

  ipcMain.handle('set-shortcut', (_event, { view, accelerator }: { view: ViewKey; accelerator: string }) => {
    const settings = getSettings()
    const oldAcc = settings.shortcuts[view]
    globalShortcut.unregister(oldAcc)
    const registered = globalShortcut.register(accelerator, () => {
      if (!mainWindow.isDestroyed()) mainWindow.webContents.send('switch-view', view)
    })
    if (registered) {
      saveSettings({ shortcuts: { ...settings.shortcuts, [view]: accelerator } })
    } else {
      // Re-register the old shortcut since new one failed
      globalShortcut.register(oldAcc, () => {
        if (!mainWindow.isDestroyed()) mainWindow.webContents.send('switch-view', view)
      })
    }
    return { success: registered }
  })

  ipcMain.handle('show-open-dialog', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    return result.canceled ? null : result.filePaths[0]
  })

  return () => {
    watcher.stop()
    globalShortcut.unregisterAll()
    ipcMain.removeAllListeners('resize-window')
    ipcMain.removeAllListeners('window-close')
    ipcMain.removeAllListeners('window-minimize')
    ipcMain.removeAllListeners('window-zoom')
    ipcMain.removeAllListeners('set-always-on-top')
    ipcMain.removeAllListeners('set-claude-path')
    ipcMain.removeHandler('get-usage')
    ipcMain.removeHandler('get-settings')
    ipcMain.removeHandler('set-shortcut')
    ipcMain.removeHandler('show-open-dialog')
  }
}
