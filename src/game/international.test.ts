import { ageStrengthFactor } from './development'
import { describe, expect, it } from 'vitest'
import { REAL_VETERANS } from '../data/international-veterans'
import { calculateAuctionFee, calculatePlayerSalary, calculatePlayerValue, calculateRegularAuctionMinimum } from './economy'
import { drawInternationalArrival, INTERNATIONAL_SELLER_ID, type InternationalMarketState } from './international'
import { retirementProbability } from './lifecycle'
import { hashText } from './rng'
import { createNewCareer } from './setup'
import type { Player } from './types'

function firstArrival(season = 2026) {
  for (let seed = 1; seed < 1_000; seed++) {
    const result = drawInternationalArrival(undefined, season, 1, seed, [], 576)
    if (result.listing) return { seed, ...result }
  }
  throw new Error('Expected an arrival seed')
}

function currentPlayer(name: string, sourceId: string): Player {
  return { id: `club:${sourceId}`, sourceId, name, position: 'M', age: 34, nationality: 'BRA', strength: 30,
    fitness: 100, morale: 75, salary: 4_300, value: 100_000, contractRounds: 14, contractSeasons: 1,
    goals: 0, appearances: 0, yellowCards: 0, suspensionRounds: 0, injuryRounds: 0, injuryProneness: 1, listed: false }
}

describe('rare international arrivals', () => {
  it('uses real eligible veterans, ordinary transfer prices, and one-season contracts', () => {
    const current = createNewCareer({ managerName: 'Exterior', seed: 77 })
    const players = [...current.clubs, ...(current.libertadores?.invitedClubs ?? [])].flatMap((club) => club.players)
    let arrivals = 0
    for (let seed = 1; seed <= 1_000; seed++) {
      const result = drawInternationalArrival(undefined, 2026, 1, seed, players, players.length)
      if (!result.listing) continue
      arrivals++
      const listing = result.listing
      const player = listing.internationalPlayer
      const identity = REAL_VETERANS.find((candidate) => `international-${candidate.id}` === player.sourceId)!
      expect(identity).toBeDefined()
      expect(player).toMatchObject({ name: identity.name, nationality: identity.nationality, position: identity.position,
        age: 2026 - identity.birthYear, contractRounds: 14, contractSeasons: 1, listed: false })
      expect(player.age).toBeGreaterThanOrEqual(31)
      expect(player.age).toBeLessThanOrEqual(38)
      expect(retirementProbability(player.age)).toBeLessThan(1)
      expect(player.strength).toBeLessThanOrEqual(identity.strength)
      expect(player.strength).toBe(Math.round(identity.strength * ageStrengthFactor(player.age)))
      expect(player.salary).toBe(calculatePlayerSalary(player.strength, player.age))
      expect(player.value).toBe(calculatePlayerValue(player.strength, player.age))
      expect(listing).toMatchObject({ sellerId: INTERNATIONAL_SELLER_ID, playerId: player.id,
        expiresAfterRound: 1, fee: calculateAuctionFee(player.value), minimumSalary: calculateRegularAuctionMinimum(player.salary) })
      expect(players.some((existing) => existing.id === player.id || existing.sourceId === player.sourceId || existing.name === player.name)).toBe(false)
    }
    expect(arrivals).toBeGreaterThan(50)
  })

  it('cannot reroll an offered round after serialization or regress its calendar', () => {
    const { seed, state, listing } = firstArrival()
    const saved = JSON.parse(JSON.stringify(state)) as InternationalMarketState
    const before = structuredClone(saved)
    expect(drawInternationalArrival(undefined, 2026, 1, seed, [], 576)).toEqual({ state, listing })
    expect(drawInternationalArrival(saved, 2026, 1, seed, [], 600)).toEqual({ state: saved })
    expect(drawInternationalArrival(saved, 2025, 14, seed, [], 600)).toEqual({ state: saved })
    expect(saved).toEqual(before)
    const next = drawInternationalArrival(saved, 2026, 2, seed, [], 600)
    expect(next.state).toMatchObject({ lastSeason: 2026, lastRound: 2, targetPlayerCount: 576 })
    expect(saved).toEqual(before)
    expect(drawInternationalArrival(saved, 2026, 2, seed + 1, [], 600)).toEqual(next)
  })

  it('remembers unsold arrivals across seasons and never repeats an identity', () => {
    let state: InternationalMarketState | undefined
    const offered = new Set<string>()
    for (let season = 2026; season <= 2060; season++) {
      for (let round = 1; round <= 14; round++) {
        const result = drawInternationalArrival(state, season, round, 777, [], 576)
        state = result.state
        if (!result.listing) continue
        const identity = result.listing.internationalPlayer.sourceId
        expect(offered.has(identity)).toBe(false)
        offered.add(identity)
      }
    }
    expect(offered.size).toBeGreaterThan(8)
    expect(state!.offeredIds).toHaveLength(offered.size)
  })

  it('also remembers rounds with no arrival instead of giving another draw after reload', () => {
    let seed = 1
    while (drawInternationalArrival(undefined, 2026, 1, seed, [], 576).listing) seed++
    const result = drawInternationalArrival(undefined, 2026, 1, seed, [], 576)
    const saved = JSON.parse(JSON.stringify(result.state)) as InternationalMarketState
    expect(result.listing).toBeUndefined()
    expect(drawInternationalArrival(saved, 2026, 1, firstArrival().seed, [], 576)).toEqual({ state: saved })
  })

  it.each(['normalized name', 'abbreviated name', 'source identity'] as const)('excludes players already in any supplied roster by %s', (match) => {
    const { seed } = firstArrival()
    const current = REAL_VETERANS.map((player) => {
      if (match === 'source identity') return currentPlayer('Nome diferente', `international-${player.id}`)
      const name = player.name.normalize('NFD').replace(/\p{M}/gu, '').toUpperCase()
      if (match === 'abbreviated name') {
        const parts = name.split(' ')
        return currentPlayer(parts.length > 1 ? `${parts[0][0]}. ${parts.slice(1).join(' ')}` : name, `existing-${player.id}`)
      }
      return currentPlayer(`  ${name.replaceAll(' ', '  ')}  `, `existing-${player.id}`)
    })
    expect(drawInternationalArrival(undefined, 2026, 1, seed, current, 576).listing).toBeUndefined()
  })

  it('prefers Brazilian returns with a 75% probability while both categories have candidates', () => {
    let brazilian = 0
    let arrivals = 0
    for (let seed = 1; seed <= 100_000; seed++) {
      const { listing } = drawInternationalArrival(undefined, 2026, 1, seed, [], 576)
      if (!listing) continue
      arrivals++
      if (listing.internationalPlayer.nationality === 'BRA') brazilian++
    }
    expect(arrivals).toBeGreaterThan(6_500)
    expect(brazilian / arrivals).toBeGreaterThan(0.73)
    expect(brazilian / arrivals).toBeLessThan(0.77)
  })

  it.each([true, false])('falls back to the available category when only Brazilian=%s candidates remain', (brazilian) => {
    const current = REAL_VETERANS.filter((player) => (player.nationality === 'BRA') !== brazilian)
      .map((player) => currentPlayer(player.name, `international-${player.id}`))
    let arrivals = 0
    for (let seed = 1; seed <= 500; seed++) {
      const { listing } = drawInternationalArrival(undefined, 2026, 1, seed, current, 576)
      if (!listing) continue
      arrivals++
      expect(listing.internationalPlayer.nationality === 'BRA').toBe(brazilian)
    }
    expect(arrivals).toBeGreaterThan(20)
  })

  it('matches a binomial season frequency, usually zero to three arrivals, without a hard cap', () => {
    const histogram = Array<number>(15).fill(0)
    const seasons = 50_000
    for (let seed = 1; seed <= seasons; seed++) {
      let state: InternationalMarketState | undefined
      let arrivals = 0
      for (let round = 1; round <= 14; round++) {
        const result = drawInternationalArrival(state, 2026, round, seed, [], 576)
        state = result.state
        if (result.listing) arrivals++
      }
      histogram[arrivals]++
    }
    const mean = histogram.reduce((total, count, arrivals) => total + count * arrivals, 0) / seasons
    expect(mean).toBeGreaterThan(0.98)
    expect(mean).toBeLessThan(1.02)
    expect(histogram.slice(0, 4).reduce((total, count) => total + count, 0) / seasons).toBeGreaterThan(0.98)
    expect(histogram.slice(4).reduce((total, count) => total + count, 0)).toBeGreaterThan(0)
    let combinations = 1
    for (let count = 0; count <= 3; count++) {
      if (count > 0) combinations *= (15 - count) / count
      const expected = combinations * (1 / 14) ** count * (13 / 14) ** (14 - count)
      expect(Math.abs(histogram[count] / seasons - expected)).toBeLessThan(0.006)
    }
  })

  it('has no fictional fallback when all identities are offered or have aged out', () => {
    const { seed, state } = firstArrival()
    const exhausted = { ...state, rngState: hashText(`${seed}:international-arrivals`), lastRound: 0, offeredIds: REAL_VETERANS.map((player) => player.id) }
    for (let round = 1; round <= 14; round++) {
      const result = drawInternationalArrival(exhausted, 2026, round, seed, [], 576)
      expect(result.listing).toBeUndefined()
      expect(result.state.offeredIds).toEqual(exhausted.offeredIds)
    }
    for (let sample = 1; sample <= 100; sample++) {
      expect(drawInternationalArrival(undefined, 2060, 1, sample, [], 576).listing).toBeUndefined()
    }
  })
})
