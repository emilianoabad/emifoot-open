import { beforeAll, describe, expect, it } from 'vitest'
import { createNewCareer, getPrizeAmount, getTable, type Division, type GameState } from './index'
import { fastForwardSeason } from '../test/simulation'
import { parseGameState } from '../persistence/schema'

describe('competition prize accounting', () => {
  let initial: GameState
  let completed: GameState
  beforeAll(() => {
    initial = createNewCareer({ managerName: 'Prêmios', seed: 77 })
    const result = fastForwardSeason(initial)
    if (!result.ok) throw new Error(result.error)
    completed = result.state
  })

  it('pays every winner and loser exactly once, including penalty decisions and simulated rounds', () => {
    const amounts = [50_000, 100_000, 200_000, 400_000, 1_000_000]
    const payments = completed.ledger.filter((entry) => entry.prize?.kind === 'cup')
    expect(payments).toHaveLength(62)
    expect(payments.reduce((total, entry) => total + entry.amount, 0)).toBe(6_300_000)
    let penaltyMatches = 0
    completed.cup.rounds.forEach((round, roundIndex) => {
      for (const fixture of round.matches) {
        const result = fixture.result!
        const homeWins = result.homeGoals === result.awayGoals
          ? result.homePenalties! > result.awayPenalties!
          : result.homeGoals > result.awayGoals
        if (result.homeGoals === result.awayGoals) penaltyMatches += 1
        for (const [clubId, won] of [[fixture.homeId, homeWins], [fixture.awayId, !homeWins]] as const) {
          const entries = payments.filter((entry) => entry.clubId === clubId && entry.prize?.kind === 'cup' && entry.prize.roundIndex === roundIndex)
          expect(entries).toHaveLength(1)
          expect(entries[0].amount).toBe(amounts[roundIndex] * (won ? 1 : 0.5))
        }
      }
    })
    expect(penaltyMatches).toBeGreaterThan(0)
    const championPayments = payments.filter((entry) => entry.clubId === completed.cup.championId)
    expect(championPayments.map((entry) => entry.amount)).toEqual(amounts)
    expect(championPayments.reduce((sum, entry) => sum + entry.amount, 0)).toBe(1_750_000)
    for (const club of completed.clubs) {
      const transactions = completed.ledger.filter((entry) => entry.clubId === club.id)
      expect(club.cash - initial.clubs.find((candidate) => candidate.id === club.id)!.cash)
        .toBe(transactions.reduce((sum, entry) => sum + entry.amount, 0))
    }
  })

  it('retains prize identifiers and amounts through the save schema', () => {
    const loaded = parseGameState(JSON.parse(JSON.stringify(completed)))
    expect(loaded).toEqual(completed)
    expect(getPrizeAmount(loaded, 2026, { kind: 'cup', roundIndex: 4 }, loaded.cup.championId)).toBe(1_000_000)
    expect(getPrizeAmount(loaded, 2026, { kind: 'division', division: 4 })).toBe(150_000)
    expect(getPrizeAmount(loaded, 2026, { kind: 'division-runner-up', division: 4 })).toBe(37_500)
    expect(getPrizeAmount(loaded, 2026, { kind: 'top-scorer' })).toBe(200_000)
    expect(getPrizeAmount(loaded, 2026, { kind: 'best-attack' })).toBe(200_000)
    expect(getPrizeAmount(loaded, 2026, { kind: 'best-defence' })).toBe(200_000)
  })

  it('pays each division champion and runner-up once, at the requested amounts', () => {
    const amounts = [[2_000_000, 500_000], [500_000, 125_000], [300_000, 75_000], [150_000, 37_500]]
    for (const division of [1, 2, 3, 4] as Division[]) {
      const [champion, runnerUp] = getTable(completed, division)
      expect(completed.awards[0].runnersUp?.[String(division)]).toBe(runnerUp.clubId)
      expect(getPrizeAmount(completed, 2026, { kind: 'division', division }, champion.clubId)).toBe(amounts[division - 1][0])
      expect(getPrizeAmount(completed, 2026, { kind: 'division-runner-up', division }, runnerUp.clubId)).toBe(amounts[division - 1][1])
      const payments = completed.ledger.filter((entry) => (entry.prize?.kind === 'division' || entry.prize?.kind === 'division-runner-up') && entry.prize.division === division)
      expect(payments).toHaveLength(2)
      expect(getPrizeAmount(completed, 2026, { kind: 'division', division }, runnerUp.clubId)).toBeUndefined()
    }
  })

  it('reads historical amounts without inventing or retroactively crediting payments', () => {
    const legacy = structuredClone(completed)
    delete legacy.awards[0].runnersUp
    legacy.ledger = legacy.ledger.filter((entry) => !entry.description.endsWith(' — eliminado') && entry.prize?.kind !== 'division-runner-up')
    for (const entry of legacy.ledger) {
      if (entry.prize?.kind === 'cup' && entry.prize.roundIndex === 4) entry.amount = 160_000
      if (entry.prize?.kind === 'division') entry.amount = { 1: 175_000, 2: 110_000, 3: 75_000, 4: 50_000 }[entry.prize.division]
      if (entry.prize?.kind === 'top-scorer') entry.amount = 30_000
      delete entry.prize
    }
    const snapshot = structuredClone(legacy)
    expect(getPrizeAmount(legacy, 2026, { kind: 'cup', roundIndex: 4 }, legacy.cup.championId)).toBe(160_000)
    expect(getPrizeAmount(legacy, 2026, { kind: 'division', division: 1 })).toBe(175_000)
    expect(getPrizeAmount(legacy, 2026, { kind: 'libertadores' })).toBe(250_000)
    expect(getPrizeAmount(legacy, 2026, { kind: 'top-scorer' })).toBe(30_000)
    expect(getPrizeAmount(legacy, 2026, { kind: 'division-runner-up', division: 1 })).toBeUndefined()
    const final = legacy.cup.rounds[4].matches[0]
    const runnerUp = final.homeId === legacy.cup.championId ? final.awayId : final.homeId
    expect(getPrizeAmount(legacy, 2026, { kind: 'cup', roundIndex: 4 }, runnerUp)).toBeUndefined()
    expect(getPrizeAmount(legacy, 2027, { kind: 'cup', roundIndex: 4 }, legacy.cup.championId)).toBeUndefined()
    expect(legacy).toEqual(snapshot)
  })
})
