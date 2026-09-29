import { useEffect, useState } from 'react'
import { useGameKeyboard } from './useGameKeyboard'
import { chooseTacticAndStart, getAvailableTactics, getManagerClub, type EngineResult, type GameState, type TacticId } from '../game'
import {
  CareerScreen,
  CupScreen,
  FinanceScreen,
  FixturesScreen,
  LibertadoresScreen,
  MarketScreen,
  NewsScreen,
  SquadScreen,
  StadiumScreen,
  TablesScreen,
  type ManagerScreenId,
  type SquadMode,
} from './screens'

const SCREEN_KEYS: Record<string, ManagerScreenId> = {
  c: 'fixtures', r: 'fixtures', t: 'tables', q: 'cup', m: 'market',
  l: 'libertadores', f: 'finance', e: 'stadium', p: 'career', n: 'news',
}

interface GameShellProps {
  state: GameState
  message: string
  command: (run: (state: GameState) => EngineResult) => void
  onExit: () => void
  managedClubIds?: readonly string[]
}

export function GameShell({ state, message, command, onExit, managedClubIds }: GameShellProps) {
  const [screen, setScreen] = useState<ManagerScreenId>('squad')
  const [squadMode, setSquadMode] = useState<SquadMode>('normal')
  const [selectedTactic, setSelectedTactic] = useState<TacticId>()
  const tactics = getAvailableTactics(getManagerClub(state))

  useEffect(() => {
    document.querySelector<HTMLElement>('.dos-viewport--portrait')?.scrollTo({ top: 0 })
  }, [state.phase, screen, squadMode])

  useEffect(() => {
    if (!selectedTactic || state.phase !== 'pre-round') return
    const timer = window.setTimeout(() => {
      const tactic = selectedTactic
      setSelectedTactic(undefined)
      command((current) => chooseTacticAndStart(current, tactic))
    }, 900)
    return () => window.clearTimeout(timer)
  }, [command, selectedTactic, state.phase])

  const keyboardRef = useGameKeyboard<HTMLElement>((pressedKey) => {
    if (pressedKey === 'Escape') {
      if (selectedTactic) setSelectedTactic(undefined)
      else if (squadMode !== 'normal') setSquadMode('normal')
      else if (screen === 'squad') onExit()
      else setScreen('squad')
      return true
    }
    const key = pressedKey.toLowerCase()
    if ((key === 'v' || key === 'o') && screen === 'squad') {
      setSelectedTactic(undefined)
      setSquadMode(key === 'v' ? 'sell' : 'renew')
      return true
    }
    const destination = SCREEN_KEYS[key]
    if (destination) {
      setSelectedTactic(undefined)
      setSquadMode('normal')
      setScreen(destination)
      return true
    }
    const tactic = tactics.find((candidate) => String(candidate.key % 10) === key)
    if (screen === 'squad' && squadMode === 'normal' && tactic) {
      setSelectedTactic(tactic.id)
      return true
    }
  }, true)

  const common = { state, command, message, managedClubIds }
  const openScreen = (destination: ManagerScreenId) => {
    setSquadMode('normal')
    setSelectedTactic(undefined)
    setScreen(destination)
  }
  return (
    <section ref={keyboardRef} className="game-screen screen-black">
      {screen === 'squad' && (
        <SquadScreen
          key={squadMode}
          {...common}
          squadMode={squadMode}
          onEnterSquadMode={(mode) => { setSelectedTactic(undefined); setSquadMode(mode) }}
          onExitSquadMode={() => setSquadMode('normal')}
          onOpenScreen={openScreen}
          selectedTactic={selectedTactic}
          onSelectTactic={setSelectedTactic}
          onExit={onExit}
        />
      )}
      {screen === 'tables' && <TablesScreen {...common} />}
      {screen === 'fixtures' && <FixturesScreen {...common} />}
      {screen === 'cup' && <CupScreen {...common} />}
      {screen === 'libertadores' && <LibertadoresScreen {...common} />}
      {screen === 'market' && <MarketScreen {...common} />}
      {screen === 'finance' && <FinanceScreen {...common} />}
      {screen === 'stadium' && <StadiumScreen {...common} />}
      {screen === 'career' && <CareerScreen {...common} />}
      {screen === 'news' && <NewsScreen {...common} />}
      {screen !== 'squad' ? <button type="button" className="browser-back-command" onClick={() => setScreen('squad')}>ESC&nbsp; VOLTAR</button> : null}
      {message && message !== 'COMANDO ACEITE.' && screen !== 'squad' ? <div className="dos-status-message">{message}</div> : null}
    </section>
  )
}
