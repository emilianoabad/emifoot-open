import { describe, expect, it } from 'vitest'
import { buildNextCupRound, createCup, createLeagueSchedule } from './schedule'

describe('league schedule', () => {
  it('creates a balanced 14-round double round robin', () => {
    const clubs = Array.from({ length: 8 }, (_, index) => `club-${index + 1}`)
    const league = createLeagueSchedule(1, clubs)
    expect(league.rounds).toHaveLength(14)
    expect(league.rounds.every((round) => round.length === 4)).toBe(true)
    expect(league.rounds.flat()).toHaveLength(56)

    for (const club of clubs) {
      const fixtures = league.rounds.flat().filter((fixture) => fixture.homeId === club || fixture.awayId === club)
      expect(fixtures).toHaveLength(14)
      expect(fixtures.filter((fixture) => fixture.homeId === club)).toHaveLength(7)
      expect(fixtures.filter((fixture) => fixture.awayId === club)).toHaveLength(7)
      for (const opponent of clubs.filter((candidate) => candidate !== club)) {
        expect(fixtures.filter((fixture) => fixture.homeId === opponent || fixture.awayId === opponent)).toHaveLength(2)
      }
    }
  })

  it('alternates home and away without a seven-match first-leg road trip', () => {
    const clubs = Array.from({ length: 8 }, (_, index) => `club-${index + 1}`)
    const league = createLeagueSchedule(1, clubs)

    for (const club of clubs) {
      const venues = league.rounds.map((round) => round.find((fixture) => fixture.homeId === club || fixture.awayId === club)?.homeId === club ? 'home' : 'away')
      const firstLegHomeMatches = venues.slice(0, 7).filter((venue) => venue === 'home').length
      let longestRun = 1
      let currentRun = 1
      for (let index = 1; index < venues.length; index += 1) {
        currentRun = venues[index] === venues[index - 1] ? currentRun + 1 : 1
        longestRun = Math.max(longestRun, currentRun)
      }

      expect(firstLegHomeMatches).toBeGreaterThanOrEqual(3)
      expect(firstLegHomeMatches).toBeLessThanOrEqual(4)
      expect(longestRun).toBeLessThanOrEqual(2)
    }
  })
})

describe('Copa do Brasil bracket', () => {
  it('starts every season with all 32 clubs and produces five knockout rounds', () => {
    const clubIds = Array.from({ length: 32 }, (_, index) => `club-${index + 1}`)
    let cup = createCup(1234, clubIds).cup
    expect(cup.rounds[0]?.matches).toHaveLength(16)
    expect(new Set(cup.rounds[0]?.matches.flatMap((fixture) => [fixture.homeId, fixture.awayId]))).toEqual(new Set(clubIds))

    for (const winnerCount of [16, 8, 4, 2, 1]) {
      cup = buildNextCupRound(cup, Array.from({ length: winnerCount }, (_, index) => `winner-${winnerCount}-${index}`))
    }

    expect(cup.rounds.map((round) => round.matches.length)).toEqual([16, 8, 4, 2, 1])
    expect(cup.championId).toBe('winner-1-0')
  })
})
