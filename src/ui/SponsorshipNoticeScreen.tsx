import { useEffect } from 'react'
import { acknowledgeSponsorshipNotice, bettingRegulationNotice, type EngineResult, type GameState } from '../game'
import { useGameKeyboard } from './useGameKeyboard'

interface Props {
  state: GameState
  command: (run: (state: GameState) => EngineResult) => void
}

export function SponsorshipNoticeScreen({ state, command }: Props) {
  const notice = bettingRegulationNotice(state)
  const keyboardRef = useGameKeyboard<HTMLButtonElement>((key) => {
    if (key === 'Enter' || key === 'Escape') {
      command(acknowledgeSponsorshipNotice)
      return true
    }
  })
  useEffect(() => {
    keyboardRef.current?.closest('.dos-viewport--portrait')?.scrollTo({ top: 0 })
  }, [keyboardRef])
  if (!notice) return null
  return (
    <button ref={keyboardRef} className="sponsorship-notice-screen screen-blue" type="button" onClick={() => command(acknowledgeSponsorshipNotice)} aria-label="Continuar após comunicado de patrocínio">
      <div className="sponsorship-notice-title screen-red dos-double">PATROCÍNIO</div>
      <div className="sponsorship-notice-message screen-black dos-double" role="status">{notice}</div>
      <div className="sponsorship-notice-continue">ENTER / ESC  CONTINUAR</div>
    </button>
  )
}
