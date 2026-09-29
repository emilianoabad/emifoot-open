import { useMemo } from 'react'
import { DosTeamName } from '../ui/DosTeamName'
import { CLUB_DRAW_PLAYER_MS, type MultiplayerSnapshot } from './protocol'
import { useTimerElapsed } from './useTimerElapsed'

interface Props {
  snapshot: MultiplayerSnapshot
  playerId?: string
}

export function MultiplayerClubDrawScreen({ snapshot, playerId }: Props) {
  const timer = snapshot.timer?.kind === 'club-draw' ? snapshot.timer : undefined
  const clubs = snapshot.game?.clubs
  const clubsById = useMemo(() => new Map((clubs ?? []).map((club) => [club.id, club])), [clubs])
  const fourthDivisionClubs = useMemo(() => (clubs ?? []).filter((club) => club.division === 4), [clubs])
  const elapsed = useTimerElapsed(timer) ?? snapshot.players.length * CLUB_DRAW_PLAYER_MS
  const revealedCount = Math.min(snapshot.players.length, Math.floor(elapsed / CLUB_DRAW_PLAYER_MS))
  const activePlayer = snapshot.players[revealedCount]
  const wheelIndex = fourthDivisionClubs.length > 0
    ? (Math.floor(elapsed / 100) + revealedCount * 3) % fourthDivisionClubs.length
    : 0
  const wheelClub = fourthDivisionClubs[wheelIndex]

  return (
    <section className="manager-entry-screen screen-black" aria-label="Sorteio das equipas">
      <div className="manager-entry-head dos-red-line">
        <span>NOME</span><span>EQUIPA</span>
      </div>
      <div className="multiplayer-assignment-list" role="list">
        {snapshot.players.map((player, index) => {
          const assignedClub = player.clubId ? clubsById.get(player.clubId) : undefined
          const revealed = index < revealedCount
          const drawing = index === revealedCount
          const displayedClub = revealed ? assignedClub : drawing ? wheelClub : undefined
          const accessibleClub = revealed ? assignedClub?.name ?? 'equipa desconhecida' : drawing ? 'a sortear' : 'aguarda sorteio'
          return (
            <div
              className={`manager-assigned-row multiplayer-assigned-row dos-red-line ${revealed ? 'revealed' : ''} ${drawing ? 'drawing' : ''} ${player.id === playerId ? 'you' : ''}`}
              role="listitem"
              aria-label={`${player.name}: ${accessibleClub}`}
              key={player.id}
            >
              <span>{player.id === playerId ? '▶ ' : ''}{player.name.toLowerCase()}</span>
              {displayedClub
                ? <DosTeamName club={displayedClub} className="assigned-club" />
                : <span className="assigned-club pending-club">— A AGUARDAR —</span>}
            </div>
          )
        })}
      </div>
      <div className="manager-entry-message multiplayer-draw-status" role="status" aria-live="polite">
        {activePlayer
          ? `A SORTEAR EQUIPA PARA ${activePlayer.name.toUpperCase()}...`
          : 'EQUIPAS SORTEADAS.'}
      </div>
    </section>
  )
}
