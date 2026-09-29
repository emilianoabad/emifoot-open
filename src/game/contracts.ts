import { CONTRACT_LENGTH_ROUNDS } from './constants'
import type { Player } from './types'

export type ContractMarker = '*' | '.' | ''

function contractRounds(player: Player): number {
  return Math.max(0, Math.min(CONTRACT_LENGTH_ROUNDS, player.contractRounds))
}

export function contractMarker(player: Player): ContractMarker {
  const rounds = contractRounds(player)
  if (rounds >= 2) return '*'
  return rounds === 1 ? '.' : ''
}

export function isSaleProtected(player: Player): boolean {
  return contractRounds(player) >= 2
}

export function canPlayerDemandRaise(player: Player): boolean {
  return contractRounds(player) === 0
}

export function setPlayerContract(player: Player, rounds = CONTRACT_LENGTH_ROUNDS): void {
  player.contractRounds = Math.max(0, Math.min(CONTRACT_LENGTH_ROUNDS, Math.round(rounds)))
  player.contractSeasons = player.contractRounds > 0 ? 1 : 0
  if (player.contractRounds > 0) player.listed = false
}

export function tickPlayerContract(player: Player): void {
  if (player.contractRounds > 0) setPlayerContract(player, player.contractRounds - 1)
}
