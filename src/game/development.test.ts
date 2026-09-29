import { describe, expect, it } from 'vitest'
import { agePlayer, ageStrengthFactor, contextualStrength, createDevelopment, developAfterMatch } from './development'
import { createNewCareer, migratePlayerDevelopment } from './setup'
import { parseGameState } from '../persistence/schema'
import { loadGame, saveGame } from '../persistence/saveRepository'
import type { Player } from './types'

function setTalent(player: Player, potential: number, age: number): void {
  player.age = age
  player.development = createDevelopment(potential, age)
  player.strength = Math.round(player.development.ability)
}

describe('anchored player development', () => {
  it('matures quickly at first, peaks near 30, and declines progressively after 33', () => {
    const strength = (age: number) => 50 * ageStrengthFactor(age)
    expect(strength(20) - strength(17)).toBeGreaterThan(9)
    expect(strength(23) - strength(20)).toBeLessThan(strength(20) - strength(17))
    expect(strength(30)).toBeGreaterThan(49)
    expect(strength(33) - strength(34)).toBeLessThan(strength(35) - strength(36))
    expect(strength(35) - strength(36)).toBeLessThan(strength(37) - strength(38))
    expect(strength(40)).toBeLessThan(21)
    expect(strength(50)).toBeLessThan(1)
    expect(Number.isFinite(ageStrengthFactor(1000))).toBe(true)
  })

  it('has exponential resistance around individual talent, even in extreme company', () => {
    const low = contextualStrength(10, 27, 50)
    const elite = contextualStrength(50, 27, 10)
    expect(low).toBeGreaterThan(10)
    expect(low).toBeLessThan(17)
    expect(elite).toBeGreaterThan(43)
    expect(elite).toBeLessThan(49)
    const anchor = 25 * ageStrengthFactor(27)
    const smallGain = contextualStrength(25, 27, anchor + 5) - anchor
    const largeGain = contextualStrength(25, 27, anchor + 20) - anchor
    expect(largeGain).toBeLessThan(4 * smallGain)
    expect(contextualStrength(50, 40, 50)).toBeLessThan(27)
  })

  it('develops participating players without erasing talent or changing the bench', () => {
    const state = createNewCareer({ managerName: 'Talento', seed: 5 })
    const [home, away] = state.clubs
    for (const club of [home, away]) for (const player of club.players) setTalent(player, 50, 27)
    const weak = home.players.find((player) => home.lineup.includes(player.id))!
    setTalent(weak, 10, 27)
    const benched = home.players.find((player) => !home.lineup.includes(player.id))!
    const beforeBench = structuredClone(benched)
    let seed = state.rngState
    for (let match = 0; match < 140; match++) seed = developAfterMatch(seed, home, away, home.lineup, away.lineup)
    expect(weak.strength).toBeGreaterThan(12)
    expect(weak.strength).toBeLessThan(19)
    expect(weak.development!.potential).toBe(10)
    expect(benched).toEqual(beforeBench)
    expect(away.players.filter((player) => away.lineup.includes(player.id)).every((player) => player.strength >= 47)).toBe(true)
    // The same player still cannot become elite after moving clubs.
    away.players.push(home.players.splice(home.players.indexOf(weak), 1)[0])
    expect(weak.development!.potential).toBe(10)
  })

  it('preserves fractional growth, seed reproducibility and independence from roster order', () => {
    const state = createNewCareer({ managerName: 'Precisão', seed: 12 })
    const copy = parseGameState(JSON.parse(JSON.stringify(state)))
    const [home, away] = state.clubs
    const [copyHome, copyAway] = copy.clubs
    copyHome.players.reverse()
    copyAway.players.reverse()
    const seed = developAfterMatch(state.rngState, home, away, home.lineup, away.lineup)
    expect(developAfterMatch(copy.rngState, copyHome, copyAway, home.lineup, away.lineup)).toBe(seed)
    for (const player of [...home.players, ...away.players]) {
      const other = [...copyHome.players, ...copyAway.players].find((candidate) => candidate.id === player.id)!
      expect(other).toEqual(player)
    }
    expect(home.players.some((player) => player.development!.ability !== player.strength)).toBe(true)
  })

  it('ages a whole career without raising peak talent or leaving elite 40-year-olds', () => {
    const state = createNewCareer({ managerName: 'Carreira', seed: 8 })
    const [home, away] = state.clubs
    for (const player of [...home.players, ...away.players]) setTalent(player, 50, 17)
    let seed = state.rngState
    for (let age = 17; age <= 45; age++) {
      for (let match = 0; match < 25; match++) seed = developAfterMatch(seed, home, away, home.lineup, away.lineup)
      for (const player of [...home.players, ...away.players]) {
        expect(player.development!.potential).toBe(50)
        expect(player.strength).toBeGreaterThanOrEqual(1)
        expect(player.strength).toBeLessThanOrEqual(50)
        if (age >= 40) expect(player.strength).toBeLessThan(28)
        agePlayer(player)
      }
    }
  })

  it('does not infer an old academy player’s talent from their origin club’s present division', () => {
    const state = createNewCareer({ managerName: 'Base migrada', seed: 13 })
    delete state.playerModelVersion
    const first = state.clubs.find((club) => club.division === 1)!
    const fourth = state.clubs.find((club) => club.division === 4)!
    for (const club of [first, fourth]) {
      const player = club.players[0]
      Object.assign(player, { id: `academy-2027-${club.id}-0`, sourceId: `academy-2027-${club.id}-0`, strength: 30, age: 20 })
      delete player.development
    }
    first.division = 4
    fourth.division = 1
    const migrated = migratePlayerDevelopment(state)
    for (const club of [first, fourth]) {
      expect(migrated.clubs.find((candidate) => candidate.id === club.id)!.players[0].development!.potential).toBe(46.5)
    }
  })

  it('migrates old saves by original identity once, preserving purchases, money and contracts', async () => {
    const state = createNewCareer({ managerName: 'Migração', seed: 13 })
    const original = structuredClone(state)
    const fourth = state.clubs.find((club) => club.division === 4)!
    const first = state.clubs.find((club) => club.division === 1)!
    const player = fourth.players.pop()!
    const originalPeak = player.development!.potential
    first.players.push(player)
    delete state.playerModelVersion
    for (const club of [...state.clubs, ...state.libertadores!.invitedClubs]) for (const candidate of club.players) {
      delete candidate.development
      candidate.strength = 15
    }
    const migrated = migratePlayerDevelopment(state)
    expect(migrated.clubs.find((club) => club.id === first.id)!.players.find((candidate) => candidate.id === player.id)!.development!.potential).toBe(originalPeak)
    expect(migrated.clubs.map((club) => club.cash)).toEqual(original.clubs.map((club) => club.cash))
    expect(migrated.clubs.flatMap((club) => club.players.map((candidate) => candidate.contractRounds))).toEqual(state.clubs.flatMap((club) => club.players.map((candidate) => candidate.contractRounds)))
    expect(migratePlayerDevelopment(migrated)).toBe(migrated)
    expect(state.playerModelVersion).toBeUndefined()
    await saveGame('development-migration', 'Migração', state)
    const loaded = (await loadGame('development-migration'))!
    expect(loaded.playerModelVersion).toBe(1)
    expect(loaded.clubs).toEqual(migrated.clubs)
  })
})
