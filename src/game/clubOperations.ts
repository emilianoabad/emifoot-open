import { MATCHDAY_GATE_SHARE } from './constants'
import { calculateAuctionFee, calculatePlayerSalary, calculatePlayerValue } from './economy'
import { calculateAttendance } from './match'
import { sponsorshipPayment } from './sponsorship'
import type { Club, GameState, LedgerEntry } from './types'

export function stadiumRepairCost(club: Club): number {
  return Math.round((100 - club.stadium.condition) * club.stadium.capacity * 0.75)
}

function chargeStadiumWork(state: GameState, club: Club, type: LedgerEntry['type'], cost: number, description: string): void {
  club.cash -= cost
  state.ledger.push({
    id: `ledger-stadium-${state.season}-${state.currentRound}-${state.ledger.length}`,
    season: state.season, round: state.currentRound, clubId: club.id, type, amount: -cost, description,
  })
}

/** Shared costs and bookkeeping for human commands and routine AI maintenance. */
export function repairClubStadium(state: GameState, club: Club): string | undefined {
  if (100 - club.stadium.condition < 1) return 'O estádio já está em ótimo estado.'
  const cost = stadiumRepairCost(club)
  if (club.cash < cost) return 'Dinheiro insuficiente para a manutenção completa.'
  chargeStadiumWork(state, club, 'maintenance', cost, 'Recuperação completa do estádio')
  club.stadium.condition = 100
  return undefined
}

export function expandClubStadium(state: GameState, club: Club, seats: 1000 | 5000): string | undefined {
  if (state.phase === 'half-time') return 'Obras não podem ser contratadas durante a partida.'
  if (club.stadium.expansionRounds > 0) return 'Já existe uma ampliação em andamento.'
  const cost = seats * 135
  if (club.cash < cost) return 'Dinheiro insuficiente para a ampliação.'
  chargeStadiumWork(state, club, 'construction', cost, `Ampliação de ${seats.toLocaleString('pt-BR')} lugares`)
  club.stadium.expansionSeats = seats
  club.stadium.expansionRounds = seats === 1000 ? 2 : 4
  return undefined
}

function typicalHomeAttendance(state: GameState, club: Club, ticketPrice: number): number {
  const opponents = state.clubs.filter((candidate) => candidate.division === club.division && candidate.id !== club.id)
  const home = { ...club, ticketPrice, form: [] }
  const visitors = opponents.length > 0 ? opponents : [club]
  return visitors.reduce((sum, opponent) => sum + calculateAttendance(home, opponent), 0) / visitors.length
}

/** Fund a full contract's projected deficit and retain two rounds of costs. */
export function seasonOperatingReserve(club: Club, additionalSalary = 0): number {
  const wages = club.players.reduce((sum, player) => sum + player.salary, additionalSalary)
  const costs = wages + Math.round(club.stadium.capacity * 0.12)
  const affordableGate = calculateAttendance({ ...club, ticketPrice: 40, form: [] }, club) * 40 * MATCHDAY_GATE_SHARE / 2
  const guaranteedSponsor = club.sponsorship?.kind === 'betting' ? 0 : club.sponsorPerRound
  const deficit = Math.max(0, costs - affordableGate - guaranteedSponsor)
  return 2 * costs + 14 * deficit
}

/** Pick the cheapest accessible ticket that supports the team, with two ordinary signings a year. */
export function sustainableTicketPrice(state: GameState, club: Club): number {
  const contractedWages = club.players.reduce((sum, player) => sum + player.salary, 0)
  const fairWages = club.players.reduce((sum, player) => sum + calculatePlayerSalary(player.strength, player.age), 0)
  const wages = Math.max(contractedWages, fairWages)
  const maintenance = Math.round(club.stadium.capacity * 0.12)
  const recruitment = 2 * calculateAuctionFee(calculatePlayerValue(55 - club.division * 10, 26)) / 14
  const guaranteedSponsor = club.sponsorship?.kind === 'betting' ? 0 : sponsorshipPayment(state, club)
  const requiredGate = Math.max(0, wages + maintenance + recruitment - guaranteedSponsor) * 2
  for (let price = 10; price < 40; price++) {
    const gate = typicalHomeAttendance(state, club, price) * price * MATCHDAY_GATE_SHARE
    if (gate >= requiredGate) return price
  }
  return 40
}

/** Protect season funding, four payrolls and two transfer fees before stadium work. */
export function clubOperatingReserve(club: Club): number {
  const wages = club.players.reduce((sum, player) => sum + player.salary, 0)
  const maintenance = Math.round(club.stadium.capacity * 0.12)
  return Math.max(4 * (wages + maintenance), seasonOperatingReserve(club))
    + 2 * calculateAuctionFee(calculatePlayerValue(55 - club.division * 10, 26))
}

function hasRegularSellouts(state: GameState, club: Club): boolean {
  const league = state.leagues.find((candidate) => candidate.division === club.division)
  const homeMatches = league?.rounds.flat().filter((fixture) => fixture.homeId === club.id && fixture.result).slice(-3) ?? []
  return homeMatches.length === 3
    && homeMatches.every((fixture) => fixture.result!.attendance >= club.stadium.capacity * 0.9)
    && typicalHomeAttendance(state, club, club.ticketPrice) >= club.stadium.capacity * 0.9
}

/** Called once before each round's market. Human managers make their own business decisions. */
export function runAiClubOperations(state: GameState, managedClubIds: readonly string[] = [state.manager.clubId]): void {
  for (const club of state.clubs) {
    if (managedClubIds.includes(club.id)) continue
    club.ticketPrice = sustainableTicketPrice(state, club)
    const reserve = clubOperatingReserve(club)
    if (club.stadium.condition <= 75 && club.cash - stadiumRepairCost(club) >= reserve) repairClubStadium(state, club)
    if (club.stadium.condition <= 75 || club.stadium.expansionRounds > 0 || !hasRegularSellouts(state, club)) continue
    const seats = club.cash - 5_000 * 135 >= reserve ? 5_000 : 1_000
    if (club.cash - seats * 135 >= reserve) expandClubStadium(state, club, seats)
  }
}
