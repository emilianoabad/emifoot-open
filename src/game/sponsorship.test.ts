import { beforeAll, describe, expect, it } from 'vitest'
import {
  acceptJobOffer, acceptSponsorshipOffer, acknowledgeSponsorshipNotice, acknowledgeRetirementNotice, automaticAcademySelection, promoteAcademyPlayers, advanceAfterStandings, advanceBettingRegulation, bestSafeSponsorship, bettingRegulationNotice,
  createNewCareer, createSponsorshipProposal, expectedBettingActiveFraction, finishRoundForManagedClubs,
  getAvailableSponsorshipProposal, getManagerClub, getSponsorBrand, getTable, maximumSponsorshipPerRound, nextBettingRegulation,
  random, reachHalfTime, showStandings, signSponsorship, SPONSOR_BRANDS, sponsorshipPayment,
  sponsorshipValue, startNextSeason, startRoundForManagedClubs,
  type EngineResult, type GameState,
} from './index'
import { fastForwardSeason } from '../test/simulation'
import { parseGameState } from '../persistence/schema'

function unwrap(result: EngineResult): GameState {
  if (!result.ok) throw new Error(result.error)
  return result.state
}

function negotiation(completed: GameState): GameState {
  const state = structuredClone(completed)
  state.manager.dismissed = false
  return unwrap(startNextSeason(state))
}

function regulationSeed(change: boolean): number {
  for (let seed = 1; seed < 1_000; seed++) if ((nextBettingRegulation(seed, true).allowed === false) === change) return seed
  throw new Error('Expected a regulation seed')
}

function playRound(initial: GameState, round: number, regulationChanges: boolean): GameState {
  const state = structuredClone(initial)
  state.phase = 'pre-round'
  state.currentRound = round
  state.activeCompetition = undefined
  state.sponsorship!.rngState = regulationSeed(regulationChanges)
  return unwrap(showStandings(unwrap(finishRoundForManagedClubs(unwrap(reachHalfTime(unwrap(startRoundForManagedClubs(state, [])))), []))))
}

describe('annual sponsorship contracts', () => {
  let completed: GameState
  beforeAll(() => { completed = unwrap(fastForwardSeason(createNewCareer({ managerName: 'Patrocínio', seed: 77 }))) })

  it('opens three offers for the chosen club after promotion and before the cup draw', () => {
    const moved = unwrap(acceptJobOffer(completed, completed.manager.offers[0].clubId))
    const before = structuredClone(moved)
    const next = unwrap(startNextSeason(moved))
    const club = getManagerClub(next)
    const proposal = next.sponsorship!.proposals[club.id]
    expect(moved).toEqual(before)
    expect(next).toMatchObject({ phase: 'sponsorship', season: 2027 })
    expect(next.sponsorship!.pendingClubIds).toEqual([club.id])
    expect(proposal).toMatchObject({ season: 2027, division: club.division, supporters: club.supporters })
    expect(proposal.previousPosition).toBe(getTable(moved, getManagerClub(moved).division).findIndex((entry) => entry.clubId === club.id) + 1)
    expect(proposal.offers).toHaveLength(3)
    expect(new Set(proposal.offers.map((offer) => offer.brandId)).size).toBe(3)
    expect(proposal.offers.map((offer) => offer.kind)).toEqual(['steady', 'performance', 'betting'])
    expect(club.sponsorship).toBeUndefined()
    expect(next.clubs.filter((candidate) => candidate.id !== club.id).every((candidate) => candidate.sponsorship?.season === 2027)).toBe(true)
    expect(parseGameState(next)).toEqual(next)
    const signed = unwrap(acceptSponsorshipOffer(next, proposal.offers[0].id))
    expect(signed.phase).toBe(signed.offseason!.retirementPendingClubIds.length ? 'retirement-notice'
      : signed.offseason!.pendingAcademyClubIds!.length ? 'academy' : 'cup-draw')
    expect(getManagerClub(signed).sponsorship).toEqual(proposal.offers[0])
    let ready = signed.phase === 'retirement-notice' ? unwrap(acknowledgeRetirementNotice(signed)) : signed
    if (ready.phase === 'academy') ready = unwrap(promoteAcademyPlayers(ready, automaticAcademySelection(ready.offseason!.plans[club.id])))
    expect(ready.phase).toBe('cup-draw')
    expect(getManagerClub(ready).sponsorship).toEqual(proposal.offers[0])
    expect(acceptSponsorshipOffer(signed, proposal.offers[1].id).ok).toBe(false)
    expect(acceptSponsorshipOffer(next, next.sponsorship!.proposals[next.clubs.find((candidate) => candidate.id !== club.id)!.id].offers[0].id).ok).toBe(false)
  })

  it('uses the new division for a promoted champion and rewards each sporting achievement', () => {
    const promotedId = completed.awards[0].champions['4']
    const originalClub = completed.clubs.find((club) => club.id === promotedId)!
    const next = negotiation(completed)
    expect(next.sponsorship!.proposals[promotedId].division).toBe(3)
    expect(next.sponsorship!.proposals[promotedId].achievements).toContain('Campeão de divisão')
    const state = structuredClone(completed)
    state.awards = []
    const club = state.clubs.find((candidate) => candidate.id === originalClub.id)!
    const baseline = createSponsorshipProposal(state, club).offers[0].basePerRound
    for (const award of [
      { champions: { 4: club.id } }, { cupChampionId: club.id }, { libertadoresChampionId: club.id },
      { bestAttackClubId: club.id }, { bestDefenceClubId: club.id }, { topScorerId: club.players[0].id },
    ]) {
      state.awards = [{ ...completed.awards[0], champions: {}, cupChampionId: '', libertadoresChampionId: undefined,
        bestAttackClubId: undefined, bestDefenceClubId: undefined, topScorerId: '', ...award }]
      expect(createSponsorshipProposal(state, club).offers[0].basePerRound).toBeGreaterThan(baseline)
    }
  })

  it('scales with division, members and results without an unbounded money feedback loop', () => {
    expect(sponsorshipValue(2, 20_000, 21, 0)).toBeGreaterThan(sponsorshipValue(3, 20_000, 21, 0))
    expect(sponsorshipValue(4, 40_000, 21, 0)).toBeGreaterThan(sponsorshipValue(4, 10_000, 21, 0))
    expect(sponsorshipValue(4, 20_000, 35, 0)).toBeGreaterThan(sponsorshipValue(4, 20_000, 10, 0))
    expect(sponsorshipValue(1, 1e12, 42, 100)).toBeLessThanOrEqual(18_000 * 1.6 * 1.55 + 25)
    const club = getManagerClub(completed)
    const first = createSponsorshipProposal(completed, club)
    const rich = { ...club, cash: 1e12, sponsorPerRound: 1e9 }
    expect(createSponsorshipProposal(completed, rich)).toEqual(first)
    expect(SPONSOR_BRANDS).toHaveLength(30)
    expect(new Set(SPONSOR_BRANDS.map((brand) => brand.id)).size).toBe(30)
    expect(SPONSOR_BRANDS.every((brand) => brand.description.length > 10)).toBe(true)
  })

  it('quotes the largest headline offer but ~10% lower expected receipts while bets are allowed', () => {
    const state = structuredClone(completed)
    state.sponsorship!.bettingAllowed = true
    const next = negotiation(state)
    for (const club of next.clubs) {
      const proposal = next.sponsorship!.proposals[club.id]
      const safe = bestSafeSponsorship(proposal)
      const bet = proposal.offers[2]
      expect(bet.projectedIncome).toBeGreaterThan(Math.max(...proposal.offers.slice(0, 2).map((offer) => offer.projectedIncome)))
      expect(bet.expectedIncome / safe.expectedIncome).toBeCloseTo(0.9, 2)
      for (const offer of proposal.offers) expect(offer.basePerRound + offer.winBonus).toBeLessThanOrEqual(maximumSponsorshipPerRound(club.division))
    }
  })

  it('offers three distinct non-betting brands to every club during a ban', () => {
    const state = structuredClone(completed)
    state.sponsorship!.bettingAllowed = false
    const next = negotiation(state)
    for (const club of next.clubs) {
      const proposal = next.sponsorship!.proposals[club.id]
      expect(proposal.offers).toHaveLength(3)
      expect(new Set(proposal.offers.map((offer) => offer.brandId)).size).toBe(3)
      expect(proposal.offers.every((offer) => offer.kind !== 'betting' && !getSponsorBrand(offer.brandId).betting)).toBe(true)
      const [steady, performance, balanced] = proposal.offers
      expect(balanced.basePerRound).toBeGreaterThan(performance.basePerRound)
      expect(balanced.basePerRound).toBeLessThan(steady.basePerRound)
      expect(balanced.winBonus).toBeGreaterThan(steady.winBonus)
      expect(balanced.winBonus).toBeLessThan(performance.winBonus)
    }
    const proposal = next.sponsorship!.proposals[next.manager.clubId]
    const signed = unwrap(acceptSponsorshipOffer(next, proposal.offers[2].id))
    expect(getManagerClub(signed).sponsorship).toEqual(proposal.offers[2])
    expect(parseGameState(next)).toEqual(next)
  })

  it('replaces an unsigned betting offer from an old save and rejects its stale id', () => {
    const old = negotiation(completed)
    const clubId = old.manager.clubId
    const bettingId = old.sponsorship!.proposals[clubId].offers[2].id
    old.sponsorship!.bettingAllowed = false
    const before = structuredClone(old)
    const proposal = getAvailableSponsorshipProposal(old, clubId)!
    expect(old).toEqual(before)
    expect(proposal.offers.slice(0, 2)).toEqual(old.sponsorship!.proposals[clubId].offers.slice(0, 2))
    expect(new Set(proposal.offers.map((offer) => offer.brandId)).size).toBe(3)
    expect(proposal.offers.every((offer) => !getSponsorBrand(offer.brandId).betting)).toBe(true)
    expect(getAvailableSponsorshipProposal(parseGameState(old), clubId)).toEqual(proposal)
    expect(acceptSponsorshipOffer(old, bettingId).ok).toBe(false)
    const signed = unwrap(acceptSponsorshipOffer(old, proposal.offers[2].id))
    expect(signed.sponsorship!.proposals[clubId]).toEqual(proposal)
    expect(getManagerClub(signed).sponsorship).toEqual(proposal.offers[2])
    expect(parseGameState(signed)).toEqual(signed)
  })

  it('preserves betting agreements signed before the ban', () => {
    const state = negotiation(completed)
    const clubId = state.manager.clubId
    const proposal = state.sponsorship!.proposals[clubId]
    const signed = unwrap(acceptSponsorshipOffer(state, proposal.offers[2].id))
    signed.sponsorship!.bettingAllowed = false
    expect(getAvailableSponsorshipProposal(signed, clubId)).toEqual(proposal)
    expect(getManagerClub(signed).sponsorship).toEqual(proposal.offers[2])
    expect(sponsorshipPayment(signed, getManagerClub(signed), 'V')).toBe(0)
  })

  it('pays guaranteed money plus exactly one result bonus, for one season only', () => {
    const state = negotiation(completed)
    const club = getManagerClub(state)
    for (const offer of state.sponsorship!.proposals[club.id].offers) {
      signSponsorship(club, offer)
      state.sponsorship!.bettingAllowed = true
      expect(sponsorshipPayment(state, club, 'V')).toBe(offer.basePerRound + offer.winBonus)
      expect(sponsorshipPayment(state, club, 'E')).toBe(offer.basePerRound + offer.drawBonus)
      expect(sponsorshipPayment(state, club, 'D')).toBe(offer.basePerRound)
      expect(sponsorshipPayment({ ...state, season: 2028 }, club, 'V')).toBe(0)
    }
  })

  it('suspends all betting receipts on a ban, resumes without arrears, and only notifies affected clubs', () => {
    const offers = negotiation(completed)
    const clubId = offers.manager.clubId
    const signed = unwrap(acceptSponsorshipOffer(offers, offers.sponsorship!.proposals[clubId].offers[2].id))
    signed.sponsorship!.bettingAllowed = true
    const banned = playRound(signed, 1, true)
    expect(banned.sponsorship!.bettingAllowed).toBe(false)
    expect(banned.lastReport!.bettingRegulationChange).toEqual({ allowed: false })
    expect(banned.ledger.filter((entry) => entry.season === 2027 && entry.type === 'sponsor' && entry.clubId === clubId).map((entry) => entry.amount)).toEqual([0])
    expect(bettingRegulationNotice(banned)).toContain('O Governo editou uma Medida Provisória proibindo as bets.')
    expect(bettingRegulationNotice(banned)).toContain(`suspendeu o patrocínio do clube ${getManagerClub(banned).name} até segunda ordem.`)
    expect(banned.phase).toBe('standings')
    expect(acknowledgeSponsorshipNotice(banned).ok).toBe(false)
    const notice = unwrap(advanceAfterStandings(banned))
    expect(notice).toMatchObject({ phase: 'sponsorship-notice', currentRound: 1 })
    expect(notice.ledger).toEqual(banned.ledger)
    expect(parseGameState(notice)).toEqual(notice)
    const continued = unwrap(acknowledgeSponsorshipNotice(notice))
    expect(continued).toMatchObject({ phase: 'auction', currentRound: 2 })
    const withoutNotice = structuredClone(banned)
    delete withoutNotice.lastReport!.bettingRegulationChange
    const normalContinuation = unwrap(advanceAfterStandings(withoutNotice))
    expect(continued.ledger).toEqual(normalContinuation.ledger)
    expect(continued.rngState).toBe(normalContinuation.rngState)
    expect(acknowledgeSponsorshipNotice(continued).ok).toBe(false)
    const stillBanned = playRound(banned, 2, false)
    expect(bettingRegulationNotice(stillBanned)).toBeUndefined()
    expect(unwrap(advanceAfterStandings(stillBanned)).phase).not.toBe('sponsorship-notice')
    const allowed = playRound(stillBanned, 3, true)
    expect(bettingRegulationNotice(allowed)).toContain('APOSTAS LIBERADAS')
    expect(unwrap(advanceAfterStandings(allowed)).phase).toBe('sponsorship-notice')
    const receipts = allowed.ledger.filter((entry) => entry.season === 2027 && entry.type === 'sponsor' && entry.clubId === clubId)
    expect(receipts).toHaveLength(3)
    expect(receipts.slice(0, 2).map((entry) => entry.amount)).toEqual([0, 0])
    expect(receipts[2].amount).toBe(sponsorshipPayment(allowed, getManagerClub(allowed), getManagerClub(allowed).form.at(-1)))
    const safeClub = allowed.clubs.find((club) => club.sponsorship?.kind !== 'betting')!
    const unaffected = { ...allowed, manager: { ...allowed.manager, clubId: safeClub.id } }
    expect(bettingRegulationNotice(unaffected)).toBeUndefined()
    expect(unwrap(advanceAfterStandings(unaffected)).phase).not.toBe('sponsorship-notice')
    expect(parseGameState(allowed)).toEqual(allowed)
  })

  it('keeps old current-season payments and carries the government position into the next season', () => {
    const old = structuredClone(completed)
    delete old.sponsorship
    expect(sponsorshipPayment(old, getManagerClub(old), 'V')).toBe(getManagerClub(old).sponsorPerRound)
    const next = negotiation(old)
    expect(next.sponsorship?.bettingAllowed).toBe(true)
    const banned = structuredClone(completed)
    banned.sponsorship!.bettingAllowed = false
    expect(negotiation(banned).sponsorship?.bettingAllowed).toBe(false)
    const rngBefore = banned.rngState
    advanceBettingRegulation(banned)
    expect(banned.rngState).toBe(rngBefore)
  })

  it.each([true, false])('calculates the active fraction of a season (initially allowed: %s)', (initiallyAllowed) => {
    const exactFraction = 0.5 + (initiallyAllowed ? 1 : -1) * 3 / 14 * (1 - (6 / 7) ** 14)
    expect(expectedBettingActiveFraction(initiallyAllowed)).toBeCloseTo(exactFraction, 12)
  })

  it('empirically prices new betting contracts at 10% below safe receipts', () => {
    const state = negotiation(completed)
    const source = structuredClone(completed)
    source.sponsorship!.bettingAllowed = true
    const proposal = createSponsorshipProposal(source, getManagerClub(source))
    const bet = proposal.offers[2]
    const safe = bestSafeSponsorship(proposal)
    const club = getManagerClub(state)
    let governmentRng = 123_456
    let resultsRng = 7_654_321
    let changes = 0
    let betReceipts = 0
    let safeReceipts = 0
    const seasons = 50_000
    for (let season = 0; season < seasons; season++) {
      let allowed = true
      for (let round = 0; round < 14; round++) {
        const next = nextBettingRegulation(governmentRng, allowed)
        governmentRng = next.rngState
        if (next.allowed !== allowed) changes++
        allowed = next.allowed
        state.sponsorship!.bettingAllowed = allowed
        const outcomeRoll = random(resultsRng)
        resultsRng = outcomeRoll.state
        const outcome = outcomeRoll.value < proposal.expectedWins / 14 ? 'V'
          : outcomeRoll.value < (proposal.expectedWins + proposal.expectedDraws) / 14 ? 'E' : 'D'
        club.sponsorship = bet
        betReceipts += sponsorshipPayment(state, club, outcome)
        club.sponsorship = safe
        safeReceipts += sponsorshipPayment(state, club, outcome)
      }
    }
    expect(changes / seasons).toBeCloseTo(1, 1)
    expect(betReceipts / safeReceipts).toBeGreaterThan(0.88)
    expect(betReceipts / safeReceipts).toBeLessThan(0.92)
  })
})
