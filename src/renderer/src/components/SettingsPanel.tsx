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
    <div className="no-drag" style={{ flex: 1, overflowY: 'auto', minHeight: 0, fontSize: 13, color: '#e0e0e0', paddingRight: 8 }}>
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
