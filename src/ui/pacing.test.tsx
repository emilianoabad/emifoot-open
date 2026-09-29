import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  completeCupDraw,
  confirmManagerRegistration,
  createNewCareer,
  finishRound,
  getManagerClub,
  reachHalfTime,
  showStandings,
  startRound,
  submitAuctionOffer,
  type EngineResult,
  type GameState,
} from '../game'
import { AuctionScreen } from './AuctionScreen'
import { CupDrawScreen } from './CupDrawScreen'
import { MatchdayScreen } from './MatchdayScreen'
import { HalfTimeScreen } from './HalfTimeScreen'
import * as localFastMode from '../config/localFastMode'

function unwrap(result: EngineResult): GameState {
  if (!result.ok) throw new Error(result.error)
  return result.state
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('vintage presentation pacing', () => {
  it('plays one-second test halves but waits for the manager at halftime', async () => {
    vi.useFakeTimers()
    vi.spyOn(localFastMode, 'getMatchPacing').mockReturnValue(localFastMode.getMatchPacing(true))
    let state = createNewCareer({ managerName: 'Intervalo', seed: 4 })
    state.market = []
    state.phase = 'pre-round'
    state = unwrap(startRound(state))
    const command = vi.fn()
    const view = render(<MatchdayScreen state={state} command={command} />)

    async function expectOneSecondHalf(expectedCommand: typeof reachHalfTime) {
      for (let tick = 0; tick < 10; tick++) await act(() => vi.advanceTimersByTimeAsync(90))
      await act(() => vi.advanceTimersByTimeAsync(99))
      expect(command).not.toHaveBeenCalled()
      await act(() => vi.advanceTimersByTimeAsync(1))
      expect(command).toHaveBeenCalledExactlyOnceWith(expectedCommand)
      command.mockClear()
    }

    await expectOneSecondHalf(reachHalfTime)
    state = unwrap(reachHalfTime(state))
    view.rerender(<HalfTimeScreen state={state} command={command} message="" />)
    await act(() => vi.advanceTimersByTimeAsync(60_000))
    expect(screen.getByText('JOGADORES EM CAMPO')).toBeInTheDocument()
    expect(command).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /Esc.*Fim/ }))
    expect(command).toHaveBeenCalledExactlyOnceWith(finishRound)
    command.mockClear()

    state = unwrap(finishRound(state))
    view.rerender(<MatchdayScreen state={state} command={command} />)
    await expectOneSecondHalf(showStandings)
  })

  it('keeps the cup draw visible long enough to follow', async () => {
    vi.useFakeTimers()
    const state = unwrap(confirmManagerRegistration(createNewCareer({ managerName: 'Tempo', seed: 3 })))
    const command = vi.fn()
    render(<CupDrawScreen state={state} command={command} />)

    await act(() => vi.advanceTimersByTimeAsync(5_000))
    expect(command).not.toHaveBeenCalled()
  })

  it('keeps each half on screen instead of finishing in a few seconds', async () => {
    vi.useFakeTimers()
    let state = unwrap(confirmManagerRegistration(createNewCareer({ managerName: 'Tempo', seed: 4 })))
    state = unwrap(completeCupDraw(state))
    state.market = []
    state.phase = 'pre-round'
    state = unwrap(startRound(state))
    const command = vi.fn()
    render(<MatchdayScreen state={state} command={command} />)

    await act(() => vi.advanceTimersByTimeAsync(8_000))
    expect(command).not.toHaveBeenCalled()
  })

  it('renders each scorer beside the fixture where the goal happened', async () => {
    vi.useFakeTimers()
    let state = unwrap(confirmManagerRegistration(createNewCareer({ managerName: 'Tempo', seed: 4 })))
    state = unwrap(completeCupDraw(state))
    state.market = []
    state.phase = 'pre-round'
    state = unwrap(startRound(state))
    const matches = state.pendingMatchDay?.matches
    const firstMatch = matches?.[0]
    const secondMatch = matches?.[1]
    if (!matches || !firstMatch || !secondMatch) throw new Error('Expected a populated match day')
    for (const match of matches) match.events = []
    firstMatch.events = [{ minute: 1, type: 'goal', clubId: firstMatch.homeId, playerName: 'Primeiro Marcador' }]
    secondMatch.events = [{ minute: 2, type: 'goal', clubId: secondMatch.awayId, playerName: 'Segundo Marcador' }]

    const command = vi.fn()
    const { container } = render(<MatchdayScreen state={state} command={command} />)
    await act(() => vi.advanceTimersByTimeAsync(800))

    const rows = container.querySelectorAll('.matchday-row')
    expect(rows[0]?.querySelector('.matchday-goal-slot')).toHaveTextContent("Primeiro Marcador 1'")
    expect(rows[0]?.querySelector('.matchday-goal-slot')).not.toHaveTextContent('Segundo Marcador')
    expect(rows[1]?.querySelector('.matchday-goal-slot')).toHaveTextContent("Segundo Marcador 2'")
    expect(container.querySelector('.matchday-events')).not.toBeInTheDocument()
  })

  it('shows an auction result briefly and then opens the next bid automatically', async () => {
    vi.useFakeTimers()
    let state = unwrap(confirmManagerRegistration(createNewCareer({ managerName: 'Tempo', seed: 5 })))
    state = unwrap(completeCupDraw(state))
    state = unwrap(submitAuctionOffer(state))
    const command = vi.fn()
    render(<AuctionScreen state={state} message="" command={command} />)

    await act(() => vi.advanceTimersByTimeAsync(1_999))
    expect(command).not.toHaveBeenCalled()
    await act(() => vi.advanceTimersByTimeAsync(1))
    expect(command).toHaveBeenCalledOnce()
  })

  it('shows an affordability warning for one second and then automatically skips the bid', async () => {
    vi.useFakeTimers()
    let state = unwrap(confirmManagerRegistration(createNewCareer({ managerName: 'Sem verba', seed: 5 })))
    state = unwrap(completeCupDraw(state))
    const listing = state.market[0]
    getManagerClub(state).cash = Math.max(0, listing.fee - 1)
    const command = vi.fn()
    render(<AuctionScreen state={state} message="" command={command} />)

    expect(screen.queryByLabelText('Oferta de ordenado')).not.toBeInTheDocument()
    expect(screen.getByText(/DINHEIRO INSUFICIENTE/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /passar/i })).not.toBeInTheDocument()
    await act(() => vi.advanceTimersByTimeAsync(999))
    expect(command).not.toHaveBeenCalled()
    await act(() => vi.advanceTimersByTimeAsync(1))
    expect(command).toHaveBeenCalledOnce()
  })

  it('does not resubmit an automatic multiplayer pass after the server records it', async () => {
    vi.useFakeTimers()
    let state = unwrap(confirmManagerRegistration(createNewCareer({ managerName: 'Sem verba', seed: 5 })))
    state = unwrap(completeCupDraw(state))
    const listing = state.market[0]
    getManagerClub(state).cash = Math.max(0, listing.fee - 1)
    const onNetworkOffer = vi.fn()
    render(<AuctionScreen state={state} message="" command={vi.fn()} onNetworkOffer={onNetworkOffer} offerSubmitted />)

    await act(() => vi.advanceTimersByTimeAsync(1_000))
    expect(onNetworkOffer).not.toHaveBeenCalled()
  })
})
