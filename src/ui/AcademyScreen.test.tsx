import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createNewCareer, getManagerClub, type GameState, type Position } from '../game'
import { AcademyScreen } from './AcademyScreen'

afterEach(cleanup)

function academyState(): GameState {
  const state = createNewCareer({ managerName: 'Base', seed: 7 })
  const club = getManagerClub(state)
  const candidates = (['D', 'A'] as Position[]).flatMap((position) => Array.from({ length: 3 }, (_, i) => ({
    ...club.players[0], id: `base-${position}-${i}`, name: `Base ${position}${i + 1}`, position, age: 17 + i, salary: 300 + i * 100, strength: 8 + i,
  })))
  club.players = [...club.players.slice(0, -2), candidates[0], candidates[3]]
  state.season += 1
  state.phase = 'academy'
  state.offseason = { season: state.season, targetPlayerCount: 640, retirementPendingClubIds: [], pendingAcademyClubIds: [club.id],
    plans: { [club.id]: { retired: [], candidates, required: { G: 0, D: 1, M: 0, A: 1 }, promotedIds: [candidates[0].id, candidates[3].id] } } }
  return state
}

describe('academy selection', () => {
  it('requires the fixed number in each position and allows choices to be changed', async () => {
    const state = academyState()
    const command = vi.fn()
    render(<AcademyScreen state={state} command={command} />)
    expect(screen.getByRole('heading', { name: 'PROMOÇÃO DA BASE · 2027' })).toBeVisible()
    expect(screen.getByText(getManagerClub(state).name)).toBeVisible()
    expect(screen.getByText('ESCOLHA 2 JOGADORES')).toBeVisible()
    expect(screen.getByLabelText('Vagas por posição')).toHaveTextContent('D 0/1')
    const confirm = screen.getByRole('button', { name: /PROMOVER/ })
    const defender1 = screen.getByRole('button', { name: /Base D1,/ })
    const defender2 = screen.getByRole('button', { name: /Base D2,/ })
    const attacker = screen.getByRole('button', { name: /Base A3,/ })
    expect(defender1).toHaveTextContent('Cr$ 300')
    expect(confirm).toBeDisabled()
    fireEvent.keyDown(document.body, { key: 'Enter' })
    expect(command).not.toHaveBeenCalled()
    const user = userEvent.setup()
    await user.click(defender1)
    expect(defender1).toHaveAttribute('aria-pressed', 'true')
    expect(defender2).toBeDisabled()
    expect(screen.getByLabelText('Vagas por posição')).toHaveTextContent('D 1/1')
    expect(confirm).toBeDisabled()
    await user.click(defender1)
    expect(defender2).toBeEnabled()
    await user.click(defender2)
    await user.click(attacker)
    expect(confirm).toBeEnabled()
    await user.click(confirm)
    expect(command).toHaveBeenCalledOnce()
    const result = command.mock.calls[0][0](state)
    expect(result.ok).toBe(true)
    expect(result.state.offseason.plans[state.manager.clubId].promotedIds).toEqual(['base-D-1', 'base-A-2'])
    expect(result.state.phase).toBe('cup-draw')
  })

  it('confirms once from the focused promotion button and leaves chat alone', async () => {
    const command = vi.fn()
    render(<><AcademyScreen state={academyState()} command={command} /><input aria-label="Chat" /></>)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Base D1,/ }))
    await user.click(screen.getByRole('button', { name: /Base A1,/ }))
    await user.type(screen.getByLabelText('Chat'), 'hello{Enter}')
    expect(command).not.toHaveBeenCalled()
    screen.getByRole('button', { name: /PROMOVER/ }).focus()
    await user.keyboard('{Enter}')
    expect(command).toHaveBeenCalledOnce()
  })

  it('sends only selected ids in multiplayer and waits after the server accepts them', async () => {
    const state = academyState()
    const command = vi.fn()
    const onNetworkChoice = vi.fn()
    const view = render(<AcademyScreen state={state} command={command} onNetworkChoice={onNetworkChoice} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Base D3,/ }))
    await user.click(screen.getByRole('button', { name: /Base A2,/ }))
    await user.click(screen.getByRole('button', { name: /PROMOVER/ }))
    expect(onNetworkChoice).toHaveBeenCalledExactlyOnceWith(['base-D-2', 'base-A-1'])
    expect(command).not.toHaveBeenCalled()
    const accepted = structuredClone(state)
    accepted.offseason!.pendingAcademyClubIds = []
    view.rerender(<AcademyScreen state={accepted} command={command} onNetworkChoice={onNetworkChoice} />)
    expect(screen.getByRole('status')).toHaveTextContent('AGUARDE OS OUTROS TREINADORES.')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    fireEvent.keyDown(document.body, { key: 'Enter' })
    expect(onNetworkChoice).toHaveBeenCalledOnce()
  })

  it('shows a waiting message when the club has no vacancies', () => {
    const state = academyState()
    state.offseason!.plans[state.manager.clubId].required = { G: 0, D: 0, M: 0, A: 0 }
    render(<AcademyScreen state={state} command={vi.fn()} />)
    expect(screen.getByRole('status')).toHaveTextContent('AGUARDE OS OUTROS TREINADORES.')
    expect(screen.queryByText(/ESCOLHA/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
