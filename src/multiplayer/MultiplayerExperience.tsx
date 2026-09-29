import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  acknowledgeSponsorshipNotice,
  bettingRegulationNotice,
  getManagerClub,
  type EngineResult,
  type GameState,
} from '../game'
import { AuctionScreen } from '../ui/AuctionScreen'
import { AcademyScreen } from '../ui/AcademyScreen'
import { CupDrawScreen } from '../ui/CupDrawScreen'
import { CompetitionResultsScreen } from '../ui/CompetitionResultsScreen'
import { GameShell } from '../ui/GameShell'
import { HalfTimeScreen } from '../ui/HalfTimeScreen'
import { InjuryScreen } from '../ui/InjuryScreen'
import { MatchdayScreen } from '../ui/MatchdayScreen'
import { RetirementNoticeScreen } from '../ui/RetirementNoticeScreen'
import { StandingsScreen } from '../ui/StandingsScreen'
import { SeasonAwardsPanel } from '../ui/SeasonAwardsPanel'
import { SponsorshipScreen } from '../ui/SponsorshipScreen'
import { SponsorshipNoticeScreen } from '../ui/SponsorshipNoticeScreen'
import { useGameKeyboard } from '../ui/useGameKeyboard'
import { MultiplayerChat } from './MultiplayerChat'
import { MultiplayerClubDrawScreen } from './MultiplayerClubDrawScreen'
import { MultiplayerEntryScreen } from './MultiplayerEntryScreen'
import { buildInviteClipboardText, buildInviteText, buildInviteUrl, INVITE_CARD_TITLE, readInviteContext } from './invite'
import type { ClubSetup, MultiplayerAction, MultiplayerSnapshot } from './protocol'
import { useMultiplayer } from './useMultiplayer'

function setupFromState(state: GameState): ClubSetup {
  const club = getManagerClub(state)
  return { tactic: club.tactic, lineup: [...club.lineup], bench: [...club.bench] }
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function inferNetworkAction(before: GameState, after: GameState): MultiplayerAction | undefined {
  if (before.phase === 'pre-round' && after.phase === 'first-half') return { type: 'ready-round', setup: setupFromState(after) }
  if (before.phase === 'half-time' && after.phase === 'second-half') return { type: 'ready-half-time' }
  if (before.phase === 'standings' && after.phase !== 'standings') return { type: 'continue' }
  if (before.phase === 'sponsorship-notice' && after.phase !== 'sponsorship-notice') return { type: 'continue' }
  if (before.phase === 'retirement-notice' && (after.phase !== 'retirement-notice'
    || !after.offseason?.retirementPendingClubIds.includes(before.manager.clubId))) return { type: 'continue' }
  if (before.phase === 'competition-results' && after.phase !== 'competition-results') return { type: 'continue' }
  if (before.phase === 'cup-draw' || before.phase === 'first-half' || before.phase === 'second-half') return undefined

  const beforeSaleResult = before.playerSaleResults?.[before.manager.clubId]
  const afterSaleResult = after.playerSaleResults?.[after.manager.clubId]
  if (beforeSaleResult && !afterSaleResult) return { type: 'acknowledge-player-sale' }

  const beforeClub = getManagerClub(before)
  const afterClub = getManagerClub(after)
  const afterPlayerIds = new Set(afterClub.players.map((player) => player.id))
  const removedPlayer = beforeClub.players.find((player) => !afterPlayerIds.has(player.id))
  if (removedPlayer) return { type: 'sell-player', playerId: removedPlayer.id }

  for (const player of beforeClub.players) {
    const changed = afterClub.players.find((candidate) => candidate.id === player.id)
    if (changed && (changed.salary !== player.salary || changed.contractRounds !== player.contractRounds)) {
      return { type: 'renew-player', playerId: player.id, salary: changed.salary }
    }
  }
  if (after.bid && (after.bid.listingId !== before.bid?.listingId || after.bid.salary !== before.bid?.salary)) {
    return { type: 'place-transfer-bid', listingId: after.bid.listingId, salary: after.bid.salary }
  }
  if (afterClub.ticketPrice !== beforeClub.ticketPrice) return { type: 'set-ticket-price', price: afterClub.ticketPrice }
  if (afterClub.stadium.expansionSeats !== beforeClub.stadium.expansionSeats && afterClub.stadium.expansionSeats) {
    return { type: 'expand-stadium', seats: afterClub.stadium.expansionSeats === 1000 ? 1000 : 5000 }
  }
  if (afterClub.stadium.condition !== beforeClub.stadium.condition) return { type: 'repair-stadium' }

  if (before.phase === 'half-time' && !arraysEqual(beforeClub.lineup, afterClub.lineup)) {
    const outId = beforeClub.lineup.find((id) => !afterClub.lineup.includes(id))
    const inId = afterClub.lineup.find((id) => !beforeClub.lineup.includes(id))
    if (outId && inId) return { type: 'half-time-substitution', outId, inId }
  }
  if (
    beforeClub.tactic !== afterClub.tactic
    || !arraysEqual(beforeClub.lineup, afterClub.lineup)
    || !arraysEqual(beforeClub.bench, afterClub.bench)
  ) return { type: 'update-club', setup: setupFromState(after) }
  return undefined
}

interface WaitingRoomProps {
  snapshot: MultiplayerSnapshot
  playerId?: string
  message: string
  onStart: () => void
  onExit: () => void
}

function WaitingRoom({ snapshot, playerId, message, onStart, onExit }: WaitingRoomProps) {
  const [copyMessage, setCopyMessage] = useState('')
  const [now, setNow] = useState(Date.now)
  const lobbyEndsAt = snapshot.timer?.kind === 'open-lobby' ? snapshot.timer.endsAt : undefined
  useEffect(() => {
    if (!lobbyEndsAt) return
    const interval = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(interval)
  }, [lobbyEndsAt])
  const creator = snapshot.players.find((player) => player.id === snapshot.hostId)?.name ?? ''
  const shareUrl = useMemo(() => buildInviteUrl(window.location.href, snapshot.code), [snapshot.code])
  const shareText = useMemo(() => buildInviteText(snapshot.code, creator), [creator, snapshot.code])
  const isHost = snapshot.mode === 'private' && playerId === snapshot.hostId
  const connectedCount = snapshot.players.filter((player) => player.connected).length

  const copyLink = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: INVITE_CARD_TITLE, text: shareText, url: shareUrl })
        setCopyMessage('CONVITE PARTILHADO.')
      } else {
        await navigator.clipboard.writeText(buildInviteClipboardText(snapshot.code, creator, shareUrl))
        setCopyMessage('CONVITE COPIADO.')
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setCopyMessage('SELECIONE E COPIE O LINK ABAIXO.')
    }
  }
  const keyboardRef = useGameKeyboard<HTMLElement>((key) => {
    if (key === 'Escape') { onExit(); return true }
    if (key === 'Enter' && isHost) { onStart(); return true }
    if (key.toLowerCase() === 'c' && snapshot.mode === 'private') { void copyLink(); return true }
  }, true)

  return (
    <section ref={keyboardRef} className="multiplayer-lobby screen-blue">
      <div className="multiplayer-lobby-title screen-red">SALA DE ESPERA · {snapshot.code}</div>
      <div className="multiplayer-lobby-status">{snapshot.mode === 'private' ? 'LIGA COM AMIGOS' : 'LIGA ONLINE'} · {connectedCount}/8 TREINADORES</div>
      <div className="multiplayer-seats dos-double screen-black">
        {Array.from({ length: 8 }, (_, index) => {
          const player = snapshot.players[index]
          return (
            <div className={player ? 'occupied' : ''} key={index}>
              <span>{index + 1}</span>
              <span>{player ? player.name.toUpperCase() : 'LUGAR LIVRE'}</span>
              <span>{player && !player.connected ? 'SEM LIGAÇÃO' : player?.isHost ? 'CRIADOR' : player ? 'LIGADO' : ''}</span>
            </div>
          )
        })}
      </div>
      {snapshot.mode === 'private' ? (
        <div className="multiplayer-share dos-double screen-green">
          <div>PARTILHE ESTE LINK:</div>
          <input aria-label="Link da sala" readOnly value={shareUrl} onFocus={(event) => event.target.select()} />
          <button type="button" onClick={() => void copyLink()}>C&nbsp; PARTILHAR</button>
          <span>{copyMessage}</span>
        </div>
      ) : (
        <div className="multiplayer-open-wait dos-double screen-green" role="status">
          {lobbyEndsAt ? `${connectedCount}/8 TREINADORES — COMEÇA EM ${Math.max(0, Math.ceil(Math.min(snapshot.timer!.durationMs, lobbyEndsAt - now) / 1000))}s` : 'AGUARDANDO OUTRO TREINADOR'}
          <div>DE 2 A 8 TREINADORES · INÍCIO AUTOMÁTICO</div>
        </div>
      )}
      <div className="multiplayer-lobby-actions">
        {isHost ? <button type="button" onClick={onStart}>ENTER&nbsp; COMEÇAR AGORA</button> : snapshot.mode === 'private' ? <span>AGUARDE O CRIADOR COMEÇAR...</span> : <span>SEM CRIADOR · SEM PAUSAS</span>}
        <button type="button" onClick={onExit}>ESC&nbsp; {snapshot.mode === 'open' ? 'CANCELAR BUSCA' : 'VOLTAR AO MENU'}</button>
      </div>
      <div className="multiplayer-lobby-message">{message}</div>
    </section>
  )
}

interface MultiplayerGameProps {
  snapshot: MultiplayerSnapshot
  playerId?: string
  message: string
  setMessage: (message: string) => void
  sendAction: (action: MultiplayerAction) => void
  onExit: () => void
}

function MultiplayerGame({ snapshot, playerId, message, setMessage, sendAction, onExit }: MultiplayerGameProps) {
  const game = snapshot.game
  const seasonKeyboardRef = useGameKeyboard<HTMLElement>((key) => {
    if (key === 'Enter') { sendAction({ type: 'continue' }); return true }
    if (key === 'Escape') { onExit(); return true }
  })
  const command = useCallback((run: (state: GameState) => EngineResult) => {
    if (!game || snapshot.pause) return
    const result = run(game)
    if (!result.ok) {
      setMessage(result.error)
      return
    }
    const action = inferNetworkAction(game, result.state)
    if (action) {
      setMessage('COMANDO ENVIADO. A AGUARDAR OS OUTROS TREINADORES...')
      sendAction(action)
    }
  }, [game, sendAction, setMessage, snapshot.pause])

  if (!game) return null
  const alreadySubmitted = playerId ? snapshot.submittedPlayerIds.includes(playerId) : false
  const playerSaleResult = game.playerSaleResults?.[game.manager.clubId]
  const showInjuryNotice = Boolean(game.injuryNoticePending && (game.phase === 'standings' || game.phase === 'competition-results'))
  let screen
  if (playerSaleResult) screen = <AuctionScreen state={game} command={command} message={message} playerSaleResult={playerSaleResult} />
  else if (showInjuryNotice) screen = <InjuryScreen state={game} />
  else if (game.phase === 'manager-registration') screen = <MultiplayerClubDrawScreen snapshot={snapshot} playerId={playerId} />
  else if (game.phase === 'cup-draw') screen = <CupDrawScreen state={game} command={command} networkTimer={snapshot.timer} />
  else if (game.phase === 'sponsorship') screen = <SponsorshipScreen state={game} command={command} onNetworkChoice={(offerId) => sendAction({ type: 'sponsorship-offer', offerId })} />
  else if (game.phase === 'retirement-notice') screen = <RetirementNoticeScreen state={game} command={command} />
  else if (game.phase === 'academy') screen = <AcademyScreen key={`${game.season}-${game.manager.clubId}`} state={game} command={command} message={message} onNetworkChoice={(playerIds) => sendAction({ type: 'academy-selection', playerIds })} />
  else if (game.phase === 'auction') screen = (
    <AuctionScreen
      state={game}
      command={command}
      message={alreadySubmitted && !game.auctionResult ? 'DECISÃO ENVIADA. AGUARDE OS OUTROS TREINADORES.' : message}
      onNetworkOffer={(salary) => sendAction({ type: 'auction-offer', salary })}
      offerSubmitted={alreadySubmitted}
    />
  )
  else if (game.phase === 'first-half' || game.phase === 'second-half') screen = <MatchdayScreen key={`${game.currentRound}-${game.phase}-${game.pendingMatchDay?.competition}`} state={game} command={command} networkTimer={snapshot.timer} />
  else if (game.phase === 'half-time') screen = <HalfTimeScreen state={game} command={command} message={alreadySubmitted ? 'DECISÕES CONCLUÍDAS. AGUARDE.' : message} />
  else if (game.phase === 'standings') screen = <StandingsScreen state={game} command={command} />
  else if (game.phase === 'sponsorship-notice') screen = bettingRegulationNotice(game)
    ? <SponsorshipNoticeScreen state={game} command={command} />
    : <StandingsScreen state={game} command={command} advance={acknowledgeSponsorshipNotice} />
  else if (game.phase === 'competition-results') screen = <CompetitionResultsScreen state={game} command={command} />
  else if (game.phase === 'pre-round') screen = <GameShell state={game} command={command} message={alreadySubmitted ? 'PRONTO. A AGUARDAR OS OUTROS TREINADORES.' : message} onExit={onExit} managedClubIds={snapshot.players.flatMap((player) => player.clubId ? [player.clubId] : [])} />
  else screen = (
    <section ref={seasonKeyboardRef} className="multiplayer-season-end screen-blue">
      <div className="screen-heading">FIM DA TEMPORADA {game.season}</div>
      <SeasonAwardsPanel state={game} />
      <div>OS MESMOS TREINADORES CONTINUAM NOS SEUS CLUBES.</div>
      <button type="button" className="season-continue" onClick={() => sendAction({ type: 'continue' })}>ENTER&nbsp; PRÓXIMA TEMPORADA</button>
      <button type="button" onClick={onExit}>ESC&nbsp; VOLTAR AO TÍTULO</button>
    </section>
  )
  return <>{screen}</>
}

export function MultiplayerExperience({ onExit, entryMode = 'private', resumeCode }: { onExit: () => void; entryMode?: 'private' | 'open' | 'resume'; resumeCode?: string }) {
  const controller = useMultiplayer()
  const [invite] = useState(() => readInviteContext(window.location.href))
  const inviteCode = invite.code
  const resumeAttempted = useRef(false)

  useEffect(() => {
    const code = resumeCode ?? inviteCode
    if (!code || resumeAttempted.current) return
    resumeAttempted.current = true
    controller.resumeRoom(code)
  }, [controller, inviteCode, resumeCode])

  useEffect(() => {
    const url = new URL(window.location.href)
    if (!url.searchParams.has('creator')) return
    url.searchParams.delete('creator')
    window.history.replaceState(null, '', url)
  }, [])

  useEffect(() => {
    if (!controller.snapshot) return
    const url = new URL(window.location.href)
    url.searchParams.set('room', controller.snapshot.code)
    url.searchParams.delete('creator')
    window.history.replaceState(null, '', url)
  }, [controller.snapshot])

  useEffect(() => {
    document.querySelector<HTMLElement>('.dos-viewport--portrait')?.scrollTo({ top: 0 })
  }, [controller.snapshot?.game?.phase, controller.snapshot?.status])

  const exit = () => {
    controller.leaveRoom()
    const url = new URL(window.location.href)
    url.searchParams.delete('room')
    url.searchParams.delete('creator')
    window.history.replaceState(null, '', url)
    onExit()
  }

  if (!controller.snapshot) {
    return (
      <MultiplayerEntryScreen
        entryMode={entryMode}
        inviteCode={inviteCode}
        connectionState={controller.connectionState}
        message={controller.message}
        onCreatePrivate={controller.createPrivate}
        onJoinPrivate={controller.joinPrivate}
        onJoinOpen={controller.joinOpen}
        onExit={exit}
      />
    )
  }

  return (
    <div className="multiplayer-shell">
      <div className="multiplayer-game-pane">
        <div inert={Boolean(controller.snapshot.pause) || controller.connectionState !== 'connected'}>
          {controller.snapshot.status === 'waiting' ? (
            <WaitingRoom
              snapshot={controller.snapshot}
              playerId={controller.playerId}
              message={controller.message}
              onStart={controller.startRoom}
              onExit={exit}
            />
          ) : (
            <MultiplayerGame
              snapshot={controller.snapshot}
              playerId={controller.playerId}
              message={controller.message}
              setMessage={controller.setMessage}
              sendAction={controller.sendAction}
              onExit={exit}
            />
          )}
        </div>
        {controller.snapshot.pause && (
          <div className="multiplayer-pause screen-blue dos-double" role="status">
            <strong>LIGA PAUSADA POR {controller.snapshot.pause.name.toUpperCase()}</strong>
            <p>PARTIDAS E CRONÔMETROS CONGELADOS.</p>
            <p>{controller.snapshot.hostId === controller.playerId ? 'USE RETOMAR LIGA PARA CONTINUAR.' : 'AGUARDE O CRIADOR RETOMAR.'}</p>
            <p>O CHAT CONTINUA DISPONÍVEL.</p>
          </div>
        )}
      </div>
      <MultiplayerChat snapshot={controller.snapshot} playerId={controller.playerId} onSend={controller.sendChat}
        onTogglePause={controller.togglePause} connected={controller.connectionState === 'connected'}
        connectionMessage={controller.connectionState !== 'connected' ? controller.message : undefined} />
    </div>
  )
}
