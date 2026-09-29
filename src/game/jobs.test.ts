import { describe, expect, it } from 'vitest'
import { advanceAfterStandings } from './engine'
import { createJobOffers } from './jobs'
import { getClub, getTable } from './selectors'
import { createNewCareer } from './setup'
import type { Division, GameState } from './types'

function completedLeague(division: Division, position: number, reputation: number): GameState {
  const state = createNewCareer({ managerName: 'Treinador', seed: 77 })
  const managerClub = state.clubs.find((club) => club.division === division)!
  state.manager.clubId = managerClub.id
  state.manager.reputation = reputation
  for (const league of state.leagues) {
    const order = state.clubs.filter((club) => club.division === league.division).map((club) => club.id)
    if (league.division === division) {
      order.splice(order.indexOf(managerClub.id), 1)
      order.splice(position - 1, 0, managerClub.id)
    }
    for (const fixture of league.rounds.flat()) {
      const homeWins = order.indexOf(fixture.homeId) < order.indexOf(fixture.awayId)
      fixture.result = { homeGoals: homeWins ? 1 : 0, awayGoals: homeWins ? 0 : 1, attendance: 0, events: [] }
    }
  }
  return state
}

function nextDivision(state: GameState, clubId: string): number {
  const club = getClub(state, clubId)
  const position = getTable(state, club.division).findIndex((entry) => entry.clubId === clubId) + 1
  if (position <= 2) return Math.max(1, club.division - 1)
  if (position >= 7) return Math.min(4, club.division + 1)
  return club.division
}

describe('manager job offers', () => {
  it('offers strong first-division clubs to a successful first-division manager', () => {
    const state = completedLeague(1, 2, 85)
    const offers = createJobOffers(state)
    expect(offers).toHaveLength(3)
    expect(offers.every((offer) => nextDivision(state, offer.clubId) === 1)).toBe(true)
    expect(offers.every((offer) => getClub(state, offer.clubId).rating >= 43)).toBe(true)
  })

  it('opens the next tier after promotion, without jumping from division four to the elite', () => {
    const state = completedLeague(4, 1, 65)
    expect(createJobOffers(state).map((offer) => nextDivision(state, offer.clubId))).toEqual([3, 3, 3])
  })

  it('keeps an ordinary lower-division season within a credible level', () => {
    const state = completedLeague(4, 5, 35)
    expect(createJobOffers(state).every((offer) => nextDivision(state, offer.clubId) === 4)).toBe(true)
  })

  it.each(['cup', 'libertadores'] as const)('lets a %s title attract clubs two tiers above', (competition) => {
    const state = completedLeague(4, 3, 65)
    state[competition]!.championId = state.manager.clubId
    expect(createJobOffers(state).map((offer) => nextDivision(state, offer.clubId))).toEqual([2, 2, 2])
  })

  it('takes relegation into account when matching clubs and setting next-season objectives', () => {
    const state = completedLeague(1, 8, 85)
    const offers = createJobOffers(state)
    expect(offers.every((offer) => nextDivision(state, offer.clubId) === 2)).toBe(true)
    expect(offers.every((offer) => offer.objective === 'Lutar pelo acesso')).toBe(true)
  })

  it('always leaves a dismissed, low-reputation manager three distinct recovery options', () => {
    const state = completedLeague(4, 8, 10)
    state.manager.dismissed = true
    const offers = createJobOffers(state)
    expect(offers).toHaveLength(3)
    expect(new Set(offers.map((offer) => offer.clubId)).size).toBe(3)
    expect(offers.every((offer) => offer.clubId !== state.manager.clubId && nextDivision(state, offer.clubId) === 4)).toBe(true)
    expect(offers.every((offer) => getClub(state, offer.clubId).rating <= 31)).toBe(true)
  })

  it('varies comparable opportunities across seasons while preserving save and match determinism', () => {
    const state = completedLeague(1, 3, 45)
    const before = structuredClone(state)
    expect(createJobOffers(state)).toEqual(createJobOffers(state))
    expect(state).toEqual(before)
    const combinations = new Set(Array.from({ length: 20 }, (_, index) =>
      createJobOffers({ ...state, season: state.season + index }).map((offer) => offer.clubId).join(','),
    ))
    expect(combinations.size).toBeGreaterThan(1)
  })

  it('uses credible offers when the engine finalizes the season', () => {
    const state = completedLeague(1, 2, 85)
    state.currentRound = 14
    state.phase = 'standings'
    const otherClub = state.clubs.find((club) => club.id !== state.manager.clubId)!
    state.cup.championId = otherClub.id
    state.libertadores!.championId = otherClub.id
    const result = advanceAfterStandings(state)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    expect(result.state.phase).toBe('season-end')
    expect(result.state.manager.offers).toHaveLength(3)
    expect(result.state.manager.offers.every((offer) => nextDivision(result.state, offer.clubId) === 1 && getClub(result.state, offer.clubId).rating >= 43)).toBe(true)
  })
})
