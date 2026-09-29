import { useGameKeyboard } from './useGameKeyboard'
import {
  advanceAfterCompetitionResults,
  formatMoney,
  getCompetitionClub,
  getPrizeAmount,
  type EngineResult,
  type Fixture,
  type GameState,
} from '../game'
import { DosTeamName } from './DosTeamName'

interface Props {
  state: GameState
  command: (run: (state: GameState) => EngineResult) => void
}

function score(fixture: Fixture): string {
  const result = fixture.result
  if (!result) return '-'
  const penalties = result.homePenalties !== undefined && result.awayPenalties !== undefined
    ? ` (${result.homePenalties}-${result.awayPenalties} pen.)`
    : ''
  return `${result.homeGoals}-${result.awayGoals}${penalties}`
}

export function CompetitionResultsScreen({ state, command }: Props) {
  const event = state.activeCompetition
  const fixtures = event?.competition === 'cup' ? state.lastReport?.cupResults ?? [] : state.lastReport?.libertadoresResults ?? []
  const managerFixture = fixtures.find((fixture) => fixture.homeId === state.manager.clubId || fixture.awayId === state.manager.clubId)
  const prize = event?.competition === 'cup' && managerFixture
    ? getPrizeAmount(state, state.season, { kind: 'cup', roundIndex: event.roundIndex }, state.manager.clubId)
    : undefined

  const keyboardRef = useGameKeyboard<HTMLButtonElement>((key) => {
    if ((key === 'Enter' || key === 'Escape')) {
      command(advanceAfterCompetitionResults)
      return true
    }
  })

  return (
    <button ref={keyboardRef} className="competition-results-screen screen-blue" type="button" onClick={() => command(advanceAfterCompetitionResults)} aria-label="Continuar depois dos resultados">
      <div className="competition-results-title">{event?.title ?? 'COMPETIÇÃO'}</div>
      <div className="competition-results-stage">{event?.roundName ?? 'RESULTADOS'}</div>
      {prize !== undefined && <div className="competition-prize screen-green">PRÊMIO RECEBIDO: <b>{formatMoney(prize)}</b></div>}
      <div className="competition-results-list dos-double screen-black">
        {fixtures.map((fixture) => (
          <div className="competition-result-row" key={fixture.id}>
            <DosTeamName club={getCompetitionClub(state, fixture.homeId)} />
            <b>{score(fixture)}</b>
            <DosTeamName club={getCompetitionClub(state, fixture.awayId)} />
          </div>
        ))}
      </div>
      <div className="competition-results-continue">ENTER / ESC&nbsp; CONTINUAR</div>
    </button>
  )
}
