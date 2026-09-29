import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, within } from '@testing-library/react'
import { createNewCareer, getManagerFixture, type Fixture, type GameState } from '../game'
import { SquadScreen } from './screens'

afterEach(cleanup)

function win(fixture: Fixture, clubId: string) {
  fixture.result = { homeGoals: fixture.homeId === clubId ? 2 : 0, awayGoals: fixture.awayId === clubId ? 2 : 0, attendance: 10_000, events: [] }
}

function makeLeagueLeader(state: GameState, clubId: string) {
  const fixture = state.leagues.flatMap((league) => league.rounds[0]).find((match) => match.homeId === clubId || match.awayId === clubId)!
  win(fixture, clubId)
}

function renderPanels(state: GameState) {
  const result = render(<SquadScreen state={state} command={vi.fn()} />)
  return {
    ...result,
    club: within(result.container.querySelector<HTMLElement>('.original-club-panel')!),
    opponent: within(result.container.querySelector<HTMLElement>('.original-next-match')!),
  }
}

describe('club and next-opponent summaries', () => {
  it.each([true, false])('shows the opponent’s standings independently of the manager’s (home: %s)', (atHome) => {
    const state = createNewCareer({ managerName: 'Painel', seed: 77 })
    state.currentRound = 2
    const match = state.leagues.find((league) => league.division === 4)!.rounds[1][0]
    state.manager.clubId = atHome ? match.homeId : match.awayId
    makeLeagueLeader(state, atHome ? match.awayId : match.homeId)
    const { club, opponent } = renderPanels(state)
    expect(club.getByText('4ª divisão')).toBeInTheDocument()
    expect(club.getByText(/º lugar/)).toHaveTextContent(/0 pontos$/)
    expect(opponent.getByText('1º lugar 3 pontos')).toBeInTheDocument()
    expect(opponent.getByText(atHome ? 'CASA' : 'FORA')).toBeInTheDocument()
  })

  it('reads a cup opponent’s own division and updates the manager’s division when clubs change', () => {
    const state = createNewCareer({ managerName: 'Painel', seed: 77 })
    const opponentId = state.clubs.find((club) => club.division === 1)!.id
    state.activeCompetition = { competition: 'cup', stage: 'knockout', roundIndex: 0, title: 'COPA DO BRASIL', roundName: 'PRIMEIRA FASE' }
    state.cup.rounds[0].matches[0] = { id: 'cup-summary', competition: 'cup', round: 1, homeId: state.manager.clubId, awayId: opponentId }
    makeLeagueLeader(state, opponentId)
    const { club, opponent, rerender } = renderPanels(state)
    expect(club.getByText('4ª divisão')).toBeInTheDocument()
    expect(opponent.getByText('1º lugar 3 pontos')).toBeInTheDocument()
    const changedClub = { ...state, manager: { ...state.manager, clubId: opponentId } }
    rerender(<SquadScreen state={changedClub} command={vi.fn()} />)
    expect(club.getByText('1ª divisão')).toBeInTheDocument()
    expect(club.queryByText('4ª divisão')).not.toBeInTheDocument()
    expect(opponent.getByText(/º lugar/)).toHaveTextContent(/0 pontos$/)
  })

  it('uses group standings for foreign Libertadores opponents', () => {
    const state = createNewCareer({ managerName: 'Painel', seed: 77 })
    const group = state.libertadores!.groups[0]
    state.manager.clubId = group.clubIds[0]
    state.activeCompetition = { competition: 'libertadores', stage: 'group', roundIndex: 1, title: 'LIBERTADORES', roundName: '2ª JORNADA DOS GRUPOS' }
    const match = getManagerFixture(state)!
    const opponentId = match.homeId === state.manager.clubId ? match.awayId : match.homeId
    win(group.rounds[0].find((fixture) => fixture.homeId === opponentId || fixture.awayId === opponentId)!, opponentId)
    const { opponent } = renderPanels(state)
    expect(opponent.getByText('1º lugar 3 pontos')).toBeInTheDocument()
  })

  it('omits standings that are unavailable for a foreign knockout opponent', () => {
    const state = createNewCareer({ managerName: 'Painel', seed: 77 })
    const foreign = state.libertadores!.invitedClubs[0]
    state.activeCompetition = { competition: 'libertadores', stage: 'knockout', roundIndex: 0, title: 'LIBERTADORES', roundName: 'QUARTAS DE FINAL' }
    state.libertadores!.knockoutRounds = [{ name: 'QUARTAS DE FINAL', matches: [{ id: 'lib-summary', competition: 'libertadores', round: 1, homeId: state.manager.clubId, awayId: foreign.id }] }]
    const { opponent } = renderPanels(state)
    expect(opponent.getByText(foreign.name.toUpperCase())).toBeInTheDocument()
    expect(opponent.queryByText(/lugar|pontos/)).not.toBeInTheDocument()
  })

  it('does not show standings or an away label when there is no next fixture', () => {
    const state = createNewCareer({ managerName: 'Painel', seed: 77 })
    state.leagues.forEach((league) => { league.rounds[0] = [] })
    const { opponent } = renderPanels(state)
    expect(opponent.getByText('FIM DA TEMPORADA')).toBeInTheDocument()
    expect(opponent.queryByText(/lugar|pontos|CASA|FORA/)).not.toBeInTheDocument()
  })
})
