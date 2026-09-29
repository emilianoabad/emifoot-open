import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getMatchPacing } from '../config/localFastMode'
import {
  getClub,
  getCompetitionClub,
  reachHalfTime,
  showStandings,
  type Division,
  type EngineResult,
  type Fixture,
  type GameState,
  type MatchEvent,
} from '../game'
import { DosTeamName } from './DosTeamName'
import type { MultiplayerTimer } from '../multiplayer/protocol'
import { useTimerElapsed } from '../multiplayer/useTimerElapsed'

interface Props {
  state: GameState
  command: (run: (state: GameState) => EngineResult) => void
  networkTimer?: MultiplayerTimer
}

interface LiveFixture {
  fixture: Fixture
  attendance: number
  events: MatchEvent[]
}

export function MatchdayScreen({ state, command, networkTimer }: Props) {
  const pacing = getMatchPacing()
  const secondHalf = state.phase === 'second-half'
  const competition = state.pendingMatchDay?.competition ?? state.activeCompetition?.competition ?? 'league'
  const startMinute = secondHalf ? 46 : 0
  const endMinute = secondHalf ? 90 : 45
  const [localMinute, setMinute] = useState(startMinute)
  const elapsed = useTimerElapsed(networkTimer)
  const minute = elapsed !== undefined && networkTimer
    ? Math.min(endMinute, startMinute + Math.floor(elapsed / networkTimer.durationMs * (endMinute - startMinute + 1)))
    : localMinute
  const advanced = useRef(false)
  const fixtures = useMemo<LiveFixture[]>(() => {
    if (secondHalf) {
      const results = competition === 'cup' ? state.lastReport?.cupResults
        : competition === 'libertadores' ? state.lastReport?.libertadoresResults
          : state.lastReport?.leagueResults
      return (results ?? []).map((fixture) => ({
        fixture,
        attendance: fixture.result?.attendance ?? 0,
        events: fixture.result?.events ?? [],
      }))
    }
    return (state.pendingMatchDay?.matches ?? []).map((match) => ({
      fixture: {
        id: match.fixtureId,
        competition,
        division: competition === 'league' ? getClub(state, match.homeId).division : undefined,
        round: state.currentRound,
        homeId: match.homeId,
        awayId: match.awayId,
      },
      attendance: match.attendance,
      events: match.events,
    }))
  }, [competition, secondHalf, state])

  const advance = useCallback(() => {
    if (advanced.current || networkTimer) return
    advanced.current = true
    command(secondHalf ? showStandings : reachHalfTime)
  }, [command, secondHalf, networkTimer])

  useEffect(() => {
    if (networkTimer) return
    const interval = window.setInterval(() => {
      setMinute((current) => {
        if (current >= endMinute) {
          window.clearInterval(interval)
          window.setTimeout(advance, pacing.phaseEndDelayMs)
          return current
        }
        return Math.min(endMinute, current + pacing.minuteStep)
      })
    }, pacing.minuteIntervalMs)
    return () => window.clearInterval(interval)
  }, [advance, endMinute, pacing.minuteIntervalMs, pacing.minuteStep, pacing.phaseEndDelayMs, networkTimer])

  const renderFixture = ({ fixture, attendance, events }: LiveFixture) => {
    const goals = events.filter((event) => event.type === 'goal' && event.minute <= minute)
    const homeGoals = goals.filter((event) => event.clubId === fixture.homeId).length
    const awayGoals = goals.filter((event) => event.clubId === fixture.awayId).length
    const latestEvent = events.filter((event) => (event.type === 'goal' || event.type === 'injury') && event.minute <= minute).at(-1)
    const eventClub = latestEvent ? getCompetitionClub(state, latestEvent.clubId) : undefined
    return (
      <div className="matchday-row" key={fixture.id}>
        <DosTeamName club={getCompetitionClub(state, fixture.homeId)} />
        <b>{homeGoals}</b>
        <DosTeamName club={getCompetitionClub(state, fixture.awayId)} />
        <b>{awayGoals}</b>
        <div className="matchday-goal-slot">
          {latestEvent && eventClub ? (
            <div className={`goal-flash ${latestEvent.type === 'injury' ? 'injury-flash' : ''}`} style={{ background: eventClub.primary, color: eventClub.secondary }}>
              {latestEvent.type === 'injury' ? '[+] ' : ''}{latestEvent.playerName.slice(0, latestEvent.type === 'injury' ? 15 : 18)} <span>{latestEvent.minute}'</span>
            </div>
          ) : null}
        </div>
        <span className="matchday-attendance">{attendance}</span>
      </div>
    )
  }

  const title = state.pendingMatchDay?.title ?? state.activeCompetition?.title ?? 'CAMPEONATO BRASILEIRO'
  const roundName = state.pendingMatchDay?.roundName ?? state.activeCompetition?.roundName ?? `${state.currentRound}ª JORNADA`

  return (
    <section className="original-matchday screen-blue">
      <div className="matchday-title">{competition === 'league' ? roundName : `${title} · ${roundName}`}</div>
      <div className={`matchday-board ${competition !== 'league' ? 'competition-matchday-board' : ''}`}>
        {competition === 'league' ? ([1, 2, 3, 4] as Division[]).map((division) => (
          <div className="matchday-division" key={division}>{fixtures.filter(({ fixture }) => fixture.division === division).map(renderFixture)}</div>
        )) : <div className="matchday-division competition-matchday-fixtures">{fixtures.map(renderFixture)}</div>}
      </div>
      <button type="button" className="matchday-progress" onClick={advance} aria-label={secondHalf ? 'Terminar partida' : 'Ir para o intervalo'}>
        <span style={{ width: `${((minute - startMinute) / (endMinute - startMinute)) * 100}%` }} />
      </button>
    </section>
  )
}
