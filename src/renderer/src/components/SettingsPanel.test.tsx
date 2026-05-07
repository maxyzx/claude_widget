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
