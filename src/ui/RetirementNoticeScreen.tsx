import { useEffect } from 'react'
import { acknowledgeRetirementNotice, getManagerClub, type EngineResult, type GameState } from '../game'
import { useGameKeyboard } from './useGameKeyboard'

interface Props {
  state: GameState
  command: (run: (state: GameState) => EngineResult) => void
}

export function RetirementNoticeScreen({ state, command }: Props) {
  const club = getManagerClub(state)
  const retired = state.offseason?.plans[club.id]?.retired ?? []
  const pending = retired.length > 0 && state.offseason?.retirementPendingClubIds.includes(club.id)
  const keyboardRef = useGameKeyboard<HTMLElement>((key) => {
    if (pending && (key === 'Enter' || key === 'Escape')) {
      command(acknowledgeRetirementNotice)
      return true
    }
  })
  useEffect(() => {
    keyboardRef.current?.closest('.dos-viewport--portrait')?.scrollTo({ top: 0 })
  }, [keyboardRef])

  return (
    <section ref={keyboardRef} className="retirement-screen screen-blue" aria-label="Aposentadorias">
      <h1 className="retirement-title screen-red dos-double">APOSENTADORIAS · {state.season - 1}</h1>
      <div className="retirement-club">{club.name}</div>
      {retired.length ? (
        <div className="retirement-list screen-black dos-double" role="region" aria-label="Jogadores aposentados" tabIndex={0}>
          <table>
            <thead><tr><th scope="col">POS.</th><th scope="col">JOGADOR</th><th scope="col">IDADE</th></tr></thead>
            <tbody>
              {retired.map((player) => <tr key={player.id}><td>{player.position}</td><td>{player.name}</td><td>{player.age} anos</td></tr>)}
            </tbody>
          </table>
        </div>
      ) : null}
      {pending ? (
        <button type="button" className="retirement-continue" onClick={() => command(acknowledgeRetirementNotice)} aria-label="Continuar após aposentadorias">ENTER / ESC&nbsp; CONTINUAR</button>
      ) : <div className="retirement-waiting" role="status">AGUARDE OS OUTROS TREINADORES.</div>}
    </section>
  )
}
