import { describe, expect, it } from 'vitest'
import { parseGameState } from '../persistence/schema'
import { MAX_SQUAD_SIZE, MIN_SQUAD_SIZE } from './constants'
import { calculatePlayerSalary, calculatePlayerValue } from './economy'
import { acknowledgeRetirementNotice, automaticAcademySelection, beginPreseason, promoteAcademyPlayers, renewSquads, retirementProbability } from './lifecycle'
import { hashText } from './rng'
import { createNewCareer } from './setup'
import { createMarketListings } from './transfer'
import type { GameState, Position } from './types'

const POSITIONS: readonly Position[] = ['G', 'D', 'M', 'A']

function career(seed = 77): GameState {
  return createNewCareer({ managerName: 'Formação', seed })
}

function newYear(state: GameState): void {
  state.season += 1
  for (const club of state.clubs) for (const player of club.players) player.age += 1
}

function rebuildMarket(state: GameState): void {
  const market = createMarketListings(state.rngState, state.clubs, state.manager.clubId, 1)
  state.market = market.listings
  state.rngState = market.rngState
}

function expectValidSquads(state: GameState, target: number): void {
  const activeIds = state.clubs.flatMap((club) => club.players.map((player) => player.id))
  const retiredIds = new Set(Object.values(state.offseason!.plans).flatMap((plan) => plan.retired.map((player) => player.id)))
  expect(activeIds).toHaveLength(target)
  expect(new Set(activeIds).size).toBe(target)
  expect(activeIds.every((id) => !retiredIds.has(id))).toBe(true)
  for (const club of state.clubs) {
    expect(club.players.length).toBeGreaterThanOrEqual(MIN_SQUAD_SIZE)
    expect(club.players.length).toBeLessThanOrEqual(MAX_SQUAD_SIZE)
    expect(club.players.some((player) => player.position === 'G')).toBe(true)
    expect(club.lineup).toHaveLength(11)
    const selectedIds = [...club.lineup, ...club.bench]
    expect(new Set(selectedIds).size).toBe(selectedIds.length)
    expect(selectedIds.every((id) => club.players.some((player) => player.id === id) && !retiredIds.has(id))).toBe(true)
  }
  expect(state.market.every((listing) => !retiredIds.has(listing.playerId)
    && state.clubs.some((club) => club.id === listing.sellerId && club.players.some((player) => player.id === listing.playerId)))).toBe(true)
}

describe('annual retirements and squad renewal', () => {
  it('has no retirement hazard through 33, exponential growth afterward, and certainty by 41', () => {
    for (let age = 15; age <= 33; age++) expect(retirementProbability(age)).toBe(0)
    expect(retirementProbability(34)).toBe(0.06)
    for (let age = 35; age <= 40; age++) {
      expect(retirementProbability(age) / retirementProbability(age - 1)).toBeCloseTo(1.55, 12)
    }
    for (const age of [41, 42, 60, 100]) expect(retirementProbability(age)).toBe(1)
  })

  it.each([33, 34, 37, 40, 41])('real retirement decisions follow the age-%i hazard across independent seeds', (age) => {
    const original = career()
    const club = original.clubs[0]
    for (const player of club.players) player.age = age
    let retired = 0
    const samples = 500
    for (let sample = 0; sample < samples; sample++) {
      const state = { ...original, season: 2027, rngState: hashText(`retire:${age}:${sample}`), clubs: [structuredClone(club)] }
      renewSquads(state, [])
      retired += state.offseason!.plans[club.id].retired.length
    }
    const rate = retired / (samples * club.players.length)
    if (age <= 33 || age >= 41) expect(rate).toBe(retirementProbability(age))
    else expect(Math.abs(rate - retirementProbability(age))).toBeLessThan(0.02)
  })

  it('draws the same decisions and candidates from the same save, and cannot reroll a prepared season', () => {
    const first = career()
    newYear(first)
    const second = structuredClone(first)
    renewSquads(first, [first.manager.clubId])
    renewSquads(second, [second.manager.clubId])
    expect(second).toEqual(first)
    const prepared = structuredClone(first)
    renewSquads(first, [first.manager.clubId])
    expect(first).toEqual(prepared)
    const resumed = parseGameState(first)
    renewSquads(resumed, [resumed.manager.clubId])
    expect(resumed).toEqual(prepared)
  })

  it('preserves all young squads without consuming random draws or creating unnecessary players', () => {
    const state = career()
    newYear(state)
    for (const club of state.clubs) for (const player of club.players) player.age = 33
    const ids = state.clubs.flatMap((club) => club.players.map((player) => player.id))
    const rng = state.rngState
    renewSquads(state, [state.manager.clubId])
    expect(state.rngState).toBe(rng)
    expect(state.clubs.flatMap((club) => club.players.map((player) => player.id))).toEqual(ids)
    expect(Object.values(state.offseason!.plans).every((plan) => plan.retired.length === 0 && plan.candidates.length === 0)).toBe(true)
    beginPreseason(state)
    expect(state.phase).toBe('cup-draw')
  })

  it('replaces a whole retiring league while keeping each club playable and identifying its retirees', () => {
    const state = career()
    newYear(state)
    for (const club of state.clubs) for (const player of club.players) player.age = 41
    const oldRosters = new Map(state.clubs.map((club) => [club.id, structuredClone(club.players)]))
    const total = state.clubs.reduce((count, club) => count + club.players.length, 0)
    const managedIds = [state.manager.clubId, state.clubs.find((club) => club.id !== state.manager.clubId)!.id]
    renewSquads(state, [...managedIds, managedIds[0]])
    rebuildMarket(state)
    expectValidSquads(state, total)
    expect(state.offseason!.retirementPendingClubIds).toEqual(managedIds)
    for (const club of state.clubs) {
      const plan = state.offseason!.plans[club.id]
      expect(plan.retired).toEqual(oldRosters.get(club.id))
      expect(plan.promotedIds).toEqual(automaticAcademySelection(plan))
      expect(plan.promotedIds).toHaveLength(Object.values(plan.required).reduce((count, quota) => count + quota, 0))
      for (const position of POSITIONS) {
        expect(club.players.filter((player) => player.position === position)).toHaveLength(plan.required[position])
        const chosen = plan.candidates.filter((player) => player.position === position && plan.promotedIds.includes(player.id))
        const rejected = plan.candidates.filter((player) => player.position === position && !plan.promotedIds.includes(player.id))
        if (chosen.length && rejected.length) expect(Math.min(...chosen.map((player) => player.strength))).toBeGreaterThanOrEqual(Math.max(...rejected.map((player) => player.strength)))
      }
      expect(plan.candidates.every((player) => player.age >= 17 && player.age <= 20 && player.nationality === 'BRA'
        && player.strength >= 3 && player.strength <= 45 && player.salary <= calculatePlayerSalary(45, 20)
        && player.salary === calculatePlayerSalary(player.strength, player.age) && player.value === calculatePlayerValue(player.strength, player.age))).toBe(true)
    }
    expect(parseGameState(state)).toEqual(state)
  })

  it('replaces goalkeepers when every goalkeeper retires but the outfield squad remains young', () => {
    const state = career()
    newYear(state)
    for (const club of state.clubs) for (const player of club.players) player.age = player.position === 'G' ? 41 : 25
    const total = state.clubs.reduce((count, club) => count + club.players.length, 0)
    renewSquads(state, [state.manager.clubId])
    rebuildMarket(state)
    expectValidSquads(state, total)
    expect(Object.values(state.offseason!.plans).every((plan) => plan.retired.length > 0
      && plan.retired.every((player) => player.position === 'G') && plan.required.G > 0)).toBe(true)
  })

  it('keeps a fixed, unique and playable population over fifty renewals without creating money', () => {
    const state = career(121)
    const initialIds = new Set(state.clubs.flatMap((club) => club.players.map((player) => player.id)))
    const total = initialIds.size
    const balances = state.clubs.map((club) => club.cash)
    for (let year = 0; year < 50; year++) {
      newYear(state)
      renewSquads(state, [state.manager.clubId])
      rebuildMarket(state)
      expect(state.offseason!.targetPlayerCount).toBe(total)
      expectValidSquads(state, total)
      expect(state.clubs.map((club) => club.cash)).toEqual(balances)
      expect(state.clubs.every((club) => club.players.every((player) => player.age <= 40))).toBe(true)
      expect(parseGameState(state)).toEqual(state)
    }
    expect(state.clubs.flatMap((club) => club.players).every((player) => !initialIds.has(player.id))).toBe(true)
  })

  it('saves and acknowledges retirement notices without changing the renewal decisions', () => {
    const state = career()
    newYear(state)
    const club = state.clubs.find((candidate) => candidate.id === state.manager.clubId)!
    club.players[0].age = 41
    renewSquads(state, [club.id])
    beginPreseason(state)
    expect(state.phase).toBe('retirement-notice')
    const before = structuredClone(state)
    const continued = acknowledgeRetirementNotice(parseGameState(state))
    expect(continued.ok).toBe(true)
    if (!continued.ok) return
    expect(state).toEqual(before)
    expect(continued.state.phase).toBe('academy')
    expect(continued.state.offseason!.plans).toEqual(before.offseason!.plans)
    expect(continued.state.offseason!.retirementPendingClubIds).toEqual([])
    expect(continued.state.clubs).toEqual(before.clubs)
    expect(continued.state.rngState).toBe(before.rngState)
    expect(acknowledgeRetirementNotice(continued.state).ok).toBe(false)
  })

  it('loads existing careers without an offseason snapshot', () => {
    const old = career()
    expect(old.offseason).toBeUndefined()
    expect(parseGameState(old)).toEqual(old)
  })
})

describe('annual academy selection', () => {
  it('uses replacement vacancies to rebalance squad sizes instead of perpetuating bloated payrolls', () => {
    const state = career()
    newYear(state)
    for (const club of state.clubs) for (const player of club.players) player.age = 25
    const large = state.clubs.find((club) => club.division === 1)!
    const small = state.clubs.find((club) => club.division === 4)!
    large.players.push(...small.players.splice(-4))
    expect(large.players).toHaveLength(22)
    expect(small.players).toHaveLength(14)
    large.players[2].age = 41
    large.players[3].age = 41
    renewSquads(state, [large.id])
    expect(state.offseason!.plans[large.id].promotedIds).toHaveLength(0)
    expect(state.offseason!.plans[small.id].promotedIds).toHaveLength(2)
    expect(large.players).toHaveLength(20)
    expect(small.players).toHaveLength(16)
    rebuildMarket(state)
    expectValidSquads(state, 576)
  })

  function academy(): GameState {
    const state = career()
    newYear(state)
    for (const club of state.clubs) for (const player of club.players) player.age = 41
    renewSquads(state, [state.manager.clubId])
    rebuildMarket(state)
    beginPreseason(state)
    const result = acknowledgeRetirementNotice(state)
    if (!result.ok) throw new Error(result.error)
    expect(result.state.phase).toBe('academy')
    return result.state
  }

  it.each(['missing', 'too many', 'duplicate', 'outside club', 'wrong position'] as const)(
    'rejects %s choices without changing the save, roster, finances or random stream', (invalid) => {
      const state = academy()
      const plan = state.offseason!.plans[state.manager.clubId]
      const selected = automaticAcademySelection(plan)
      if (invalid === 'missing') selected.pop()
      if (invalid === 'too many') selected.push(plan.candidates.find((player) => !selected.includes(player.id))!.id)
      if (invalid === 'duplicate') selected[0] = selected[1]
      if (invalid === 'outside club') selected[0] = state.offseason!.plans[state.clubs.find((club) => club.id !== state.manager.clubId)!.id].candidates[0].id
      if (invalid === 'wrong position') {
        const firstPosition = plan.candidates.find((player) => player.id === selected[0])!.position
        selected[0] = plan.candidates.find((player) => player.position !== firstPosition && !selected.includes(player.id))!.id
      }
      const before = structuredClone(state)
      expect(promoteAcademyPlayers(state, selected).ok).toBe(false)
      expect(state).toEqual(before)
    },
  )

  it('swaps the default intake for the chosen prospects without changing population or balances', () => {
    const state = academy()
    const clubId = state.manager.clubId
    const plan = state.offseason!.plans[clubId]
    const before = structuredClone(state)
    const selected = POSITIONS.flatMap((position) => plan.candidates.filter((player) => player.position === position)
      .sort((left, right) => left.strength - right.strength || right.age - left.age || right.id.localeCompare(left.id))
      .slice(0, plan.required[position]).map((player) => player.id))
    expect(selected).not.toEqual(plan.promotedIds)
    const promoted = promoteAcademyPlayers(parseGameState(JSON.parse(JSON.stringify(state))), selected)
    expect(promoted.ok).toBe(true)
    if (!promoted.ok) return
    const result = promoted.state
    expect(state).toEqual(before)
    expect(result.phase).toBe('cup-draw')
    expect(result.revision).toBe(state.revision + 1)
    expect(result.rngState).toBe(state.rngState)
    expect(result.offseason!.pendingAcademyClubIds).toEqual([])
    expect(result.offseason!.plans[clubId].candidates).toEqual(plan.candidates)
    expect(result.offseason!.plans[clubId].promotedIds).toEqual(selected)
    expect(result.clubs.find((club) => club.id === clubId)!.players.map((player) => player.id).sort()).toEqual([...selected].sort())
    expect(result.clubs.filter((club) => club.id !== clubId)).toEqual(state.clubs.filter((club) => club.id !== clubId))
    expect(result.clubs.map((club) => club.cash)).toEqual(state.clubs.map((club) => club.cash))
    expect(result.ledger).toEqual(state.ledger)
    expectValidSquads(result, state.offseason!.targetPlayerCount)
    expect(parseGameState(JSON.parse(JSON.stringify(result)))).toEqual(result)
    expect(promoteAcademyPlayers(result, selected).ok).toBe(false)
  })

  it('keeps each manager’s pool pending until that manager chooses, including after reload', () => {
    const state = academy()
    const firstId = state.manager.clubId
    const secondId = state.clubs.find((club) => club.id !== firstId)!.id
    state.offseason!.pendingAcademyClubIds = [firstId, secondId]
    const firstPlan = state.offseason!.plans[firstId]
    const first = promoteAcademyPlayers(state, automaticAcademySelection(firstPlan))
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(first.state.phase).toBe('academy')
    expect(first.state.offseason!.pendingAcademyClubIds).toEqual([secondId])
    expect(promoteAcademyPlayers(first.state, automaticAcademySelection(firstPlan)).ok).toBe(false)
    const resumed = parseGameState(JSON.parse(JSON.stringify(first.state)))
    resumed.manager.clubId = secondId
    const secondPlan = resumed.offseason!.plans[secondId]
    expect(promoteAcademyPlayers(resumed, automaticAcademySelection(firstPlan)).ok).toBe(false)
    const second = promoteAcademyPlayers(resumed, automaticAcademySelection(secondPlan))
    expect(second.ok).toBe(true)
    if (!second.ok) return
    expect(second.state.phase).toBe('cup-draw')
    expect(second.state.offseason!.pendingAcademyClubIds).toEqual([])
    expectValidSquads(second.state, state.offseason!.targetPlayerCount)
  })

  it('loads a previous retirement snapshot without reopening an already automatic intake', () => {
    const state = academy()
    delete state.offseason!.pendingAcademyClubIds
    state.phase = 'cup-draw'
    const resumed = parseGameState(JSON.parse(JSON.stringify(state)))
    beginPreseason(resumed)
    expect(resumed.phase).toBe('cup-draw')
    expect(resumed.clubs).toEqual(state.clubs)
    expect(promoteAcademyPlayers(resumed, automaticAcademySelection(resumed.offseason!.plans[state.manager.clubId])).ok).toBe(false)
  })
})
