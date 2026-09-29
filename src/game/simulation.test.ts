import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { createNewCareer, getTable, startNextSeason } from './index'
import type { Division } from './types'
import { fastForwardSeason } from '../test/simulation'

describe('long-running simulation', () => {
  it('completes the previously failing regression seed', () => {
    const completed = fastForwardSeason(createNewCareer({ managerName: 'Teste', seed: 755_634_927 }))
    expect(completed.ok, completed.ok ? undefined : completed.error).toBe(true)
  })

  it('completes many seeds with valid competitions and a playable next season', () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 2_000_000_000 }), (seed) => {
      const initial = createNewCareer({ managerName: 'Teste', seed })
      const initialCash = initial.clubs.reduce((sum, club) => sum + club.cash, 0)
      const completed = fastForwardSeason(initial)
      expect(completed.ok, completed.ok ? undefined : completed.error).toBe(true)
      if (!completed.ok) return
      const state = completed.state
      expect(state.phase).toBe('season-end')
      expect(state.currentRound).toBe(14)
      expect(state.cup.championId).toBeTruthy()
      expect(state.cup.rounds.map((round) => round.matches.length)).toEqual([16, 8, 4, 2, 1])
      expect(state.cup.rounds.every((round) => round.matches.every((fixture) => fixture.result))).toBe(true)
      expect(state.libertadores?.groupRoundIndex).toBe(6)
      expect(state.libertadores?.groups.every((group) => group.rounds.flat().every((fixture) => fixture.result))).toBe(true)
      expect(state.libertadores?.knockoutRounds.map((round) => round.matches.length)).toEqual([4, 2, 1])
      expect(state.libertadores?.championId).toBeTruthy()
      expect(state.awards).toHaveLength(1)
      expect(state.awards[0]?.libertadoresQualifiedIds).toHaveLength(4)
      expect(state.awards[0]?.bestAttackClubId).toBeTruthy()
      expect(state.awards[0]?.bestDefenceClubId).toBeTruthy()
      expect(state.ledger.filter((entry) => entry.prize?.kind === 'cup')).toHaveLength(62)
      expect(state.ledger.filter((entry) => entry.type === 'prize' && entry.description.startsWith('Campeão da ') && entry.description.endsWith('divisão'))).toHaveLength(4)
      for (const division of [1, 2, 3, 4] as Division[]) {
        const fixtures = state.leagues.find((league) => league.division === division)?.rounds.flat() ?? []
        expect(fixtures).toHaveLength(56)
        expect(fixtures.every((fixture) => fixture.result)).toBe(true)
        expect(getTable(state, division).every((entry) => entry.played === 14)).toBe(true)
      }
      expect(state.clubs.every((club) => club.players.length >= 14)).toBe(true)
      expect(state.clubs.every((club) => Number.isFinite(club.cash))).toBe(true)
      expect(state.clubs.every((club) => club.players.every((player) => player.contractRounds >= 0 && player.contractRounds <= 14))).toBe(true)
      const domesticIds = new Set(state.clubs.map((club) => club.id))
      const domesticLedger = state.ledger.filter((entry) => domesticIds.has(entry.clubId))
      expect(state.clubs.reduce((sum, club) => sum + club.cash, 0) - initialCash)
        .toBe(domesticLedger.reduce((sum, entry) => sum + entry.amount, 0))
      for (const club of state.clubs) {
        const openingCash = initial.clubs.find((candidate) => candidate.id === club.id)!.cash
        const transactions = domesticLedger.filter((entry) => entry.clubId === club.id)
        expect(club.cash - openingCash).toBe(transactions.reduce((sum, entry) => sum + entry.amount, 0))
      }

      state.manager.dismissed = false
      const next = startNextSeason(state)
      expect(next.ok).toBe(true)
      if (!next.ok) return
      expect(next.state.season).toBe(2027)
      expect(next.state.currentRound).toBe(1)
      expect(next.state.phase).toBe('sponsorship')
      for (const division of [1, 2, 3, 4] as Division[]) {
        expect(next.state.clubs.filter((club) => club.division === division)).toHaveLength(8)
      }
    }), { numRuns: 20 })
  }, 30_000)
})
