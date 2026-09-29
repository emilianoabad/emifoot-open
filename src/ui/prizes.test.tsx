import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { advanceAfterCompetitionResults, createNewCareer, type GameState } from '../game'
import { fastForwardSeason } from '../test/simulation'
import { CompetitionResultsScreen } from './CompetitionResultsScreen'
import { SeasonAwardsPanel } from './SeasonAwardsPanel'

afterEach(cleanup)

describe('visible prize money', () => {
  let season: GameState
  beforeAll(() => {
    const result = fastForwardSeason(createNewCareer({ managerName: 'Prêmios', seed: 77 }))
    if (!result.ok) throw new Error(result.error)
    season = result.state
  })

  it('shows all thirteen season awards with the recorded payment next to the recipient', () => {
    const { container } = render(<SeasonAwardsPanel state={season} />)
    expect(container.querySelectorAll('.award-row')).toHaveLength(13)
    expect(Array.from(container.querySelectorAll('.award-amount'), (element) => element.textContent)).toEqual([
      'Cr$ 2.000.000', 'Cr$ 500.000', 'Cr$ 500.000', 'Cr$ 125.000',
      'Cr$ 300.000', 'Cr$ 75.000', 'Cr$ 150.000', 'Cr$ 37.500',
      'Cr$ 1.000.000', 'Cr$ 250.000', 'Cr$ 200.000', 'Cr$ 200.000', 'Cr$ 200.000',
    ])
  })

  it('keeps older season summaries readable without inventing runner-up awards', () => {
    const legacy = structuredClone(season)
    delete legacy.awards[0].runnersUp
    const { container } = render(<SeasonAwardsPanel state={legacy} />)
    expect(container.querySelectorAll('.award-row')).toHaveLength(9)
    expect(screen.queryByText('2º')).not.toBeInTheDocument()
  })

  it.each([true, false])('shows the personalized final payout (champion: %s) and keeps the continue control', async (champion) => {
    const state = structuredClone(season)
    const fixture = state.cup.rounds[4].matches[0]
    const runnerUp = fixture.homeId === state.cup.championId ? fixture.awayId : fixture.homeId
    state.manager.clubId = champion ? state.cup.championId! : runnerUp
    state.activeCompetition = { competition: 'cup', stage: 'knockout', roundIndex: 4, title: 'COPA DO BRASIL', roundName: 'FINAL' }
    state.lastReport!.cupResults = [fixture]
    const command = vi.fn()
    render(<CompetitionResultsScreen state={state} command={command} />)
    expect(screen.getByText(/PRÊMIO RECEBIDO/)).toHaveTextContent(champion ? 'Cr$ 1.000.000' : 'Cr$ 500.000')
    await userEvent.setup().keyboard('{Enter}')
    expect(command).toHaveBeenCalledExactlyOnceWith(advanceAfterCompetitionResults)
  })

  it('does not show a new payout to a manager already eliminated before the round', () => {
    const state = structuredClone(season)
    const final = state.cup.rounds[4].matches[0]
    state.manager.clubId = state.clubs.find((club) => club.id !== final.homeId && club.id !== final.awayId)!.id
    state.activeCompetition = { competition: 'cup', stage: 'knockout', roundIndex: 4, title: 'COPA DO BRASIL', roundName: 'FINAL' }
    state.lastReport!.cupResults = [final]
    render(<CompetitionResultsScreen state={state} command={vi.fn()} />)
    expect(screen.queryByText(/PRÊMIO RECEBIDO/)).not.toBeInTheDocument()
  })
})
