import { beforeAll, describe, expect, it } from 'vitest'
import { acceptSponsorshipOffer, acknowledgeRetirementNotice, automaticAcademySelection, promoteAcademyPlayers, createNewCareer, getManagerClub, startNextSeason, type EngineResult, type GameState } from './index'
import { fastForwardSeason } from '../test/simulation'
import { parseGameState } from '../persistence/schema'

function unwrap(result: EngineResult): GameState {
  if (!result.ok) throw new Error(result.error)
  return result.state
}

describe('season renewal', () => {
  let completed: GameState
  beforeAll(() => {
    completed = unwrap(fastForwardSeason(createNewCareer({ managerName: 'Base', seed: 77 })))
    completed.manager.dismissed = false
    for (const player of getManagerClub(completed).players) player.age = 25
    getManagerClub(completed).players[0].age = 60
  })

  it('signs a sponsor, announces retirees, chooses academy graduates, then opens the season', () => {
    const retiredId = getManagerClub(completed).players[0].id
    const next = unwrap(startNextSeason(completed))
    expect(next.phase).toBe('sponsorship')
    expect(getManagerClub(next).players.some((player) => player.id === retiredId)).toBe(false)
    expect(next.offseason!.plans[next.manager.clubId].retired.map((player) => player.id)).toEqual([retiredId])
    expect(next.clubs.flatMap((club) => club.players)).toHaveLength(completed.clubs.flatMap((club) => club.players).length)
    expect(next.clubs.map((club) => club.cash)).toEqual(completed.clubs.map((club) => club.cash))
    expect(next.market.every((listing) => next.clubs.find((club) => club.id === listing.sellerId)?.players.some((player) => player.id === listing.playerId))).toBe(true)
    const signed = unwrap(acceptSponsorshipOffer(next, next.sponsorship!.proposals[next.manager.clubId].offers[0].id))
    expect(signed.phase).toBe('retirement-notice')
    expect(parseGameState(signed)).toEqual(signed)
    const acknowledged = unwrap(acknowledgeRetirementNotice(signed))
    expect(acknowledged.phase).toBe('academy')
    expect(acknowledged.rngState).toBe(signed.rngState)
    expect(acknowledged.clubs).toEqual(signed.clubs)
    expect(acknowledgeRetirementNotice(acknowledged).ok).toBe(false)
    const resumed = parseGameState(JSON.parse(JSON.stringify(acknowledged)))
    const plan = resumed.offseason!.plans[resumed.manager.clubId]
    const selected = automaticAcademySelection(plan)
    const promoted = unwrap(promoteAcademyPlayers(resumed, selected))
    expect(promoted.phase).toBe('cup-draw')
    expect(promoted.offseason!.pendingAcademyClubIds).toEqual([])
    expect(promoted.offseason!.plans[promoted.manager.clubId].promotedIds).toEqual(selected)
    expect(promoted.clubs.flatMap((club) => club.players)).toHaveLength(completed.clubs.flatMap((club) => club.players).length)
    expect(promoted.rngState).toBe(resumed.rngState)
    expect(parseGameState(promoted)).toEqual(promoted)
    expect(promoteAcademyPlayers(promoted, selected).ok).toBe(false)
    expect(startNextSeason(next).ok).toBe(false)
  })

  it('skips the announcement when the managed club has no retirees', () => {
    const young = structuredClone(completed)
    for (const player of getManagerClub(young).players) player.age = 25
    const next = unwrap(startNextSeason(young))
    const signed = unwrap(acceptSponsorshipOffer(next, next.sponsorship!.proposals[next.manager.clubId].offers[0].id))
    expect(signed.offseason!.retirementPendingClubIds).toEqual([])
    expect(signed.offseason!.pendingAcademyClubIds).toEqual([])
    expect(signed.phase).toBe('cup-draw')
  })
})
