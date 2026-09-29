import { describe, expect, it } from 'vitest'
import { createNewCareer } from './setup'
import { calculateAiAuctionSalary, calculateAuctionFee, calculatePlayerSalary, calculatePlayerValue, calculateRegularAuctionMinimum } from './economy'
import { setPlayerContract } from './contracts'
import { canAiAffordTransfer, createMarketListings, resolveAuctionListing, sellPlayerToAi } from './transfer'
import type { GameState } from './types'

describe('transfer pricing and accounting', () => {
  it('does not compound prices or wages through 200 resales in a cash-rich league', () => {
    const state = createNewCareer({ managerName: 'Inflação', seed: 81 })
    for (const club of state.clubs) club.cash = 1_000_000_000
    const target = state.clubs[0].players.find((player) => player.position !== 'G')!
    target.strength = 40
    target.age = 26
    target.value = calculatePlayerValue(target.strength, target.age)
    target.salary = calculatePlayerSalary(target.strength, target.age)
    const salaryCeiling = Math.round(target.salary * 1.6 / 100) * 100
    const openingCash = state.clubs.reduce((total, club) => total + club.cash, 0)
    for (let trade = 0; trade < 200; trade++) {
      const seller = state.clubs.find((club) => club.players.some((player) => player.id === target.id))!
      const player = seller.players.find((player) => player.id === target.id)!
      setPlayerContract(player, 0)
      state.market = [{
        id: `resale-${trade}`, sellerId: seller.id, playerId: player.id,
        fee: calculateAuctionFee(player.value), minimumSalary: calculateRegularAuctionMinimum(player.salary), expiresAfterRound: 1,
      }]
      const sale = resolveAuctionListing(state, state.market[0].id)
      expect(sale.clubId, `trade ${trade}`).toBeDefined()
      expect(sale.auction?.fee, `trade ${trade}`).toBe(118_000)
      const transferred = state.clubs.find((club) => club.id === sale.clubId)!.players.find((candidate) => candidate.id === target.id)!
      expect(transferred.salary).toBeLessThanOrEqual(salaryCeiling)
      expect(state.clubs.reduce((total, club) => total + club.cash, 0)).toBe(openingCash)
    }
  })

  it('keeps the same market and fees regardless of any human club balance, including debt and multiplayer', () => {
    for (const seed of [1, 82, 9_431]) {
      const state = createNewCareer({ managerName: 'Preço', seed })
      const ids = state.clubs.filter((club) => club.division === 4).map((club) => club.id)
      for (const managedIds of [[state.manager.clubId], ids]) {
        const reference = createMarketListings(state.rngState, state.clubs, managedIds, 3)
        expect(reference.listings[0].playerId).toBe('santos:espn-132948')
        expect(reference.listings[0].fee).toBeGreaterThan(100_000)
        for (const cash of [-100_000, 0, 1_000, 9_000, 100_000, 100_000_000]) {
          const clubs = structuredClone(state.clubs)
          for (const club of clubs) if (managedIds.includes(club.id)) club.cash = cash
          expect(createMarketListings(state.rngState, clubs, managedIds, 3)).toEqual(reference)
          // One poor member must not discount an otherwise wealthy league.
          clubs.find((club) => club.id === managedIds[0])!.cash = -100_000
          expect(createMarketListings(state.rngState, clubs, managedIds, 3)).toEqual(reference)
        }
      }
    }
  })

  it('keeps higher-quality players more expensive and fixed-quality prices stable over repeated auctions', () => {
    const ordinaryFee = calculateAuctionFee(calculatePlayerValue(20, 26))
    const eliteFee = calculateAuctionFee(calculatePlayerValue(40, 26))
    expect(eliteFee).toBeGreaterThan(ordinaryFee)
    expect(eliteFee).toBeLessThanOrEqual(ordinaryFee * 4.5)
    const state = createNewCareer({ managerName: 'Índice', seed: 81 })
    const prices = new Map<string, number>()
    for (let round = 1; round <= 100; round++) {
      const market = createMarketListings(round * 7_919, state.clubs, state.manager.clubId, round)
      for (const listing of market.listings) {
        if (prices.has(listing.playerId)) expect(listing.fee).toBe(prices.get(listing.playerId))
        prices.set(listing.playerId, listing.fee)
      }
    }
    expect(new Set(prices.values()).size).toBeGreaterThan(10)
  })

  it('lets every fourth-division club buy the round-three star and retain a round of operating costs', () => {
    const clubs = createNewCareer({ managerName: 'Reforço', seed: 82 }).clubs.filter((club) => club.division === 4)
    for (const club of clubs) {
      const state = createNewCareer({ managerName: 'Reforço', seed: 82 })
      state.manager.clubId = club.id
      state.currentRound = 3
      const market = createMarketListings(state.rngState, state.clubs, club.id, state.currentRound)
      state.market = market.listings
      state.rngState = market.rngState
      const listing = state.market[0]
      const player = state.clubs.find((seller) => seller.id === listing.sellerId)!.players.find((candidate) => candidate.id === listing.playerId)!
      const manager = state.clubs.find((candidate) => candidate.id === club.id)!
      const salary = calculateAiAuctionSalary(listing.minimumSalary, 1, calculatePlayerSalary(player.strength, player.age))

      expect(player.strength).toBeGreaterThanOrEqual(40)
      const result = resolveAuctionListing(state, listing.id, salary)
      expect(result.success).toBe(true)
      expect(manager.players.find((candidate) => candidate.id === player.id)?.strength).toBe(player.strength)
      expect(manager.cash).toBe(club.cash - listing.fee)
      const payroll = manager.players.reduce((sum, candidate) => sum + candidate.salary, 0)
      expect(manager.cash).toBeGreaterThanOrEqual(payroll + Math.round(manager.stadium.capacity * 0.12))
    }
  })

  it('makes a strength-40 signing a major fourth-division purchase with operating cash left, while young superstars cost more', () => {
    const clubs = createNewCareer({ managerName: 'Orçamento', seed: 82 }).clubs.filter((club) => club.division === 4)
    const eliteFee = calculateAuctionFee(calculatePlayerValue(40, 26))
    const salary = calculateAiAuctionSalary(4_500, 1, calculatePlayerSalary(40, 26))
    for (const club of clubs) {
      expect(eliteFee).toBeGreaterThan(club.cash / 2)
      const payroll = club.players.reduce((sum, player) => sum + player.salary, salary)
      expect(club.cash - eliteFee).toBeGreaterThan(payroll + Math.round(club.stadium.capacity * 0.12))
    }
    const superstarFee = calculateAuctionFee(calculatePlayerValue(50, 20))
    expect(superstarFee).toBeGreaterThan(Math.min(...clubs.map((club) => club.cash)))
    expect(superstarFee).toBeLessThanOrEqual(Math.max(...clubs.map((club) => club.cash)))
    expect(calculatePlayerValue(50, 34)).toBeLessThan(calculatePlayerValue(50, 20))
  })

  it('preserves entry-level fees while reducing the premium for strong players', () => {
    expect(calculateAuctionFee(calculatePlayerValue(10, 26))).toBe(5_000)
    expect(calculateAuctionFee(calculatePlayerValue(15, 26))).toBe(15_000)
    expect(calculateAuctionFee(calculatePlayerValue(40, 26))).toBe(118_000)
    expect(calculateAuctionFee(calculatePlayerValue(50, 26))).toBe(185_000)
  })

  it('does not propagate a human-inflated wage through AI bids or buy a contract the AI cannot afford to maintain', () => {
    const state = createNewCareer({ managerName: 'Ordenados', seed: 82 })
    const listing = state.market[0]
    const player = state.clubs.find((club) => club.id === listing.sellerId)!.players.find((player) => player.id === listing.playerId)!
    player.salary = 64_000
    listing.minimumSalary = 40_000
    const fairSalary = calculatePlayerSalary(player.strength, player.age)
    expect(calculateAiAuctionSalary(listing.minimumSalary, 1, fairSalary)).toBeLessThanOrEqual(Math.round(fairSalary * 1.6 / 100) * 100)
    const before = structuredClone(state.clubs)
    resolveAuctionListing(state, listing.id)
    expect(state.clubs).toEqual(before)
    expect(state.ledger).toEqual([])

    const buyer = state.clubs.find((club) => club.id === state.manager.clubId)!
    const costs = buyer.players.reduce((sum, player) => sum + player.salary, 0) + 2_000 + Math.round(buyer.stadium.capacity * 0.12)
    buyer.cash = 20_000 + costs * 2 - 1
    expect(canAiAffordTransfer(buyer, 20_000, 2_000)).toBe(false)
    buyer.cash++
    expect(canAiAffordTransfer(buyer, 20_000, 2_000)).toBe(true)
  })

  it('accepts a valid human bid when no AI club can compete, while keeping the full player price', () => {
    const state = createNewCareer({ managerName: 'Sem concorrentes', seed: 82 })
    for (const club of state.clubs) club.cash = 0
    const listing = state.market[0]
    const manager = state.clubs.find((club) => club.id === state.manager.clubId)!
    manager.cash = listing.fee
    const result = resolveAuctionListing(state, listing.id, listing.minimumSalary)
    expect(result.success).toBe(true)
    expect(result.auction?.fee).toBe(listing.fee)
    expect(manager.cash).toBe(0)
    expect(manager.players.some((player) => player.id === listing.playerId)).toBe(true)
  })

  it('requires funding for the full contract when recurring income cannot support the squad', () => {
    const state = createNewCareer({ managerName: 'Sustentabilidade', seed: 82 })
    const club = state.clubs.find((candidate) => candidate.division === 4)!
    club.stadium.capacity = 1_000
    club.sponsorPerRound = 0
    for (const player of club.players) player.salary = 10_000
    // A million covers the fee and several payrolls, but not this season's deficit.
    club.cash = 1_000_000
    expect(canAiAffordTransfer(club, 20_000, 2_000)).toBe(false)
    club.cash = 5_000_000
    expect(canAiAffordTransfer(club, 20_000, 2_000)).toBe(true)
    // Reliable recurring revenue can fund the same squad without those savings.
    club.cash = 1_000_000
    club.sponsorPerRound = 200_000
    expect(canAiAffordTransfer(club, 20_000, 2_000)).toBe(true)
    club.sponsorship = {
      id: 'inherited-betting', season: state.season, brandId: 'apostalia', kind: 'betting',
      basePerRound: 200_000, winBonus: 0, drawBonus: 0, projectedIncome: 2_800_000, expectedIncome: 2_000_000,
    }
    // A departing human manager can leave a betting contract behind.
    expect(canAiAffordTransfer(club, 20_000, 2_000)).toBe(false)
  })

  const cases: Array<[string, (state: GameState) => void]> = [
    ['human auction', (state) => { resolveAuctionListing(state, state.market[0].id, 64_000) }],
    ['AI auction', (state) => { resolveAuctionListing(state, state.market[0].id) }],
    ['direct sale', (state) => {
      const player = state.clubs.find((club) => club.id === state.manager.clubId)!.players.find((player) => player.position !== 'G')!
      expect(sellPlayerToAi(state, player.id).ok).toBe(true)
    }],

  ]

  it.each(cases)('conserves cash and records both sides of a %s', (_, execute) => {
    const state = createNewCareer({ managerName: 'Contabilidade', seed: 82 })
    for (const club of state.clubs) club.cash = 2_000_000
    const balances = new Map(state.clubs.map((club) => [club.id, club.cash]))
    execute(state)
    const entries = state.ledger.filter((entry) => entry.type === 'transfer')
    expect(entries).toHaveLength(2)
    expect(new Set(entries.map((entry) => entry.id)).size).toBe(2)
    expect(entries.reduce((sum, entry) => sum + entry.amount, 0)).toBe(0)
    expect(state.clubs.reduce((sum, club) => sum + club.cash - balances.get(club.id)!, 0)).toBe(0)
    for (const club of state.clubs) {
      expect(club.cash - balances.get(club.id)!).toBe(entries.filter((entry) => entry.clubId === club.id).reduce((sum, entry) => sum + entry.amount, 0))
    }
  })
})
