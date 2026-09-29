import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createNewCareer } from '../game'
import { MultiplayerClubDrawScreen } from './MultiplayerClubDrawScreen'
import {
  CLUB_DRAW_PLAYER_MS,
  clubDrawDurationMs,
  type MultiplayerSnapshot,
} from './protocol'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('multiplayer club draw', () => {
  it('reveals every manager and full club name in synchronized order', () => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
    const game = createNewCareer({ managerName: 'Emiliano', seed: 12_345 })
    game.phase = 'manager-registration'
    const [firstClub, secondClub] = game.clubs.filter((club) => club.division === 4)
    if (!firstClub || !secondClub) throw new Error('Expected two fourth-division clubs')
    const durationMs = clubDrawDurationMs(2)
    const snapshot: MultiplayerSnapshot = {
      code: 'ABC234',
      mode: 'private',
      status: 'playing',
      revision: 2,
      hostId: 'player-1',
      players: [
        { id: 'player-1', name: 'Emiliano', clubId: firstClub.id, clubName: firstClub.name, connected: true, ready: false, isHost: true },
        { id: 'player-2', name: 'Ana', clubId: secondClub.id, clubName: secondClub.name, connected: true, ready: false, isHost: false },
      ],
      chat: [],
      timer: { kind: 'club-draw', label: 'SORTEIO DAS EQUIPAS', durationMs, endsAt: 10_000 + durationMs },
      game,
      submittedPlayerIds: [],
      notice: 'SORTEIO DAS EQUIPAS DA 4ª DIVISÃO EM CURSO.',
    }

    render(<MultiplayerClubDrawScreen snapshot={snapshot} playerId="player-1" />)

    expect(screen.getByRole('region', { name: 'Sorteio das equipas' })).toHaveClass('manager-entry-screen')
    expect(screen.getByRole('listitem', { name: 'Emiliano: a sortear' })).toHaveClass('manager-assigned-row')
    expect(screen.getByRole('listitem', { name: 'Ana: aguarda sorteio' })).toBeInTheDocument()

    act(() => vi.advanceTimersByTime(CLUB_DRAW_PLAYER_MS))
    expect(screen.getByRole('listitem', { name: `Emiliano: ${firstClub.name}` })).toBeInTheDocument()
    expect(screen.getByRole('listitem', { name: `Emiliano: ${firstClub.name}` }).querySelector('.assigned-club')?.getAttribute('style')).toContain(`--team-bg: ${firstClub.primary}`)
    expect(screen.getByRole('listitem', { name: 'Ana: a sortear' })).toBeInTheDocument()

    act(() => vi.advanceTimersByTime(CLUB_DRAW_PLAYER_MS))
    expect(screen.getByRole('listitem', { name: `Ana: ${secondClub.name}` })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('EQUIPAS SORTEADAS')
  })
})
