import { TACTICS } from './constants'
import { effectiveStrength } from './lineup'
import type { Club, Player, Position } from './types'

// Every position helps both phases. A forward's defensive contribution is
// one quarter of a defender's; keepers influence buildup but never finish goals.
const INFLUENCE: Record<Position, { attack: number; defence: number; scoring: number }> = {
  G: { attack: 0.05, defence: 1.2, scoring: 0 },
  D: { attack: 0.2, defence: 0.8, scoring: 0.1 },
  M: { attack: 0.55, defence: 0.45, scoring: 0.35 },
  A: { attack: 0.9, defence: 0.2, scoring: 1 },
}

interface MatchStrength {
  attack: number
  defence: number
  tempo: number
}

export function matchPlayers(club: Club, lineup: readonly string[]): Player[] {
  const ids = new Set(lineup)
  // Canonical order makes a replay independent of roster/lineup display order.
  return club.players.filter((player) => ids.has(player.id))
    .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}

export function matchStrength(club: Club, lineup: readonly string[] = club.lineup): MatchStrength {
  const tactic = TACTICS.find((candidate) => candidate.id === club.tactic)!
  const required = { G: 1, D: tactic.defenders, M: tactic.midfielders, A: tactic.attackers }
  const counts = { G: 0, D: 0, M: 0, A: 0 }
  let attack = 0
  let defence = 0
  for (const player of matchPlayers(club, lineup)) {
    const strength = effectiveStrength(player)
    const influence = INFLUENCE[player.position]
    attack += strength * influence.attack
    defence += strength * influence.defence
    counts[player.position] += 1
  }
  let attackWeight = 0
  let defenceWeight = 0
  let mismatches = 0
  for (const position of ['G', 'D', 'M', 'A'] as const) {
    attackWeight += required[position] * INFLUENCE[position].attack
    defenceWeight += required[position] * INFLUENCE[position].defence
    mismatches += Math.abs(counts[position] - required[position]) / 2
  }
  const coverage = Math.exp(-0.35 * mismatches)
  return {
    // Fixed formation denominators: missing players do not shrink the divisor.
    // A natural XI of equal-strength players has equal quality in every shape.
    attack: Math.max(1e-6, coverage * attack / attackWeight),
    defence: Math.max(1e-6, coverage * defence / defenceWeight),
    tempo: 0.07 * (tactic.attackers - 2) - 0.035 * (tactic.defenders - 4),
  }
}

export function expectedHalfGoals(attacking: MatchStrength, defending: MatchStrength, home: boolean): number {
  // Relative quality keeps the goal scale stable across divisions and seasons.
  // The smooth, strictly increasing contrast has finite limits but no flat cap.
  const contrast = 1.6 * Math.tanh(Math.log(attacking.attack / defending.defence))
  // Attacking shapes open BOTH ends; defensive shapes slow BOTH ends. Neither
  // formation gets a free scoring bonus without also exposing its own goal.
  return 0.7 * Math.exp(contrast + attacking.tempo + defending.tempo + (home ? 0.1 : -0.1))
}

export function goalScoringWeight(player: Player): number {
  // A mild exponent lets an exceptional finisher stand out without assigning
  // every goal to the best player. Fitness and morale affect finishing too.
  return INFLUENCE[player.position].scoring * effectiveStrength(player) ** 1.25
}
