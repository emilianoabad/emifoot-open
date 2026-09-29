/// <reference types="node" />
import process from 'node:process'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { TACTICS } from './constants'
import { simulateFirstHalf, simulateSecondHalf } from './match'
import { expectedHalfGoals, goalScoringWeight, matchStrength } from './matchModel'
import { createLeagueSchedule } from './schedule'
import { getTable } from './selectors'
import { createNewCareer } from './setup'
import type { Club, Position, TacticId } from './types'

const initial = createNewCareer({ managerName: 'Match balance', seed: 7 })
const template = initial.clubs[0]

function team(id: string, strength: number, tacticId: TacticId = '4-4-2'): Club {
  const tactic = TACTICS.find((candidate) => candidate.id === tacticId)!
  const counts = { G: 1, D: tactic.defenders, M: tactic.midfielders, A: tactic.attackers }
  const players = (['G', 'D', 'M', 'A'] as const).flatMap((position) =>
    Array.from({ length: counts[position] }, (_, index) => ({
      ...template.players[0], id: `${id}-${position}${index}`, sourceId: `${id}-${position}${index}`,
      name: `${id}-${position}${index}`, position, strength, age: 26, fitness: 100, morale: 100,
      nationality: 'BRA', injuryRounds: 0, suspensionRounds: 0, injuryProneness: 0.1,
      neymarAuctionPending: undefined,
    })))
  return { ...template, id, name: id, division: 4, rating: strength, players, tactic: tacticId,
    lineup: players.map((player) => player.id), bench: [] }
}

function upgraded(club: Club, position: Position, strength = 50): Club {
  const copy = structuredClone(club)
  copy.players.find((player) => player.position === position)!.strength = strength
  return copy
}

function play(seed: number, home: Club, away: Club) {
  const first = simulateFirstHalf(seed, home, away)
  return simulateSecondHalf(first.rngState, home, away, first.pending)
}

function sample(club: Club, opponent: Club, count: number, alternateVenues = true) {
  let seed = 0x57249ab1
  let goals = 0, conceded = 0, squares = 0, wins = 0, draws = 0, losses = 0
  const scorers: Record<string, number> = {}
  for (let index = 0; index < count; index++) {
    const home = !alternateVenues || index % 2 === 0
    const match = play(seed, home ? club : opponent, home ? opponent : club)
    seed = match.rngState
    const own = home ? match.result.homeGoals : match.result.awayGoals
    const against = home ? match.result.awayGoals : match.result.homeGoals
    goals += own
    conceded += against
    squares += own ** 2
    wins += Number(own > against)
    draws += Number(own === against)
    losses += Number(own < against)
    for (const event of match.result.events) {
      if (event.type === 'goal' && event.clubId === club.id && event.playerId) scorers[event.playerId] = (scorers[event.playerId] ?? 0) + 1
    }
  }
  return { goals: goals / count, conceded: conceded / count, variance: squares / count - (goals / count) ** 2,
    winRate: wins / count, drawRate: draws / count, lossRate: losses / count,
    scorers: Object.fromEntries(Object.entries(scorers).map(([id, goals]) => [id, goals / count])) }
}

function report(label: string, value: unknown) {
  if (process.env.EMIFOOT_MATCH_REPORT === '1') console.info(label, JSON.stringify(value))
}

function sampleLeague(clubs: Club[], seasons: number) {
  const league = createLeagueSchedule(4, clubs.map((club) => club.id))
  const byId = new Map(clubs.map((club) => [club.id, club]))
  const totals = new Map(clubs.map((club) => [club.id, { clubId: club.id, titles: 0, wins: 0, draws: 0, losses: 0 }]))
  let seed = 0x78123451
  for (let season = 0; season < seasons; season++) {
    for (const fixture of league.rounds.flat()) {
      const match = play(seed, byId.get(fixture.homeId)!, byId.get(fixture.awayId)!)
      seed = match.rngState
      fixture.result = match.result
    }
    const table = getTable({ ...initial, clubs, leagues: [league] }, 4)
    totals.get(table[0].clubId)!.titles++
    for (const entry of table) {
      const total = totals.get(entry.clubId)!
      total.wins += entry.wins
      total.draws += entry.draws
      total.losses += entry.losses
    }
  }
  return [...totals.values()].map((total) => ({ clubId: total.clubId, titleRate: total.titles / seasons,
    winRate: total.wins / (14 * seasons), drawRate: total.draws / (14 * seasons), lossRate: total.losses / (14 * seasons) }))
}

describe('match mathematics', () => {
  it('makes every upgrade help both ends, with position-appropriate influence', () => {
    const club = team('home', 15)
    const opponent = matchStrength(team('away', 15))
    const baseline = matchStrength(club)
    const improvements = (['G', 'D', 'M', 'A'] as const).map((position) => {
      const stronger = matchStrength(upgraded(club, position))
      expect(expectedHalfGoals(stronger, opponent, true)).toBeGreaterThan(expectedHalfGoals(baseline, opponent, true))
      expect(expectedHalfGoals(opponent, stronger, false)).toBeLessThan(expectedHalfGoals(opponent, baseline, false))
      return { attack: stronger.attack - baseline.attack, defence: stronger.defence - baseline.defence }
    })
    for (let i = 1; i < improvements.length; i++) {
      expect(improvements[i].attack).toBeGreaterThan(improvements[i - 1].attack)
      expect(improvements[i].defence).toBeLessThan(improvements[i - 1].defence)
    }
    expect(improvements[1].defence / improvements[3].defence).toBeCloseTo(4)
  })

  it('is monotone in ability, fitness and morale throughout every formation', () => {
    fc.assert(fc.property(
      fc.constantFrom(...TACTICS.map((tactic) => tactic.id)), fc.integer({ min: 1, max: 49 }),
      fc.integer({ min: 1, max: 50 }), fc.integer({ min: 0, max: 10 }),
      fc.integer({ min: 20, max: 99 }), fc.integer({ min: 20, max: 99 }),
      (tactic, strength, opponentStrength, index, fitness, morale) => {
        const club = team('home', strength, tactic)
        club.players[index].fitness = fitness
        club.players[index].morale = morale
        const opponent = matchStrength(team('away', opponentStrength))
        const baseline = matchStrength(club)
        for (const field of ['strength', 'fitness', 'morale'] as const) {
          const copy = structuredClone(club)
          copy.players[index][field] += 1
          const improved = matchStrength(copy)
          expect(expectedHalfGoals(improved, opponent, true)).toBeGreaterThan(expectedHalfGoals(baseline, opponent, true))
          expect(expectedHalfGoals(opponent, improved, false)).toBeLessThan(expectedHalfGoals(opponent, baseline, false))
        }
      }), { seed: 98173, numRuns: 500 })
  })

  it('keeps relative quality and goal rates stable across the strength scale', () => {
    for (const tactic of TACTICS) {
      const reference = matchStrength(team('reference', 10, tactic.id))
      for (const strength of [15, 20, 30, 40, 50]) {
        const current = matchStrength(team('club', strength, tactic.id))
        expect(expectedHalfGoals(current, current, true)).toBeCloseTo(expectedHalfGoals(reference, reference, true), 12)
      }
    }
    const low = [matchStrength(team('home', 10)), matchStrength(team('away', 15))]
    const high = [matchStrength(team('home', 30)), matchStrength(team('away', 45))]
    expect(expectedHalfGoals(low[0], low[1], true)).toBeCloseTo(expectedHalfGoals(high[0], high[1], true), 12)
  })

  it('gives attacking formations more goals at both ends, without a free quality advantage', () => {
    const opponent = matchStrength(team('away', 25))
    const baseline = matchStrength(team('home', 25))
    for (const tactic of TACTICS) {
      const profile = matchStrength(team('home', 25, tactic.id))
      const attackRatio = expectedHalfGoals(profile, opponent, true) / expectedHalfGoals(baseline, opponent, true)
      const concededRatio = expectedHalfGoals(opponent, profile, false) / expectedHalfGoals(opponent, baseline, false)
      expect(attackRatio).toBeCloseTo(concededRatio, 12)
    }
    const attacking = matchStrength(team('attack', 25, '3-4-3'))
    const defensive = matchStrength(team('defence', 25, '6-4-0'))
    expect(expectedHalfGoals(attacking, opponent, true)).toBeGreaterThan(expectedHalfGoals(baseline, opponent, true))
    expect(expectedHalfGoals(defensive, opponent, true)).toBeLessThan(expectedHalfGoals(baseline, opponent, true))
  })

  it('cannot improve both ends by claiming a different formation with the same players', () => {
    for (const original of TACTICS) {
      const club = team('club', 25, original.id)
      const natural = matchStrength(club)
      for (const claimed of TACTICS.filter((candidate) => candidate.id !== original.id)) {
        const misplaced = matchStrength({ ...club, tactic: claimed.id })
        expect(misplaced.attack).toBeLessThan(natural.attack)
        expect(misplaced.defence).toBeLessThan(natural.defence)
      }
    }
  })

  it('does not reward duplicate or missing starters', () => {
    const club = team('club', 25)
    const complete = matchStrength(club)
    expect(matchStrength(club, [...club.lineup, club.lineup[0]])).toEqual(complete)
    for (const absent of club.lineup) {
      const incomplete = matchStrength(club, club.lineup.filter((id) => id !== absent))
      expect(incomplete.attack).toBeLessThan(complete.attack)
      expect(incomplete.defence).toBeLessThan(complete.defence)
    }
  })

  it('has positive, bounded scoring expectations even at extreme mismatches', () => {
    for (const attacking of TACTICS) for (const defending of TACTICS) {
      for (const [own, opponent] of [[1, 50], [50, 1]]) {
        const attack = matchStrength(team('home', own, attacking.id))
        const defence = matchStrength(team('away', opponent, defending.id))
        for (const home of [true, false]) {
          const goals = expectedHalfGoals(attack, defence, home)
          expect(goals).toBeGreaterThan(0)
          expect(goals).toBeLessThan(5)
        }
      }
    }
  })

  it('weights finishing by position, strength and condition, with zero goalkeeper weight', () => {
    const club = team('club', 15)
    const forward = club.players.find((player) => player.position === 'A')!
    expect(goalScoringWeight({ ...forward, strength: 45 })).toBeGreaterThan(3 * goalScoringWeight(forward))
    expect(goalScoringWeight({ ...forward, fitness: 20 })).toBeLessThan(goalScoringWeight(forward))
    expect(goalScoringWeight({ ...forward, morale: 20 })).toBeLessThan(goalScoringWeight(forward))
    expect(goalScoringWeight({ ...forward, position: 'G', strength: 50 })).toBe(0)
  })
})

describe('match and season balance', () => {
  it('replays identically without mutation or dependence on roster display order', () => {
    const home = team('home', 30), away = team('away', 25)
    const before = structuredClone([home, away])
    const reordered = structuredClone(home)
    reordered.players.reverse()
    reordered.lineup.reverse()
    for (let seed = 1; seed <= 100; seed++) {
      expect(play(seed, home, away)).toEqual(play(seed, reordered, away))
    }
    expect([home, away]).toEqual(before)
  })

  it('never assigns goals to goalkeepers, including formations without forwards', () => {
    for (const tactic of ['3-4-3', '4-4-2', '6-4-0'] as const) {
      const club = upgraded(team('home', 15, tactic), 'G')
      const matches = sample(club, team('away', 15), 2_000)
      expect(matches.scorers['home-G0']).toBeUndefined()
      expect(Object.values(matches.scorers).reduce((total, goals) => total + goals, 0)).toBeCloseTo(matches.goals, 10)
    }
  })

  it('preserves Poisson means, variance, draws and upsets for equal teams', () => {
    const home = team('home', 30), away = team('away', 30)
    const matches = sample(home, away, 20_000, false)
    const expected = 2 * expectedHalfGoals(matchStrength(home), matchStrength(away), true)
    expect(matches.goals).toBeCloseTo(expected, 1)
    expect(matches.variance).toBeCloseTo(expected, 1)
    expect(matches.drawRate).toBeGreaterThan(0.2)
    expect(matches.drawRate).toBeLessThan(0.3)
    expect(matches.lossRate).toBeGreaterThan(0.25)
    expect(matches.winRate).toBeGreaterThan(matches.lossRate)
    report('equal teams, fixed home venue', matches)
  })

  it('lets an exceptional lower-division forward score more and help prevent goals', () => {
    const ordinary = team('home', 15), opponent = team('away', 15)
    const star = upgraded(ordinary, 'A')
    const baseline = sample(ordinary, opponent, 20_000)
    const improved = sample(star, opponent, 20_000)
    expect(improved.goals).toBeGreaterThan(baseline.goals * 1.4)
    expect(improved.conceded).toBeLessThan(baseline.conceded * 0.95)
    expect(improved.scorers['home-A0']).toBeGreaterThan(baseline.scorers['home-A0'] * 3)
    expect(improved.scorers['home-A0']).toBeGreaterThan(improved.scorers['home-A1'] * 3)
    expect(improved.scorers['home-A0']).toBeLessThan(improved.goals * 0.75)
    expect(improved.lossRate).toBeGreaterThan(0.1)
    report('strength-15 team with ordinary forwards', baseline)
    report('same team with one strength-50 forward', improved)
  })

  it('makes a clearly stronger team usually win the season, while still losing individual games', () => {
    const clubs = Array.from({ length: 8 }, (_, index) => team(`club-${index}`, index === 0 ? 40 : 30))
    const seasons = 1_200
    const strongest = sampleLeague(clubs, seasons)[0]
    const { titleRate, winRate, lossRate } = strongest
    expect(titleRate).toBeGreaterThan(0.65)
    expect(titleRate).toBeLessThan(0.97)
    expect(winRate).toBeGreaterThan(0.6)
    expect(winRate).toBeLessThan(0.8)
    expect(lossRate).toBeGreaterThan(0.1)
    expect(titleRate).toBeGreaterThan(winRate + 0.1)
    report('strength-40 team against seven strength-30 teams', { seasons, ...strongest })
  }, 30_000)

  it('has no dominant formation among equally strong squads over repeated seasons', () => {
    const tactics: TacticId[] = ['3-4-3', '4-3-3', '4-4-2', '4-5-1', '5-2-3', '5-3-2', '5-5-0', '6-4-0']
    const clubs = tactics.map((tactic) => team(tactic, 30, tactic))
    const results = sampleLeague(clubs, 1_200)
    for (const club of results) {
      expect(club.titleRate).toBeGreaterThan(0.07)
      expect(club.titleRate).toBeLessThan(0.19)
      expect(Math.abs(club.winRate - club.lossRate)).toBeLessThan(0.025)
    }
    report('equal-quality squads with different formations', results)
  }, 30_000)
})
