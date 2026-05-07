# Inline Settings Panel Design

**Date:** 2026-05-08
**Status:** Approved

## Goal

Replace the separate settings window with an inline settings panel inside the main widget. A gear icon in the top-right corner opens the settings view; a back button returns to the main view. No second Electron window is needed.

## What Changes

### Remove
- `src/renderer/settings.html` — settings window HTML entry point
- `src/renderer/src/settings.tsx` — settings window React entry point
- `src/renderer/src/components/SettingsWindow.tsx` — standalone window component
- `src/renderer/src/components/SettingsWindow.test.tsx` — tests for the above
- Revert `electron.vite.config.ts` back to single renderer input
- Remove `createSettingsWindow()` and the `Settings...` menu item from `src/main/index.ts`

### Keep (unchanged)
- `src/shared/types.ts` — AppSettings, DEFAULT_SETTINGS, StoreSchema
- `src/main/file-watcher.ts` — parameterized with claudeDataPath
- `src/main/ipc-handlers.ts` — all settings + global shortcut IPC handlers
- `src/preload/index.ts` — full settings API exposed to renderer

### Add / Modify

**`src/renderer/src/components/SettingsPanel.tsx`** (new)
Inline settings UI — same three sections as before (Window, Data, Shortcuts). Accepts an `onBack: () => void` prop (called by the back button in `UsageWidget`, not inside this component). No outer window chrome needed.

**`src/renderer/src/components/SettingsPanel.test.tsx`** (new)
Component tests mirroring the existing SettingsWindow tests (same coverage, adapted for inline rendering).

**`src/renderer/src/components/UsageWidget.tsx`** (modify)
- Add `view: 'main' | 'settings'` state
- Traffic lights row: add a gear button (`⚙`) pushed to the right. When `view === 'settings'`, replace the gear button with a `←` back button
- When `view === 'settings'`, render `<SettingsPanel />` in place of the normal content

## Layout

```
┌─────────────────────────────────┐
│ ● ● ●                        ⚙ │  ← traffic lights row (gear top-right)
├─────────────────────────────────┤
│ [logo] D  W  M  H       $12.34 │  ← period tabs + cost (hidden in settings view)
├─────────────────────────────────┤
│  ... normal content ...         │
└─────────────────────────────────┘

Settings view:
┌─────────────────────────────────┐
│ ● ● ●                        ← │  ← back button replaces gear
├─────────────────────────────────┤
│  WINDOW                         │
│  Always on Top          [toggle]│
│ ─────────────────────────────── │
│  DATA                           │
│  Claude Data Path               │
│  [~/.claude              ][Browse]│
│  Default: ~/.claude             │
│ ─────────────────────────────── │
│  SHORTCUTS                      │
│  Day View              [⌘1]     │
│  Week View             [⌘2]     │
│  Month View            [⌘3]     │
│  Heatmap View          [⌘4]     │
└─────────────────────────────────┘
```

## State & Data Flow

- `view` state lives in `UsageWidget` — no lifting needed
- `SettingsPanel` reads/writes via `window.claudeWidget` (same as before)
- The gear/back button is rendered in the existing traffic lights row div, using `flex: 1` spacer to push it right
- The period tabs + cost row is **not rendered** when `view === 'settings'` (simpler than hiding).

## App Menu

The `Settings...` menu item is removed. The `Quit` item stays. The Edit submenu stays.

## Testing

- `SettingsPanel.test.tsx` — 5 tests mirroring former SettingsWindow tests
- `UsageWidget.test.tsx` — 2 new tests: gear click shows settings, back click returns to main

## Out of Scope

- Animations/transitions between views
- Bear-style toolbar tabs (only 1 settings page needed for now)
