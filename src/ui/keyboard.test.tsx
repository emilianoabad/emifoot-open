import { useState } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createNewCareer, getManagerClub, reachHalfTime, startRound, type EngineResult, type GameState } from '../game'
import { GameShell } from './GameShell'
import { StandingsScreen } from './StandingsScreen'
import { HalfTimeScreen } from './HalfTimeScreen'
import { SeasonEndScreen } from './SeasonEndScreen'
import { MultiplayerEntryScreen } from '../multiplayer/MultiplayerEntryScreen'
import { MarketScreen } from './screens'
import { AuctionScreen } from './AuctionScreen'

function readyState() { return { ...createNewCareer({ managerName: 'Keys', seed: 7 }), phase: 'pre-round' as const } }
function unwrap(result: EngineResult) { if (!result.ok) throw new Error(result.error); return result.state }
afterEach(() => { cleanup(); vi.useRealTimers() })

function Career() {
  const [state, setState] = useState<GameState>(readyState)
  const [message, setMessage] = useState('')
  return <GameShell state={state} message={message} onExit={() => {}} command={(run) => {
    const result = run(state)
    if (result.ok) { setState(result.state); setMessage(result.message ?? '') }
  }} />
}

describe('advertised keyboard controls', () => {
  it('confirms a selected player sale with Enter and cancels renewal from its focused salary field', async () => {
    const user = userEvent.setup()
    render(<Career />)
    await user.keyboard('v')
    const candidate = screen.getAllByRole('button', { name: /posição [GDMA], preço/ })[0]
    const label = candidate.getAttribute('aria-label')!
    await user.click(candidate)
    expect(screen.getByRole('button', { name: /Confirmar venda/ })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument()
    await user.keyboard('{Escape}o')
    await user.click(screen.getAllByRole('button', { name: /contrato .* ordenado/ })[0])
    await waitFor(() => expect(screen.getByLabelText('Novo ordenado')).toHaveFocus())
    await user.keyboard('{Escape}')
    expect(screen.queryByText('RENOVAR CONTRATO')).not.toBeInTheDocument()
    expect(screen.getByText('TÁCTICAS')).toBeInTheDocument()
    await user.keyboard('v')
    expect(screen.queryByRole('button', { name: /Confirmar venda/ })).not.toBeInTheDocument()
  })

  it('submits a market bid with Enter from its salary input after choosing a player', async () => {
    const user = userEvent.setup()
    const command = vi.fn()
    const state = readyState()
    getManagerClub(state).cash = 100_000_000
    const { container } = render(<MarketScreen state={state} command={command} />)
    await user.click(container.querySelector<HTMLButtonElement>('.market-row')!)
    expect(screen.getByLabelText('Oferta de ordenado')).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(command).toHaveBeenCalledOnce()
    expect(unwrap(command.mock.calls[0][0](state)).bid?.listingId).toBe(state.market[0].id)
  })

  it('makes X select the best players and Enter start from the fixtures screen', async () => {
    const user = userEvent.setup()
    const state = readyState()
    const team = getManagerClub(state)
    team.lineup = [...team.lineup].reverse()
    const command = vi.fn()
    render(<GameShell state={state} message="" command={command} onExit={vi.fn()} />)
    await user.keyboard('x')
    expect(command).toHaveBeenCalledOnce()
    const updated = unwrap(command.mock.calls[0][0](state))
    expect(getManagerClub(updated).lineup).not.toEqual(team.lineup)
    command.mockClear()
    await user.keyboard('c{Enter}')
    expect(command).toHaveBeenCalledOnce()
    expect(unwrap(command.mock.calls[0][0](state)).phase).toBe('first-half')
  })

  it('cancels the pending formation kickoff when another screen is opened', async () => {
    vi.useFakeTimers()
    const command = vi.fn()
    render(<GameShell state={readyState()} message="" command={command} onExit={vi.fn()} />)
    fireEvent.keyDown(document.body, { key: '3' })
    fireEvent.keyDown(document.body, { key: 'c' })
    await act(() => vi.advanceTimersByTimeAsync(1000))
    expect(command).not.toHaveBeenCalled()
  })

  it('hides unavailable formations and ignores their keyboard shortcuts', async () => {
    vi.useFakeTimers()
    const state = readyState()
    const forwards = getManagerClub(state).players.filter((player) => player.position === 'A')
    forwards.slice(2).forEach((player) => { player.injuryRounds = 1 })
    const command = vi.fn()
    render(<GameShell state={state} message="" command={command} onExit={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /4-3-3/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /3-4-3/ })).not.toBeInTheDocument()
    fireEvent.keyDown(document.body, { key: '2' })
    await act(() => vi.advanceTimersByTimeAsync(1000))
    expect(command).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /4-4-2/ }))
    await act(() => vi.advanceTimersByTimeAsync(1000))
    expect(command).toHaveBeenCalledOnce()
    const started = unwrap(command.mock.calls[0][0](state))
    expect(getManagerClub(started).tactic).toBe('4-4-2')
    expect(started.phase).toBe('first-half')
  })

  it('makes X choose a feasible replacement when the current tactic loses a required player', async () => {
    const state = readyState()
    const club = getManagerClub(state)
    club.tactic = '4-3-3'
    club.players.filter((player) => player.position === 'A').slice(2).forEach((player) => { player.suspensionRounds = 1 })
    const command = vi.fn()
    render(<GameShell state={state} message="" command={command} onExit={vi.fn()} />)
    fireEvent.keyDown(document.body, { key: 'x' })
    expect(command).toHaveBeenCalledOnce()
    expect(getManagerClub(unwrap(command.mock.calls[0][0](state))).tactic).not.toBe('4-3-3')
  })

  it('does not advance standings while typing chat or dispatch twice for a focused button', async () => {
    const user = userEvent.setup()
    const command = vi.fn()
    render(<><StandingsScreen state={readyState()} command={command} /><input aria-label="Chat" /></>)
    await user.type(screen.getByLabelText('Chat'), 'hello{Enter}{Escape}')
    expect(command).not.toHaveBeenCalled()
    screen.getByRole('button', { name: 'Continuar após classificação' }).focus()
    await user.keyboard('{Enter}')
    expect(command).toHaveBeenCalledOnce()
  })

  it.each(['v', 'o'])('keeps chat focus when a server snapshot refreshes the selected management player (%s)', async (key) => {
    const user = userEvent.setup()
    const state = readyState()
    const command = vi.fn()
    const draw = (state: GameState) => <><GameShell state={state} message="" command={command} onExit={vi.fn()} /><input aria-label="Chat" /></>
    const view = render(draw(state))
    await user.keyboard(key)
    await user.click(screen.getAllByRole('button', { name: /Selecionar/ })[0])
    if (key === 'o') await waitFor(() => expect(screen.getByLabelText('Novo ordenado')).toHaveFocus())
    await user.click(screen.getByLabelText('Chat'))
    view.rerender(draw(structuredClone(state)))
    await user.type(screen.getByLabelText('Chat'), 'message')
    expect(screen.getByLabelText('Chat')).toHaveFocus()
    expect(command).not.toHaveBeenCalled()
  })

  it('does not steal focus from chat when the next auction opens', async () => {
    const user = userEvent.setup()
    const state = readyState()
    getManagerClub(state).cash = 100_000_000
    const draw = (state: GameState) => <><AuctionScreen state={state} command={vi.fn()} message="" /><input aria-label="Chat" /></>
    const view = render(draw(state))
    await waitFor(() => expect(screen.getByLabelText('Oferta de ordenado')).toHaveFocus())
    await user.click(screen.getByLabelText('Chat'))
    view.rerender(draw({ ...state, market: state.market.slice(1) }))
    await act(() => new Promise((resolve) => setTimeout(resolve, 30)))
    expect(screen.getByLabelText('Chat')).toHaveFocus()
  })

  it('ignores repeat keys, browser shortcuts, and inert game screens', () => {
    const command = vi.fn()
    const view = render(<StandingsScreen state={readyState()} command={command} />)
    fireEvent.keyDown(document.body, { key: 'Enter', repeat: true })
    fireEvent.keyDown(document.body, { key: 'Enter', ctrlKey: true })
    expect(command).not.toHaveBeenCalled()
    view.rerender(<div inert><StandingsScreen state={readyState()} command={command} /></div>)
    fireEvent.keyDown(document.body, { key: 'Enter' })
    expect(command).not.toHaveBeenCalled()
  })

  it('does not substitute or end halftime when 1 or Escape is typed in chat', async () => {
    const user = userEvent.setup()
    const command = vi.fn()
    const state = unwrap(reachHalfTime(unwrap(startRound(readyState()))))
    render(<><HalfTimeScreen state={state} command={command} message="" /><input aria-label="Chat" /></>)
    await user.type(screen.getByLabelText('Chat'), '1{Escape}')
    expect(command).not.toHaveBeenCalled()
    screen.getByLabelText('Chat').blur()
    await user.keyboard('1')
    expect(command).toHaveBeenCalledOnce()
  })

  it('supports multiplayer menu letters and Escape from a name field', async () => {
    const user = userEvent.setup()
    const onExit = vi.fn()
    render(<MultiplayerEntryScreen inviteCode="" connectionState="idle" message="" onCreatePrivate={vi.fn()} onJoinPrivate={vi.fn()} onJoinOpen={vi.fn()} onExit={onExit} />)
    await user.keyboard('c')
    expect(screen.getByLabelText('Nome do treinador multijogador')).toHaveFocus()
    await user.keyboard('Coach{Escape}')
    expect(screen.getByRole('button', { name: /CRIAR SALA/ })).toBeInTheDocument()
    await user.keyboard('e')
    expect(screen.getByLabelText('Código da sala')).toHaveFocus()
    await user.keyboard('{Escape}{Escape}')
    expect(onExit).toHaveBeenCalledOnce()
  })

  it('handles the next-season Enter prompt and respects dismissal', async () => {
    const user = userEvent.setup()
    const command = vi.fn()
    const state = readyState()
    const view = render(<SeasonEndScreen state={state} command={command} message="" />)
    await user.keyboard('{Enter}')
    expect(command).toHaveBeenCalledOnce()
    command.mockClear()
    view.rerender(<SeasonEndScreen state={{ ...state, manager: { ...state.manager, dismissed: true } }} command={command} message="" />)
    await user.keyboard('{Enter}')
    expect(command).not.toHaveBeenCalled()
  })
})
