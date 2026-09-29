import { expectedHalfGoals, goalScoringWeight, matchPlayers, matchStrength } from './matchModel'
import { isNeymarEasterEgg } from './easterEggs'
import { random, randomInt } from './rng'
import type { Club, MatchEvent, MatchResult, PendingMatch, Player } from './types'

interface SimulatedHalf {
  homeGoals: number
  awayGoals: number
  events: MatchEvent[]
  rngState: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function poisson(state: number, lambda: number): { value: number; state: number } {
  const limit = Math.exp(-lambda)
  let probability = 1
  let count = 0
  let nextState = state
  do {
    count += 1
    const roll = random(nextState)
    nextState = roll.state
    probability *= roll.value
  } while (probability > limit)
  return { value: count - 1, state: nextState }
}

function pickScorer(state: number, club: Club, lineup: string[]): { player: Player; state: number } {
  const candidates = matchPlayers(club, lineup)
    .map((player) => ({ player, weight: goalScoringWeight(player) }))
    .filter(({ weight }) => weight > 0)
  if (!candidates.length) throw new Error('Cannot select a scorer without an outfield player')
  const roll = random(state)
  let remaining = roll.value * candidates.reduce((total, candidate) => total + candidate.weight, 0)
  for (const candidate of candidates) {
    remaining -= candidate.weight
    if (remaining < 0) return { player: candidate.player, state: roll.state }
  }
  return { player: candidates[candidates.length - 1].player, state: roll.state }
}

export function calculateAttendance(home: Club, away: Club, homeLeaguePosition?: number): number {
  const priceEffect = clamp(1.25 - home.ticketPrice / 90, 0.35, 1.1)
  const form = home.form.slice(-5)
  const formPoints = form.reduce((sum, result) => sum + (result === 'V' ? 3 : result === 'E' ? 1 : 0), 0)
  // Unplayed matches count as neutral form, so one opening win is not a streak.
  const formEffect = 1 + ((formPoints + (5 - form.length) * 1.5) / 15 - 0.5) * 0.6
  const positionEffect = homeLeaguePosition === 1 ? 1.15 : homeLeaguePosition === 2 ? 1.08 : 1
  const draw = home.supporters * (0.45 + away.rating / 90) * priceEffect
    * (0.75 + home.stadium.condition / 350) * formEffect * positionEffect
  return Math.min(home.stadium.capacity, Math.max(800, Math.round(draw)))
}

function simulateHalf(
  state: number,
  home: Club,
  away: Club,
  homeLineup: string[],
  awayLineup: string[],
  minuteStart: number,
  minuteEnd: number,
): SimulatedHalf {
  let nextState = state
  const homeStrength = matchStrength(home, homeLineup)
  const awayStrength = matchStrength(away, awayLineup)
  const homeRoll = poisson(nextState, expectedHalfGoals(homeStrength, awayStrength, true))
  nextState = homeRoll.state
  const awayRoll = poisson(nextState, expectedHalfGoals(awayStrength, homeStrength, false))
  nextState = awayRoll.state
  const events: MatchEvent[] = []

  // Schedule the recurring injury before selecting scorers: he cannot score
  // or receive a card after leaving the pitch.
  if (minuteStart >= 46) {
    for (const [club, lineup] of [[home, homeLineup], [away, awayLineup]] as const) {
      const neymar = club.players.find((player) => lineup.includes(player.id) && isNeymarEasterEgg(player) && player.injuryRounds === 0)
      if (!neymar) continue
      const minute = randomInt(nextState, minuteStart, minuteEnd)
      const duration = randomInt(minute.state, 2, 4)
      nextState = duration.state
      events.push({ minute: minute.value, type: 'injury', clubId: club.id, playerId: neymar.id, playerName: neymar.name, durationRounds: duration.value, detail: `[+] ${duration.value} jogos` })
    }
  }
  const onPitch = (player: Player, minute: number) => !events.some((event) => event.type === 'injury' && event.playerId === player.id && event.minute <= minute)

  const addGoals = (club: Club, lineup: string[], count: number) => {
    for (let index = 0; index < count; index += 1) {
      const minute = randomInt(nextState, minuteStart, minuteEnd)
      nextState = minute.state
      const activeLineup = lineup.filter((id) => !events.some((event) => event.type === 'injury' && event.playerId === id && event.minute <= minute.value))
      const scorer = pickScorer(nextState, club, activeLineup)
      nextState = scorer.state
      events.push({ minute: minute.value, type: 'goal', clubId: club.id, playerId: scorer.player.id, playerName: scorer.player.name })
    }
  }
  addGoals(home, homeLineup, homeRoll.value)
  addGoals(away, awayLineup, awayRoll.value)

  for (const [club, lineup] of [[home, homeLineup], [away, awayLineup]] as const) {
    const cardRoll = random(nextState)
    nextState = cardRoll.state
    if (cardRoll.value < 0.34) {
      const candidates = matchPlayers(club, lineup)
        // His scripted second-half exit takes precedence over random red cards.
        .filter((player) => !isNeymarEasterEgg(player) || cardRoll.value >= 0.025)
      const index = randomInt(nextState, 0, candidates.length - 1)
      nextState = index.state
      const minute = randomInt(nextState, minuteStart, minuteEnd)
      nextState = minute.state
      if (onPitch(candidates[index.value], minute.value)) events.push({ minute: minute.value, type: cardRoll.value < 0.025 ? 'red' : 'yellow', clubId: club.id, playerId: candidates[index.value].id, playerName: candidates[index.value].name })
    }
    const injuryRoll = random(nextState)
    nextState = injuryRoll.state
    if (injuryRoll.value < 0.018) {
      const candidates = matchPlayers(club, lineup)
        .filter((player) => !isNeymarEasterEgg(player))
      const weightedCandidates = candidates.flatMap((player) => Array.from({ length: Math.max(1, Math.round(player.injuryProneness * 10)) }, () => player))
      const index = randomInt(nextState, 0, weightedCandidates.length - 1)
      nextState = index.state
      const minute = randomInt(nextState, minuteStart, minuteEnd)
      nextState = minute.state
      const durationRoll = random(nextState)
      nextState = durationRoll.state
      const durationRounds = durationRoll.value < 0.58 ? 1 : durationRoll.value < 0.84 ? 2 : durationRoll.value < 0.96 ? 3 : 4
      const injured = weightedCandidates[index.value]
      events.push({
        minute: minute.value,
        type: 'injury',
        clubId: club.id,
        playerId: injured.id,
        playerName: injured.name,
        durationRounds,
        detail: `[+] ${durationRounds} jogo${durationRounds === 1 ? '' : 's'}`,
      })
    }
  }

  return { homeGoals: homeRoll.value, awayGoals: awayRoll.value, events: events.sort((a, b) => a.minute - b.minute), rngState: nextState }
}

export function simulateFirstHalf(state: number, home: Club, away: Club, homeLeaguePosition?: number): { pending: PendingMatch; rngState: number } {
  const half = simulateHalf(state, home, away, home.lineup, away.lineup, 1, 45)
  return {
    pending: {
      fixtureId: '',
      homeId: home.id,
      awayId: away.id,
      homeGoals: half.homeGoals,
      awayGoals: half.awayGoals,
      attendance: calculateAttendance(home, away, homeLeaguePosition),
      events: half.events,
      homeLineup: [...home.lineup],
      awayLineup: [...away.lineup],
    },
    rngState: half.rngState,
  }
}

export function simulateSecondHalf(state: number, home: Club, away: Club, pending: PendingMatch): { result: MatchResult; rngState: number } {
  const half = simulateHalf(state, home, away, home.lineup, away.lineup, 46, 90)
  return {
    result: {
      homeGoals: pending.homeGoals + half.homeGoals,
      awayGoals: pending.awayGoals + half.awayGoals,
      attendance: pending.attendance,
      events: [...pending.events, ...half.events].sort((a, b) => a.minute - b.minute),
    },
    rngState: half.rngState,
  }
}
