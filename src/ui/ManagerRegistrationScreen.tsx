import { useGameKeyboard } from './useGameKeyboard'
import { confirmManagerRegistration, getManagerClub, type EngineResult, type GameState } from '../game'
import { DosTeamName } from './DosTeamName'

interface Props {
  state: GameState
  command: (run: (state: GameState) => EngineResult) => void
}

export function ManagerRegistrationScreen({ state, command }: Props) {
  const club = getManagerClub(state)

  const keyboardRef = useGameKeyboard<HTMLElement>((key) => {
    if ((key === 'Enter' || key === 'Escape')) {
      command(confirmManagerRegistration)
      return true
    }
  })

  return (
    <section ref={keyboardRef} className="manager-entry-screen screen-black">
      <div className="manager-entry-head dos-red-line">
        <span>NOME</span><span>EQUIPA</span>
      </div>
      <div className="manager-assigned-row dos-red-line">
        <span>{state.manager.name.toLowerCase()}</span>
        <DosTeamName club={club} className="assigned-club" />
      </div>
      <button className="manager-entry-start" type="button" onClick={() => command(confirmManagerRegistration)}>
        ENTER&nbsp; COMEÇAR
      </button>
    </section>
  )
}
