import { describe, expect, it } from 'vitest'
import { createNewCareer, getAttendanceLeaguePosition, getClub, getTable } from './index'
import { parseGameState } from '../persistence/schema'

describe('three-point league tables', () => {
  it('awards three points for home and away wins and one for a draw, including saved results', () => {
    const state = createNewCareer({ managerName: 'Tabela', seed: 81 })
    const club = getClub(state, state.manager.clubId)
    const fixtures = state.leagues.find((league) => league.division === 4)!.rounds.flat()
    const home = fixtures.find((fixture) => fixture.homeId === club.id)!
    const away = fixtures.find((fixture) => fixture.awayId === club.id)!
    const draw = fixtures.find((fixture) => fixture.id !== home.id && fixture.id !== away.id
      && (fixture.homeId === club.id || fixture.awayId === club.id))!
    expect(getAttendanceLeaguePosition(state, club)).toBeUndefined()
    home.result = { homeGoals: 2, awayGoals: 0, attendance: 10_000, events: [] }
    away.result = { homeGoals: 1, awayGoals: 3, attendance: 10_000, events: [] }
    expect(getAttendanceLeaguePosition(state, club)).toBeUndefined()
    draw.result = { homeGoals: 1, awayGoals: 1, attendance: 10_000, events: [] }
    const saved = parseGameState(JSON.parse(JSON.stringify(state)))
    expect(getTable(saved, 4)[0]).toMatchObject({ clubId: club.id, played: 3, wins: 2, draws: 1, losses: 0, points: 7 })
    expect(getTable(saved, 4).every((entry) => entry.points === entry.wins * 3 + entry.draws)).toBe(true)
    expect(getAttendanceLeaguePosition(saved, club)).toBe(1)
    expect(saved.leagues).toEqual(state.leagues)
    expect(saved.clubs).toEqual(state.clubs)
  })
})
