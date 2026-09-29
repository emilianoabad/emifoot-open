import { useEffect, useRef, useState } from 'react'
import type { MultiplayerSnapshot, MultiplayerTimerKind } from './protocol'

const ACTION_TIMER_KINDS = new Set<MultiplayerTimerKind>(['auction', 'regular-turn', 'half-time', 'sponsorship', 'academy'])

function secondsRemaining(endsAt?: number): number {
  return endsAt ? Math.max(0, Math.ceil((endsAt - Date.now()) / 1_000)) : 0
}

interface Props {
  snapshot: MultiplayerSnapshot
  playerId?: string
  onSend: (text: string) => void
  onTogglePause?: () => void
  connected?: boolean
  connectionMessage?: string
}

export function MultiplayerChat({ snapshot, playerId, onSend, onTogglePause, connected = true, connectionMessage }: Props) {
  const [text, setText] = useState('')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [, setTick] = useState(0)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const alreadySubmitted = playerId ? snapshot.submittedPlayerIds.includes(playerId) : true
  const actionTimer = !snapshot.pause && connected && snapshot.timer && playerId && !alreadySubmitted && ACTION_TIMER_KINDS.has(snapshot.timer.kind)
    ? snapshot.timer
    : undefined
  const remaining = secondsRemaining(actionTimer?.endsAt)
  const canTogglePause = Boolean(onTogglePause && snapshot.mode === 'private' && snapshot.status === 'playing' && snapshot.hostId === playerId)
  const hasLeagueControls = canTogglePause || Boolean(connectionMessage)

  useEffect(() => {
    if (!actionTimer) return
    const interval = window.setInterval(() => setTick((current) => current + 1), 250)
    return () => window.clearInterval(interval)
  }, [actionTimer])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: 'nearest' })
  }, [snapshot.chat])

  const submit = () => {
    const next = text.trim()
    if (!next) return
    onSend(next)
    setText('')
  }

  return (
    <aside className={`multiplayer-chat screen-black ${hasLeagueControls ? 'has-league-controls' : ''} ${actionTimer ? 'has-action-timer' : ''} ${mobileOpen ? 'mobile-open' : ''}`} aria-label="Chat da sala">
      <div className="multiplayer-room-head screen-red">
        <span>SALA {snapshot.code}</span>
        <span>{snapshot.players.filter((player) => player.connected).length}/{snapshot.players.length}</span>
        <button
          type="button"
          className="multiplayer-chat-toggle"
          aria-expanded={mobileOpen}
          aria-controls="multiplayer-chat-content"
          onClick={() => setMobileOpen((open) => !open)}
        >
          {mobileOpen ? 'FECHAR ▲' : 'CHAT ▼'}
        </button>
      </div>
      {hasLeagueControls && (
        <div className="multiplayer-league-controls">
          {canTogglePause && (
            <button type="button" disabled={!connected} onClick={onTogglePause}>{snapshot.pause ? 'RETOMAR LIGA' : 'PAUSAR LIGA'}</button>
          )}
          {connectionMessage && <span role="status">{connectionMessage}</span>}
        </div>
      )}
      {actionTimer ? (
        <div className={`multiplayer-timer actionable ${remaining <= 5 ? 'urgent' : ''}`} role="timer" aria-label={`${actionTimer.label}: ${remaining} segundos`}>
          <span>{actionTimer.label}</span><b>{String(remaining).padStart(2, '0')}</b>
        </div>
      ) : null}
      <div className="multiplayer-player-strip" id="multiplayer-chat-content">
        {snapshot.players.map((player) => (
          <div className={`${player.id === playerId ? 'you' : ''} ${player.connected ? '' : 'offline'}`} key={player.id}>
            <span>{player.ready ? '√' : player.connected ? '·' : '×'}</span>
            <span>{player.name.slice(0, 13)}</span>
            <span
              className="multiplayer-player-club"
              style={player.clubName && player.clubPrimary && player.clubSecondary ? {
                color: player.clubSecondary,
                backgroundColor: player.clubPrimary,
              } : undefined}
            >
              {player.clubName?.slice(0, 11) ?? (player.isHost ? 'HOST' : '')}
            </span>
          </div>
        ))}
      </div>
      <div className="multiplayer-chat-log" aria-live="polite">
        {snapshot.chat.map((item) => (
          <div className={item.system ? 'system' : item.playerId === playerId ? 'mine' : ''} key={item.id}>
            <b>{item.author.slice(0, 12)}:</b> {item.text}
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>
      <form className="multiplayer-chat-form" onSubmit={(event) => { event.preventDefault(); submit() }}>
        <input aria-label="Mensagem do chat" disabled={!connected} maxLength={180} value={text} onChange={(event) => setText(event.target.value)} placeholder="MENSAGEM..." />
        <button type="submit" disabled={!connected} aria-label="Enviar mensagem">ENTER</button>
      </form>
    </aside>
  )
}
