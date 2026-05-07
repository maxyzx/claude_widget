import { ipcRenderer } from 'electron'
import type { UsageData } from '../shared/types'

;(window as any).claudeWidget = {
  onUsageUpdate: (callback: (data: UsageData) => void) => {
    ipcRenderer.on('usage-update', (_event, data) => callback(data))
  },
  removeUsageListeners: () => {
    ipcRenderer.removeAllListeners('usage-update')
  },
  resizeWindow: (height: number) => {
    ipcRenderer.send('resize-window', height)
  },
  closeWindow: () => ipcRenderer.send('window-close'),
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  zoomWindow: () => ipcRenderer.send('window-zoom'),

  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setAlwaysOnTop: (enabled: boolean) => ipcRenderer.send('set-always-on-top', enabled),
  setClaudePath: (path: string) => ipcRenderer.send('set-claude-path', path),
  setShortcut: (view: string, accelerator: string) =>
    ipcRenderer.invoke('set-shortcut', { view, accelerator }),
  showOpenDialog: () => ipcRenderer.invoke('show-open-dialog'),

  // View switching (triggered by global shortcuts)
  onSwitchView: (callback: (view: string) => void) => {
    ipcRenderer.on('switch-view', (_event, view) => callback(view))
  },
  removeSwitchViewListeners: () => {
    ipcRenderer.removeAllListeners('switch-view')
  },
}
