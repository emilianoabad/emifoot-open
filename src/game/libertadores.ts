import { RAW_LIBERTADORES_ROSTERS } from '../data/libertadores-rosters.generated'
import { CONTRACT_LENGTH_ROUNDS } from './constants'
import { createDevelopment } from './development'
import { calculatePlayerSalary, calculatePlayerValue } from './economy'
import { autoPickLineup } from './lineup'
import { hashText, shuffle } from './rng'
import type { Club, CupRound, Fixture, LibertadoresGroup, LibertadoresState, Player, Position, TableEntry } from './types'

const INVITED_CLUBS = [
  { id: 'conmebol-river-plate', name: 'River Plate', shortName: 'RIVER', city: 'Buenos Aires', state: 'ARG', nationality: 'ARG', rating: 48, primary: '#ffffff', secondary: '#c8102e', stadium: 'Monumental' },
  { id: 'conmebol-boca-juniors', name: 'Boca Juniors', shortName: 'BOCA', city: 'Buenos Aires', state: 'ARG', nationality: 'ARG', rating: 47, primary: '#003b7a', secondary: '#f6c600', stadium: 'La Bombonera' },
  { id: 'conmebol-racing', name: 'Racing Club', shortName: 'RACING', city: 'Avellaneda', state: 'ARG', nationality: 'ARG', rating: 44, primary: '#75bde0', secondary: '#ffffff', stadium: 'El Cilindro' },
  { id: 'conmebol-independiente', name: 'Independiente', shortName: 'INDEP.', city: 'Avellaneda', state: 'ARG', nationality: 'ARG', rating: 43, primary: '#d71920', secondary: '#ffffff', stadium: 'Libertadores de América' },
  { id: 'conmebol-nacional', name: 'Nacional', shortName: 'NACIONAL', city: 'Montevidéu', state: 'URU', nationality: 'URU', rating: 44, primary: '#ffffff', secondary: '#174c9c', stadium: 'Gran Parque Central' },
  { id: 'conmebol-penarol', name: 'Peñarol', shortName: 'PEÑAROL', city: 'Montevidéu', state: 'URU', nationality: 'URU', rating: 44, primary: '#f5c400', secondary: '#111111', stadium: 'Campeón del Siglo' },
  { id: 'conmebol-olimpia', name: 'Olimpia', shortName: 'OLIMPIA', city: 'Assunção', state: 'PAR', nationality: 'PAR', rating: 42, primary: '#ffffff', secondary: '#111111', stadium: 'Manuel Ferreira' },
  { id: 'conmebol-cerro-porteno', name: 'Cerro Porteño', shortName: 'CERRO', city: 'Assunção', state: 'PAR', nationality: 'PAR', rating: 42, primary: '#c8202f', secondary: '#173f8a', stadium: 'La Nueva Olla' },
  { id: 'conmebol-ldu-quito', name: 'LDU Quito', shortName: 'LDU', city: 'Quito', state: 'ECU', nationality: 'ECU', rating: 43, primary: '#ffffff', secondary: '#d71920', stadium: 'Rodrigo Paz Delgado' },
  { id: 'conmebol-barcelona-sc', name: 'Barcelona SC', shortName: 'BARCELONA', city: 'Guayaquil', state: 'ECU', nationality: 'ECU', rating: 41, primary: '#f7d117', secondary: '#111111', stadium: 'Monumental Banco Pichincha' },
  { id: 'conmebol-atletico-nacional', name: 'Atlético Nacional', shortName: 'A. NACIONAL', city: 'Medellín', state: 'COL', nationality: 'COL', rating: 43, primary: '#138a45', secondary: '#ffffff', stadium: 'Atanasio Girardot' },
  { id: 'conmebol-colo-colo', name: 'Colo-Colo', shortName: 'COLO-COLO', city: 'Santiago', state: 'CHI', nationality: 'CHI', rating: 42, primary: '#ffffff', secondary: '#111111', stadium: 'Monumental David Arellano' },
] as const

function makePlayer(
  clubId: string,
  rating: number,
  raw: (typeof RAW_LIBERTADORES_ROSTERS)[number]['players'][number],
  roleRank: number,
): Player {
  const hash = hashText(`${clubId}:${raw.sourceId}`)
  const position = raw.position as Position
  const age = raw.age
  const development = createDevelopment(rating - roleRank + (hash % 5), age)
  const strength = Math.round(development.ability)
  return {
    id: `${clubId}:${raw.sourceId}`,
    sourceId: raw.sourceId,
    name: raw.name,
    position,
    age,
    nationality: raw.nationality,
    strength,
    development,
    fitness: 100,
    morale: 75,
    salary: calculatePlayerSalary(strength, age),
    value: calculatePlayerValue(strength, age),
    contractRounds: CONTRACT_LENGTH_ROUNDS,
    contractSeasons: 1,
    goals: 0,
    appearances: 0,
    yellowCards: 0,
    suspensionRounds: 0,
    injuryRounds: 0,
    injuryProneness: 0.65 + (hashText(`${raw.sourceId}:injury`) % 101) / 100,
    listed: false,
  }
}

function makeInvitedClub(definition: (typeof INVITED_CLUBS)[number]): Club {
  const roster = RAW_LIBERTADORES_ROSTERS.find((candidate) => candidate.id === definition.id)
  if (!roster) throw new Error(`Elenco da Libertadores não encontrado: ${definition.name}`)
  const ranks: Record<Position, number> = { G: 0, D: 0, M: 0, A: 0 }
  const players = roster.players.map((raw) => {
    const position = raw.position as Position
    const player = makePlayer(definition.id, definition.rating, raw, ranks[position])
    ranks[position] += 1
    return player
  })
  const club: Club = {
    id: definition.id,
    name: definition.name,
    shortName: definition.shortName,
    city: definition.city,
    state: definition.state,
    division: 1,
    rating: definition.rating,
    primary: definition.primary,
    secondary: definition.secondary,
    source: roster.source,
    players,
    lineup: [],
    bench: [],
    tactic: '4-4-2',
    cash: 8_000_000,
    supporters: 70_000,
    ticketPrice: 20,
    sponsorPerRound: 0,
    stadium: { name: definition.stadium, capacity: 45_000, condition: 95, expansionSeats: 0, expansionRounds: 0 },
    form: [],
  }
  return { ...club, ...autoPickLineup(club) }
}

function createGroupSchedule(groupIndex: number, clubIds: string[]): Fixture[][] {
  const pairings = [
    [[0, 3], [1, 2]],
    [[3, 2], [0, 1]],
    [[1, 3], [2, 0]],
  ] as const
  const firstLeg = pairings.map((round, roundIndex) => round.map(([home, away], matchIndex) => ({
    id: `lib-grupo-${groupIndex + 1}-${roundIndex + 1}-${matchIndex + 1}`,
    competition: 'libertadores' as const,
    round: roundIndex + 1,
    homeId: clubIds[home],
    awayId: clubIds[away],
  })))
  const secondLeg = firstLeg.map((fixtures, legIndex) => fixtures.map((fixture, matchIndex) => ({
    ...fixture,
    id: `lib-grupo-${groupIndex + 1}-${legIndex + 4}-${matchIndex + 1}`,
    round: legIndex + 4,
    homeId: fixture.awayId,
    awayId: fixture.homeId,
  })))
  return [...firstLeg, ...secondLeg]
}

export function createLibertadores(state: number, season: number, brazilianClubIds: string[]): { libertadores: LibertadoresState; rngState: number } {
  if (brazilianClubIds.length !== 4) throw new Error('A Libertadores requer quatro clubes brasileiros.')
  const invitedClubs = INVITED_CLUBS.map(makeInvitedClub)
  const shuffled = shuffle(state, invitedClubs.map((club) => club.id))
  const groups: LibertadoresGroup[] = brazilianClubIds.map((clubId, groupIndex) => {
    const clubIds = [clubId, ...shuffled.value.slice(groupIndex * 3, groupIndex * 3 + 3)]
    return { name: `GRUPO ${String.fromCharCode(65 + groupIndex)}`, clubIds, rounds: createGroupSchedule(groupIndex, clubIds) }
  })
  return {
    libertadores: {
      season,
      brazilianClubIds: [...brazilianClubIds],
      invitedClubs,
      groups,
      groupRoundIndex: 0,
      knockoutRounds: [],
      nextKnockoutRoundIndex: 0,
    },
    rngState: shuffled.state,
  }
}

export function tableForFixtures(clubIds: string[], fixtures: Fixture[], clubName: (clubId: string) => string): TableEntry[] {
  const table = new Map<string, TableEntry>(clubIds.map((clubId) => [clubId, {
    clubId, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0,
  }]))
  for (const fixture of fixtures) {
    if (!fixture.result) continue
    const home = table.get(fixture.homeId)
    const away = table.get(fixture.awayId)
    if (!home || !away) continue
    const { homeGoals, awayGoals } = fixture.result
    home.played += 1; away.played += 1
    home.goalsFor += homeGoals; home.goalsAgainst += awayGoals
    away.goalsFor += awayGoals; away.goalsAgainst += homeGoals
    if (homeGoals > awayGoals) { home.wins += 1; home.points += 3; away.losses += 1 }
    else if (awayGoals > homeGoals) { away.wins += 1; away.points += 3; home.losses += 1 }
    else { home.draws += 1; away.draws += 1; home.points += 1; away.points += 1 }
  }
  for (const entry of table.values()) entry.goalDifference = entry.goalsFor - entry.goalsAgainst
  return [...table.values()].sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor || clubName(a.clubId).localeCompare(clubName(b.clubId), 'pt-BR'))
}

export function buildLibertadoresQuarterfinals(libertadores: LibertadoresState, clubName: (clubId: string) => string): LibertadoresState {
  const qualified = libertadores.groups.map((group) => tableForFixtures(group.clubIds, group.rounds.flat(), clubName).slice(0, 2))
  const pairings = [[qualified[0][0], qualified[1][1]], [qualified[1][0], qualified[0][1]], [qualified[2][0], qualified[3][1]], [qualified[3][0], qualified[2][1]]]
  const matches = pairings.map(([home, away], index): Fixture => ({
    id: `lib-mata-1-${index + 1}`, competition: 'libertadores', round: 1, homeId: home.clubId, awayId: away.clubId,
  }))
  return { ...libertadores, groupRoundIndex: 6, knockoutRounds: [{ name: 'QUARTAS DE FINAL', matches }], nextKnockoutRoundIndex: 0 }
}

export function buildNextLibertadoresRound(libertadores: LibertadoresState, winnerIds: string[]): LibertadoresState {
  const nextIndex = libertadores.nextKnockoutRoundIndex + 1
  if (winnerIds.length === 1) return { ...libertadores, nextKnockoutRoundIndex: nextIndex, championId: winnerIds[0] }
  const names = ['QUARTAS DE FINAL', 'SEMIFINAL', 'FINAL']
  const matches: Fixture[] = []
  for (let index = 0; index < winnerIds.length; index += 2) {
    matches.push({
      id: `lib-mata-${nextIndex + 1}-${index / 2 + 1}`,
      competition: 'libertadores',
      round: nextIndex + 1,
      homeId: winnerIds[index],
      awayId: winnerIds[index + 1],
    })
  }
  const round: CupRound = { name: names[nextIndex], matches }
  return { ...libertadores, nextKnockoutRoundIndex: nextIndex, knockoutRounds: [...libertadores.knockoutRounds, round] }
}
