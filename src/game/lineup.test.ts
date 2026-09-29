import { describe, expect, it } from 'vitest'
import { TACTICS } from './constants'
import { autoPickLineup, getAvailableTactics, validateLineup } from './lineup'
import { createNewCareer } from './setup'
import { chooseTacticAndStart, setTactic } from './engine'
import { getManagerClub } from './selectors'
import type { Club, Player, Position } from './types'

const initial = createNewCareer({ managerName: 'Lineup', seed: 7 })
const template = initial.clubs[0]
function player(id: string, position: Position, strength: number, extra: Partial<Player> = {}): Player {
  return { ...template.players[0], id, name: id, position, strength, fitness: 100, morale: 75,
    nationality: 'BRA', injuryRounds: 0, suspensionRounds: 0, ...extra }
}
function club(players: Player[]): Club { return { ...template, players, tactic: '4-4-2', lineup: [], bench: [] } }
function strength(players: Player[]) {
  return players.reduce((sum, p) => sum + p.strength * (0.65 + p.fitness / 250) * (0.8 + p.morale / 500), 0)
}

describe('available formations', () => {
  function squad() {
    return club([
      player('G', 'G', 20),
      ...Array.from({ length: 6 }, (_, i) => player(`D${i}`, 'D', 20)),
      ...Array.from({ length: 5 }, (_, i) => player(`M${i}`, 'M', 20)),
      ...Array.from({ length: 3 }, (_, i) => player(`A${i}`, 'A', 20)),
    ])
  }

  it('offers only formations covered by healthy, non-suspended players in their own positions', () => {
    const team = squad()
    expect(getAvailableTactics(team)).toHaveLength(TACTICS.length)
    team.players.find((p) => p.id === 'A2')!.injuryRounds = 1
    team.players.find((p) => p.id === 'M4')!.suspensionRounds = 1
    expect(getAvailableTactics(team).map((tactic) => tactic.id)).toEqual(['4-4-2', '5-3-2', '5-4-1', '6-3-1', '6-4-0'])
    const state = structuredClone(initial)
    state.phase = 'pre-round'
    Object.assign(getManagerClub(state), { players: team.players })
    expect(setTactic(state, '4-3-3')).toEqual({ ok: false, error: 'Não há jogadores disponíveis para esta tática.' })
    expect(chooseTacticAndStart(state, '4-3-3').ok).toBe(false)
    expect(setTactic(state, '4-4-2').ok).toBe(true)
    expect(state.phase).toBe('pre-round')
  })

  it('counts compulsory foreign places across all positions and exempts invited clubs', () => {
    const team = squad()
    team.players.forEach((p) => {
      if (['G', 'D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'A0', 'A1', 'A2'].includes(p.id)) p.nationality = 'ARG'
    })
    // Every formation needs at least six foreign starters, despite full positional coverage.
    expect(getAvailableTactics(team).map((tactic) => tactic.id)).toEqual([team.tactic])
    expect(getAvailableTactics({ ...team, id: 'conmebol-test' })).toHaveLength(TACTICS.length)
    team.players.find((p) => p.id === 'G')!.nationality = 'BRA'
    team.players.find((p) => p.id === 'D0')!.nationality = 'BRA'
    team.players.find((p) => p.id === 'D1')!.nationality = 'BRA'
    const choices = getAvailableTactics(team).map((tactic) => tactic.id)
    expect(choices).toContain('4-4-2')
    expect(choices).not.toContain('4-3-3')
    for (const tactic of getAvailableTactics(team)) {
      expect(validateLineup({ ...team, ...autoPickLineup(team, tactic.id) })).toBeUndefined()
    }
  })

  it('retains only the current emergency setup when no natural formation is possible', () => {
    const team = squad()
    team.players = team.players.filter((p) => p.position !== 'D' || ['D0', 'D1'].includes(p.id))
    expect(getAvailableTactics(team).map((tactic) => tactic.id)).toEqual(['4-4-2'])
    const state = structuredClone(initial)
    state.phase = 'pre-round'
    Object.assign(getManagerClub(state), { players: team.players, tactic: team.tactic })
    expect(chooseTacticAndStart(state, '4-4-2').ok).toBe(true)
    expect(setTactic(state, '3-4-3').ok).toBe(false)
  })
})

describe('automatic starting eleven', () => {
  it('keeps full elevens for international opponents and saves when a domestic roster cannot satisfy the foreign limit', () => {
    for (const invited of initial.libertadores!.invitedClubs) {
      expect(invited.lineup).toHaveLength(11)
      expect(validateLineup(invited)).toBeUndefined()
    }
    const team = club(template.players.map((p) => ({ ...p, nationality: 'ARG' })))
    const selection = autoPickLineup(team)
    expect(selection.lineup).toHaveLength(11)
    expect(validateLineup({ ...team, ...selection })).toContain('quatro estrangeiros')
  })
  it('ranks each position by match strength, including fitness and morale, and excludes unavailable players', () => {
    const team = club([
      player('keeper', 'G', 20), player('reserve keeper', 'G', 10),
      ...Array.from({ length: 4 }, (_, i) => player(`D${i}`, 'D', 20)),
      ...Array.from({ length: 4 }, (_, i) => player(`M${i}`, 'M', 20)),
      player('fit', 'A', 20), player('fresh', 'A', 19), player('tired', 'A', 25, { fitness: 0, morale: 0 }),
      player('injured', 'A', 50, { injuryRounds: 1 }), player('suspended', 'A', 50, { suspensionRounds: 1 }),
    ])
    const selection = autoPickLineup(team)
    expect(selection.lineup).toContain('fit')
    expect(selection.lineup).toContain('fresh')
    expect(selection.lineup).not.toContain('tired')
    expect(selection.lineup).not.toContain('injured')
    expect(selection.bench).not.toContain('suspended')
    expect(validateLineup({ ...team, ...selection })).toBeUndefined()
  })

  it('allocates foreign places across the whole team without replacing attackers with defenders', () => {
    const team = club([
      player('G', 'G', 20),
      ...Array.from({ length: 4 }, (_, i) => player(`foreign D${i}`, 'D', 40 - i, { nationality: 'ARG' })),
      ...Array.from({ length: 4 }, (_, i) => player(`domestic D${i}`, 'D', 35 - i)),
      ...Array.from({ length: 4 }, (_, i) => player(`M${i}`, 'M', 20)),
      player('foreign A1', 'A', 50, { nationality: 'URU' }), player('foreign A2', 'A', 49, { nationality: 'URU' }),
      player('domestic A1', 'A', 1), player('domestic A2', 'A', 1),
    ])
    const selection = autoPickLineup(team)
    const starters = team.players.filter((p) => selection.lineup.includes(p.id))
    expect(starters.filter((p) => p.position === 'D')).toHaveLength(4)
    expect(starters.filter((p) => p.position === 'A')).toHaveLength(2)
    expect(starters.filter((p) => p.nationality !== 'BRA')).toHaveLength(4)
    expect(selection.lineup).toEqual(expect.arrayContaining(['foreign A1', 'foreign A2']))
    expect(validateLineup({ ...team, ...selection })).toBeUndefined()
  })

  it('fills a missing position with an outfield player, never a second goalkeeper', () => {
    const team = club([
      player('G1', 'G', 50), player('G2', 'G', 49),
      ...Array.from({ length: 3 }, (_, i) => player(`D${i}`, 'D', 20)),
      ...Array.from({ length: 5 }, (_, i) => player(`M${i}`, 'M', 20)),
      ...Array.from({ length: 3 }, (_, i) => player(`A${i}`, 'A', 10)),
    ])
    const selection = autoPickLineup(team)
    expect(selection.lineup).toHaveLength(11)
    expect(selection.lineup).not.toContain('G2')
    expect(selection.bench).toContain('G2')
    expect(selection.lineup).toContain('M4')
  })

  it.each(TACTICS)('finds the strongest legal $id selection, checked against every possible eleven', (tactic) => {
    const positions: Position[] = ['G', 'G', ...Array<Position>(6).fill('D'), ...Array<Position>(5).fill('M'), ...Array<Position>(3).fill('A')]
    const team = club(positions.map((position, i) => player(String(i), position, 12 + (i * 7) % 30,
      { nationality: i % 3 === 0 ? 'ARG' : 'BRA', fitness: 60 + (i * 11) % 41, morale: 40 + (i * 13) % 61 })))
    const selection = autoPickLineup(team, tactic.id)
    let best = -Infinity
    function enumerate(index: number, picked: Player[]) {
      if (picked.length === 11) {
        if (picked.filter((p) => p.position === 'G').length !== 1
          || picked.filter((p) => p.position === 'D').length !== tactic.defenders
          || picked.filter((p) => p.position === 'M').length !== tactic.midfielders
          || picked.filter((p) => p.position === 'A').length !== tactic.attackers
          || picked.filter((p) => p.nationality !== 'BRA').length > 4) return
        best = Math.max(best, strength(picked))
        return
      }
      for (let i = index; i <= team.players.length - (11 - picked.length); i += 1) enumerate(i + 1, [...picked, team.players[i]])
    }
    enumerate(0, [])
    expect(Number.isFinite(best)).toBe(true)
    expect(strength(team.players.filter((p) => selection.lineup.includes(p.id)))).toBeCloseTo(best, 8)
    expect(validateLineup({ ...team, ...selection })).toBeUndefined()
    expect(selection.bench.some((id) => selection.lineup.includes(id))).toBe(false)
  })

  it('uses exactly the previewed eleven when a formation starts a match', () => {
    const state = structuredClone(initial)
    state.phase = 'pre-round'
    const preview = autoPickLineup(getManagerClub(state), '3-4-3')
    const changed = setTactic(state, '3-4-3')
    const started = chooseTacticAndStart(state, '3-4-3')
    expect(changed.ok && getManagerClub(changed.state).lineup).toEqual(preview.lineup)
    expect(started.ok && getManagerClub(started.state).lineup).toEqual(preview.lineup)
  })
})
