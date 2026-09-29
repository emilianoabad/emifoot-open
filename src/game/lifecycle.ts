import { MAX_SQUAD_SIZE, MIN_SQUAD_SIZE } from './constants'
import { createDevelopment, DIVISION_PEAK_STRENGTH } from './development'
import { calculatePlayerSalary, calculatePlayerValue } from './economy'
import { autoPickLineup } from './lineup'
import { random, randomInt } from './rng'
import type { AcademyPlan, Club, EngineResult, GameState, Player, Position } from './types'

const POSITIONS: readonly Position[] = ['G', 'D', 'M', 'A']
const BALANCED_SQUAD: Record<Position, number> = { G: 2, D: 6, M: 6, A: 4 }
const FIRST_NAMES = ['André', 'Arthur', 'Bruno', 'Caio', 'Carlos', 'Daniel', 'Davi', 'Diego', 'Eduardo', 'Enzo', 'Felipe', 'Gabriel', 'Guilherme', 'Gustavo', 'Henrique', 'Igor', 'João', 'Joaquim', 'José', 'Júlio', 'Kauã', 'Leandro', 'Leonardo', 'Lucas', 'Luiz', 'Marcos', 'Mateus', 'Miguel', 'Murilo', 'Nicolas', 'Otávio', 'Paulo', 'Pedro', 'Rafael', 'Renan', 'Ricardo', 'Rodrigo', 'Samuel', 'Thiago', 'Vinícius', 'Vitor', 'Wesley']
const LAST_NAMES = ['Almeida', 'Alves', 'Andrade', 'Araujo', 'Barbosa', 'Barros', 'Batista', 'Borges', 'Campos', 'Cardoso', 'Carvalho', 'Castro', 'Costa', 'Dias', 'Duarte', 'Ferreira', 'Freitas', 'Gomes', 'Gonçalves', 'Lima', 'Lopes', 'Machado', 'Martins', 'Melo', 'Mendes', 'Moreira', 'Moura', 'Nascimento', 'Nunes', 'Oliveira', 'Pereira', 'Ramos', 'Reis', 'Ribeiro', 'Rocha', 'Rodrigues', 'Santana', 'Santos', 'Silva', 'Soares', 'Souza', 'Teixeira']

/** Annual hazard: 6% at 34, growing 55% per year; everyone retires by 41. */
export function retirementProbability(age: number): number {
  return age <= 33 ? 0 : Math.min(1, 0.06 * 1.55 ** (age - 34))
}

function draw(state: GameState, min: number, max: number): number {
  const result = randomInt(state.rngState, min, max)
  state.rngState = result.state
  return result.value
}

function academyPlayer(state: GameState, club: Club, position: Position, index: number): Player {
  const id = `academy-${state.season}-${club.id}-${index}`
  const name = `${FIRST_NAMES[draw(state, 0, FIRST_NAMES.length - 1)]} ${LAST_NAMES[draw(state, 0, LAST_NAMES.length - 1)]}`
  const age = draw(state, 17, 20)
  // The best prospects must replace a first-team cohort, not steadily dilute it.
  const base = DIVISION_PEAK_STRENGTH[club.division]
  const talent = draw(state, 1, 100) <= 8 ? draw(state, 4, 8) : 0
  const development = createDevelopment(base + draw(state, -4, 3) + talent, age)
  const strength = Math.round(development.ability)
  return {
    id, sourceId: id, name, position, age, nationality: 'BRA', strength, development, fitness: 100, morale: 75,
    salary: calculatePlayerSalary(strength, age), value: calculatePlayerValue(strength, age),
    contractRounds: 14, contractSeasons: 1, goals: 0, appearances: 0, yellowCards: 0,
    suspensionRounds: 0, injuryRounds: 0, injuryProneness: draw(state, 65, 140) / 100, listed: false,
  }
}

export function automaticAcademySelection(plan: AcademyPlan): string[] {
  return POSITIONS.flatMap((position) => plan.candidates.filter((player) => player.position === position)
    .sort((a, b) => b.strength - a.strength || a.age - b.age || a.id.localeCompare(b.id))
    .slice(0, plan.required[position]).map((player) => player.id))
}

export function applyAcademySelection(club: Club, plan: AcademyPlan, playerIds: readonly string[]): void {
  const replaced = new Set([...plan.retired.map((player) => player.id), ...plan.promotedIds])
  const selected = new Set(playerIds)
  club.players = [...club.players.filter((player) => !replaced.has(player.id)),
    ...plan.candidates.filter((player) => selected.has(player.id))]
  plan.promotedIds = [...playerIds]
  Object.assign(club, autoPickLineup(club))
}

/** Build retirement/replacement decisions once, before the new season can begin. */
export function renewSquads(state: GameState, managedClubIds: readonly string[]): void {
  if (state.offseason?.season === state.season) return
  const targetPlayerCount = state.offseason?.targetPlayerCount ?? state.internationalMarket?.targetPlayerCount
    ?? state.clubs.reduce((sum, club) => sum + club.players.length, 0)
  const plans: Record<string, AcademyPlan> = {}
  const survivors = new Map<string, Player[]>()
  const quotas = new Map<string, number>()
  for (const club of state.clubs) {
    const retired = club.players.filter((player) => {
      const probability = retirementProbability(player.age)
      if (!probability) return false
      const decision = random(state.rngState)
      state.rngState = decision.state
      return decision.value < probability
    })
    plans[club.id] = { retired: structuredClone(retired), candidates: [], required: { G: 0, D: 0, M: 0, A: 0 }, promotedIds: [] }
    const retiredIds = new Set(retired.map((player) => player.id))
    const remaining = club.players.filter((player) => !retiredIds.has(player.id))
    survivors.set(club.id, remaining)
    // Protect the minimum squad and goalkeeper position before distributing vacancies.
    quotas.set(club.id, Math.max(0, MIN_SQUAD_SIZE - remaining.length, remaining.some((player) => player.position === 'G') ? 0 : 1))
  }
  let population = state.clubs.reduce((sum, club) => sum + survivors.get(club.id)!.length + quotas.get(club.id)!, 0)
  while (population < targetPlayerCount) {
    const eligible = state.clubs.filter((club) => survivors.get(club.id)!.length + quotas.get(club.id)! < MAX_SQUAD_SIZE)
      .sort((a, b) => survivors.get(a.id)!.length + quotas.get(a.id)! - survivors.get(b.id)!.length - quotas.get(b.id)!
        || Number(quotas.get(b.id)! < plans[b.id].retired.length) - Number(quotas.get(a.id)! < plans[a.id].retired.length)
        || a.id.localeCompare(b.id))
    if (!eligible.length) break
    const club = eligible[0]
    quotas.set(club.id, quotas.get(club.id)! + 1)
    population += 1
  }
  for (const club of state.clubs) {
    const plan = plans[club.id]
    const remaining = survivors.get(club.id)!
    const counts = Object.fromEntries(POSITIONS.map((position) => [position, remaining.filter((player) => player.position === position).length])) as Record<Position, number>
    for (let slot = 0; slot < quotas.get(club.id)!; slot++) {
      const position = [...POSITIONS].sort((a, b) => counts[a] / BALANCED_SQUAD[a] - counts[b] / BALANCED_SQUAD[b])[0]
      counts[position] += 1
      plan.required[position] += 1
    }
    for (const position of POSITIONS) {
      if (!plan.required[position]) continue
      for (let candidate = 0; candidate < plan.required[position] + 2; candidate++) {
        plan.candidates.push(academyPlayer(state, club, position, plan.candidates.length))
      }
    }
    applyAcademySelection(club, plan, automaticAcademySelection(plan))
  }
  state.offseason = {
    season: state.season, targetPlayerCount, plans,
    retirementPendingClubIds: [...new Set(managedClubIds)].filter((id) => plans[id]?.retired.length > 0),
    pendingAcademyClubIds: [...new Set(managedClubIds)].filter((id) => plans[id]?.promotedIds.length > 0),
  }
}

export function beginPreseason(state: GameState): void {
  state.phase = state.offseason?.retirementPendingClubIds.length ? 'retirement-notice'
    : state.offseason?.pendingAcademyClubIds?.length ? 'academy' : 'cup-draw'
}

export function acknowledgeRetirementNotice(original: GameState): EngineResult {
  if (original.phase !== 'retirement-notice' || !original.offseason) return { ok: false, error: 'Não há aposentadorias para anunciar.' }
  const state = structuredClone(original)
  state.offseason!.retirementPendingClubIds = []
  beginPreseason(state)
  state.revision += 1
  return { ok: true, state }
}

export function promoteAcademyPlayers(original: GameState, playerIds: readonly string[]): EngineResult {
  const clubId = original.manager.clubId
  const plan = original.offseason?.plans[clubId]
  if (original.phase !== 'academy' || !plan || !original.offseason?.pendingAcademyClubIds?.includes(clubId)) {
    return { ok: false, error: 'Não há jogadores da base para escolher agora.' }
  }
  const requiredCount = Object.values(plan.required).reduce((sum, count) => sum + count, 0)
  if (playerIds.length !== requiredCount || new Set(playerIds).size !== playerIds.length) {
    return { ok: false, error: `Escolha exatamente ${requiredCount} jogadores da base.` }
  }
  const selected = plan.candidates.filter((player) => playerIds.includes(player.id))
  if (selected.length !== requiredCount || POSITIONS.some((position) => selected.filter((player) => player.position === position).length !== plan.required[position])) {
    return { ok: false, error: 'Preencha as vagas indicadas para cada posição.' }
  }
  const state = structuredClone(original)
  const club = state.clubs.find((candidate) => candidate.id === clubId)!
  applyAcademySelection(club, state.offseason!.plans[clubId], playerIds)
  state.offseason!.pendingAcademyClubIds = state.offseason!.pendingAcademyClubIds!.filter((id) => id !== clubId)
  beginPreseason(state)
  state.revision += 1
  return { ok: true, state }
}
