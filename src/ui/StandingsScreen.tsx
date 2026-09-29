import { useGameKeyboard } from './useGameKeyboard'
import { advanceAfterStandings, getClub, getTable, type Division, type EngineResult, type GameState } from '../game'
import { DosTeamName } from './DosTeamName'

interface Props {
  state: GameState
  command: (run: (state: GameState) => EngineResult) => void
  advance?: (state: GameState) => EngineResult
}

export function StandingsScreen({ state, command, advance = advanceAfterStandings }: Props) {
  const keyboardRef = useGameKeyboard<HTMLButtonElement>((key) => {
    if ((key === 'Enter' || key === 'Escape')) {
      command(advance)
      return true
    }
  })

  return (
    <button ref={keyboardRef} className="original-standings screen-black" type="button" onClick={() => command(advance)} aria-label="Continuar após classificação">
      <div className="standings-title">CLASSIFICAÇÃO&nbsp;&nbsp; {state.currentRound}ª JORNADA</div>
      <div className="standings-grid">
        {([1, 2, 3, 4] as Division[]).map((division) => (
          <div className="division-table" key={division}>
            <div className="division-title">{division}ª DIVISÃO</div>
            {getTable(state, division).map((entry) => (
              <div className="original-standing-row" key={entry.clubId}>
                <DosTeamName club={getClub(state, entry.clubId)} />
                <span>{entry.wins}</span><span>{entry.draws}</span><span>{entry.losses}</span>
                <span>{entry.goalsFor}:{entry.goalsAgainst}</span><span>{entry.points}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </button>
  )
}
