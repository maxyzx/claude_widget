import { app, BrowserWindow, screen, Menu } from 'electron'
import { join } from 'path'
import Store from 'electron-store'
import { setupIpcHandlers } from './ipc-handlers'
import type { StoreSchema } from '../shared/types'

interface WindowBounds { x: number; y: number }
const store = new Store<StoreSchema>()

const WINDOW_WIDTH = 344
const WINDOW_HEIGHT = 344

function getInitialAlwaysOnTop(): boolean {
  const stored = store.get('settings') as any
  return stored?.alwaysOnTop ?? true
}

function createWindow(): BrowserWindow {
  const { workAreaSize } = screen.getPrimaryDisplay()
  const saved = store.get('windowPos') as WindowBounds | undefined
  const defaultPos: WindowBounds = {
    x: workAreaSize.width - WINDOW_WIDTH - 20,
    y: workAreaSize.height - WINDOW_HEIGHT - 20
  }
  const { x, y } = saved ?? defaultPos

  const win = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    x,
    y,
    frame: false,
    transparent: true,
    alwaysOnTop: getInitialAlwaysOnTop(),
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: false,
      nodeIntegration: true,
      sandbox: false
    }
  })

  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  win.on('moved', () => {
    const [winX, winY] = win.getPosition()
    store.set('windowPos', { x: winX, y: winY })
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

function setupAppMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { label: 'Quit', accelerator: 'CommandOrControl+Q', click: () => app.quit() }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

app.whenReady().then(() => {
  const win = createWindow()
  setupAppMenu()
  const stopHandlers = setupIpcHandlers(win, store)

  app.on('before-quit', () => stopHandlers())
  app.on('window-all-closed', () => app.quit())
})
