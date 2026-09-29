import { tableForFixtures } from './libertadores'
import { CUP_ROUND_NAMES } from './constants'
import type { Club, Division, Fixture, GameState, LibertadoresGroup, PrizeAward, TableEntry } from './types'

/** Read the money actually paid, including careers saved before prizes had identifiers. */
export function getPrizeAmount(state: GameState, season: number, prize: PrizeAward, clubId?: string): number | undefined {
  const entries = state.ledger.filter((entry) => {
    if (entry.type !== 'prize' || entry.season !== season || (clubId && entry.clubId !== clubId)) return false
    if (entry.prize) {
      if (entry.prize.kind !== prize.kind) return false
      if (prize.kind === 'division' || prize.kind === 'division-runner-up') {
        return (entry.prize.kind === 'division' || entry.prize.kind === 'division-runner-up') && entry.prize.division === prize.division
      }
      if (prize.kind === 'cup') return entry.prize.kind === 'cup' && entry.prize.roundIndex === prize.roundIndex
      return true
    }
    // Legacy descriptions are deliberately isolated from the current prize identifiers.
    switch (prize.kind) {
      case 'division': return entry.description === `Campeão da ${prize.division}ª divisão`
      case 'division-runner-up': return false // Older careers did not pay runners-up.
      case 'cup': return entry.description === `Prêmio da ${CUP_ROUND_NAMES[prize.roundIndex]}`
      case 'libertadores': return entry.description === 'Campeão da Libertadores'
      case 'top-scorer': return entry.description.startsWith('Prêmio de artilheiro: ')
      case 'best-attack': return entry.description === 'Melhor ataque da temporada'
      case 'best-defence': return entry.description === 'Melhor defesa da temporada'
    }
  })
  return entries.length ? entries.reduce((total, entry) => total + entry.amount, 0) : undefined
}

export function getClub(state: GameState, clubId: string): Club {
  const club = state.clubs.find((candidate) => candidate.id === clubId)
  if (!club) throw new Error(`Unknown club ${clubId}`)
  return club
}

export function getManagerClub(state: GameState): Club {
  return getClub(state, state.manager.clubId)
}

export function getCompetitionClub(state: GameState, clubId: string): Club {
  const club = state.clubs.find((candidate) => candidate.id === clubId)
    ?? state.libertadores?.invitedClubs.find((candidate) => candidate.id === clubId)
  if (!club) throw new Error(`Unknown competition club ${clubId}`)
  return club
}

export function getLibertadoresGroupTable(state: GameState, group: LibertadoresGroup): TableEntry[] {
  return tableForFixtures(group.clubIds, group.rounds.flat(), (clubId) => getCompetitionClub(state, clubId).name)
}

function getRoundFixtures(state: GameState, round = state.currentRound): Fixture[] {
  return state.leagues.flatMap((league) => league.rounds[round - 1] ?? [])
}

export function getManagerFixture(state: GameState, round = state.currentRound): Fixture | undefined {
  const active = state.activeCompetition
  const fixtures = active?.competition === 'cup'
    ? state.cup.rounds[active.roundIndex]?.matches ?? []
    : active?.stage === 'group'
      ? state.libertadores?.groups.flatMap((group) => group.rounds[active.roundIndex] ?? []) ?? []
      : active?.competition === 'libertadores'
        ? state.libertadores?.knockoutRounds[active.roundIndex]?.matches ?? []
        : getRoundFixtures(state, round)
  return fixtures.find(
    (fixture) => fixture.homeId === state.manager.clubId || fixture.awayId === state.manager.clubId,
  )
}

export function getTable(state: GameState, division: Division): TableEntry[] {
  const clubs = state.clubs.filter((club) => club.division === division)
  const names = new Map(clubs.map((club) => [club.id, club.name]))
  const table = new Map<string, TableEntry>()
  for (const club of clubs) {
    table.set(club.id, {
      clubId: club.id,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      points: 0,
    })
  }

  const league = state.leagues.find((candidate) => candidate.division === division)
  for (const fixture of league?.rounds.flat() ?? []) {
    if (!fixture.result) continue
    const home = table.get(fixture.homeId)
    const away = table.get(fixture.awayId)
    if (!home || !away) continue
    const { homeGoals, awayGoals } = fixture.result
    home.played += 1
    away.played += 1
    home.goalsFor += homeGoals
    home.goalsAgainst += awayGoals
    away.goalsFor += awayGoals
    away.goalsAgainst += homeGoals
    if (homeGoals > awayGoals) {
      home.wins += 1
      home.points += 3
      away.losses += 1
    } else if (awayGoals > homeGoals) {
      away.wins += 1
      away.points += 3
      home.losses += 1
    } else {
      home.draws += 1
      away.draws += 1
      home.points += 1
      away.points += 1
    }
  }

  for (const entry of table.values()) entry.goalDifference = entry.goalsFor - entry.goalsAgainst
  return [...table.values()].sort((a, b) =>
    b.points - a.points ||
    b.wins - a.wins ||
    b.goalDifference - a.goalDifference ||
    b.goalsFor - a.goalsFor ||
    (names.get(a.clubId) ?? '').localeCompare(names.get(b.clubId) ?? '', 'pt-BR'),
  )
}

export function getClubPosition(state: GameState, clubId: string): number {
  const club = getClub(state, clubId)
  return getTable(state, club.division).findIndex((entry) => entry.clubId === clubId) + 1
}

/** Wait for actual league results before awarding a leader's crowd bonus. */
export function getAttendanceLeaguePosition(state: GameState, club: Club): number | undefined {
  const table = getTable(state, club.division)
  const index = table.findIndex((entry) => entry.clubId === club.id)
  return index >= 0 && table[index].played >= 3 ? index + 1 : undefined
}

export function formatMoney(value: number): string {
  const sign = value < 0 ? '-' : ''
  return `${sign}Cr$ ${Math.abs(Math.round(value)).toLocaleString('pt-BR')}`
}
