import { calculatePlayerValue } from './economy'
import { hashText, random } from './rng'
import type { Club, Division, Player } from './types'

export const PLAYER_MODEL_VERSION = 1
export const DIVISION_PEAK_STRENGTH: Record<Division, number> = { 1: 46, 2: 36, 3: 26, 4: 16 }
const clamp = (value: number): number => Math.max(1, Math.min(50, value))

/** Smooth maturation and accelerating decline; no discontinuity at age 33. */
export function ageStrengthFactor(age: number): number {
  const years = age - 33
  const decline = Math.max(0, years) + Math.log1p(Math.exp(-Math.abs(years)))
  return (1 - 0.32 * Math.exp(-(age - 17) / 3)) * Math.exp(-0.018 * decline ** 2)
}

/** Identity-based peak talent, assigned once, never changed by a transfer or promotion. */
export function initialPotential(clubId: string, rating: number, division: Division, name: string, rank: number): number {
  const ratingBase = { 1: 43, 2: 40, 3: 34, 4: 30 }[division]
  const variation = hashText(`${clubId}:${name}`) % 5 - 2
  return clamp(DIVISION_PEAK_STRENGTH[division] + Math.round((rating - ratingBase) / 3) + Math.max(-3, 2 - rank) + variation)
}

export function createDevelopment(potential: number, age: number): NonNullable<Player['development']> {
  return { potential: clamp(potential), ability: clamp(clamp(potential) * ageStrengthFactor(age)) }
}

function development(player: Player): NonNullable<Player['development']> {
  // Legacy/custom players without provenance keep their current ability on first use.
  return player.development ??= {
    potential: clamp(player.strength / Math.max(0.01, ageStrengthFactor(player.age))), ability: player.strength,
  }
}

function setAbility(player: Player, ability: number): void {
  development(player).ability = clamp(ability)
  player.strength = Math.round(player.development!.ability)
  player.value = calculatePlayerValue(player.strength, player.age)
}

/** The inverse sinh makes the resistance to moving away from talent exponential. */
export function contextualStrength(potential: number, age: number, company: number): number {
  const anchor = potential * ageStrengthFactor(age)
  return clamp(anchor + 3 * Math.asinh(0.3 * (company - anchor) / 3))
}

export function agePlayer(player: Player): void {
  const current = development(player)
  const growth = current.potential * (ageStrengthFactor(player.age + 1) - ageStrengthFactor(player.age))
  player.age += 1
  setAbility(player, current.ability + growth)
}

/** Develop only participants, using a frozen snapshot so array order cannot affect growth. */
export function developAfterMatch(
  rngState: number, home: Club, away: Club,
  homePlayerIds: readonly string[], awayPlayerIds: readonly string[],
): number {
  const participants = [home, away].map((club, index) => {
    const ids = new Set(index === 0 ? homePlayerIds : awayPlayerIds)
    return club.players.filter((player) => ids.has(player.id))
      .map((player) => ({ player, strength: player.strength }))
  })
  const sums = participants.map((team) => team.reduce((sum, entry) => sum + entry.strength, 0))
  for (const { player, strength, team } of participants.flatMap((players, team) => players.map((entry) => ({ ...entry, team })))
    .sort((a, b) => a.player.id.localeCompare(b.player.id))) {
    const teammates = (sums[team] - strength) / Math.max(1, participants[team].length - 1)
    const opponents = sums[1 - team] / Math.max(1, participants[1 - team].length)
    const company = 0.8 * teammates + 0.2 * opponents
    const current = development(player)
    const target = contextualStrength(current.potential, player.age, company)
    const retention = Math.exp(-(2 + 4 * Math.exp(-(player.age - 17) / 4)) / 14)
    const roll = random(rngState)
    rngState = roll.state
    const fluctuation = 0.45 * Math.sqrt(1 - retention ** 2) * Math.sqrt(3) * (2 * roll.value - 1)
    setAbility(player, target + (current.ability - target) * retention + fluctuation)
  }
  return rngState
}
