import { describe, expect, it } from 'vitest'
import { parseGameState } from '../persistence/schema'
import { createNewCareer } from './setup'
import { prepareMarket } from './market'
import { acknowledgeAuctionResult, submitAuctionOffer } from './engine'
import { renewSquads } from './lifecycle'
import { getMarketPlayer } from './transfer'
import type { EngineResult } from './types'

function unwrap(result: EngineResult) {
  if (!result.ok) throw new Error(result.error)
  return result.state
}

function arrivingCareer() {
  for (let seed = 1; seed < 1000; seed++) {
    const state = createNewCareer({ managerName: 'Exterior', seed })
    if (state.market.some((listing) => listing.internationalPlayer)) return state
  }
  throw new Error('No arrival seed')
}

describe('international market integration', () => {
  it('appends a real arrival after the six regular auctions and persists it without rerolling', () => {
    const state = arrivingCareer()
    expect(state.market).toHaveLength(7)
    expect(state.market.slice(0, 6).every((listing) => !listing.internationalPlayer)).toBe(true)
    expect(state.market[6].internationalPlayer).toBeDefined()
    const before = structuredClone(state)
    const loaded = parseGameState(state)
    prepareMarket(loaded, [loaded.manager.clubId])
    expect(loaded).toEqual(before)
    expect(state.clubs.flatMap((club) => club.players).some((player) => player.id === state.market[6].playerId)).toBe(false)
  })

  it('runs the arrival through the ordinary queue and next-round flow', () => {
    let state = arrivingCareer()
    const arrivalId = state.market.at(-1)!.playerId
    state.phase = 'auction'
    for (let auction = 0; auction < 7; auction++) {
      expect(state.phase).toBe('auction')
      expect(Boolean(state.market[0].internationalPlayer)).toBe(auction === 6)
      expect(getMarketPlayer(state, state.market[0])).toBeDefined()
      state = unwrap(submitAuctionOffer(state))
      state = unwrap(acknowledgeAuctionResult(state))
    }
    expect(state.phase).toBe('pre-round')
    expect(state.clubs.flatMap((club) => club.players).filter((player) => player.id === arrivalId)).toHaveLength(1)
    state.currentRound += 1
    prepareMarket(state, [state.manager.clubId])
    expect(state.internationalMarket!.lastRound).toBe(2)
    expect(state.market.some((listing) => listing.internationalPlayer?.id === arrivalId)).toBe(false)
  })

  it('counts imported veterans against the original population when filling academy vacancies', () => {
    let state = arrivingCareer()
    const target = state.clubs.flatMap((club) => club.players).length
    state.market = [state.market.at(-1)!]
    state.phase = 'auction'
    state = unwrap(submitAuctionOffer(state))
    expect(state.clubs.flatMap((club) => club.players)).toHaveLength(target + 1)
    expect(state.internationalMarket!.targetPlayerCount).toBe(target)
    state.season++
    // Retire a full cohort, making the population target binding.
    for (const club of state.clubs) for (const player of club.players) player.age = 41
    renewSquads(state, [state.manager.clubId])
    expect(state.clubs.flatMap((club) => club.players)).toHaveLength(target)
    expect(state.offseason!.targetPlayerCount).toBe(target)
  })
})
