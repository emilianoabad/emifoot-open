import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MultiplayerChat } from './MultiplayerChat'
import { MultiplayerEntryScreen } from './MultiplayerEntryScreen'
import type { MultiplayerSnapshot, MultiplayerTimerKind } from './protocol'

const player = {
  id: 'player-1',
  name: 'Emiliano',
  clubId: 'remo',
  clubName: 'Remo',
  clubPrimary: '#0000aa',
  clubSecondary: '#ffffff',
  connected: true,
  ready: false,
  isHost: true,
}

function makeSnapshot(timerKind?: MultiplayerTimerKind, submittedPlayerIds: string[] = []): MultiplayerSnapshot {
  return {
    code: 'ABC234',
    mode: 'private',
    status: timerKind ? 'playing' : 'waiting',
    revision: 1,
    hostId: player.id,
    players: [player],
    chat: [],
    timer: timerKind ? {
      kind: timerKind,
      label: 'DECISÃO',
      endsAt: Date.now() + 5_000,
      durationMs: 5_000,
    } : undefined,
    submittedPlayerIds,
    notice: '',
  }
}

describe('simplified multiplayer UI', () => {
  beforeEach(() => {
    sessionStorage.clear()
    localStorage.clear()
    Element.prototype.scrollIntoView = vi.fn()
  })

  afterEach(() => cleanup())

  it('keeps room details hidden until the player chooses how to enter', async () => {
    const user = userEvent.setup()
    render(
      <MultiplayerEntryScreen
        inviteCode=""
        connectionState="idle"
        message=""
        onCreatePrivate={vi.fn()}
        onJoinPrivate={vi.fn()}
        onJoinOpen={vi.fn()}
        onExit={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: /CRIAR SALA/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /ENTRAR COM CÓDIGO/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /BUSCAR LIGA/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /ENTRAR COM CÓDIGO/ }))
    expect(screen.getByLabelText('Código da sala')).toHaveFocus()
    expect(screen.getByLabelText('Nome do treinador multijogador')).toBeInTheDocument()
  })

  it('asks only for the manager name when opening an invite link', async () => {
    const user = userEvent.setup()
    const joinPrivate = vi.fn()
    render(
      <MultiplayerEntryScreen
        inviteCode="ABC234"
        connectionState="idle"
        message=""
        onCreatePrivate={vi.fn()}
        onJoinPrivate={joinPrivate}
        onJoinOpen={vi.fn()}
        onExit={vi.fn()}
      />,
    )

    expect(screen.getByText('SALA ABC234')).toBeInTheDocument()
    expect(screen.queryByLabelText('Código da sala')).not.toBeInTheDocument()
    const name = screen.getByLabelText('Nome do treinador multijogador')
    expect(name).toHaveFocus()
    await user.type(name, 'Emiliano')
    await user.click(screen.getByRole('button', { name: /ENTER.*ENTRAR/ }))
    expect(joinPrivate).toHaveBeenCalledWith('ABC234', 'Emiliano')
  })

  it('shows a blinking timer only while this player has a pending decision', () => {
    const onSend = vi.fn()
    const view = render(<MultiplayerChat snapshot={makeSnapshot('cup-draw')} playerId={player.id} onSend={onSend} />)
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
    expect(screen.queryByText('À ESPERA...')).not.toBeInTheDocument()

    view.rerender(<MultiplayerChat snapshot={makeSnapshot('club-draw')} playerId={player.id} onSend={onSend} />)
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()

    view.rerender(<MultiplayerChat snapshot={makeSnapshot('auction')} playerId={player.id} onSend={onSend} />)
    expect(screen.getByRole('timer')).toHaveClass('actionable')
    expect(screen.getByLabelText('Chat da sala')).toHaveClass('has-action-timer')

    view.rerender(<MultiplayerChat snapshot={makeSnapshot('auction', [player.id])} playerId={player.id} onSend={onSend} />)
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()

    view.rerender(<MultiplayerChat snapshot={makeSnapshot('sponsorship')} playerId={player.id} onSend={onSend} />)
    expect(screen.getByRole('timer')).toHaveClass('actionable')

    view.rerender(<MultiplayerChat snapshot={makeSnapshot('sponsorship', [player.id])} playerId={player.id} onSend={onSend} />)
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()

    view.rerender(<MultiplayerChat snapshot={makeSnapshot('academy')} playerId={player.id} onSend={onSend} />)
    expect(screen.getByRole('timer')).toHaveClass('actionable')
    expect(screen.getByLabelText('Chat da sala')).toHaveClass('has-action-timer')

    view.rerender(<MultiplayerChat snapshot={makeSnapshot('academy', [player.id])} playerId={player.id} onSend={onSend} />)
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()

    view.rerender(<MultiplayerChat snapshot={makeSnapshot('first-half')} playerId={player.id} onSend={onSend} />)
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
  })

  it('shows each assigned club in its real colors above chat', () => {
    render(<MultiplayerChat snapshot={makeSnapshot('regular-turn')} playerId={player.id} onSend={vi.fn()} />)

    const club = screen.getByText('Remo')
    expect(club).toHaveClass('multiplayer-player-club')
    expect(club).toHaveStyle({ backgroundColor: '#0000aa', color: '#ffffff' })
  })

  it('opens and closes the mobile chat terminal without hiding its timer state', async () => {
    const user = userEvent.setup()
    render(<MultiplayerChat snapshot={makeSnapshot('auction')} playerId={player.id} onSend={vi.fn()} />)

    const chat = screen.getByLabelText('Chat da sala')
    const toggle = screen.getByRole('button', { name: 'CHAT ▼' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(chat).not.toHaveClass('mobile-open')
    expect(screen.getByRole('timer')).toBeInTheDocument()

    await user.click(toggle)
    expect(screen.getByRole('button', { name: 'FECHAR ▲' })).toHaveAttribute('aria-expanded', 'true')
    expect(chat).toHaveClass('mobile-open')
    expect(screen.getByRole('timer')).toBeInTheDocument()
  })
})

it('shows pause controls only to the private creator and retains chat during a pause', () => {
  const snapshot = makeSnapshot('auction')
  snapshot.pause = { playerId: player.id, name: player.name }
  const view = render(<MultiplayerChat snapshot={snapshot} playerId={player.id} onSend={vi.fn()} onTogglePause={vi.fn()} />)
  expect(screen.getByRole('button', { name: 'RETOMAR LIGA' })).toBeEnabled()
  expect(screen.getByLabelText('Mensagem do chat')).toBeEnabled()
  expect(screen.queryByRole('timer')).not.toBeInTheDocument()
  view.rerender(<MultiplayerChat snapshot={snapshot} playerId="guest" onSend={vi.fn()} onTogglePause={vi.fn()} />)
  expect(screen.queryByRole('button', { name: 'RETOMAR LIGA' })).not.toBeInTheDocument()
  view.rerender(<MultiplayerChat snapshot={{ ...snapshot, mode: 'open', pause: undefined, hostId: undefined }} playerId={player.id} onSend={vi.fn()} onTogglePause={vi.fn()} />)
  expect(screen.queryByRole('button', { name: 'PAUSAR LIGA' })).not.toBeInTheDocument()
  cleanup()
})
