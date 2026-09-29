import { describe, expect, it } from 'vitest'
import { parseGameState } from '../persistence/schema'
import { MAX_SQUAD_SIZE } from './constants'
import { calculateAuctionFee, calculatePlayerSalary, calculatePlayerValue, calculateRegularAuctionMinimum } from './economy'
import { drawInternationalArrival, INTERNATIONAL_SELLER_ID } from './international'
import { createNewCareer } from './setup'
import { getAiTransferInterest, getAuctionBidEligibilityError, getAuctionSeller, getMarketPlayer, resolveAuctionListing } from './transfer'
import type { GameState, MarketListing, Player } from './types'

function fixture(real = true): { state: GameState; listing: MarketListing; player: Player } {
  const state = createNewCareer({ managerName: 'Exterior', seed: 81 })
  state.phase = 'auction'
  const current = [...state.clubs, ...(state.libertadores?.invitedClubs ?? [])].flatMap((club) => club.players)
  for (let seed = 1; seed < 1_000; seed++) {
    const arrival = drawInternationalArrival(undefined, state.season, 1, seed, current, state.clubs.reduce((count, club) => count + club.players.length, 0))
    if (!arrival.listing) continue
    const listing: MarketListing = arrival.listing
    if (!real) {
      const player = listing.internationalPlayer!
      Object.assign(player, { id: 'international-test-player', sourceId: 'international-test-player', name: 'Jogador de Teste', age: 34, strength: 40, nationality: 'BRA', position: 'A' })
      player.salary = calculatePlayerSalary(player.strength, player.age)
      player.value = calculatePlayerValue(player.strength, player.age)
      listing.playerId = player.id
      listing.fee = calculateAuctionFee(player.value)
      listing.minimumSalary = calculateRegularAuctionMinimum(player.salary)
    }
    state.market = [listing]
    state.internationalMarket = arrival.state
    return { state, listing, player: listing.internationalPlayer! }
  }
  throw new Error('Expected an international arrival')
}

const cashInLeague = (state: GameState) => state.clubs.reduce((sum, club) => sum + club.cash, 0)
const playerIds = (state: GameState) => state.clubs.flatMap((club) => club.players.map((player) => player.id))

describe('international auction transfers', () => {
  it('presents an outside seller without creating a domestic club', () => {
    const { state, listing, player } = fixture()
    expect(getAuctionSeller(state, listing.sellerId)).toMatchObject({ id: INTERNATIONAL_SELLER_ID, name: 'EXTERIOR', shortName: 'EXTERIOR' })
    expect(state.clubs.some((club) => club.id === INTERNATIONAL_SELLER_ID)).toBe(false)
    expect(getMarketPlayer(state, listing)).toBe(player)
    expect(playerIds(state)).not.toContain(player.id)
    expect(getAuctionSeller(state, 'missing-club')).toBeUndefined()
    expect(parseGameState(state)).toEqual(state)
  })

  it.each([true, false])('imports a real=%s player only into the winning human club and removes its fee from the economy', (real) => {
    const { state, listing, player } = fixture(real)
    for (const club of state.clubs) club.cash = club.id === state.manager.clubId ? 1_000_000 : 0
    const manager = state.clubs.find((club) => club.id === state.manager.clubId)!
    const originalOffer = structuredClone(listing)
    const beforeIds = playerIds(state)
    const beforeCash = cashInLeague(state)
    const result = resolveAuctionListing(state, listing.id, listing.minimumSalary)
    expect(result).toMatchObject({ success: true, clubId: manager.id, auction: { sellerId: INTERNATIONAL_SELLER_ID } })
    expect(playerIds(state)).toHaveLength(beforeIds.length + 1)
    expect(playerIds(state).filter((id) => id === player.id)).toHaveLength(1)
    const signed = manager.players.find((candidate) => candidate.id === player.id)!
    expect(signed).not.toBe(player)
    expect(signed).toMatchObject({ salary: listing.minimumSalary, contractRounds: 14, contractSeasons: 1, morale: 78, listed: false })
    expect(listing).toEqual(originalOffer)
    expect(cashInLeague(state)).toBe(beforeCash - listing.fee)
    expect(state.ledger).toHaveLength(1)
    expect(state.ledger[0]).toMatchObject({ clubId: manager.id, type: 'transfer', amount: -listing.fee, externalTransfer: true })
    expect(state.clubs.filter((club) => club.id !== manager.id).every((club) => club.cash === 0)).toBe(true)
    expect(manager.lineup.every((id) => manager.players.some((candidate) => candidate.id === id))).toBe(true)
    expect(parseGameState(state)).toEqual(state)
    const completed = structuredClone(state)
    expect(resolveAuctionListing(state, listing.id, listing.minimumSalary).text).toContain('CANCELADA')
    expect(state).toEqual(completed)
  })

  it('lets an affordable AI club win with an ordinary salary bid and the same cash sink', () => {
    const { state, listing, player } = fixture()
    const buyer = state.clubs.find((club) => club.id !== state.manager.clubId && getAiTransferInterest(club, player) > 0)!
    expect(buyer).toBeDefined()
    for (const club of state.clubs) club.cash = club.id === buyer.id ? 1_000_000 : 0
    const originalOffer = structuredClone(listing)
    const count = playerIds(state).length
    const result = resolveAuctionListing(state, listing.id)
    expect(result).toMatchObject({ success: false, clubId: buyer.id })
    const signed = buyer.players.find((candidate) => candidate.id === player.id)!
    expect(signed.salary).toBeGreaterThanOrEqual(listing.minimumSalary)
    expect(signed.salary).toBeLessThanOrEqual(Math.round(calculatePlayerSalary(player.strength, player.age) * 1.6 / 100) * 100)
    expect(signed.contractRounds).toBe(14)
    expect(playerIds(state)).toHaveLength(count + 1)
    expect(cashInLeague(state)).toBe(1_000_000 - listing.fee)
    expect(listing).toEqual(originalOffer)
    expect(state.ledger).toHaveLength(1)
    expect(state.ledger[0]).toMatchObject({ clubId: buyer.id, amount: -listing.fee, externalTransfer: true })
    expect(parseGameState(state)).toEqual(state)
  })

  it('leaves an unsold player outside all domestic squads and creates no cash entries', () => {
    const { state, listing, player } = fixture()
    for (const club of state.clubs) club.cash = 0
    const beforeIds = playerIds(state)
    const originalOffer = structuredClone(listing)
    const result = resolveAuctionListing(state, listing.id)
    expect(result).toMatchObject({ success: false, auction: { sellerId: INTERNATIONAL_SELLER_ID } })
    expect(result.clubId).toBeUndefined()
    expect(result.text).toContain('NÃO FOI TRANSFERIDO')
    expect(playerIds(state)).toEqual(beforeIds)
    expect(playerIds(state)).not.toContain(player.id)
    expect(state.ledger).toEqual([])
    expect(cashInLeague(state)).toBe(0)
    expect(listing).toEqual(originalOffer)
  })

  it.each(['cash', 'squad'] as const)('rejects an otherwise winning human bid that violates the %s limit', (constraint) => {
    const { state, listing, player } = fixture()
    for (const club of state.clubs) club.cash = 0
    const manager = state.clubs.find((club) => club.id === state.manager.clubId)!
    manager.cash = constraint === 'cash' ? listing.fee - 1 : 1_000_000
    if (constraint === 'squad') {
      while (manager.players.length < MAX_SQUAD_SIZE) {
        manager.players.push({ ...manager.players[0], id: `squad-filler-${manager.players.length}`, sourceId: `filler-${manager.players.length}` })
      }
    }
    expect(getAuctionBidEligibilityError(state, listing, manager.id)).toContain(constraint === 'cash' ? 'Dinheiro insuficiente' : 'Plantel cheio')
    const beforeIds = playerIds(state)
    const beforeCash = cashInLeague(state)
    const result = resolveAuctionListing(state, listing.id, 64_000)
    expect(result.clubId).toBeUndefined()
    expect(playerIds(state)).toEqual(beforeIds)
    expect(playerIds(state)).not.toContain(player.id)
    expect(cashInLeague(state)).toBe(beforeCash)
    expect(state.ledger).toEqual([])
  })

  it.each(['domestic', 'invited'] as const)('rejects an external identity already owned by a %s club', (scope) => {
    const { state, listing, player } = fixture()
    const club = scope === 'domestic' ? state.clubs[0] : state.libertadores!.invitedClubs[0]
    club.players[0].sourceId = player.sourceId
    const before = structuredClone(state)
    expect(getMarketPlayer(state, listing)).toBeUndefined()
    expect(resolveAuctionListing(state, listing.id, 64_000).text).toContain('CANCELADA')
    expect(state).toEqual(before)
  })

  it('requires a matching external payload and ignores it on domestic listings', () => {
    const { state, listing } = fixture()
    const invalid = { ...listing, playerId: 'another-player' }
    expect(getMarketPlayer(state, invalid)).toBeUndefined()
    const missing = { ...listing, internationalPlayer: undefined }
    expect(getMarketPlayer(state, missing)).toBeUndefined()
    const seller = state.clubs[0]
    const domestic = { ...listing, sellerId: seller.id, playerId: seller.players[0].id }
    expect(getMarketPlayer(state, domestic)).toBe(seller.players[0])
    expect(getAuctionSeller(state, seller.id)).toBe(seller)
  })
})
