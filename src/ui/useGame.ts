import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import type { EngineResult, GameState, NewCareerInput } from '../game'
import { createNewCareer } from '../game'
import { listSaves, loadGame, saveGame, type SaveRecord } from '../persistence/saveRepository'

export type SaveSummary = Omit<SaveRecord, 'state'> & { season: number; clubId: string }
const CAREER_SLOT_ID = 'career'

interface CareerView {
  game: GameState | null
  message: string
}

type CareerAction =
  | { type: 'show'; game: GameState | null; message: string }
  | { type: 'message'; message: string }
  | { type: 'command'; run: (state: GameState) => EngineResult }

function careerReducer(current: CareerView, action: CareerAction): CareerView {
  if (action.type === 'show') return { game: action.game, message: action.message }
  if (action.type === 'message') return { ...current, message: action.message }
  if (!current.game) return current
  const result = action.run(current.game)
  return result.ok
    ? { game: result.state, message: result.message ?? 'COMANDO ACEITE.' }
    : { ...current, message: result.error }
}

export function useGame() {
  const [{ game, message }, dispatch] = useReducer(careerReducer, { game: null, message: '' })
  const [saves, setSaves] = useState<SaveSummary[]>([])
  const [storageError, setStorageError] = useState('')
  const saveQueue = useRef(Promise.resolve())

  const refreshSaves = useCallback(async () => {
    const records = await listSaves()
    setSaves(records.filter((record) => record.slotId === CAREER_SLOT_ID))
  }, [])

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- IndexedDB is an external store.
    void refreshSaves().catch(() => setStorageError('NÃO FOI POSSÍVEL LER A CARREIRA GUARDADA NESTE NAVEGADOR.'))
  }, [refreshSaves])

  useEffect(() => {
    if (!game) return
    // Preserve command order even if opening IndexedDB or writing a save is slow.
    saveQueue.current = saveQueue.current
      .then(() => saveGame(CAREER_SLOT_ID, game.manager.name, game))
      .then(refreshSaves)
      .then(() => setStorageError(''))
      .catch(() => setStorageError('NÃO FOI POSSÍVEL GUARDAR A CARREIRA. NÃO FECHE ESTA ABA.'))
  }, [game, refreshSaves])

  const createCareer = useCallback((input: NewCareerInput) => {
    try {
      dispatch({ type: 'show', game: createNewCareer(input), message: 'CARREIRA CRIADA. BOA SORTE, MISTER!' })
    } catch (error) {
      dispatch({ type: 'message', message: error instanceof Error ? error.message : 'Não foi possível criar a carreira.' })
    }
  }, [])

  const command = useCallback((run: (state: GameState) => EngineResult) => {
    dispatch({ type: 'command', run })
  }, [])

  const load = useCallback(async (slotId: string) => {
    try {
      await saveQueue.current
      const loaded = await loadGame(slotId)
      if (!loaded) {
        dispatch({ type: 'message', message: 'GRAVAÇÃO NÃO ENCONTRADA.' })
        return
      }
      dispatch({ type: 'show', game: loaded, message: `GRAVAÇÃO ${slotId.toUpperCase()} CARREGADA.` })
    } catch {
      dispatch({ type: 'message', message: 'A GRAVAÇÃO ESTÁ CORROMPIDA OU É INCOMPATÍVEL.' })
    }
  }, [])

  const exitToTitle = useCallback(() => {
    dispatch({ type: 'show', game: null, message: 'VOLTOU AO MENU PRINCIPAL.' })
  }, [])

  return { game, saves, message, storageError, createCareer, command, load, exitToTitle }
}
