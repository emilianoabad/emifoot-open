import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { listSaves, loadGame, saveGame } from '../persistence/saveRepository'
import { useGame } from './useGame'

vi.mock('../persistence/saveRepository', () => ({
  listSaves: vi.fn(),
  saveGame: vi.fn(),
  loadGame: vi.fn(),
}))

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(listSaves).mockResolvedValue([])
  vi.mocked(saveGame).mockImplementation(async (slotId, name, state) => ({ slotId, name, state, savedAt: new Date().toISOString() }))
})
afterEach(cleanup)

describe('career storage failures', () => {
  it('shows a visible warning when browser storage cannot be read', async () => {
    vi.mocked(listSaves).mockRejectedValue(new Error('Storage denied'))
    render(<App />)
    expect(await screen.findByRole('alert')).toHaveTextContent('NÃO FOI POSSÍVEL LER A CARREIRA')
    expect(screen.getByRole('button', { name: /CARREIRA SOLO/ })).toBeEnabled()
  })

  it('keeps a failed save visible after exiting and clears it after a successful save', async () => {
    vi.mocked(saveGame).mockRejectedValueOnce(new Error('Quota exceeded'))
    const { result } = renderHook(useGame)
    act(() => result.current.createCareer({ managerName: 'Ana', seed: 1 }))
    await waitFor(() => expect(result.current.storageError).toContain('NÃO FOI POSSÍVEL GUARDAR'))
    expect(result.current.game?.manager.name).toBe('Ana')
    act(() => result.current.exitToTitle())
    expect(result.current.storageError).toContain('NÃO FECHE ESTA ABA')
    expect(result.current.message).not.toContain('AUTOSAVE CONCLUÍDO')
    act(() => result.current.createCareer({ managerName: 'Bia', seed: 2 }))
    await waitFor(() => expect(result.current.storageError).toBe(''))
    expect(saveGame).toHaveBeenCalledTimes(2)
  })

  it('serializes saves so a delayed older write cannot overwrite a newer career', async () => {
    let finishFirst!: () => void
    const firstWrite = new Promise<void>((resolve) => { finishFirst = resolve })
    vi.mocked(saveGame).mockImplementationOnce(async (slotId, name, state) => {
      await firstWrite
      return { slotId, name, state, savedAt: new Date().toISOString() }
    })
    const { result } = renderHook(useGame)
    act(() => result.current.createCareer({ managerName: 'Ana', seed: 1 }))
    await waitFor(() => expect(saveGame).toHaveBeenCalledTimes(1))
    act(() => result.current.createCareer({ managerName: 'Bia', seed: 2 }))
    expect(saveGame).toHaveBeenCalledTimes(1)
    await act(async () => finishFirst())
    await waitFor(() => expect(saveGame).toHaveBeenCalledTimes(2))
    expect(vi.mocked(saveGame).mock.calls.map((call) => call[1])).toEqual(['Ana', 'Bia'])
  })

  it('reports a pending save failure even after returning to the title', async () => {
    let failWrite!: (error: Error) => void
    vi.mocked(saveGame).mockImplementationOnce(() => new Promise((_, reject) => { failWrite = reject }))
    const { result } = renderHook(useGame)
    act(() => result.current.createCareer({ managerName: 'Ana', seed: 1 }))
    await waitFor(() => expect(saveGame).toHaveBeenCalledTimes(1))
    act(() => result.current.exitToTitle())
    await act(async () => failWrite(new Error('Disk full')))
    expect(result.current.storageError).toContain('NÃO FOI POSSÍVEL GUARDAR')
  })
})


describe('career command ordering', () => {
  it('loads only after the most recent queued autosave has finished', async () => {
    let finishWrite!: () => void
    const pending = new Promise<void>((resolve) => { finishWrite = resolve })
    vi.mocked(saveGame).mockImplementationOnce(async (slotId, name, state) => {
      await pending
      vi.mocked(loadGame).mockResolvedValue(state)
      return { slotId, name, state, savedAt: new Date().toISOString() }
    })
    const { result } = renderHook(useGame)
    act(() => result.current.createCareer({ managerName: 'Latest', seed: 3 }))
    await waitFor(() => expect(saveGame).toHaveBeenCalledTimes(1))
    act(() => result.current.exitToTitle())
    let loading!: Promise<void>
    act(() => { loading = result.current.load('career') })
    expect(loadGame).not.toHaveBeenCalled()
    await act(async () => { finishWrite(); await loading })
    expect(result.current.game?.manager.name).toBe('Latest')
  })

  it('applies batched commands in order and preserves the game when a command fails', async () => {
    const { result } = renderHook(useGame)
    act(() => result.current.createCareer({ managerName: 'Commands', seed: 4 }))
    await waitFor(() => expect(saveGame).toHaveBeenCalledTimes(1))
    act(() => {
      result.current.command((state) => ({ ok: true, state: { ...state, revision: state.revision + 1 } }))
      result.current.command((state) => ({ ok: true, state: { ...state, revision: state.revision + 1 } }))
      result.current.command(() => ({ ok: false, error: 'Rejected command' }))
    })
    expect(result.current.game?.revision).toBe(2)
    expect(result.current.message).toBe('Rejected command')
    await waitFor(() => expect(saveGame).toHaveBeenCalledTimes(2))
  })
})
