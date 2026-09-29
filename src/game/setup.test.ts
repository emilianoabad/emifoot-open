import { afterEach, describe, expect, it, vi } from 'vitest'
import { AFFORDABLE_AUCTION_FEE } from './constants'
import { getManagerClub } from './selectors'
import { createNewCareer } from './setup'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('new career randomness', () => {
  it('uses fresh browser entropy for the club draw and opening market', () => {
    const entropy = [1, 4]
    vi.stubGlobal('crypto', {
      getRandomValues: (values: Uint32Array) => {
        values[0] = entropy.shift() ?? 1
        return values
      },
    })

    const first = createNewCareer({ managerName: 'Mesmo Nome' })
    const second = createNewCareer({ managerName: 'Mesmo Nome' })
    const marketSignature = (state: typeof first) => state.market.map((listing) => listing.playerId).join('|')

    expect(first.seed).toBe(1)
    expect(second.seed).toBe(4)
    expect(first.manager.clubId).not.toBe(second.manager.clubId)
    expect(marketSignature(first)).not.toBe(marketSignature(second))
  })

  it('keeps explicit seeds reproducible for tests and multiplayer synchronization', () => {
    const first = createNewCareer({ managerName: 'Teste', seed: 2026 })
    const second = createNewCareer({ managerName: 'Teste', seed: 2026 })

    expect(second).toEqual(first)
  })

  it('starts every player free to negotiate a one-year contract', () => {
    const state = createNewCareer({ managerName: 'Contratos', seed: 2026 })

    expect(state.clubs.every((club) => club.players.every((player) => (
      player.contractRounds === 0 && player.contractSeasons === 0
    )))).toBe(true)
  })

  it('offers at least two affordable players at their genuine fees to a new fourth-division manager', () => {
    for (let seed = 1; seed <= 100; seed += 1) {
      const state = createNewCareer({ managerName: 'Mercado inicial', seed })
      const managerClub = getManagerClub(state)
      let remainingCash = managerClub.cash
      let affordablePlayers = 0
      for (const listing of [...state.market].sort((a, b) => a.fee - b.fee)) {
        if (listing.fee > remainingCash) continue
        remainingCash -= listing.fee
        affordablePlayers += 1
      }

      expect(state.market.filter((listing) => listing.fee <= AFFORDABLE_AUCTION_FEE).length).toBeGreaterThanOrEqual(2)
      expect(affordablePlayers).toBeGreaterThanOrEqual(2)
    }
  })
})
