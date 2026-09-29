import type { Division, TacticId } from './types'

export const DEFAULT_TICKET_PRICE = 25

export const TACTICS: ReadonlyArray<{
  id: TacticId
  key: number
  defenders: number
  midfielders: number
  attackers: number
  label: string
}> = [
  { id: '3-4-3', key: 1, defenders: 3, midfielders: 4, attackers: 3, label: '1  3-4-3' },
  { id: '4-3-3', key: 2, defenders: 4, midfielders: 3, attackers: 3, label: '2  4-3-3' },
  { id: '4-4-2', key: 3, defenders: 4, midfielders: 4, attackers: 2, label: '3  4-4-2' },
  { id: '4-5-1', key: 4, defenders: 4, midfielders: 5, attackers: 1, label: '4  4-5-1' },
  { id: '5-2-3', key: 5, defenders: 5, midfielders: 2, attackers: 3, label: '5  5-2-3' },
  { id: '5-3-2', key: 6, defenders: 5, midfielders: 3, attackers: 2, label: '6  5-3-2' },
  { id: '5-4-1', key: 7, defenders: 5, midfielders: 4, attackers: 1, label: '7  5-4-1' },
  { id: '5-5-0', key: 8, defenders: 5, midfielders: 5, attackers: 0, label: '8  5-5-0' },
  { id: '6-3-1', key: 9, defenders: 6, midfielders: 3, attackers: 1, label: '9  6-3-1' },
  { id: '6-4-0', key: 10, defenders: 6, midfielders: 4, attackers: 0, label: '0  6-4-0' },
]

export const CUP_AFTER_ROUNDS = [2, 5, 8, 11, 14] as const
export const CUP_ROUND_NAMES = ['1/16 FINAL', 'OITAVAS', 'QUARTAS', 'SEMIFINAL', 'FINAL'] as const
export const LIBERTADORES_GROUP_AFTER_ROUNDS = [1, 3, 5, 7, 9, 11] as const
export const LIBERTADORES_KNOCKOUT_AFTER_ROUNDS = [12, 13, 14] as const
export const LIBERTADORES_KNOCKOUT_ROUND_NAMES = ['QUARTAS DE FINAL', 'SEMIFINAL', 'FINAL'] as const
export const MAX_FOREIGN_STARTERS = 4
export const MIN_SQUAD_SIZE = 14
export const MAX_SQUAD_SIZE = 24
export const AFFORDABLE_AUCTION_FEE = 40_000
export const MATCHDAY_GATE_SHARE = 0.26
export const CONTRACT_LENGTH_ROUNDS = 14
export const ECONOMY_MODEL_VERSION = 5
export const SAVE_SCHEMA_VERSION = 1



export const DIVISION_PRIZE: Record<Division, number> = {
  1: 2_000_000,
  2: 500_000,
  3: 300_000,
  4: 150_000,
}
export const DIVISION_RUNNER_UP_SHARE = 0.25

export const CUP_ROUND_PRIZES = [50_000, 100_000, 200_000, 400_000, 1_000_000] as const
export const LIBERTADORES_PRIZE = 250_000
export const TOP_SCORER_PRIZE = 200_000
export const BEST_ATTACK_PRIZE = 200_000
export const BEST_DEFENCE_PRIZE = 200_000
