import { describe, expect, it } from 'vitest'
import { parseGameState } from '../persistence/schema'
import { setPlayerContract } from './contracts'
import { calculateAuctionFee, calculatePlayerSalary, calculatePlayerValue } from './economy'
import { autoPickLineup } from './lineup'
import { createNewCareer } from './setup'
import {
  createMarketListings,
  evaluateSalaryDemands,
  getAiAuctionCandidates,
  getAiTransferInterest,
  getPlayerSaleQuote,
  rebalanceAiSquads,
  resolveAuctionListing,
  selectAiTransferBuyer,
} from './transfer'
import type { Club, MarketListing, Player, Position } from './types'

function setSquad(club: Club, strength: number): void {
  const template = club.players[0]
  const positions: Position[] = ['G', 'G', 'D', 'D', 'D', 'D', 'D', 'D', 'M', 'M', 'M', 'M', 'M', 'M', 'A', 'A', 'A', 'A']
  club.tactic = '4-4-2'
  club.players = positions.map((position, index) => {
    const player = { ...template, id: `${club.id}-test-${index}`, sourceId: `${club.id}-test-${index}`, position, strength, age: 26, nationality: 'BRA', neymarAuctionPending: false, listed: false }
    player.salary = calculatePlayerSalary(strength, player.age)
    player.value = calculatePlayerValue(strength, player.age)
    setPlayerContract(player, 0)
    return player
  })
  Object.assign(club, autoPickLineup(club))
}

function surplusFixture() {
  const state = createNewCareer({ managerName: 'Recrutamento', seed: 91 })
  const seller = state.clubs.find((club) => club.division === 1)!
  const buyer = state.clubs.find((club) => club.division === 2)!
  for (const club of state.clubs) club.cash = 0
  seller.cash = 9_000_000
  buyer.cash = 9_000_000
  setSquad(seller, 42)
  setSquad(buyer, 20)
  const extras = Array.from({ length: 6 }, (_, index): Player => ({
    ...seller.players[8], id: `surplus-${index}`, sourceId: `surplus-${index}`, strength: 30,
    value: calculatePlayerValue(30, 26), salary: calculatePlayerSalary(30, 26),
  }))
  seller.players.push(...extras)
  Object.assign(seller, autoPickLineup(seller))
  state.market = []
  return { state, seller, buyer, extras }
}

function listingFor(seller: Club, player: Player): MarketListing {
  return { id: `test-${player.id}`, sellerId: seller.id, playerId: player.id, fee: calculateAuctionFee(player.value), minimumSalary: player.salary, expiresAfterRound: 1 }
}

describe('AI squad recruitment', () => {
  it('values a positional improvement and useful depth, and ignores redundant weaker players regardless of cash', () => {
    const state = createNewCareer({ managerName: 'Mérito', seed: 91 })
    const club = state.clubs.find((candidate) => candidate.division === 1)!
    setSquad(club, 40)
    const candidate = { ...club.players[14], id: 'candidate', strength: 46 }
    expect(getAiTransferInterest(club, candidate)).toBeGreaterThan(0)
    candidate.strength = 38
    expect(getAiTransferInterest(club, candidate)).toBe(0)
    club.cash = 1_000_000_000
    expect(getAiTransferInterest(club, candidate)).toBe(0)
    club.players.pop()
    expect(getAiTransferInterest(club, candidate)).toBeGreaterThan(0)
  })

  it('prefers a suitable division and need without forbidding an ambitious lower-division purchase', () => {
    const state = createNewCareer({ managerName: 'Prioridades', seed: 91 })
    const first = state.clubs.find((club) => club.division === 1)!
    const fourth = state.clubs.find((club) => club.division === 4)!
    setSquad(first, 39)
    setSquad(fourth, 10)
    const player = { ...first.players[14], strength: 45 }
    expect(getAiTransferInterest(first, player)).toBeGreaterThan(getAiTransferInterest(fourth, player) * 20)
    expect(getAiTransferInterest(fourth, player)).toBeGreaterThan(0)
    let firstDivisionWins = 0
    for (let seed = 1; seed <= 5_000; seed++) {
      state.rngState = seed
      if (selectAiTransferBuyer(state, [first, fourth], player)?.id === first.id) firstDivisionWins++
    }
    expect(firstDivisionWins / 5_000).toBeGreaterThan(0.98)
    expect(firstDivisionWins).toBeLessThan(5_000)
  })

  it('shares affordable, useful, non-human candidates and deterministic selection', () => {
    const state = createNewCareer({ managerName: 'Candidatos', seed: 91 })
    const seller = state.clubs.find((club) => club.division === 1)!
    const buyer = state.clubs.find((club) => club.division === 2)!
    const otherHuman = state.clubs.find((club) => club.division === 3)!
    for (const club of state.clubs) club.cash = 0
    for (const club of [buyer, otherHuman]) { setSquad(club, 20); club.cash = 9_000_000 }
    const player = { ...seller.players[14], strength: 35 }
    const listing = listingFor(seller, player)
    const before = structuredClone(state)
    const candidates = getAiAuctionCandidates(state, listing, player, listing.minimumSalary, [state.manager.clubId, otherHuman.id])
    expect(candidates.map((club) => club.id)).toEqual([buyer.id])
    expect(state).toEqual(before)
    expect(getAiAuctionCandidates(state, listing, player, listing.minimumSalary - 100)).toEqual([])
    const copy = structuredClone(state)
    expect(selectAiTransferBuyer(state, candidates, player)?.id).toBe(selectAiTransferBuyer(copy, candidates, player)?.id)
    expect(state.rngState).toBe(copy.rngState)
  })

  it('sells full AI squads’ surplus through real transfers, preserving population, cash, and human ownership', () => {
    const { state, seller, buyer, extras } = surplusFixture()
    const managed = state.clubs.find((club) => club.id === state.manager.clubId)!
    const humanBefore = structuredClone(managed)
    const idsBefore = state.clubs.flatMap((club) => club.players.map((player) => player.id)).sort()
    const cashBefore = state.clubs.reduce((sum, club) => sum + club.cash, 0)
    const balances = new Map(state.clubs.map((club) => [club.id, club.cash]))
    rebalanceAiSquads(state)
    expect(seller.players).toHaveLength(18)
    expect(buyer.players).toHaveLength(24)
    expect(buyer.players.filter((player) => extras.some((extra) => extra.id === player.id))).toHaveLength(6)
    expect(state.clubs.flatMap((club) => club.players.map((player) => player.id)).sort()).toEqual(idsBefore)
    expect(state.clubs.reduce((sum, club) => sum + club.cash, 0)).toBe(cashBefore)
    expect(state.ledger).toHaveLength(12)
    expect(state.ledger.reduce((sum, entry) => sum + entry.amount, 0)).toBe(0)
    for (const club of state.clubs) {
      expect(club.cash - balances.get(club.id)!).toBe(state.ledger.filter((entry) => entry.clubId === club.id).reduce((sum, entry) => sum + entry.amount, 0))
      expect(club.lineup.every((id) => club.players.some((player) => player.id === id))).toBe(true)
    }
    expect(managed).toEqual(humanBefore)
    const elite = buyer.players[14]
    Object.assign(elite, { strength: 48, salary: calculatePlayerSalary(48, 26), value: calculatePlayerValue(48, 26) })
    const listing = listingFor(buyer, elite)
    expect(getAiAuctionCandidates(state, listing, elite, elite.salary).map((club) => club.id)).toContain(seller.id)
    state.market = [listing]
    const result = resolveAuctionListing(state, listing.id)
    expect(result.clubId).toBe(seller.id)
    expect(seller.players.find((player) => player.id === elite.id)?.strength).toBe(48)
    expect(seller.players).toHaveLength(19)
    expect(state.clubs.flatMap((club) => club.players.map((player) => player.id)).sort()).toEqual(idsBefore)
    expect(state.clubs.reduce((sum, club) => sum + club.cash, 0)).toBe(cashBefore)
    expect(managed).toEqual(humanBefore)
    expect(parseGameState(state)).toEqual(state)
  })

  it('keeps surplus when no club needs or can afford it, and never sells protected contracts or queued offers', () => {
    const { state, seller, buyer, extras } = surplusFixture()
    buyer.cash = 0
    const before = structuredClone(state)
    rebalanceAiSquads(state)
    expect(state).toEqual(before)
    buyer.cash = 9_000_000
    setPlayerContract(extras[0])
    state.market = [listingFor(seller, extras[1])]
    rebalanceAiSquads(state)
    expect(seller.players).toHaveLength(18)
    expect(seller.players.some((player) => player.id === extras[0].id)).toBe(true)
    expect(seller.players.some((player) => player.id === extras[1].id)).toBe(true)
    expect(state.market).toHaveLength(1)
  })

  it('protects every human club during AI rebalancing, including multiplayer guests', () => {
    const { state, seller } = surplusFixture()
    const before = structuredClone(seller)
    rebalanceAiSquads(state, [state.manager.clubId, seller.id])
    expect(seller).toEqual(before)
    expect(state.ledger).toEqual([])
  })

  it('supplies two available elites and two affordable alternatives without inventing players or discounts', () => {
    const state = createNewCareer({ managerName: 'Oferta', seed: 91 })
    const club = state.clubs.find((candidate) => candidate.division === 1)!
    setSquad(club, 40)
    for (let round = 1; round <= 14; round++) {
      const { listings } = createMarketListings(round * 9_173, state.clubs, state.manager.clubId, round)
      expect(listings).toHaveLength(6)
      const elites = listings.filter((listing) => state.clubs.find((seller) => seller.id === listing.sellerId)!.players.find((player) => player.id === listing.playerId)!.strength >= 40)
      expect(elites.length).toBeGreaterThanOrEqual(2)
      expect(listings.filter((listing) => listing.fee <= 40_000).length).toBeGreaterThanOrEqual(2)
      expect(new Set(listings.map((listing) => listing.playerId)).size).toBe(6)
      for (const listing of listings) {
        const player = state.clubs.find((seller) => seller.id === listing.sellerId)!.players.find((candidate) => candidate.id === listing.playerId)!
        expect(listing.fee).toBe(calculateAuctionFee(player.value))
      }
    }
  })

  it('reviews expired AI wages against current ability without blocking future transfers or changing human contracts', () => {
    const state = createNewCareer({ managerName: 'Ordenados', seed: 91 })
    const club = state.clubs.find((candidate) => candidate.division === 1)!
    const guest = state.clubs.find((candidate) => candidate.division === 2)!
    const managed = [state.manager.clubId, guest.id]
    for (const team of state.clubs) for (const player of team.players) setPlayerContract(player, 14)
    const aging = club.players[0]
    const improving = club.players[1]
    Object.assign(aging, { strength: 20, age: 36, salary: 20_000, listed: true })
    Object.assign(improving, { strength: 48, age: 26, salary: 1_000 })
    setPlayerContract(aging, 0)
    setPlayerContract(improving, 0)
    const activeContract = club.players[2]
    activeContract.salary = 1_000
    const humanBefore = structuredClone(state.clubs.filter((candidate) => managed.includes(candidate.id)))
    expect(evaluateSalaryDemands(state, managed)).toEqual([])
    expect(aging.salary).toBe(calculatePlayerSalary(20, 36))
    expect(improving.salary).toBe(calculatePlayerSalary(48, 26))
    expect([aging.contractRounds, improving.contractRounds]).toEqual([0, 0])
    expect(aging.listed).toBe(false)
    expect(activeContract.salary).toBe(1_000)
    expect(state.clubs.filter((candidate) => managed.includes(candidate.id))).toEqual(humanBefore)
  })

  it('does not turn a cash-rich league into guaranteed offers for unwanted players', () => {
    const state = createNewCareer({ managerName: 'Sem interesse', seed: 91 })
    for (const club of state.clubs) { setSquad(club, 40); club.cash = 9_000_000 }
    const seller = state.clubs.find((club) => club.id === state.manager.clubId)!
    const player = seller.players[14]
    Object.assign(player, { strength: 10, salary: 1_000, value: calculatePlayerValue(10, 26) })
    const listing = listingFor(seller, player)
    state.market = [listing]
    expect(getPlayerSaleQuote(state, player.id)).toEqual({ ok: false, error: 'Nenhum clube apresentou proposta.' })
    expect(resolveAuctionListing(state, listing.id).clubId).toBeUndefined()
    expect(state.ledger).toEqual([])
  })
})
