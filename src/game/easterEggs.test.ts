import { describe, expect, it } from 'vitest'
import {
  acknowledgeAuctionResult, advanceAfterCompetitionResults, advanceAfterStandings, autoPickLineup,
  canLeaveClub, completeCupDraw, confirmManagerRegistration, createMarketListings, createNewCareer,
  agePlayer, developAfterMatch, finishRound, getClub, getManagerClub, reachHalfTime, showStandings,
  startRound, submitAuctionOffer, type EngineResult, type GameState,
} from './index'
import { isNeymarEasterEgg } from './easterEggs'
import { simulateFirstHalf, simulateSecondHalf } from './match'
import { parseGameState } from '../persistence/schema'

function unwrap(result: EngineResult): GameState {
  if (!result.ok) throw new Error(result.error)
  return result.state
}

function step(state: GameState): GameState {
  switch (state.phase) {
    case 'manager-registration': return unwrap(confirmManagerRegistration(state))
    case 'cup-draw': return unwrap(completeCupDraw(state))
    case 'auction': return unwrap(state.auctionResult ? acknowledgeAuctionResult(state) : submitAuctionOffer(state))
    case 'pre-round': return unwrap(startRound(state))
    case 'first-half': return unwrap(reachHalfTime(state))
    case 'half-time': return unwrap(finishRound(state))
    case 'second-half': return unwrap(showStandings(state))
    case 'standings': return unwrap(advanceAfterStandings(state))
    case 'competition-results': return unwrap(advanceAfterCompetitionResults(state))
    default: throw new Error(`Unexpected phase ${state.phase}`)
  }
}

describe('Neymar Easter egg', () => {
  it.each(Array.from({ length: 20 }, (_, index) => index + 1))('starts at Santos and is the first auction of round three for seed %i', (seed) => {
    let state = createNewCareer({ managerName: 'Neymar QA', seed })
    const neymar = getClub(state, 'santos').players.find(isNeymarEasterEgg)!
    expect(neymar).toMatchObject({ strength: 48, neymarAuctionPending: true })
    expect(getClub(state, 'santos').players).toHaveLength(18)
    for (let safety = 0; state.currentRound < 3 && safety < 150; safety++) {
      expect(state.market.some((listing) => listing.playerId === neymar.id)).toBe(false)
      state = step(state)
    }
    expect(state).toMatchObject({ currentRound: 3, phase: 'auction' })
    expect(state.market).toHaveLength(6)
    expect(state.market[0]).toMatchObject({ sellerId: 'santos', playerId: neymar.id })
    expect(state.market.filter((listing) => listing.playerId === neymar.id)).toHaveLength(1)
    expect(getClub(state, 'santos').players.find(isNeymarEasterEgg)?.strength).toBeGreaterThanOrEqual(44)
  })

  it('reserves enough players at Santos to complete the scripted sale', () => {
    const state = createNewCareer({ managerName: 'Reserva', seed: 15 })
    const santos = getClub(state, 'santos')
    const neymar = santos.players.find(isNeymarEasterEgg)!
    santos.players = [...santos.players.filter((player) => player.id !== neymar.id).slice(0, 14), neymar]
    expect(canLeaveClub(santos, santos.players.find((player) => player.position === 'D')!)).toBe(false)
    expect(canLeaveClub(santos, neymar)).toBe(true)
    expect(createMarketListings(1, state.clubs, state.manager.clubId, 3).listings[0].playerId).toBe(neymar.id)
  })

  it('never gets injured in the first half and always gets one second-half injury on the pitch', () => {
    const state = createNewCareer({ managerName: 'Lesão', seed: 16 })
    const santos = getClub(state, 'santos')
    const opponent = getClub(state, 'flamengo')
    const neymar = santos.players.find(isNeymarEasterEgg)!
    expect(santos.lineup).toContain(neymar.id)
    for (let seed = 1; seed <= 200; seed++) {
      const first = simulateFirstHalf(seed, santos, opponent)
      expect(first.pending.events.filter((event) => event.playerId === neymar.id && event.type === 'injury')).toEqual([])
      const second = simulateSecondHalf(first.rngState, santos, opponent, first.pending)
      const injuries = second.result.events.filter((event) => event.playerId === neymar.id && event.type === 'injury')
      expect(injuries).toHaveLength(1)
      expect(injuries[0].minute).toBeGreaterThan(45)
      expect(injuries[0].minute).toBeLessThanOrEqual(90)
      expect(injuries[0].durationRounds).toBeGreaterThanOrEqual(2)
      expect(injuries[0].durationRounds).toBeLessThanOrEqual(4)
      expect(second.result.events.filter((event) => event.playerId === neymar.id && event.type === 'goal')
        .every((event) => event.minute < injuries[0].minute)).toBe(true)
    }
  })

  it('avoids the injury when substituted at halftime and also applies to a halftime arrival', () => {
    const state = createNewCareer({ managerName: 'Intervalo', seed: 17 })
    const santos = getClub(state, 'santos')
    const opponent = getClub(state, 'flamengo')
    const neymar = santos.players.find(isNeymarEasterEgg)!
    const starting = [...santos.lineup]
    const first = simulateFirstHalf(1, santos, opponent)
    santos.lineup = santos.lineup.filter((id) => id !== neymar.id)
    const off = simulateSecondHalf(first.rngState, santos, opponent, first.pending)
    expect(off.result.events.some((event) => event.playerId === neymar.id && event.type === 'injury')).toBe(false)
    const benchedFirst = simulateFirstHalf(1, santos, opponent)
    santos.lineup = starting
    const on = simulateSecondHalf(benchedFirst.rngState, santos, opponent, benchedFirst.pending)
    expect(on.result.events.filter((event) => event.playerId === neymar.id && event.type === 'injury')).toHaveLength(1)
  })

  it('preserves the real identity through a purchase and save, then repeats after exactly the recovery games', () => {
    let state = createNewCareer({ managerName: 'Volta', seed: 18 })
    while (state.currentRound < 3) state = step(state)
    const neymarId = state.market[0].playerId
    getManagerClub(state).cash = state.market[0].fee + 200_000
    const oldCash = getManagerClub(state).cash
    const fee = state.market[0].fee
    state = unwrap(submitAuctionOffer(state, 15_000))
    const purchased = getManagerClub(state).players.find(isNeymarEasterEgg)!
    expect(purchased).toMatchObject({ id: neymarId, neymarAuctionPending: false })
    expect(getManagerClub(state).cash).toBe(oldCash - fee)
    state = parseGameState(JSON.parse(JSON.stringify(state)))
    expect(state.clubs.flatMap((club) => club.players).filter(isNeymarEasterEgg)).toHaveLength(1)
    while (state.phase === 'auction') state = step(state)
    // Focus the recurrence check on successive league games; the normal flow
    // above already exercised Copa/Libertadores before the auction.
    getManagerClub(state).players.find(isNeymarEasterEgg)!.injuryRounds = 0
    Object.assign(getManagerClub(state), autoPickLineup(getManagerClub(state)))
    let gamesMissed = 0
    let recovery = 0
    let injuries = 0
    for (let match = 0; match < 7 && injuries < 2; match++) {
      const started = unwrap(startRound(state))
      const before = getManagerClub(state).players.find(isNeymarEasterEgg)!
      const playing = getManagerClub(state).lineup.includes(neymarId)
      if (before.injuryRounds > 0) {
        expect(playing).toBe(false)
        gamesMissed++
      }
      state = unwrap(finishRound(unwrap(reachHalfTime(started))))
      const event = state.lastReport!.leagueResults.flatMap((fixture) => fixture.result!.events)
        .find((event) => event.playerId === neymarId && event.type === 'injury')
      if (event) {
        injuries++
        if (injuries === 1) recovery = event.durationRounds!
        else expect(gamesMissed).toBe(recovery)
        expect(state.lastReport!.injuryMessages?.join(' ')).toContain('NEYMAR')
        expect(getManagerClub(state).lineup).not.toContain(neymarId)
        expect(getManagerClub(state).players.find(isNeymarEasterEgg)?.injuryRounds).toBe(event.durationRounds)
      } else expect(playing).toBe(false)
      state = unwrap(showStandings(state))
      state.currentRound++
      state.phase = 'pre-round'
      state.injuryNoticePending = undefined
    }
    expect(injuries).toBe(2)
  })

  it('ages and develops Neymar under the same talent rules as other players', () => {
    const state = createNewCareer({ managerName: 'Força', seed: 19 })
    const santos = getClub(state, 'santos')
    const opponent = getManagerClub(state)
    for (let seed = 1; seed <= 200; seed++) developAfterMatch(seed, santos, opponent, santos.lineup, opponent.lineup)
    const neymar = santos.players.find(isNeymarEasterEgg)!
    expect(neymar.development?.potential).toBe(50)
    while (neymar.age < 40) agePlayer(neymar)
    expect(neymar.strength).toBeLessThan(28)
  })
})
