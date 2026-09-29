import { describe, expect, it } from 'vitest'
import { MATCHDAY_GATE_SHARE } from './constants'
import { calculateAuctionFee, calculatePlayerSalary, calculatePlayerValue } from './economy'
import { calculateAttendance } from './match'
import { createNewCareer } from './setup'
import { sponsorshipPayment } from './sponsorship'
import { clubOperatingReserve, expandClubStadium, repairClubStadium, runAiClubOperations, stadiumRepairCost, sustainableTicketPrice } from './clubOperations'
import type { Club, GameState } from './types'

function fixture() {
  const state = createNewCareer({ managerName: 'Gestão', seed: 150 })
  const club = state.clubs.find((candidate) => candidate.division === 1)!
  for (const candidate of state.clubs) candidate.cash = 0
  return { state, club }
}

function typicalGate(state: GameState, club: Club, price: number): number {
  const opponents = state.clubs.filter((candidate) => candidate.division === club.division && candidate.id !== club.id)
  return opponents.reduce((sum, opponent) => sum + calculateAttendance({ ...club, ticketPrice: price, form: [] }, opponent), 0)
    / opponents.length * price * MATCHDAY_GATE_SHARE
}

function markSellouts(state: GameState, club: Club, count = 3): void {
  for (const match of state.leagues.find((league) => league.division === club.division)!.rounds.flat().filter((match) => match.homeId === club.id).slice(0, count)) {
    match.result = { homeGoals: 1, awayGoals: 0, attendance: club.stadium.capacity, events: [] }
  }
}

describe('AI club business operations', () => {
  it('chooses the lowest accessible price that supports normal costs, independent of cash and short-term form', () => {
    const { state, club } = fixture()
    const price = sustainableTicketPrice(state, club)
    const wages = club.players.reduce((sum, player) => sum + calculatePlayerSalary(player.strength, player.age), 0)
    const transferBudget = 2 * calculateAuctionFee(calculatePlayerValue(45, 26)) / 14
    const neededGate = 2 * (wages + Math.round(club.stadium.capacity * 0.12) + transferBudget - sponsorshipPayment(state, club))
    expect(price).toBeGreaterThanOrEqual(10)
    expect(price).toBeLessThanOrEqual(40)
    if (price < 40) expect(typicalGate(state, club, price)).toBeGreaterThanOrEqual(neededGate)
    if (price > 10) expect(typicalGate(state, club, price - 1)).toBeLessThan(neededGate)
    club.cash = 100_000_000
    club.form = ['V', 'V', 'V', 'V', 'V']
    expect(sustainableTicketPrice(state, club)).toBe(price)
    club.cash = -100_000_000
    expect(sustainableTicketPrice(state, club)).toBe(price)
  })

  it('uses the accessible floor when sponsorship funds operations and the cap when demand cannot cover them', () => {
    const { state, club } = fixture()
    club.sponsorship = undefined
    club.sponsorPerRound = 1_000_000
    expect(sustainableTicketPrice(state, club)).toBe(10)
    club.sponsorPerRound = 0
    club.supporters = 800
    club.stadium.capacity = 2_000
    expect(sustainableTicketPrice(state, club)).toBe(40)
  })

  it('budgets promised wages even when they exceed the current salary benchmark', () => {
    const { state, club } = fixture()
    club.sponsorship = undefined
    club.sponsorPerRound = 0
    club.stadium.capacity = 100_000
    club.supporters = 200_000
    const normalPrice = sustainableTicketPrice(state, club)
    for (const player of club.players) player.salary *= 1.6
    const price = sustainableTicketPrice(state, club)
    const payroll = club.players.reduce((sum, player) => sum + player.salary, 0)
    expect(price).toBeGreaterThan(normalPrice)
    expect(typicalGate(state, club, price) / 2).toBeGreaterThan(payroll + club.stadium.capacity * 0.12)
  })

  it('does not spend earmarked season funding on stadium work or rely on betting receipts', () => {
    const { state, club } = fixture()
    club.stadium.capacity = 1_000
    club.stadium.condition = 70
    club.cash = 1_000_000
    club.sponsorship = undefined
    club.sponsorPerRound = 0
    for (const player of club.players) player.salary = 10_000
    runAiClubOperations(state)
    expect(club.stadium.condition).toBe(70)
    expect(club.cash).toBe(1_000_000)
    const withoutSponsor = clubOperatingReserve(club)
    club.sponsorPerRound = 200_000
    club.sponsorship = {
      id: 'inherited-betting', season: state.season, brandId: 'apostalia', kind: 'betting',
      basePerRound: 200_000, winBonus: 0, drawBonus: 0, projectedIncome: 2_800_000, expectedIncome: 2_000_000,
    }
    expect(clubOperatingReserve(club)).toBe(withoutSponsor)
    expect(sustainableTicketPrice(state, club)).toBe(40)
    runAiClubOperations(state)
    expect(club.stadium.condition).toBe(70)
    expect(state.ledger).toEqual([])
  })

  it('never changes the ticket price, stadium, or money of any human-managed club', () => {
    const { state, club: guest } = fixture()
    const host = state.clubs.find((club) => club.id === state.manager.clubId)!
    const managed = [host.id, guest.id]
    for (const club of [host, guest]) {
      club.cash = 10_000_000
      club.ticketPrice = 11
      club.stadium.condition = 50
      club.supporters = club.stadium.capacity * 10
      markSellouts(state, club)
    }
    const before = structuredClone([host, guest])
    runAiClubOperations(state, managed)
    expect([host, guest]).toEqual(before)
    expect(state.ledger).toEqual([])
  })

  it('repairs a worn stadium at the existing real cost while preserving working capital', () => {
    const { state, club } = fixture()
    club.stadium.condition = 70
    const cost = stadiumRepairCost(club)
    const reserve = clubOperatingReserve(club)
    club.cash = cost + reserve - 1
    runAiClubOperations(state)
    expect(club.stadium.condition).toBe(70)
    expect(state.ledger).toEqual([])
    club.cash++
    const beforeCash = state.clubs.reduce((sum, candidate) => sum + candidate.cash, 0)
    runAiClubOperations(state)
    expect(club.stadium.condition).toBe(100)
    expect(club.cash).toBe(reserve)
    expect(state.ledger).toHaveLength(1)
    expect(state.ledger[0]).toMatchObject({ type: 'maintenance', clubId: club.id, amount: -cost })
    expect(state.clubs.reduce((sum, candidate) => sum + candidate.cash, 0)).toBe(beforeCash - cost)
    runAiClubOperations(state)
    expect(state.ledger).toHaveLength(1)
  })

  it.each([1_000, 5_000] as const)('expands by %s only after repeated sellouts, using existing prices and build times', (seats) => {
    const { state, club } = fixture()
    club.stadium.condition = 100
    club.supporters = club.stadium.capacity * 10
    club.cash = clubOperatingReserve(club) + seats * 135
    markSellouts(state, club, 2)
    runAiClubOperations(state)
    expect(club.stadium.expansionRounds).toBe(0)
    markSellouts(state, club)
    const beforeCash = club.cash
    const beforeCapacity = club.stadium.capacity
    runAiClubOperations(state)
    expect(club.stadium).toMatchObject({ capacity: beforeCapacity, expansionSeats: seats, expansionRounds: seats === 1_000 ? 2 : 4 })
    expect(club.cash).toBe(beforeCash - seats * 135)
    expect(club.cash).toBeGreaterThanOrEqual(clubOperatingReserve(club))
    expect(state.ledger).toHaveLength(1)
    expect(state.ledger[0]).toMatchObject({ type: 'construction', clubId: club.id, amount: -seats * 135 })
    runAiClubOperations(state)
    expect(state.ledger).toHaveLength(1)
  })

  it('does not expand for past crowds when current demand or reserves cannot support construction', () => {
    const { state, club } = fixture()
    club.stadium.condition = 100
    club.cash = 100_000_000
    club.supporters = 800
    markSellouts(state, club)
    runAiClubOperations(state)
    expect(club.stadium.expansionRounds).toBe(0)
    club.supporters = club.stadium.capacity * 10
    club.cash = clubOperatingReserve(club) + 135_000 - 1
    runAiClubOperations(state)
    expect(club.stadium.expansionRounds).toBe(0)
    expect(state.ledger).toEqual([])
  })

  it('applies the same human stadium prices and rejects invalid work without any debit', () => {
    const { state, club } = fixture()
    club.stadium.condition = 75
    expect(repairClubStadium(state, club)).toContain('Dinheiro insuficiente')
    expect(expandClubStadium(state, club, 1_000)).toContain('Dinheiro insuficiente')
    expect(state.ledger).toEqual([])
    club.cash = 10_000_000
    const cost = stadiumRepairCost(club)
    expect(repairClubStadium(state, club)).toBeUndefined()
    expect(club.cash).toBe(10_000_000 - cost)
    expect(repairClubStadium(state, club)).toContain('ótimo estado')
    state.phase = 'half-time'
    expect(expandClubStadium(state, club, 1_000)).toContain('partida')
    state.phase = 'pre-round'
    expect(expandClubStadium(state, club, 1_000)).toBeUndefined()
    expect(expandClubStadium(state, club, 5_000)).toContain('andamento')
    expect(state.ledger).toHaveLength(2)
    expect(new Set(state.ledger.map((entry) => entry.id)).size).toBe(2)
    expect(club.cash - 10_000_000).toBe(state.ledger.reduce((sum, entry) => sum + entry.amount, 0))
  })
})
