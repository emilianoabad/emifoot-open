import { MAX_FOREIGN_STARTERS, TACTICS } from './constants'
import type { Club, Player, Position, TacticId } from './types'

function available(player: Player): boolean {
  return player.injuryRounds === 0 && player.suspensionRounds === 0
}

function effectiveStrength(player: Player): number {
  return player.strength * (0.65 + player.fitness / 250) * (0.8 + player.morale / 500)
}

function foreignStarterLimit(club: Club): number {
  // Invited South American clubs do not play under the Brazilian squad rule.
  return club.id.startsWith('conmebol-') ? 11 : MAX_FOREIGN_STARTERS
}

function tacticById(tactic: TacticId) {
  return TACTICS.find((candidate) => candidate.id === tactic) ?? TACTICS[2]
}

export function getAvailableTactics(club: Club): typeof TACTICS {
  const counts: Record<Position, { total: number; domestic: number }> = {
    G: { total: 0, domestic: 0 }, D: { total: 0, domestic: 0 },
    M: { total: 0, domestic: 0 }, A: { total: 0, domestic: 0 },
  }
  for (const player of club.players) {
    if (!available(player)) continue
    counts[player.position].total += 1
    if (player.nationality === 'BRA') counts[player.position].domestic += 1
  }
  const legal = TACTICS.filter((tactic) => {
    const required = { G: 1, D: tactic.defenders, M: tactic.midfielders, A: tactic.attackers }
    let minimumForeigners = 0
    for (const position of ['G', 'D', 'M', 'A'] as const) {
      if (counts[position].total < required[position]) return false
      minimumForeigners += Math.max(0, required[position] - counts[position].domestic)
    }
    return minimumForeigners <= foreignStarterLimit(club)
  })
  // When injuries leave no natural formation, retain the current emergency
  // setup. The existing lineup validation still decides whether it can play.
  return legal.length ? legal : [tacticById(club.tactic)]
}

export function autoPickLineup(club: Club, tacticId: TacticId = club.tactic): { lineup: string[]; bench: string[] } {
  const tactic = tacticById(tacticId)
  const foreignLimit = foreignStarterLimit(club)
  const sorted = [...club.players].sort((a, b) => effectiveStrength(b) - effectiveStrength(a))
  const positions: Position[] = ['G', 'D', 'M', 'A']
  const counts = { G: 1, D: tactic.defenders, M: tactic.midfielders, A: tactic.attackers }
  const candidates = Object.fromEntries(positions.map((position) => [
    position, sorted.filter((player) => player.position === position && available(player)),
  ])) as Record<Position, Player[]>
  // Preserve the existing emergency keeper rule when no healthy keeper exists.
  if (!candidates.G.length) candidates.G = sorted.filter((player) => player.position === 'G')
  let picked = positions.flatMap((position) => candidates[position].slice(0, counts[position]))

  if (picked.length !== 11 || picked.filter((player) => player.nationality !== 'BRA').length > foreignLimit) {
    interface Selection { players: Player[]; strength: number; coverage: number; foreign: number }
    const better = (a: Selection, b: Selection) => a.coverage > b.coverage
      || (a.coverage === b.coverage && a.strength > b.strength)
    let selections: Selection[] = [{ players: [], strength: 0, coverage: 0, foreign: 0 }]
    for (const position of positions) {
      const domestic = candidates[position].filter((player) => player.nationality === 'BRA')
      const foreign = candidates[position].filter((player) => player.nationality !== 'BRA')
      const options: Selection[] = []
      const limit = position === 'G' ? 1 : 10
      for (let brazilians = 0; brazilians <= Math.min(limit, domestic.length); brazilians += 1) {
        for (let foreigners = 0; foreigners <= Math.min(limit - brazilians, foreign.length, foreignLimit); foreigners += 1) {
          const count = brazilians + foreigners
          if (position === 'G' && count !== Math.min(1, candidates.G.length)) continue
          const players = [...domestic.slice(0, brazilians), ...foreign.slice(0, foreigners)]
          options.push({ players, foreign: foreigners, coverage: Math.min(count, counts[position]),
            strength: players.reduce((sum, player) => sum + effectiveStrength(player), 0) })
        }
      }
      // For a given squad size and foreign count, retain the strongest selection
      // with the most natural-position slots filled. Later positions are independent.
      const next = new Map<number, Selection>()
      for (const selection of selections) {
        for (const option of options) {
          const size = selection.players.length + option.players.length
          const foreigners = selection.foreign + option.foreign
          if (size > 11 || foreigners > foreignLimit) continue
          const combined = { players: [...selection.players, ...option.players], foreign: foreigners,
            coverage: selection.coverage + option.coverage, strength: selection.strength + option.strength }
          const key = size * (foreignLimit + 1) + foreigners
          const existing = next.get(key)
          if (!existing || better(combined, existing)) next.set(key, combined)
        }
      }
      selections = [...next.values()]
    }
    const best = selections.reduce<Selection | undefined>((best, selection) => !best
      || selection.players.length > best.players.length
      || (selection.players.length === best.players.length && better(selection, best)) ? selection : best, undefined)
    picked = positions.flatMap((position) => (best?.players ?? [])
      .filter((player) => player.position === position).sort((a, b) => effectiveStrength(b) - effectiveStrength(a)))
    // If no legal eleven exists, retain a complete displayable squad and let
    // validateLineup explain the foreign-player violation before kickoff.
    for (const player of sorted) {
      if (picked.length >= 11) break
      if (available(player) && player.position !== 'G' && !picked.includes(player)) picked.push(player)
    }
  }

  const lineup = picked.slice(0, 11).map((player) => player.id)
  const bench = sorted.filter((player) => available(player) && !lineup.includes(player.id)).slice(0, 7).map((player) => player.id)
  return { lineup, bench }
}

export function validateLineup(club: Club): string | undefined {
  const starters = club.lineup.map((id) => club.players.find((player) => player.id === id)).filter((player): player is Player => Boolean(player))
  if (starters.length !== 11 || new Set(club.lineup).size !== 11) return 'A equipa titular deve ter 11 jogadores.'
  if (!starters.some((player) => player.position === 'G')) return 'A equipa precisa de um goleiro.'
  const replaceableUnavailablePlayer = starters.find((player) => !available(player) && club.players.some((candidate) => (
    available(candidate)
    && !club.lineup.includes(candidate.id)
    && (player.position !== 'G' || candidate.position === 'G')
  )))
  if (replaceableUnavailablePlayer) return 'Há jogador lesionado ou suspenso entre os titulares.'
  if (starters.filter((player) => player.nationality !== 'BRA').length > foreignStarterLimit(club)) return 'Só podem jogar quatro estrangeiros.'
  return undefined
}

export function replaceStarter(club: Club, outId: string, inId: string): Club {
  if (!club.lineup.includes(outId) || club.lineup.includes(inId)) return club
  const incoming = club.players.find((player) => player.id === inId)
  if (!incoming || !available(incoming)) return club
  const lineup = club.lineup.map((id) => (id === outId ? inId : id))
  const bench = [outId, ...club.bench.filter((id) => id !== inId)].slice(0, 7)
  return { ...club, lineup, bench }
}

export function clubLineStrength(club: Club, lineupIds: string[] = club.lineup): number {
  const lineup = lineupIds.map((id) => club.players.find((player) => player.id === id)).filter((player): player is Player => Boolean(player))
  const tactic = tacticById(club.tactic)
  const counts: Record<Position, number> = { G: 0, D: 0, M: 0, A: 0 }
  let total = 0
  for (const player of lineup) {
    counts[player.position] += 1
    total += effectiveStrength(player)
  }
  const positionalPenalty = Math.abs(counts.D - tactic.defenders) * 0.8 + Math.abs(counts.M - tactic.midfielders) * 0.6 + Math.abs(counts.A - tactic.attackers) * 0.7
  return Math.max(1, total / Math.max(1, lineup.length) - positionalPenalty)
}
