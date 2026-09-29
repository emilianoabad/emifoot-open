import { startRound, reachHalfTime, finishRound, showStandings, advanceAfterStandings, acknowledgeSponsorshipNotice, advanceAfterCompetitionResults, acceptSponsorshipOffer } from '../game/engine'
import { bestSafeSponsorship } from '../game/sponsorship'
import { acknowledgeRetirementNotice, automaticAcademySelection, promoteAcademyPlayers } from '../game/lifecycle'
import type { EngineResult, GameState } from '../game/types'

// Isolate the competition smoke-test shortcut from the shipped engine.
// Economic simulations resolve every auction through the normal game commands.
export function fastForwardSeason(original: GameState): EngineResult {
  let state = structuredClone(original)
  if (state.phase === 'sponsorship') {
    const signed = acceptSponsorshipOffer(state, bestSafeSponsorship(state.sponsorship!.proposals[state.manager.clubId]).id)
    if (!signed.ok) return signed
    state = signed.state
  }
  if (state.phase === 'manager-registration') state.phase = 'cup-draw'
  if (state.phase === 'retirement-notice') {
    const acknowledged = acknowledgeRetirementNotice(state)
    if (!acknowledged.ok) return acknowledged
    state = acknowledged.state
  }
  if (state.phase === 'academy') {
    const promoted = promoteAcademyPlayers(state, automaticAcademySelection(state.offseason!.plans[state.manager.clubId]))
    if (!promoted.ok) return promoted
    state = promoted.state
  }
  if (state.phase === 'cup-draw') state.phase = 'auction'
  if (state.phase === 'auction') {
    state.market = []
    state.auctionResult = undefined
    state.phase = 'pre-round'
  }
  let safety = 0
  while (state.phase !== 'season-end' && safety < 500) {
    safety += 1
    if (state.phase === 'auction') {
      state.market = []
      state.auctionResult = undefined
      state.phase = 'pre-round'
      continue
    }
    const result = state.phase === 'pre-round' ? startRound(state)
      : state.phase === 'first-half' ? reachHalfTime(state)
        : state.phase === 'half-time' ? finishRound(state)
          : state.phase === 'second-half' ? showStandings(state)
            : state.phase === 'standings' ? advanceAfterStandings(state)
              : state.phase === 'sponsorship-notice' ? acknowledgeSponsorshipNotice(state)
                : state.phase === 'competition-results' ? advanceAfterCompetitionResults(state)
                  : { ok: false as const, error: `Fase não suportada na simulação: ${state.phase}` }
    if (!result.ok) return result
    state = result.state
  }
  if (state.phase !== 'season-end') return { ok: false, error: 'A simulação excedeu o limite de segurança.' }
  return { ok: true, state }
}
