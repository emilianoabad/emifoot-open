import { useCallback, useMemo, useState } from 'react'
import {
  finishRound,
  getCompetitionClub,
  getManagerClub,
  makeHalfTimeSubstitution,
  type EngineResult,
  type GameState,
} from '../game'
import { useGameKeyboard } from './useGameKeyboard'
import { DosTeamName } from './DosTeamName'

interface HalfTimeScreenProps {
  state: GameState
  command: (run: (state: GameState) => EngineResult) => void
  message: string
}

export function HalfTimeScreen({ state, command, message }: HalfTimeScreenProps) {
  const club = getManagerClub(state)
  const managerMatch = state.pendingMatchDay?.matches.find((match) => match.homeId === club.id || match.awayId === club.id)
  const starters = useMemo(() => club.lineup.map((id) => club.players.find((player) => player.id === id)!).filter(Boolean), [club])
  const substitutes = useMemo(() => club.bench.map((id) => club.players.find((player) => player.id === id)!).filter(Boolean), [club])
  const [outId, setOutId] = useState(starters.at(-1)?.id ?? '')
  const [inId, setInId] = useState(substitutes[0]?.id ?? '')
  const clubColors = { color: club.secondary, backgroundColor: club.primary, borderColor: club.secondary }
  const selectedColors = { color: club.primary, backgroundColor: club.secondary }

  const substitute = useCallback(() => {
    if (outId && inId) command((current) => makeHalfTimeSubstitution(current, outId, inId))
  }, [command, inId, outId])

  const keyboardRef = useGameKeyboard<HTMLElement>((key) => {
    if (key === 'Escape') { command(finishRound); return true }
    if (key === '1') { substitute(); return true }
  })

  return (
    <section ref={keyboardRef} className="original-halftime screen-blue">
      <div className="halftime-scoreline">
        {managerMatch ? (
          <>
            <DosTeamName club={getCompetitionClub(state, managerMatch.homeId)} />
            <b>{managerMatch.homeGoals}&nbsp;-&nbsp;{managerMatch.awayGoals}</b>
            <DosTeamName club={getCompetitionClub(state, managerMatch.awayId)} />
          </>
        ) : null}
      </div>
      <div className="halftime-lineups">
        <div className="halftime-list" style={clubColors}>
          <div className="halftime-list-title">JOGADORES EM CAMPO</div>
          {starters.map((player) => (
            <button type="button" className={outId === player.id ? 'selected' : ''} style={outId === player.id ? selectedColors : undefined} key={player.id} onClick={() => setOutId(player.id)}>
              <span>{player.position}</span><span>{player.name}{player.injuryRounds > 0 ? ' [+]' : ''}</span><span>{player.strength}</span>
            </button>
          ))}
        </div>
        <div className="halftime-list" style={clubColors}>
          <div className="halftime-list-title">JOGADORES NO BANCO</div>
          {substitutes.map((player) => (
            <button type="button" className={inId === player.id ? 'selected' : ''} style={inId === player.id ? selectedColors : undefined} key={player.id} onClick={() => setInId(player.id)}>
              <span>{player.position}</span><span>{player.name}{player.injuryRounds > 0 ? ' [+]' : ''}</span><span>{player.strength}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="halftime-commands">
        <button type="button" onClick={substitute}>1&nbsp; Substituir</button>
        <button type="button" onClick={() => command(finishRound)}>Esc&nbsp; Fim</button>
      </div>
      {message && message !== 'COMANDO ACEITE.' ? <div className="halftime-message">{message}</div> : null}
    </section>
  )
}
