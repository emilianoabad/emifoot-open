/// <reference types="node" />
import process from 'node:process'
import { describe, expect, it } from 'vitest'
import {
  acceptJobOffer, acceptSponsorshipOffer, acknowledgeAuctionResult, acknowledgeSponsorshipNotice, acknowledgeRetirementNotice, advanceAfterCompetitionResults, bestSafeSponsorship,
  advanceAfterStandings, autoPickLineup, automaticAcademySelection, promoteAcademyPlayers, calculatePlayerSalary, calculatePlayerValue, calculateAuctionFee, completeCupDraw,
  confirmManagerRegistration, createNewCareer, finishRoundForManagedClubs,
  getMarketPlayer, getManagerClub, getPlayerSaleQuote, getAiTransferInterest, getTable, canLeaveClub, isSaleProtected, maximumSponsorshipPerRound, projectedSponsorshipIncome, reachHalfTime, showStandings, startNextSeason,
  startRoundForManagedClubs, submitAuctionOffer, type EngineResult, type GameState,
  BEST_ATTACK_PRIZE, BEST_DEFENCE_PRIZE, CUP_ROUND_PRIZES, DIVISION_PRIZE,
  DIVISION_RUNNER_UP_SHARE, LIBERTADORES_PRIZE, MATCHDAY_GATE_SHARE, TOP_SCORER_PRIZE,
} from './index'
import { parseGameState } from '../persistence/schema'

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2 : (sorted[middle] ?? 0)
}

function benchmarkBasketPrice(): number {
  return sum([10, 20, 30, 40, 50].map((strength) => calculateAuctionFee(calculatePlayerValue(strength, 26))))
}

function domesticPrizeBudget(state: GameState): number {
  const cup = CUP_ROUND_PRIZES.reduce((total, prize, round) => total + prize * 1.5 * 2 ** (4 - round), 0)
  const domesticContinentalWinner = state.clubs.some((club) => club.id === state.libertadores?.championId)
  return cup + sum(Object.values(DIVISION_PRIZE)) * (1 + DIVISION_RUNNER_UP_SHARE) + TOP_SCORER_PRIZE + BEST_ATTACK_PRIZE + BEST_DEFENCE_PRIZE
    + (domesticContinentalWinner ? LIBERTADORES_PRIZE : 0)
}

interface MarketMetrics {
  auctions: number
  transfers: number
  noOffers: number
  cancellations: number
  eliteAuctions: number
  demandedAuctions: number
  unfundedAuctions: number
  strongDemand: number
  unfundedStrong: number
  quotedFees: number
  referenceFees: number
}

function measureSaleOffers(state: GameState): { eligible: number; offers: number; overpaid: number; unfunded: number } {
  let eligible = 0, overpaid = 0, unfunded = 0
  let offers = 0
  for (const club of state.clubs) {
    const perspective = { ...state, manager: { ...state.manager, clubId: club.id } }
    for (const player of club.players) {
      if (isSaleProtected(player) || !canLeaveClub(club, player)) continue
      if (!state.clubs.some((buyer) => buyer.id !== club.id && buyer.players.length < 24 && getAiTransferInterest(buyer, player) > 0)) continue
      eligible += 1
      if (getPlayerSaleQuote(perspective, player.id).ok) offers += 1
      else if (player.salary > Math.round(calculatePlayerSalary(player.strength, player.age) * 1.6 / 100) * 100) overpaid += 1
      else unfunded += 1
    }
  }
  return { eligible, offers, overpaid, unfunded }
}

/** Cash-independent upper bound: full stadiums, all sponsors and the entire prize budget. */
function annualIncomeCeiling(state: GameState): number {
  const gates = state.clubs.map((club) => Math.round(club.stadium.capacity * Math.max(40, club.ticketPrice) * MATCHDAY_GATE_SHARE))
  // Seven home league games per club; 31 Copa matches; at most 12 Brazilian
  // home group games plus seven Libertadores knockout games hosted in Brazil.
  const gatesCeiling = 7 * sum(gates) + (31 + 12 + 7) * Math.max(...gates)
  return gatesCeiling + 14 * sum(state.clubs.map((club) => maximumSponsorshipPerRound(club.division))) + domesticPrizeBudget(state)
}

/** Guaranteed expenses even when every player earns the minimum and all cups are lost. */
function annualLeagueCostFloor(state: GameState): number {
  const population = state.offseason?.targetPlayerCount ?? sum(state.clubs.map((club) => club.players.length))
  return 14 * (population * 1_000 + sum(state.clubs.map((club) => Math.round(club.stadium.capacity * 0.12))))
}

function unwrap(result: EngineResult): GameState {
  if (!result.ok) throw new Error(result.error)
  return result.state
}

/** Resolve every auction; coaches handle match lineups while we test finances. */
function playTradingSeason(initial: GameState, buyUpgrades = false, metrics?: MarketMetrics): GameState {
  let state = initial
  let steps = 0
  while (state.phase !== 'season-end') {
    if (++steps > 1_000) throw new Error(`Season stalled in ${state.phase}`)
    if (state.phase === 'sponsorship') {
      const proposal = state.sponsorship!.proposals[state.manager.clubId]
      const offer = buyUpgrades ? proposal.offers[2] : bestSafeSponsorship(proposal)
      state = unwrap(acceptSponsorshipOffer(state, offer.id))
      continue
    }
    if (state.phase === 'pre-round' || state.phase === 'half-time') Object.assign(getManagerClub(state), autoPickLineup(getManagerClub(state)))
    if (state.phase === 'auction' && !state.auctionResult) {
      const listing = state.market[0]
      const player = getMarketPlayer(state, listing)!
      const manager = getManagerClub(state)
      const wages = sum(manager.players.map((player) => player.salary))
      const upgrade = player.strength > median(manager.players.filter((candidate) => candidate.position === player.position).map((player) => player.strength))
      const salary = buyUpgrades && listing.sellerId !== manager.id && manager.players.length < 22 && upgrade && manager.cash - listing.fee > wages * 2
        ? Math.min(64_000, Math.ceil(Math.max(listing.minimumSalary, calculatePlayerSalary(player.strength, player.age)) * 1.5 / 50) * 50)
        : undefined
      const hasAiDemand = state.clubs.some((club) => club.id !== listing.sellerId && club.id !== state.manager.clubId
        && club.players.length < 24 && getAiTransferInterest(club, player) > 0)
      state = unwrap(submitAuctionOffer(state, salary))
      if (metrics) {
        const outcome = state.auctionResult
        if (!outcome?.auction) metrics.cancellations += 1
        else {
          metrics.auctions += 1
          if (player.strength >= 40) metrics.eliteAuctions += 1
          if (hasAiDemand) {
            metrics.demandedAuctions += 1
            if (!outcome.clubId) metrics.unfundedAuctions += 1
            if (player.strength >= 30) {
              metrics.strongDemand += 1
              if (!outcome.clubId) metrics.unfundedStrong += 1
            }
          }
          if (outcome.clubId && outcome.clubId !== listing.sellerId) metrics.transfers += 1
          if (!outcome.clubId) metrics.noOffers += 1
          if (listing.fee > 0) {
            metrics.quotedFees += listing.fee
            metrics.referenceFees += calculateAuctionFee(calculatePlayerValue(player.strength, player.age))
          }
        }
      }
      continue
    }
    const command = state.phase === 'manager-registration' ? confirmManagerRegistration
      : state.phase === 'retirement-notice' ? acknowledgeRetirementNotice
      : state.phase === 'academy' ? (current: GameState) => promoteAcademyPlayers(current, automaticAcademySelection(current.offseason!.plans[current.manager.clubId]))
      : state.phase === 'cup-draw' ? completeCupDraw
        : state.phase === 'auction' ? acknowledgeAuctionResult
          : state.phase === 'pre-round' ? (current: GameState) => startRoundForManagedClubs(current, [])
            : state.phase === 'first-half' ? reachHalfTime
              : state.phase === 'half-time' ? (current: GameState) => finishRoundForManagedClubs(current, [])
                : state.phase === 'second-half' ? showStandings
                  : state.phase === 'standings' ? advanceAfterStandings
                    : state.phase === 'sponsorship-notice' ? acknowledgeSponsorshipNotice
                      : state.phase === 'competition-results' ? advanceAfterCompetitionResults : undefined
    if (!command) throw new Error(`Unexpected phase ${state.phase}`)
    state = unwrap(command(state))
  }
  return state
}

describe('economy balance metrics', () => {
  // All 24 seeds resolve real auctions; hosted two-core runners need more
  // wall-clock time than a development machine. Keep every economic assertion.
  it('keeps liquidity, money supply, prices, and supporter movement inside their seasonal guardrails', () => {
    const runs = Array.from({ length: 24 }, (_, index) => {
      const initial = createNewCareer({ managerName: 'Métrica', seed: 10_000 + index * 7919 })
      const managerClub = initial.clubs.find((club) => club.id === initial.manager.clubId)!
      const initialCash = sum(initial.clubs.map((club) => club.cash))
      const initialSalary = median(initial.clubs.flatMap((club) => club.players.map((player) => player.salary)))
      const initialValue = median(initial.clubs.flatMap((club) => club.players.map((player) => player.value)))
      const initialSupporters = new Map(initial.clubs.map((club) => [club.id, club.supporters]))
      let openingBudget = managerClub.cash
      const affordableOpeningPlayers = [...initial.market].sort((a, b) => a.fee - b.fee).reduce((count, listing) => {
        if (listing.fee > openingBudget) return count
        openingBudget -= listing.fee
        return count + 1
      }, 0)
      const completed = playTradingSeason(initial)
      const endCash = sum(completed.clubs.map((club) => club.cash))
      expect(endCash - initialCash).toBeLessThanOrEqual(annualIncomeCeiling(completed) - annualLeagueCostFloor(initial))
      const mainClubIds = new Set(completed.clubs.map((club) => club.id))
      const mainLedger = completed.ledger.filter((entry) => mainClubIds.has(entry.clubId))
      const managerLedger = mainLedger.filter((entry) => entry.clubId === managerClub.id)
      const supporterGrowthRates = completed.clubs.map((club) => {
        const startingSupporters = initialSupporters.get(club.id) ?? club.supporters
        return (club.supporters - startingSupporters) / startingSupporters
      })
      expect(mainLedger.filter((entry) => entry.type === 'transfer').length).toBeGreaterThan(100)
      expect(sum(mainLedger.filter((entry) => entry.type === 'transfer' && !entry.externalTransfer).map((entry) => entry.amount))).toBe(0)
      expect(endCash - initialCash).toBe(sum(mainLedger.map((entry) => entry.amount)))
      const prizeMoney = sum(mainLedger.filter((entry) => entry.type === 'prize').map((entry) => entry.amount))
      expect(prizeMoney).toBe(domesticPrizeBudget(completed))
      return {
        cashGrowth: (endCash - initialCash) / initialCash,
        clubsWithSupporterChange: supporterGrowthRates.filter((growth) => growth !== 0).length,
        minimumSupporterGrowth: Math.min(...supporterGrowthRates),
        maximumSupporterGrowth: Math.max(...supporterGrowthRates),
        salaryGrowth: median(completed.clubs.flatMap((club) => club.players.map((player) => player.salary))) / initialSalary - 1,
        valueGrowth: median(completed.clubs.flatMap((club) => club.players.map((player) => player.value))) / initialValue - 1,
        affordableOpeningPlayers,
        managerOperatingCash: sum(managerLedger.filter((entry) => entry.type !== 'prize' && entry.type !== 'transfer').map((entry) => entry.amount)),
      }
    })

    expect(median(runs.map((run) => run.cashGrowth))).toBeGreaterThanOrEqual(0)
    expect(median(runs.map((run) => run.managerOperatingCash))).toBeGreaterThan(0)
    expect(Math.min(...runs.map((run) => run.affordableOpeningPlayers))).toBeGreaterThanOrEqual(2)
    expect(Math.max(...runs.map((run) => run.salaryGrowth))).toBeLessThanOrEqual(0.15)
    expect(Math.max(...runs.map((run) => run.valueGrowth))).toBeLessThanOrEqual(0.15)
    expect(Math.min(...runs.map((run) => run.clubsWithSupporterChange))).toBeGreaterThanOrEqual(28)
    expect(Math.min(...runs.map((run) => run.minimumSupporterGrowth))).toBeGreaterThan(-0.15)
    expect(Math.max(...runs.map((run) => run.maximumSupporterGrowth))).toBeLessThan(0.50)
  }, 90_000)

  it.each([
    { seed: 10_000, buyUpgrades: false }, { seed: 17_919, buyUpgrades: false },
    { seed: 10_000, buyUpgrades: true }, { seed: 17_919, buyUpgrades: true },
  ])('keeps prices and offers functional for 50 seasons (seed $seed, manager buys: $buyUpgrades)', ({ seed, buyUpgrades }) => {
    let state = createNewCareer({ managerName: 'Longo prazo', seed })
    const initialCash = sum(state.clubs.map((club) => club.cash))
    const initialSalary = median(state.clubs.flatMap((club) => club.players.map((player) => player.salary)))
    const initialBasketPrice = benchmarkBasketPrice()
    let cumulativePrizeMoney = 0
    let cumulativeIncomeCeiling = 0
    let cumulativeOperatingCeiling = 0
    const history = []
    const potentials = new Map(state.clubs.flatMap((club) => club.players.map((player) => [player.id, player.development!.potential] as const)))
    for (let season = 0; season < 50; season++) {
      const context = `seed=${seed}, season=${state.season}, buys=${buyUpgrades}`
      const minimumLeagueCosts = annualLeagueCostFloor(state)
      const balances = new Map(state.clubs.map((club) => [club.id, club.cash]))
      state.ledger = []
      state.news = []
      const market: MarketMetrics = { auctions: 0, transfers: 0, noOffers: 0, cancellations: 0, eliteAuctions: 0, demandedAuctions: 0, unfundedAuctions: 0, strongDemand: 0, unfundedStrong: 0, quotedFees: 0, referenceFees: 0 }
      state = playTradingSeason(state, buyUpgrades, market)
      const domesticIds = new Set(state.clubs.map((club) => club.id))
      const ledger = state.ledger.filter((entry) => domesticIds.has(entry.clubId))
      const prizeMoney = sum(ledger.filter((entry) => entry.type === 'prize').map((entry) => entry.amount))
      expect(prizeMoney, context).toBe(domesticPrizeBudget(state))
      cumulativePrizeMoney += prizeMoney
      const maximumAnnualIncome = annualIncomeCeiling(state)
      const maximumAnnualOperatingIncome = maximumAnnualIncome - domesticPrizeBudget(state) - minimumLeagueCosts
      cumulativeIncomeCeiling += maximumAnnualIncome
      cumulativeOperatingCeiling += maximumAnnualOperatingIncome
      for (const club of state.clubs) {
        const transactions = state.ledger.filter((entry) => entry.clubId === club.id)
        expect(club.cash - balances.get(club.id)!).toBe(sum(transactions.map((entry) => entry.amount)))
        expect(club.players.length).toBeGreaterThanOrEqual(14)
        expect(club.players.length).toBeLessThanOrEqual(24)
        const sponsorshipPayments = transactions.filter((entry) => entry.type === 'sponsor')
        expect(sponsorshipPayments, context).toHaveLength(14)
        expect(new Set(sponsorshipPayments.map((entry) => entry.round)).size, context).toBe(14)
        if (club.sponsorship && club.sponsorship.kind !== 'betting') {
          const results = getTable(state, club.division).find((entry) => entry.clubId === club.id)!
          expect(sum(sponsorshipPayments.map((entry) => entry.amount)), context)
            .toBe(projectedSponsorshipIncome(club.sponsorship, results.wins, results.draws))
        }
      }
      const players = state.clubs.flatMap((club) => club.players)
      expect(new Set(players.map((player) => player.id)).size, context).toBe(players.length)
      expect(players.length, context).toBeGreaterThanOrEqual(state.internationalMarket!.targetPlayerCount)
      expect(players.length, context).toBeLessThanOrEqual(state.internationalMarket!.targetPlayerCount + state.internationalMarket!.offeredIds.length)
      for (const player of players) {
        const talent = player.development!.potential
        if (potentials.has(player.id)) expect(talent, `${context}, ${player.id}`).toBe(potentials.get(player.id))
        else potentials.set(player.id, talent)
        expect(player.strength, context).toBe(Math.round(player.development!.ability))
        if (player.age >= 40) expect(player.strength, context).toBeLessThan(30)
      }
      const totalCash = sum(state.clubs.map((club) => club.cash))
      const priceIndex = benchmarkBasketPrice() / initialBasketPrice
      const quoteIndex = market.quotedFees / market.referenceFees
      const wageIndex = sum(players.map((player) => player.salary)) / sum(players.map((player) => calculatePlayerSalary(player.strength, player.age)))
      const sales = measureSaleOffers(state)
      const record = {
        divisions: [1, 2, 3, 4].map((division) => {
          const clubs = state.clubs.filter((club) => club.division === division)
          const roster = clubs.flatMap((club) => club.players)
          return { division, strength: sum(roster.map((player) => player.strength)) / roster.length,
            starters: sum(clubs.flatMap((club) => autoPickLineup(club).lineup.map((id) => club.players.find((player) => player.id === id)!.strength))) / 88,
            medianCash: median(clubs.map((club) => club.cash)), maxCash: Math.max(...clubs.map((club) => club.cash)) }
        }),
        strongFundingFailureRate: market.unfundedStrong / Math.max(1, market.strongDemand),
        demandedAuctions: market.demandedAuctions, fundingFailureRate: market.unfundedAuctions / Math.max(1, market.demandedAuctions),
        elitePlayers: players.filter((player) => player.strength >= 40).length, eliteAuctions: market.eliteAuctions,
        season: state.season, playerCount: players.length, totalCash, prizeMoney, sponsorMoney: sum(ledger.filter((entry) => entry.type === 'sponsor').map((entry) => entry.amount)), priceIndex, quoteIndex, wageIndex,
        medianValue: median(players.map((player) => player.value)), medianSalary: median(players.map((player) => player.salary)),
        auctions: market.auctions, transfers: market.transfers, cancellations: market.cancellations, noOfferRate: market.noOffers / market.auctions,
        directSaleOfferRate: sales.offers / sales.eligible, eligibleSales: sales.eligible,
        overpaidSales: sales.overpaid, unfundedSales: sales.unfunded,
        solventClubs: state.clubs.filter((club) => club.cash >= 0).length,
      }
      expect(record.elitePlayers, context).toBeGreaterThanOrEqual(64)
      expect(record.eliteAuctions, context).toBeGreaterThanOrEqual(12)
      expect(record.solventClubs, context).toBeGreaterThanOrEqual(28)
      for (const division of record.divisions) {
        expect(division.starters, `${context}, D${division.division}`).toBeGreaterThanOrEqual([38, 30, 21, 11][division.division - 1])
        expect(division.strength, `${context}, D${division.division}`).toBeGreaterThanOrEqual([36, 27, 18, 10][division.division - 1])
      }
      expect(record.divisions[3].strength, context).toBeLessThan(25)
      history.push(record)
      if (process.env.EMIFOOT_ECONOMY_REPORT === '1') console.info(JSON.stringify({ seed, buyUpgrades, ...record }))

      // Match actual auction quotes to the same strength/age basket, so
      // aging and player development cannot disguise price inflation.
      expect(market.referenceFees, context).toBeGreaterThan(0)
      expect(priceIndex, context).toBeCloseTo(1, 10)
      expect(quoteIndex, context).toBeCloseTo(1, 10)
      // Renewing the age/quality mix can change the median price. Check every
      // actual valuation against its own age and strength instead.
      expect(players.every((player) => player.value === calculatePlayerValue(player.strength, player.age)), context).toBe(true)
      expect(wageIndex, context).toBeLessThanOrEqual(1.6)
      expect(market.auctions, context).toBeGreaterThanOrEqual(70)
      // A passed human-only opportunity is not a liquidity failure. AI clubs
      // must reliably fund useful purchases, especially strong players. Annual
      // cheap-player turnover varies as small clubs rebuild their reserves.
      expect(market.demandedAuctions, context).toBeGreaterThanOrEqual(35)
      expect.soft(record.fundingFailureRate, context).toBeLessThanOrEqual(0.40)
      expect(market.strongDemand, context).toBeGreaterThanOrEqual(12)
      expect(record.strongFundingFailureRate, context).toBeLessThanOrEqual(0.05)
      expect(sales.eligible, context).toBeGreaterThan(0)
      expect.soft(record.directSaleOfferRate, context).toBeGreaterThanOrEqual(0.80)
      expect(sum(ledger.filter((entry) => entry.type === 'transfer' && !entry.externalTransfer).map((entry) => entry.amount)), context).toBe(0)
      const netOperatingIncome = sum(ledger.filter((entry) => entry.type !== 'prize' && entry.type !== 'transfer').map((entry) => entry.amount))
      const externalTransferOutflow = sum(ledger.filter((entry) => entry.externalTransfer).map((entry) => entry.amount))
      expect(externalTransferOutflow, context).toBeLessThanOrEqual(0)
      expect(totalCash - sum([...balances.values()]), context).toBe(prizeMoney + netOperatingIncome + externalTransferOutflow)
      expect(totalCash, context).toBeLessThanOrEqual(initialCash + cumulativeIncomeCeiling)
      // Capacity investments and affordable ticket changes alter revenue capacity.
      // Recalculate its ceiling each season; cash itself never enters pricing.
      expect(netOperatingIncome, context).toBeLessThanOrEqual(maximumAnnualOperatingIncome)
      expect(totalCash - cumulativePrizeMoney, context).toBeLessThanOrEqual(initialCash + cumulativeOperatingCeiling)
      // A long simulation must also remain a loadable career.
      expect(() => parseGameState(state), context).not.toThrow()
      if (season === 49) break
      if (state.manager.dismissed) state = unwrap(acceptJobOffer(state, state.manager.offers[0].clubId))
      state = unwrap(startNextSeason(state))
    }
    const last = history.at(-1)!
    const annualizedPriceInflation = (last.priceIndex / history[0].priceIndex) ** (1 / 49) - 1
    expect(annualizedPriceInflation).toBeCloseTo(0, 10)
    const lastDecade = history.slice(-10)
    expect(sum(lastDecade.map((year) => year.fundingFailureRate)) / 10)
      .toBeLessThanOrEqual(0.25)
    expect(sum(lastDecade.map((year) => year.directSaleOfferRate)) / 10)
      .toBeGreaterThanOrEqual(0.90)
    expect(last.medianSalary / initialSalary).toBeLessThanOrEqual(2.5)
  }, 180_000)
})
