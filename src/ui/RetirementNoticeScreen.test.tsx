import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { acknowledgeRetirementNotice, createNewCareer, getManagerClub, type GameState } from '../game'
import { RetirementNoticeScreen } from './RetirementNoticeScreen'

afterEach(cleanup)

function retirementState(count = 2): GameState {
  const state = createNewCareer({ managerName: 'Aposentadoria', seed: 7 })
  const club = getManagerClub(state)
  state.season += 1
  state.phase = 'retirement-notice'
  state.offseason = {
    season: state.season, targetPlayerCount: 640, retirementPendingClubIds: count ? [club.id] : [],
    plans: { [club.id]: {
      retired: Array.from({ length: count }, (_, i) => ({ ...club.players[i % club.players.length], id: `retired-${i}`, name: `Veterano ${i + 1}`, age: 34 + i % 8 })),
      candidates: [], required: { G: 0, D: 0, M: 0, A: 0 }, promotedIds: [],
    } },
  }
  return state
}

describe('retirement announcements', () => {
  it('shows the completed season, club and every retired player without explanations or row actions', () => {
    const state = retirementState(24)
    const command = vi.fn()
    render(<RetirementNoticeScreen state={state} command={command} />)
    expect(screen.getByRole('heading', { name: 'APOSENTADORIAS · 2026' })).toBeVisible()
    expect(screen.getByText(getManagerClub(state).name)).toBeVisible()
    const list = screen.getByRole('region', { name: 'Jogadores aposentados' })
    expect(list).toHaveAttribute('tabindex', '0')
    expect(within(list).getAllByRole('row')).toHaveLength(25)
    const finalRow = within(list).getByText('Veterano 24').closest('tr')!
    expect(finalRow).toHaveTextContent('41 anos')
    fireEvent.click(finalRow)
    fireEvent.wheel(list, { deltaY: 200 })
    expect(command).not.toHaveBeenCalled()
    expect(screen.queryByText(/chance|probabilidade|exponencial/i)).not.toBeInTheDocument()
  })

  it.each(['{Enter}', '{Escape}'])('continues once using %s', async (key) => {
    const command = vi.fn()
    render(<RetirementNoticeScreen state={retirementState()} command={command} />)
    await userEvent.setup().keyboard(key)
    expect(command).toHaveBeenCalledExactlyOnceWith(acknowledgeRetirementNotice)
  })

  it('continues once from a focused button without consuming multiplayer chat', async () => {
    const command = vi.fn()
    render(<><RetirementNoticeScreen state={retirementState()} command={command} /><input aria-label="Chat" /></>)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Chat'), 'hello{Enter}{Escape}')
    expect(command).not.toHaveBeenCalled()
    screen.getByRole('button', { name: 'Continuar após aposentadorias' }).focus()
    await user.keyboard('{Enter}')
    expect(command).toHaveBeenCalledExactlyOnceWith(acknowledgeRetirementNotice)
  })

  it('waits without a confirmation action when this club has no retirees', async () => {
    const command = vi.fn()
    render(<RetirementNoticeScreen state={retirementState(0)} command={command} />)
    expect(screen.getByRole('status')).toHaveTextContent('AGUARDE OS OUTROS TREINADORES.')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    await userEvent.setup().keyboard('{Enter}{Escape}')
    expect(command).not.toHaveBeenCalled()
  })
})
