import { useGameKeyboard } from './useGameKeyboard'
import { acknowledgeInjuryNotice, type EngineResult, type GameState } from '../game'

interface Props {
  state: GameState
  command?: (run: (state: GameState) => EngineResult) => void
}

export function InjuryScreen({ state, command }: Props) {
  const messages = state.lastReport?.injuryMessages ?? []

  const keyboardRef = useGameKeyboard<HTMLButtonElement>((key) => {
    if (command && (key === 'Enter' || key === 'Escape')) {
      command(acknowledgeInjuryNotice)
      return true
    }
  })

  const content = (
    <>
      <div className="injury-screen-title screen-red">LESÕES</div>
      <div className="injury-screen-list dos-double screen-black">
        {messages.map((message) => <div key={message}>{message}</div>)}
      </div>
      <div className="injury-screen-note">APENAS EQUIPAS CONTROLADAS POR JOGADORES</div>
      <div className="injury-screen-continue">{command ? 'ENTER / ESC  CONTINUAR' : 'A PARTIDA CONTINUA EM INSTANTES...'}</div>
    </>
  )

  return command ? (
    <button ref={keyboardRef} className="injury-screen screen-blue" type="button" onClick={() => command(acknowledgeInjuryNotice)} aria-label="Confirmar lesões">
      {content}
    </button>
  ) : (
    <section className="injury-screen screen-blue" aria-label="Lesões">
      {content}
    </section>
  )
}
