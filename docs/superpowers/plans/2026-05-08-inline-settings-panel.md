# Inline Settings Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the separate settings Electron window with an inline settings panel inside the main widget, toggled by a ⚙ gear icon in the top-right of the traffic lights row, with a ← back button to return.

**Architecture:** Remove all second-window infrastructure (settings.html, settings.tsx, SettingsWindow, createSettingsWindow). Add a `view: 'main' | 'settings'` state to `UsageWidget`. Gear/back buttons live in the traffic lights row; when `view === 'settings'`, the period tabs + cost row are hidden and a new `SettingsPanel` component fills the content area.

**Tech Stack:** React 19, TypeScript, Electron (ipc stays as-is), Vitest + @testing-library/react.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/renderer/settings.html` | Delete | Remove settings window HTML entry |
| `src/renderer/src/settings.tsx` | Delete | Remove settings window React entry |
| `src/renderer/src/components/SettingsWindow.tsx` | Delete | Replaced by SettingsPanel |
| `src/renderer/src/components/SettingsWindow.test.tsx` | Delete | Replaced by SettingsPanel tests |
| `electron.vite.config.ts` | Modify | Revert to single renderer input |
| `src/main/index.ts` | Modify | Remove settings window logic, simplify menu |
| `src/renderer/src/components/SettingsPanel.tsx` | Create | Inline settings form (Window/Data/Shortcuts) |
| `src/renderer/src/components/SettingsPanel.test.tsx` | Create | Component tests for SettingsPanel |
| `src/renderer/src/components/UsageWidget.tsx` | Modify | Add view state, gear/back button, render SettingsPanel |
| `src/renderer/src/components/UsageWidget.test.tsx` | Modify | Add gear click / back click tests |

---

## Task 1: Delete settings window files and revert vite config

**Files:**
- Delete: `src/renderer/settings.html`
- Delete: `src/renderer/src/settings.tsx`
- Delete: `src/renderer/src/components/SettingsWindow.tsx`
- Delete: `src/renderer/src/components/SettingsWindow.test.tsx`
- Modify: `electron.vite.config.ts`

- [ ] **Step 1: Delete the four settings window files**

```bash
rm src/renderer/settings.html \
   src/renderer/src/settings.tsx \
   src/renderer/src/components/SettingsWindow.tsx \
   src/renderer/src/components/SettingsWindow.test.tsx
```

- [ ] **Step 2: Revert electron.vite.config.ts to single renderer input**

Replace the entire `electron.vite.config.ts` with:

```typescript
import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react()]
  }
})
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```
Expected: no errors.

- [ ] **Step 4: Run tests**

```bash
npm run test
```
Expected: all existing tests pass (SettingsWindow tests are gone, that's expected).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove settings window files and revert vite config to single input"
```

---

## Task 2: Simplify main/index.ts (remove settings window, simplify menu)

**Files:**
- Modify: `src/main/index.ts`

- [ ] **Step 1: Replace src/main/index.ts**

```typescript
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
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```
Expected: no errors.

- [ ] **Step 3: Run tests**

```bash
npm run test
```
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/main/index.ts
git commit -m "feat: remove settings window from main, simplify app menu to Quit only"
```

---

## Task 3: Create SettingsPanel component and tests (TDD)

**Files:**
- Create: `src/renderer/src/components/SettingsPanel.test.tsx`
- Create: `src/renderer/src/components/SettingsPanel.tsx`

- [ ] **Step 1: Write the failing tests first**

Create `src/renderer/src/components/SettingsPanel.test.tsx`:

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SettingsPanel } from './SettingsPanel'
import { DEFAULT_SETTINGS } from '../../../shared/types'

const mockCw = {
  getSettings: vi.fn(),
  setAlwaysOnTop: vi.fn(),
  setClaudePath: vi.fn(),
  setShortcut: vi.fn(),
  showOpenDialog: vi.fn(),
}

beforeEach(() => {
  vi.clearAllMocks()
  ;(window as any).claudeWidget = mockCw
  mockCw.getSettings.mockResolvedValue({ ...DEFAULT_SETTINGS })
  mockCw.setShortcut.mockResolvedValue({ success: true })
})

describe('SettingsPanel', () => {
  it('renders all three sections', async () => {
    render(<SettingsPanel />)
    await waitFor(() => expect(screen.getByText('Always on Top')).toBeInTheDocument())
    expect(screen.getByText('Claude Data Path')).toBeInTheDocument()
    expect(screen.getByText('Day View')).toBeInTheDocument()
    expect(screen.getByText('Week View')).toBeInTheDocument()
    expect(screen.getByText('Month View')).toBeInTheDocument()
    expect(screen.getByText('Heatmap View')).toBeInTheDocument()
  })

  it('calls setAlwaysOnTop when toggle is clicked', async () => {
    render(<SettingsPanel />)
    await waitFor(() => screen.getByTestId('toggle-alwaysOnTop'))
    fireEvent.click(screen.getByTestId('toggle-alwaysOnTop'))
    expect(mockCw.setAlwaysOnTop).toHaveBeenCalledWith(false)
  })

  it('calls showOpenDialog and setClaudePath when Browse is clicked', async () => {
    mockCw.showOpenDialog.mockResolvedValue('/custom/path')
    render(<SettingsPanel />)
    await waitFor(() => screen.getByText('Browse…'))
    fireEvent.click(screen.getByText('Browse…'))
    await waitFor(() => expect(mockCw.setClaudePath).toHaveBeenCalledWith('/custom/path'))
  })

  it('does not call setClaudePath when dialog is cancelled', async () => {
    mockCw.showOpenDialog.mockResolvedValue(null)
    render(<SettingsPanel />)
    await waitFor(() => screen.getByText('Browse…'))
    fireEvent.click(screen.getByText('Browse…'))
    await waitFor(() => expect(mockCw.showOpenDialog).toHaveBeenCalled())
    expect(mockCw.setClaudePath).not.toHaveBeenCalled()
  })

  it('shows default path hint when claudeDataPath is empty', async () => {
    render(<SettingsPanel />)
    await waitFor(() => screen.getByText('Default: ~/.claude'))
  })
})
```

- [ ] **Step 2: Run tests — expect failure**

```bash
npm run test:renderer -- --reporter=verbose 2>&1 | grep -E "(FAIL|PASS|Error)" | head -10
```
Expected: FAIL — `SettingsPanel` not found.

- [ ] **Step 3: Create SettingsPanel.tsx**

Create `src/renderer/src/components/SettingsPanel.tsx`:

```typescript
import React, { useEffect, useState, useRef } from 'react'
import type { AppSettings } from '../../../shared/types'
import { DEFAULT_SETTINGS } from '../../../shared/types'

const cw = (): any => (window as any).claudeWidget

function formatAccelerator(acc: string): string {
  return acc
    .replace('CommandOrControl', '⌘')
    .replace('Command', '⌘')
    .replace('Control', '⌃')
    .replace('Alt', '⌥')
    .replace('Shift', '⇧')
    .replace(/\+/g, '')
}

function eventToAccelerator(e: KeyboardEvent): string | null {
  if (!e.metaKey && !e.ctrlKey && !e.altKey) return null
  const parts: string[] = []
  if (e.metaKey || e.ctrlKey) parts.push('CommandOrControl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  const key = e.key.length === 1 ? e.key.toUpperCase() : e.key
  if (!['Meta', 'Control', 'Alt', 'Shift'].includes(key)) {
    parts.push(key)
    return parts.join('+')
  }
  return null
}

type ViewKey = 'day' | 'week' | 'month' | 'heatmap'
const VIEW_LABELS: Record<ViewKey, string> = {
  day: 'Day', week: 'Week', month: 'Month', heatmap: 'Heatmap'
}

function Toggle({ checked, onChange, testId }: {
  checked: boolean; onChange: (v: boolean) => void; testId?: string
}): React.JSX.Element {
  return (
    <div
      data-testid={testId}
      onClick={() => onChange(!checked)}
      style={{
        width: 36, height: 20, borderRadius: 10, cursor: 'pointer',
        background: checked ? '#7c83fd' : '#3a3a4a',
        position: 'relative', transition: 'background 0.2s', flexShrink: 0
      }}
    >
      <div style={{
        position: 'absolute', top: 2, left: checked ? 18 : 2,
        width: 16, height: 16, borderRadius: '50%', background: '#fff',
        transition: 'left 0.2s'
      }} />
    </div>
  )
}

function ShortcutRecorder({ value, onCommit }: {
  value: string; onCommit: (acc: string) => void
}): React.JSX.Element {
  const [recording, setRecording] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!recording) return
    const handler = (e: KeyboardEvent) => {
      e.preventDefault()
      if (e.key === 'Escape') { setRecording(false); return }
      const acc = eventToAccelerator(e)
      if (acc) { setRecording(false); onCommit(acc) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [recording, onCommit])

  return (
    <div
      ref={ref}
      tabIndex={0}
      onClick={() => setRecording(true)}
      onBlur={() => setRecording(false)}
      style={{
        padding: '3px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 12,
        background: recording ? 'rgba(124,131,253,0.2)' : 'rgba(255,255,255,0.07)',
        border: `1px solid ${recording ? '#7c83fd' : 'rgba(255,255,255,0.12)'}`,
        color: recording ? '#aaa' : '#e0e0e0',
        minWidth: 80, textAlign: 'center', userSelect: 'none', outline: 'none'
      }}
    >
      {recording ? 'Press shortcut…' : formatAccelerator(value)}
    </div>
  )
}

export function SettingsPanel(): React.JSX.Element {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)

  useEffect(() => {
    cw()?.getSettings().then((s: AppSettings) => setSettings(s))
  }, [])

  const updateAlwaysOnTop = (v: boolean) => {
    setSettings(s => ({ ...s, alwaysOnTop: v }))
    cw()?.setAlwaysOnTop(v)
  }

  const handleBrowse = async () => {
    const path: string | null = await cw()?.showOpenDialog()
    if (path) {
      setSettings(s => ({ ...s, claudeDataPath: path }))
      cw()?.setClaudePath(path)
    }
  }

  const updateShortcut = async (view: ViewKey, acc: string) => {
    const result: { success: boolean } | undefined = await cw()?.setShortcut(view, acc)
    if (result?.success !== false) {
      setSettings(s => ({ ...s, shortcuts: { ...s.shortcuts, [view]: acc } }))
    }
  }

  const ROW: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0'
  }
  const SECTION_LABEL: React.CSSProperties = {
    fontSize: 10, color: '#666', fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8
  }
  const DIVIDER: React.CSSProperties = {
    height: 1, background: 'rgba(255,255,255,0.07)', margin: '12px 0'
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, fontSize: 13, color: '#e0e0e0' }}>
      <div style={SECTION_LABEL}>Window</div>
      <div style={ROW}>
        <span>Always on Top</span>
        <Toggle checked={settings.alwaysOnTop} onChange={updateAlwaysOnTop} testId="toggle-alwaysOnTop" />
      </div>

      <div style={DIVIDER} />

      <div style={SECTION_LABEL}>Data</div>
      <div style={{ marginBottom: 6 }}>Claude Data Path</div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
        <div style={{
          flex: 1, padding: '4px 8px', borderRadius: 4, fontSize: 12,
          background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
          color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
        }}>
          {settings.claudeDataPath || '~/.claude'}
        </div>
        <button
          onClick={handleBrowse}
          style={{
            padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 12,
            background: 'rgba(124,131,253,0.2)', border: '1px solid rgba(124,131,253,0.4)',
            color: '#7c83fd', whiteSpace: 'nowrap'
          }}
        >Browse…</button>
      </div>
      <div style={{ fontSize: 11, color: '#555' }}>Default: ~/.claude</div>

      <div style={DIVIDER} />

      <div style={SECTION_LABEL}>Shortcuts</div>
      {(Object.keys(VIEW_LABELS) as ViewKey[]).map(view => (
        <div key={view} style={ROW}>
          <span>{VIEW_LABELS[view]} View</span>
          <ShortcutRecorder value={settings.shortcuts[view]} onCommit={acc => updateShortcut(view, acc)} />
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npm run test:renderer -- --reporter=verbose 2>&1 | grep -E "(FAIL|PASS|✓|×)" | head -20
```
Expected: all 5 SettingsPanel tests PASS.

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/SettingsPanel.tsx src/renderer/src/components/SettingsPanel.test.tsx
git commit -m "feat: add SettingsPanel component (inline, TDD)"
```

---

## Task 4: Wire view switching into UsageWidget

**Files:**
- Modify: `src/renderer/src/components/UsageWidget.tsx`
- Modify: `src/renderer/src/components/UsageWidget.test.tsx`

- [ ] **Step 1: Write the two failing tests first**

In `src/renderer/src/components/UsageWidget.test.tsx`, add these two tests at the end of the `describe('UsageWidget', ...)` block (before the closing `}`):

```typescript
  it('clicking gear button shows settings panel', async () => {
    ;(window as any).claudeWidget = {
      resizeWindow: vi.fn(),
      onSwitchView: vi.fn(),
      removeSwitchViewListeners: vi.fn(),
      getSettings: vi.fn().mockResolvedValue({
        alwaysOnTop: true,
        claudeDataPath: '',
        shortcuts: { day: 'CommandOrControl+1', week: 'CommandOrControl+2', month: 'CommandOrControl+3', heatmap: 'CommandOrControl+4' }
      }),
    }
    render(<UsageWidget data={base} />)
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    await waitFor(() => expect(screen.getByText('Always on Top')).toBeInTheDocument())
    expect(screen.queryByText('D')).not.toBeInTheDocument()
  })

  it('clicking back button returns to main view', async () => {
    ;(window as any).claudeWidget = {
      resizeWindow: vi.fn(),
      onSwitchView: vi.fn(),
      removeSwitchViewListeners: vi.fn(),
      getSettings: vi.fn().mockResolvedValue({
        alwaysOnTop: true,
        claudeDataPath: '',
        shortcuts: { day: 'CommandOrControl+1', week: 'CommandOrControl+2', month: 'CommandOrControl+3', heatmap: 'CommandOrControl+4' }
      }),
    }
    render(<UsageWidget data={base} />)
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    await waitFor(() => screen.getByRole('button', { name: 'Back' }))
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'D' })).toBeInTheDocument())
  })
```

- [ ] **Step 2: Run tests — expect the two new tests to fail**

```bash
npm run test:renderer -- --reporter=verbose 2>&1 | grep -E "(gear|back|FAIL)" | head -10
```
Expected: 2 new tests FAIL — no gear/back button yet.

- [ ] **Step 3: Add SettingsPanel import and view state to UsageWidget**

In `src/renderer/src/components/UsageWidget.tsx`:

**Add import** at the top (after the existing imports):
```typescript
import { SettingsPanel } from './SettingsPanel'
```

**Add `view` state** inside `UsageWidget` function, immediately after the `const [period, setPeriod] = useState<Period>('day')` line:
```typescript
  const [view, setView] = useState<'main' | 'settings'>('main')
```

- [ ] **Step 4: Replace the traffic lights row and content in the render**

In the `return (...)` of `UsageWidget`, find this block:

```typescript
      {/* App header: traffic lights */}
      <div style={{ display: 'flex', alignItems: 'center', paddingBottom: 8, marginBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <TrafficLights />
      </div>

      {/* Logo + tabs + cost */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <img src={claudeWidgetLogo} style={{ height: 18, width: 18, borderRadius: 4 }} alt="" />
        <div className="no-drag" style={{ display: 'flex', gap: 2 }}>
          {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
            <button key={p} onClick={() => setPeriod(p)} style={{
              background: period === p ? 'rgba(124,131,253,0.25)' : 'transparent',
              border: 'none', borderRadius: 4,
              color: period === p ? '#7c83fd' : '#444',
              cursor: 'pointer', fontSize: 12, fontWeight: 700, padding: '2px 6px', transition: 'all 0.15s',
            }}>
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
        <span style={{ flex: 1 }} />
        <span style={{ color: '#4ecca3', fontSize: 18, fontWeight: 600, letterSpacing: '-0.5px' }}>
          ${estimatedCostUsd.toFixed(2)}
        </span>
        {isLive && period === 'day' && <span style={{ color: '#4ecca3', fontSize: 8, marginLeft: 2 }}>●</span>}
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '10px 0 6px' }} />

      {/* Model / day rows */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
```

Replace it with:

```typescript
      {/* Traffic lights + gear/back */}
      <div style={{ display: 'flex', alignItems: 'center', paddingBottom: 8, marginBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <TrafficLights />
        <span style={{ flex: 1 }} />
        {view === 'settings' ? (
          <button
            aria-label="Back"
            className="no-drag"
            onClick={() => setView('main')}
            style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: 14, padding: '0 2px', lineHeight: 1 }}
          >←</button>
        ) : (
          <button
            aria-label="Settings"
            className="no-drag"
            onClick={() => setView('settings')}
            style={{ background: 'none', border: 'none', color: '#444', cursor: 'pointer', fontSize: 14, padding: '0 2px', lineHeight: 1 }}
          >⚙</button>
        )}
      </div>

      {view === 'settings' ? (
        <SettingsPanel />
      ) : (
        <>
          {/* Logo + tabs + cost */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <img src={claudeWidgetLogo} style={{ height: 18, width: 18, borderRadius: 4 }} alt="" />
            <div className="no-drag" style={{ display: 'flex', gap: 2 }}>
              {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
                <button key={p} onClick={() => setPeriod(p)} style={{
                  background: period === p ? 'rgba(124,131,253,0.25)' : 'transparent',
                  border: 'none', borderRadius: 4,
                  color: period === p ? '#7c83fd' : '#444',
                  cursor: 'pointer', fontSize: 12, fontWeight: 700, padding: '2px 6px', transition: 'all 0.15s',
                }}>
                  {PERIOD_LABELS[p]}
                </button>
              ))}
            </div>
            <span style={{ flex: 1 }} />
            <span style={{ color: '#4ecca3', fontSize: 18, fontWeight: 600, letterSpacing: '-0.5px' }}>
              ${estimatedCostUsd.toFixed(2)}
            </span>
            {isLive && period === 'day' && <span style={{ color: '#4ecca3', fontSize: 8, marginLeft: 2 }}>●</span>}
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '10px 0 6px' }} />

          {/* Model / day rows */}
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
```

Then find the **last two closing `</div>` tags** before the final `)` of the return statement (the one that closes the model-rows div and then the outer widget container):

```typescript
      </div>
    </div>
  )
```

Replace with (adds Fragment close and ternary close between those two `</div>` tags):

```typescript
          </div>
        </>
      )}
    </div>
  )
```

- [ ] **Step 5: Run tests — expect all pass**

```bash
npm run test:all
```
Expected: all tests pass including the 2 new UsageWidget tests.

- [ ] **Step 6: Typecheck**

```bash
npm run typecheck
```
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/components/UsageWidget.tsx src/renderer/src/components/UsageWidget.test.tsx
git commit -m "feat: add inline settings panel with gear/back button in UsageWidget"
```

---

## Final Verification

- [ ] **Run full test suite**

```bash
npm run test:all
```
Expected: all tests pass.

- [ ] **Run dev build and manually test**

```bash
npm run dev
```

Verify:
1. ⚙ gear icon visible in top-right of traffic lights row
2. Clicking ⚙ hides period tabs/cost and shows settings panel
3. ← back button appears in place of ⚙; clicking it restores the normal widget view
4. Always on Top toggle, Browse button, shortcut recorder all function
5. Global shortcuts Cmd+1–4 still switch the main widget view
