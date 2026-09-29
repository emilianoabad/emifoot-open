import { randomBytes, randomInt as secureRandomInt, randomUUID } from 'node:crypto'
import {
  acceptSponsorshipOffer,
  acknowledgeAuctionResult,
  acknowledgeInjuryNotice,
  acknowledgeRetirementNotice,
  acknowledgeSponsorshipNotice,
  acknowledgePlayerSale,
  advanceAfterCompetitionResultsForManagedClubs,
  advanceAfterStandingsForManagedClubs,
  autoPickLineup,
  automaticAcademySelection,
  bestSafeSponsorship,
  bettingRegulationNotice,
  calculateAiAuctionSalary,
  calculatePlayerSalary,
  canLeaveClub,
  completeCupDraw,
  completeAuctionTransfer,
  confirmManagerRegistration,
  createMarketListings,
  createNewCareer,
  DEFAULT_TICKET_PRICE,
  expandStadium,
  finishRoundForManagedClubs,
  getAuctionBidEligibilityError,
  getAiAuctionCandidates,
  getMarketPlayer,
  getAvailableSponsorshipProposal,
  getAvailableTactics,
  getClub,
  isSaleProtected,
  makeHalfTimeSubstitution,
  normalizeSalaryOffer,
  placeTransferBid,
  promoteAcademyPlayers,
  random,
  reachHalfTime,
  renewPlayerContract,
  repairStadium,
  sellPlayer,
  selectAiTransferBuyer,
  setPlayerContract,
  setTicketPrice,
  showStandings,
  shuffle,
  startNextSeason,
  startRoundForManagedClubs,
  validateLineup,
  type EngineResult,
  type GameState,
  type Manager,
  type TransferMessage,
} from '../src/game/index'
import {
  clubDrawDurationMs,
  MAX_MULTIPLAYER_PLAYERS,
  type ClientMessage,
  type ClubSetup,
  type MultiplayerAction,
  type MultiplayerChatMessage,
  type MultiplayerRoomMode,
  type MultiplayerSnapshot,
  type MultiplayerTimer,
  type MultiplayerTimerKind,
  type ServerMessage,
} from '../src/multiplayer/protocol'

const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CHAT_HISTORY_LIMIT = 100
export const MAX_ROOMS = 32
export const EMPTY_ROOM_RETENTION_MS = 30 * 60_000
const OPEN_LOBBY_MS = 15_000
const CUP_DRAW_MS = 5_000
const AUCTION_DECISION_MS = 10_000
const AUCTION_RESULT_MS = 2_000
const REGULAR_TURN_MS = 45_000
interface MultiplayerModeEnvironment {
  NODE_ENV?: string
  EMIFOOT_LOCAL_FAST_MODE?: string
}

export function isLocalFastMultiplayerMode(environment: MultiplayerModeEnvironment): boolean {
  return environment.NODE_ENV === 'development' && environment.EMIFOOT_LOCAL_FAST_MODE === 'true'
}

export function multiplayerMatchPacing(fastMode = isLocalFastMultiplayerMode(process.env)): { matchHalfMs: number; halfTimeMs: number } {
  return { matchHalfMs: fastMode ? 1_000 : 19_000, halfTimeMs: 15_000 }
}

const { matchHalfMs: MATCH_HALF_MS, halfTimeMs: HALF_TIME_MS } = multiplayerMatchPacing()
const STANDINGS_MS = 5_000
const SPONSORSHIP_NOTICE_MS = 8_000
const RETIREMENT_NOTICE_MS = 15_000
const ACADEMY_DECISION_MS = 60_000
const COMPETITION_RESULTS_MS = 5_000
const INJURY_NOTICE_MS = 5_000
const SEASON_END_MS = 10_000
const SPONSORSHIP_DECISION_MS = 60_000

export interface RoomConnection {
  send: (message: ServerMessage) => void
  close?: () => void
}

interface Clock {
  now: () => number
  setTimeout: (callback: () => void, delayMs: number) => unknown
  clearTimeout: (handle: unknown) => void
}

const realClock: Clock = {
  now: () => Date.now(),
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}

interface RoomPlayer {
  id: string
  reconnectToken: string
  name: string
  connected: boolean
  ready: boolean
  clubId?: string
  connection?: RoomConnection
}

interface Room {
  code: string
  mode: MultiplayerRoomMode
  status: 'waiting' | 'playing'
  revision: number
  hostId: string
  players: RoomPlayer[]
  chat: MultiplayerChatMessage[]
  timer?: MultiplayerTimer
  timerHandle?: unknown
  timerCallback?: () => void
  pausedBy?: string
  expiryHandle?: unknown
  emptySince?: number
  game?: GameState
  managers: Map<string, Manager>
  submitted: Set<string>
  auctionBids: Map<string, number | undefined>
  notice: string
}

interface Session {
  roomCode: string
  playerId: string
}

function makeReconnectToken(): string {
  return randomBytes(24).toString('base64url')
}

function makeRoomCode(): string {
  let code = ''
  for (let index = 0; index < 6; index += 1) code += ROOM_ALPHABET[secureRandomInt(ROOM_ALPHABET.length)]
  return code
}

function makeManager(name: string, clubId: string, rating: number): Manager {
  return {
    name,
    clubId,
    reputation: Math.max(25, Math.min(70, rating + 8)),
    boardConfidence: 65,
    trophies: 0,
    promotions: 0,
    dismissed: false,
    history: [],
    offers: [],
  }
}

export class RoomCoordinator {
  private readonly rooms = new Map<string, Room>()
  private readonly sessions = new Map<RoomConnection, Session>()
  private readonly clock: Clock

  constructor(clock: Clock = realClock) {
    this.clock = clock
  }

  handle(connection: RoomConnection, message: ClientMessage): void {
    if (message.type === 'ping') {
      connection.send({ type: 'pong', now: this.clock.now() })
      return
    }
    if (message.type === 'create-private') {
      this.createRoom(connection, message.name, 'private')
      return
    }
    if (message.type === 'join-private') {
      const room = this.rooms.get(message.code)
      if (!room || room.mode !== 'private') {
        this.sendError(connection, 'SALA PRIVADA NÃO ENCONTRADA.')
        return
      }
      this.joinRoom(connection, room, message.name)
      return
    }
    if (message.type === 'join-open') {
      const room = [...this.rooms.values()].find((candidate) =>
        candidate.mode === 'open'
        && candidate.status === 'waiting'
        && candidate.players.length < MAX_MULTIPLAYER_PLAYERS)
      if (room) this.joinRoom(connection, room, message.name)
      else this.createRoom(connection, message.name, 'open')
      return
    }
    if (message.type === 'resume') {
      this.resume(connection, message.code, message.token)
      return
    }

    const context = this.contextFor(connection)
    if (!context) {
      this.sendError(connection, 'LIGAÇÃO SEM SALA. ENTRE NOVAMENTE.')
      return
    }
    const { room, player } = context
    if (message.type === 'chat') {
      this.addChat(room, player, message.text)
      return
    }
    if (message.type === 'start-room' || message.type === 'pause-room' || message.type === 'unpause-room') {
      if (message.expectedRevision > room.revision) {
        this.sendError(connection, 'ESTADO DA SALA DESACTUALIZADO.', room, player)
        return
      }
      if (room.mode !== 'private' || room.hostId !== player.id) {
        this.sendError(connection, 'APENAS O CRIADOR DE UMA LIGA COM AMIGOS PODE CONTROLÁ-LA.', room, player)
        return
      }
      if (message.type === 'start-room') this.startGame(room)
      else this.setPaused(room, player, message.type === 'pause-room')
      return
    }
    if (message.type === 'action') {
      if (message.expectedRevision > room.revision) {
        this.sendError(connection, 'ESTADO DO JOGO DESACTUALIZADO.', room, player)
        return
      }
      this.handleAction(room, player, message.action)
    }
  }

  disconnect(connection: RoomConnection): void {
    const context = this.contextFor(connection)
    this.sessions.delete(connection)
    if (!context) return
    const { room, player } = context
    if (player.connection !== connection) return
    player.connection = undefined
    player.connected = false
    // A queue seat has no club yet. Release it immediately so offline people
    // cannot fill a public lobby or prevent its countdown from restarting.
    if (room.mode === 'open' && room.status === 'waiting') {
      room.players = room.players.filter((candidate) => candidate !== player)
      this.updateOpenLobby(room)
      if (room.players.length === 0) {
        this.rooms.delete(room.code)
        return
      }
    }
    if (!room.players.some((candidate) => candidate.connected)) {
      this.freezeTimer(room)
      room.emptySince = this.clock.now()
      room.expiryHandle = this.clock.setTimeout(() => {
        if (room.players.some((candidate) => candidate.connected)) return
        this.clearTimer(room)
        this.rooms.delete(room.code)
      }, EMPTY_ROOM_RETENTION_MS)
      return
    }
    this.systemChat(room, `${player.name} PERDEU A LIGAÇÃO.`)
    room.revision += 1
    this.broadcast(room)
    this.advanceWhenEveryoneReady(room)
  }

  roomCount(): number {
    return this.rooms.size
  }

  private createRoom(connection: RoomConnection, name: string, mode: MultiplayerRoomMode): void {
    if (this.sessions.has(connection)) {
      this.sendError(connection, 'ESTA LIGAÇÃO JÁ ESTÁ NUMA SALA.')
      return
    }
    if (this.rooms.size >= MAX_ROOMS) this.reclaimEmptyRoom()
    if (this.rooms.size >= MAX_ROOMS) {
      this.sendError(connection, 'SERVIDOR CHEIO. TENTE NOVAMENTE MAIS TARDE.')
      return
    }
    let code = makeRoomCode()
    while (this.rooms.has(code)) code = makeRoomCode()
    const player = this.createPlayer(connection, name)
    const room: Room = {
      code,
      mode,
      status: 'waiting',
      revision: 0,
      hostId: player.id,
      players: [player],
      chat: [],
      managers: new Map(),
      submitted: new Set(),
      auctionBids: new Map(),
      notice: mode === 'private' ? 'PARTILHE O LINK E AGUARDE OS AMIGOS.' : 'A PROCURAR OUTROS TREINADORES...',
    }
    this.rooms.set(code, room)
    this.sessions.set(connection, { roomCode: code, playerId: player.id })
    this.systemChat(room, mode === 'private' ? `${player.name} CRIOU A SALA ${code}.` : `${player.name} ENTROU NA LIGA ONLINE.`)
    this.welcome(room, player)
  }

  private joinRoom(connection: RoomConnection, room: Room, name: string): void {
    if (this.sessions.has(connection)) {
      this.sendError(connection, 'ESTA LIGAÇÃO JÁ ESTÁ NUMA SALA.')
      return
    }
    if (room.status !== 'waiting') {
      this.sendError(connection, 'A PARTIDA JÁ COMEÇOU.')
      return
    }
    if (room.players.length >= MAX_MULTIPLAYER_PLAYERS) {
      this.sendError(connection, 'A SALA JÁ TEM OITO TREINADORES.')
      return
    }
    const player = this.createPlayer(connection, name)
    room.players.push(player)
    this.wakeRoom(room)
    room.revision += 1
    this.sessions.set(connection, { roomCode: room.code, playerId: player.id })
    this.systemChat(room, `${player.name} ENTROU NA SALA.`)
    this.welcome(room, player)
    this.updateOpenLobby(room)
    this.broadcast(room)
  }

  private resume(connection: RoomConnection, code: string, token: string): void {
    if (this.sessions.has(connection)) {
      this.sendError(connection, 'ESTA LIGAÇÃO JÁ ESTÁ NUMA SALA.')
      return
    }
    const room = this.rooms.get(code)
    const player = room?.players.find((candidate) => candidate.reconnectToken === token)
    if (!room || !player) {
      connection.send({ type: 'error', code: 'resume-unavailable', message: 'ESTA LIGA EXPIROU OU NÃO ESTÁ MAIS DISPONÍVEL.' })
      return
    }
    const previousConnection = player.connection
    if (previousConnection) this.sessions.delete(previousConnection)
    player.connection = connection
    player.connected = true
    this.sessions.set(connection, { roomCode: room.code, playerId: player.id })
    previousConnection?.close?.()
    this.wakeRoom(room)
    room.revision += 1
    this.systemChat(room, `${player.name} VOLTOU À PARTIDA.`)
    this.welcome(room, player)
    this.broadcast(room)
  }

  private updateOpenLobby(room: Room): void {
    if (room.mode !== 'open' || room.status !== 'waiting') return
    const count = room.players.filter((player) => player.connected).length
    if (count < 2) {
      this.clearTimer(room)
      room.notice = 'AGUARDANDO OUTRO TREINADOR.'
    } else if (count === MAX_MULTIPLAYER_PLAYERS) this.startGame(room)
    else if (!room.timer) {
      room.notice = 'TREINADORES ENCONTRADOS. A LIGA COMEÇA EM 15 SEGUNDOS.'
      this.schedule(room, 'open-lobby', 'INÍCIO DA LIGA ONLINE', OPEN_LOBBY_MS, () => {
        if (room.status === 'waiting' && room.players.filter((player) => player.connected).length >= 2) this.startGame(room)
      })
    }
  }

  private setPaused(room: Room, player: RoomPlayer, paused: boolean): void {
    if (room.status !== 'playing') {
      this.sendErrorToPlayer(room, player, 'A LIGA AINDA NÃO COMEÇOU.')
      return
    }
    if (Boolean(room.pausedBy) === paused) return
    room.pausedBy = paused ? player.id : undefined
    if (paused) this.freezeTimer(room)
    else this.thawTimer(room)
    room.revision += 1
    this.systemChat(room, paused ? `LIGA PAUSADA POR ${player.name.toUpperCase()}.` : 'LIGA RETOMADA.')
    this.broadcast(room)
    if (!paused) this.advanceWhenEveryoneReady(room)
  }

  private wakeRoom(room: Room): void {
    if (room.expiryHandle !== undefined) this.clock.clearTimeout(room.expiryHandle)
    room.expiryHandle = undefined
    room.emptySince = undefined
    if (!room.pausedBy) this.thawTimer(room)
  }

  private reclaimEmptyRoom(): void {
    // Retention is best-effort: abandoned lobbies must not block new games.
    // Prefer an unstarted lobby, then the room that has been empty longest.
    const candidates = [...this.rooms.values()]
      .filter((room) => room.emptySince !== undefined && !room.players.some((player) => player.connected))
      .sort((left, right) => Number(right.status === 'waiting') - Number(left.status === 'waiting')
        || left.emptySince! - right.emptySince!)
    const room = candidates[0]
    if (!room) return
    if (room.expiryHandle !== undefined) this.clock.clearTimeout(room.expiryHandle)
    this.clearTimer(room)
    this.rooms.delete(room.code)
  }

  private createPlayer(connection: RoomConnection, name: string): RoomPlayer {
    return {
      id: randomUUID(),
      reconnectToken: makeReconnectToken(),
      name: name.trim(),
      connected: true,
      ready: false,
      connection,
    }
  }

  private startGame(room: Room): void {
    if (room.status !== 'waiting' || room.players.length === 0) return
    this.clearTimer(room)
    const host = room.players.find((player) => player.id === room.hostId) ?? room.players[0]
    const game = createNewCareer({ managerName: host.name })
    const fourthDivisionIds = game.clubs.filter((club) => club.division === 4).map((club) => club.id)
    const assignment = shuffle(game.rngState, fourthDivisionIds)
    game.rngState = assignment.state
    room.managers.clear()
    room.players.forEach((player, index) => {
      const clubId = assignment.value[index]
      const club = getClub(game, clubId)
      club.ticketPrice = DEFAULT_TICKET_PRICE
      player.clubId = clubId
      player.ready = false
      room.managers.set(player.id, makeManager(player.name, clubId, club.rating))
    })
    const hostManager = room.managers.get(host.id)
    if (!hostManager) throw new Error('Treinador anfitrião sem clube.')
    game.id = `room-${room.code.toLowerCase()}-${game.seed.toString(16)}`
    game.manager = structuredClone(hostManager)
    game.phase = 'manager-registration'
    const market = createMarketListings(game.rngState, game.clubs, this.managedClubIds(room), 1)
    game.market = [...market.listings, ...game.market.filter((listing) => listing.internationalPlayer)]
    game.rngState = market.rngState
    game.auctionResult = undefined
    room.game = game
    room.status = 'playing'
    room.notice = 'SORTEIO DAS EQUIPAS DA 4ª DIVISÃO EM CURSO.'
    room.revision += 1
    this.systemChat(room, 'A PARTIDA COMEÇOU. A SORTEAR AS EQUIPAS DA 4ª DIVISÃO.')
    this.enterCurrentPhase(room)
  }

  private handleAction(room: Room, player: RoomPlayer, action: MultiplayerAction): void {
    if (room.pausedBy) {
      this.sendErrorToPlayer(room, player, 'LIGA PAUSADA. AGUARDE O CRIADOR RETOMAR.')
      return
    }
    const game = room.game
    if (room.status !== 'playing' || !game || !player.clubId) {
      this.sendErrorToPlayer(room, player, 'A PARTIDA AINDA NÃO COMEÇOU.')
      return
    }
    if (action.type === 'auction-offer') {
      this.submitAuctionOffer(room, player, action.salary)
      return
    }
    if (action.type === 'sponsorship-offer') {
      const result = this.runForPlayer(room, player, (state) => acceptSponsorshipOffer(state, action.offerId))
      if (!result.ok) { this.sendErrorToPlayer(room, player, result.error); return }
      room.submitted.add(player.id)
      player.ready = true
      room.notice = `${player.name.toUpperCase()} ASSINOU O PATROCÍNIO.`
      room.revision += 1
      if (room.game?.phase !== 'sponsorship') this.enterCurrentPhase(room)
      else { this.broadcast(room); this.advanceWhenEveryoneReady(room) }
      return
    }
    if (action.type === 'academy-selection') {
      const result = this.runForPlayer(room, player, (state) => promoteAcademyPlayers(state, action.playerIds))
      if (!result.ok) { this.sendErrorToPlayer(room, player, result.error); return }
      room.submitted.add(player.id)
      player.ready = true
      room.notice = `${player.name.toUpperCase()} PROMOVEU OS JOGADORES DA BASE.`
      room.revision += 1
      if (room.game?.phase !== 'academy') this.enterCurrentPhase(room)
      else { this.broadcast(room); this.advanceWhenEveryoneReady(room) }
      return
    }
    if (action.type === 'update-club' || action.type === 'ready-round') {
      if (game.phase !== 'pre-round') {
        this.sendErrorToPlayer(room, player, 'A EQUIPA SÓ PODE SER PREPARADA ANTES DA JORNADA.')
        return
      }
      const error = this.applyClubSetup(room, player, action.setup)
      if (error) {
        this.sendErrorToPlayer(room, player, error)
        return
      }
      if (action.type === 'ready-round') {
        player.ready = true
        room.submitted.add(player.id)
        room.notice = `${player.name.toUpperCase()} ESTÁ PRONTO PARA A JORNADA.`
      }
      room.revision += 1
      this.broadcast(room)
      this.advanceWhenEveryoneReady(room)
      return
    }
    if (action.type === 'half-time-substitution') {
      if (game.phase !== 'half-time') {
        this.sendErrorToPlayer(room, player, 'AS SUBSTITUIÇÕES SÓ ABREM NO INTERVALO.')
        return
      }
      const result = this.runForPlayer(room, player, (state) => makeHalfTimeSubstitution(state, action.outId, action.inId))
      if (!result.ok) this.sendErrorToPlayer(room, player, result.error)
      else {
        room.notice = result.message ?? 'SUBSTITUIÇÃO CONFIRMADA.'
        room.revision += 1
        this.broadcast(room)
      }
      return
    }
    if (action.type === 'ready-half-time') {
      if (game.phase !== 'half-time') {
        this.sendErrorToPlayer(room, player, 'NÃO ESTAMOS NO INTERVALO.')
        return
      }
      player.ready = true
      room.submitted.add(player.id)
      room.notice = `${player.name.toUpperCase()} TERMINOU AS DECISÕES DO INTERVALO.`
      room.revision += 1
      this.broadcast(room)
      this.advanceWhenEveryoneReady(room)
      return
    }
    if (action.type === 'continue') {
      player.ready = true
      room.submitted.add(player.id)
      this.advanceWhenEveryoneReady(room)
      return
    }

    const result = this.runManagementAction(room, player, action)
    if (!result.ok) {
      this.sendErrorToPlayer(room, player, result.error)
      return
    }
    room.notice = result.message ?? 'COMANDO ACEITE.'
    room.revision += 1
    this.broadcast(room)
  }

  private runManagementAction(room: Room, player: RoomPlayer, action: Exclude<MultiplayerAction,
    { type: 'auction-offer' | 'sponsorship-offer' | 'academy-selection' | 'update-club' | 'ready-round' | 'half-time-substitution' | 'ready-half-time' | 'continue' }
  >): EngineResult {
    if (action.type === 'sell-player') return this.runForPlayer(room, player, (state) => sellPlayer(state, action.playerId, this.managedClubIds(room)))
    if (action.type === 'acknowledge-player-sale') return this.runForPlayer(room, player, acknowledgePlayerSale)
    if (action.type === 'renew-player') return this.runForPlayer(room, player, (state) => renewPlayerContract(state, action.playerId, action.salary))
    if (action.type === 'place-transfer-bid') return this.runForPlayer(room, player, (state) => placeTransferBid(state, action.listingId, action.salary))
    if (action.type === 'set-ticket-price') return this.runForPlayer(room, player, (state) => setTicketPrice(state, action.price))
    if (action.type === 'repair-stadium') return this.runForPlayer(room, player, repairStadium)
    return this.runForPlayer(room, player, (state) => expandStadium(state, action.seats))
  }

  private applyClubSetup(room: Room, player: RoomPlayer, setup: ClubSetup): string | undefined {
    const game = room.game
    if (!game || !player.clubId) return 'CLUBE NÃO ENCONTRADO.'
    const state = structuredClone(game)
    const club = getClub(state, player.clubId)
    const playerIds = new Set(club.players.map((candidate) => candidate.id))
    const chosen = [...setup.lineup, ...setup.bench]
    if (new Set(chosen).size !== chosen.length || chosen.some((id) => !playerIds.has(id))) return 'A LISTA DE JOGADORES É INVÁLIDA.'
    if (!getAvailableTactics(club).some((candidate) => candidate.id === setup.tactic)) return 'Não há jogadores disponíveis para esta tática.'
    club.tactic = setup.tactic
    club.lineup = [...setup.lineup]
    club.bench = [...setup.bench]
    const error = validateLineup(club)
    if (error) return error
    state.revision += 1
    room.game = state
    return undefined
  }

  private runForPlayer(room: Room, player: RoomPlayer, command: (state: GameState) => EngineResult): EngineResult {
    const game = room.game
    const manager = room.managers.get(player.id)
    if (!game || !manager) return { ok: false, error: 'TREINADOR NÃO ENCONTRADO.' }
    const personalized = structuredClone(game)
    personalized.manager = structuredClone(manager)
    const result = command(personalized)
    if (!result.ok) return result
    room.managers.set(player.id, structuredClone(result.state.manager))
    room.game = result.state
    this.restoreHostManager(room)
    return result
  }

  private submitAuctionOffer(room: Room, player: RoomPlayer, salary?: number): void {
    const listing = room.game?.market[0]
    if (!room.game || room.game.phase !== 'auction' || room.game.auctionResult || !listing) {
      this.sendErrorToPlayer(room, player, 'O LEILÃO NÃO ESTÁ ABERTO.')
      return
    }
    if (salary !== undefined && (salary < listing.minimumSalary || salary > 64_000)) {
      this.sendErrorToPlayer(room, player, `O ORDENADO DEVE FICAR ENTRE ${listing.minimumSalary} E 64000.`)
      return
    }
    if (salary !== undefined && player.clubId) {
      const eligibilityError = getAuctionBidEligibilityError(room.game, listing, player.clubId)
      if (eligibilityError) {
        this.sendErrorToPlayer(room, player, eligibilityError.toUpperCase())
        return
      }
    }
    room.auctionBids.set(player.id, salary === undefined ? undefined : normalizeSalaryOffer(salary))
    room.submitted.add(player.id)
    player.ready = true
    room.notice = `${player.name.toUpperCase()} ENVIOU A DECISÃO DO LEILÃO.`
    room.revision += 1
    this.broadcast(room)
    this.advanceWhenEveryoneReady(room)
  }

  private resolveAuction(room: Room): void {
    const game = room.game
    const listing = game?.market[0]
    if (!game || game.phase !== 'auction' || !listing || game.auctionResult) return
    const seller = game.clubs.find((club) => club.id === listing.sellerId)
    const player = getMarketPlayer(game, listing)
    if (!player) {
      this.finishAuction(room, { id: `transfer-${game.revision}`, success: false, text: 'A TRANSFERÊNCIA FOI CANCELADA' })
      return
    }
    const sellerCanTransfer = seller ? canLeaveClub(seller, player) : Boolean(listing.internationalPlayer)
    if (sellerCanTransfer && player.neymarAuctionPending) player.neymarAuctionPending = false
    const auction = {
      sellerId: listing.sellerId,
      playerName: player.name,
      nationality: player.nationality,
      position: player.position,
      strength: player.strength,
      fee: listing.fee,
      minimumSalary: listing.minimumSalary,
    }
    const salaryRoll = random(game.rngState)
    game.rngState = salaryRoll.state
    const aiSalary = calculateAiAuctionSalary(listing.minimumSalary, salaryRoll.value, calculatePlayerSalary(player.strength, player.age))
    const eligibleHumanBids = room.players.flatMap((candidate) => {
      const offered = room.auctionBids.get(candidate.id)
      const club = candidate.clubId ? getClub(game, candidate.clubId) : undefined
      if (offered === undefined || !club || offered < listing.minimumSalary || offered > 64_000) return []
      if (getAuctionBidEligibilityError(game, listing, club.id)) return []
      return [{ candidate, club, salary: offered }]
    }).sort((left, right) => right.salary - left.salary || room.players.indexOf(left.candidate) - room.players.indexOf(right.candidate))
    const topHuman = eligibleHumanBids[0]
    const aiCandidates = getAiAuctionCandidates(game, listing, player, aiSalary, this.managedClubIds(room))
    const humanWins = Boolean(topHuman && (aiCandidates.length === 0 || topHuman.salary >= aiSalary))
    const buyer = humanWins ? topHuman?.club : selectAiTransferBuyer(game, aiCandidates, player)
    const salary = humanWins ? topHuman!.salary : aiSalary
    let result: TransferMessage
    if (!sellerCanTransfer) {
      result = { id: `transfer-${game.revision}-${player.id}`, success: false, auction, text: 'A TRANSFERÊNCIA FOI CANCELADA POR LIMITE DE PLANTEL' }
    } else if (!buyer) {
      result = { id: `transfer-${game.revision}-${player.id}`, success: false, auction, text: `${player.name.toUpperCase()} NÃO FOI TRANSFERIDO` }
    } else if (seller && buyer.id === seller.id) {
      player.salary = salary
      setPlayerContract(player)
      player.morale = 78
      result = {
        id: `transfer-${game.revision}-${player.id}`,
        success: humanWins,
        clubId: seller.id,
        auction,
        text: `${player.name.toUpperCase()} RENOVOU COM O ${seller.name.toUpperCase()}\nNOVO ORDENADO : ${salary.toLocaleString('pt-BR')}`,
      }
    } else {
      completeAuctionTransfer(game, listing, player, buyer, salary)
      result = {
        id: `transfer-${game.revision}-${player.id}`,
        success: humanWins,
        clubId: buyer.id,
        auction,
        text: `TRANSFERIDO PARA O ${buyer.name.toUpperCase()}\nNOVO ORDENADO : ${salary.toLocaleString('pt-BR')}`,
      }
    }
    this.finishAuction(room, result)
  }

  private finishAuction(room: Room, result: TransferMessage): void {
    const game = room.game!
    game.market = game.market.slice(1)
    game.auctionResult = result
    game.revision += 1
    room.revision += 1
    room.notice = result.text.replace('\n', ' · ')
    this.schedule(room, 'auction-result', 'RESULTADO DO LEILÃO', AUCTION_RESULT_MS, () => {
      if (!room.game?.auctionResult) return
      const acknowledged = acknowledgeAuctionResult(room.game)
      if (acknowledged.ok) room.game = acknowledged.state
      room.revision += 1
      this.enterCurrentPhase(room)
    })
  }

  private enterCurrentPhase(room: Room): void {
    const phase = room.game?.phase
    this.clearTimer(room)
    room.submitted.clear()
    room.auctionBids.clear()
    for (const player of room.players) player.ready = false
    if (!room.game || !phase) return
    if ((phase === 'standings' || phase === 'competition-results') && room.game.injuryNoticePending) {
      room.notice = 'LESÕES EM EQUIPAS CONTROLADAS POR JOGADORES.'
      this.schedule(room, 'injury-notice', 'LESÕES', INJURY_NOTICE_MS, () => {
        if (!room.game?.injuryNoticePending) return
        const acknowledged = acknowledgeInjuryNotice(room.game)
        if (acknowledged.ok) room.game = acknowledged.state
        this.restoreHostManager(room)
        room.revision += 1
        this.enterCurrentPhase(room)
      })
      return
    }
    if (phase === 'manager-registration') {
      room.notice = 'SORTEIO DAS EQUIPAS DA 4ª DIVISÃO EM CURSO.'
      this.schedule(
        room,
        'club-draw',
        'SORTEIO DAS EQUIPAS',
        clubDrawDurationMs(room.players.length),
        () => this.runPhaseCommand(room, confirmManagerRegistration),
      )
      return
    }
    if (phase === 'cup-draw') {
      room.notice = 'SORTEIO DA COPA DO BRASIL EM CURSO.'
      this.schedule(room, 'cup-draw', 'SORTEIO DA COPA', CUP_DRAW_MS, () => this.runPhaseCommand(room, completeCupDraw))
      return
    }
    if (phase === 'sponsorship') {
      room.notice = 'ESCOLHA O PATROCÍNIO DA TEMPORADA. AO FIM DO PRAZO, VALE A MELHOR OFERTA SEM APOSTAS.'
      this.schedule(room, 'sponsorship', 'PATROCÍNIO', SPONSORSHIP_DECISION_MS, () => this.finishSponsorshipSelection(room))
      return
    }
    if (phase === 'retirement-notice') {
      room.notice = ''
      for (const player of room.players) {
        if (player.clubId && room.game.offseason?.retirementPendingClubIds.includes(player.clubId)) continue
        room.submitted.add(player.id)
        player.ready = true
      }
      this.schedule(room, 'retirement-notice', 'APOSENTADORIAS', RETIREMENT_NOTICE_MS, () => this.runPhaseCommand(room, acknowledgeRetirementNotice))
      this.advanceWhenEveryoneReady(room)
      return
    }
    if (phase === 'academy') {
      room.notice = ''
      for (const player of room.players) {
        if (player.clubId && room.game.offseason?.pendingAcademyClubIds?.includes(player.clubId)) continue
        room.submitted.add(player.id)
        player.ready = true
      }
      this.schedule(room, 'academy', 'PROMOÇÃO DA BASE', ACADEMY_DECISION_MS, () => this.finishAcademySelection(room))
      this.advanceWhenEveryoneReady(room)
      return
    }
    if (phase === 'auction') {
      room.notice = 'FAÇA A SUA OFERTA DE ORDENADO.'
      this.schedule(room, 'auction', 'OFERTAS POR ORDENADO', AUCTION_DECISION_MS, () => this.resolveAuction(room))
      return
    }
    if (phase === 'pre-round') {
      const competition = room.game.activeCompetition
      room.notice = competition ? `PREPARE A EQUIPA PARA ${competition.roundName}.` : 'PREPARE O PLANTEL E ESCOLHA A TÁCTICA.'
      this.schedule(room, 'regular-turn', competition ? `DECISÃO · ${competition.roundName}` : 'DECISÃO DA JORNADA', REGULAR_TURN_MS, () => this.startRound(room))
      return
    }
    if (phase === 'first-half') {
      room.notice = 'PRIMEIRA PARTE EM CURSO.'
      this.schedule(room, 'first-half', 'PRIMEIRA PARTE', MATCH_HALF_MS, () => this.runPhaseCommand(room, reachHalfTime))
      return
    }
    if (phase === 'half-time') {
      room.notice = 'ESCOLHA SUBSTITUIÇÕES OU TERMINE O INTERVALO.'
      this.schedule(room, 'half-time', 'DECISÕES DO INTERVALO', HALF_TIME_MS, () => this.finishRound(room))
      return
    }
    if (phase === 'second-half') {
      room.notice = 'SEGUNDA PARTE EM CURSO.'
      this.schedule(room, 'second-half', 'SEGUNDA PARTE', MATCH_HALF_MS, () => this.runPhaseCommand(room, showStandings))
      return
    }
    if (phase === 'standings') {
      room.notice = 'CLASSIFICAÇÃO ACTUALIZADA.'
      this.schedule(room, 'standings', 'CLASSIFICAÇÃO', STANDINGS_MS, () => this.advanceAfterStandings(room))
      return
    }
    if (phase === 'sponsorship-notice') {
      room.notice = ''
      for (const player of room.players) {
        if (!player.clubId || bettingRegulationNotice(room.game, player.clubId)) continue
        room.submitted.add(player.id)
        player.ready = true
      }
      this.schedule(room, 'sponsorship-notice', 'PATROCÍNIO', SPONSORSHIP_NOTICE_MS, () => this.advanceAfterStandings(room))
      this.advanceWhenEveryoneReady(room)
      return
    }
    if (phase === 'competition-results') {
      room.notice = `${room.game.activeCompetition?.roundName ?? 'COMPETIÇÃO'} CONCLUÍDA.`
      this.schedule(room, 'competition-results', 'RESULTADOS DA COMPETIÇÃO', COMPETITION_RESULTS_MS, () => this.advanceAfterCompetitionResults(room))
      return
    }
    if (phase === 'season-end') {
      room.notice = `TEMPORADA ${room.game.season} TERMINADA. A PRÓXIMA COMEÇA EM 10 SEGUNDOS.`
      this.systemChat(room, room.notice)
      room.revision += 1
      this.schedule(room, 'season-end', 'NOVA TEMPORADA', SEASON_END_MS, () => this.startNextMultiplayerSeason(room))
    }
  }

  private advanceWhenEveryoneReady(room: Room): void {
    if (room.pausedBy) return
    const activePlayers = room.players.filter((player) => player.connected)
    if (activePlayers.length === 0 || !activePlayers.every((player) => room.submitted.has(player.id))) return
    if (room.game?.phase === 'auction') this.resolveAuction(room)
    else if (room.game?.phase === 'sponsorship') this.finishSponsorshipSelection(room)
    else if (room.game?.phase === 'retirement-notice') this.runPhaseCommand(room, acknowledgeRetirementNotice)
    else if (room.game?.phase === 'academy') this.finishAcademySelection(room)
    else if (room.game?.phase === 'pre-round') this.startRound(room)
    else if (room.game?.phase === 'half-time') this.finishRound(room)
    else if (room.game?.phase === 'standings' || room.game?.phase === 'sponsorship-notice') this.advanceAfterStandings(room)
    else if (room.game?.phase === 'competition-results') this.advanceAfterCompetitionResults(room)
    else if (room.game?.phase === 'season-end') this.startNextMultiplayerSeason(room)
  }

  private startRound(room: Room): void {
    if (room.game?.phase !== 'pre-round') return
    for (const player of room.players) {
      if (player.connected || !player.clubId) continue
      const club = getClub(room.game, player.clubId)
      if (validateLineup(club)) Object.assign(club, autoPickLineup(club))
    }
    const result = startRoundForManagedClubs(room.game, this.managedClubIds(room))
    if (!result.ok) {
      room.notice = result.error
      this.broadcast(room)
      return
    }
    room.game = result.state
    this.restoreHostManager(room)
    room.revision += 1
    this.enterCurrentPhase(room)
  }

  private finishRound(room: Room): void {
    if (room.game?.phase !== 'half-time') return
    const offlineSetups = room.players.flatMap((player) => {
      if (player.connected || !player.clubId) return []
      const club = getClub(room.game!, player.clubId)
      return [{ clubId: club.id, lineup: [...club.lineup], bench: [...club.bench] }]
    })
    const result = finishRoundForManagedClubs(room.game, this.managedClubIds(room))
    if (!result.ok) {
      room.notice = result.error
      this.broadcast(room)
      return
    }
    room.game = result.state
    for (const setup of offlineSetups) {
      const club = getClub(room.game, setup.clubId)
      // Keep the absent manager's choices unless injuries/suspensions require
      // the engine's automatic replacement lineup.
      if (!validateLineup({ ...club, lineup: setup.lineup })) {
        club.lineup = setup.lineup
        club.bench = setup.bench.filter((id) => club.players.some((player) => player.id === id && !player.injuryRounds && !player.suspensionRounds))
      }
    }
    this.restoreHostManager(room)
    room.revision += 1
    this.enterCurrentPhase(room)
  }

  private advanceAfterStandings(room: Room): void {
    if (!room.game || (room.game.phase !== 'standings' && room.game.phase !== 'sponsorship-notice')) return
    const result = room.game.phase === 'sponsorship-notice'
      ? acknowledgeSponsorshipNotice(room.game, this.managedClubIds(room))
      : advanceAfterStandingsForManagedClubs(room.game, this.managedClubIds(room))
    if (!result.ok) return
    room.game = result.state
    if (room.game.phase === 'auction') {
      room.game.market = room.game.market.filter((listing) => {
        if (listing.internationalPlayer) return true
        const seller = getClub(room.game!, listing.sellerId)
        const player = seller.players.find((candidate) => candidate.id === listing.playerId)
        return !this.managedClubIds(room).includes(seller.id) || (player ? !isSaleProtected(player) && player.listed : false)
      })
      if (room.game.market.length === 0) room.game.phase = 'pre-round'
    }
    this.restoreHostManager(room)
    room.revision += 1
    this.enterCurrentPhase(room)
  }

  private advanceAfterCompetitionResults(room: Room): void {
    if (room.game?.phase !== 'competition-results') return
    const result = advanceAfterCompetitionResultsForManagedClubs(room.game, this.managedClubIds(room))
    if (!result.ok) return
    room.game = result.state
    this.restoreHostManager(room)
    room.revision += 1
    this.enterCurrentPhase(room)
  }

  private startNextMultiplayerSeason(room: Room): void {
    if (room.game?.phase !== 'season-end') return
    room.game.manager.dismissed = false
    room.game.manager.offers = []
    const result = startNextSeason(room.game, this.managedClubIds(room))
    if (!result.ok) {
      room.notice = result.error
      this.broadcast(room)
      return
    }
    room.game = result.state
    room.game.market = room.game.market.filter((listing) => {
      if (listing.internationalPlayer) return true
      const seller = getClub(room.game!, listing.sellerId)
      const player = seller.players.find((candidate) => candidate.id === listing.playerId)
      return !this.managedClubIds(room).includes(seller.id) || (player ? !isSaleProtected(player) && player.listed : false)
    })
    for (const manager of room.managers.values()) {
      manager.dismissed = false
      manager.offers = []
      manager.boardConfidence = Math.max(35, Math.min(80, manager.boardConfidence + 12))
    }
    this.restoreHostManager(room)
    room.revision += 1
    this.enterCurrentPhase(room)
  }

  private finishSponsorshipSelection(room: Room): void {
    if (room.game?.phase !== 'sponsorship') return
    for (const player of room.players) {
      if (!player.clubId || !room.game.sponsorship?.pendingClubIds.includes(player.clubId)) continue
      const proposal = getAvailableSponsorshipProposal(room.game, player.clubId)
      if (!proposal) continue
      const result = this.runForPlayer(room, player, (state) => acceptSponsorshipOffer(state, bestSafeSponsorship(proposal).id))
      if (!result.ok) { room.notice = result.error; this.broadcast(room); return }
    }
    room.revision += 1
    this.enterCurrentPhase(room)
  }

  private finishAcademySelection(room: Room): void {
    if (room.game?.phase !== 'academy') return
    for (const player of room.players) {
      if (!player.clubId || !room.game.offseason?.pendingAcademyClubIds?.includes(player.clubId)) continue
      const plan = room.game.offseason.plans[player.clubId]
      const result = this.runForPlayer(room, player, (state) => promoteAcademyPlayers(state, automaticAcademySelection(plan)))
      if (!result.ok) { room.notice = result.error; this.broadcast(room); return }
    }
    room.revision += 1
    this.enterCurrentPhase(room)
  }

  private runPhaseCommand(room: Room, command: (state: GameState) => EngineResult): void {
    if (!room.game) return
    const result = command(room.game)
    if (!result.ok) return
    room.game = result.state
    this.restoreHostManager(room)
    room.revision += 1
    this.enterCurrentPhase(room)
  }

  private schedule(
    room: Room,
    kind: MultiplayerTimerKind,
    label: string,
    durationMs: number,
    callback: () => void,
  ): void {
    this.clearTimer(room)
    room.timer = { kind, label, durationMs, endsAt: this.clock.now() + durationMs }
    room.timerCallback = callback
    this.armTimer(room, durationMs)
    this.broadcast(room)
  }

  private armTimer(room: Room, delayMs: number): void {
    room.timerHandle = this.clock.setTimeout(() => {
      if (this.rooms.get(room.code) !== room || room.pausedBy || !room.players.some((player) => player.connected)) return
      const callback = room.timerCallback
      room.timerHandle = undefined
      room.timer = undefined
      room.timerCallback = undefined
      callback?.()
    }, delayMs)
  }

  private freezeTimer(room: Room): void {
    if (!room.timer || room.timer.remainingMs !== undefined) return
    room.timer.remainingMs = Math.max(0, room.timer.endsAt - this.clock.now())
    if (room.timerHandle !== undefined) this.clock.clearTimeout(room.timerHandle)
    room.timerHandle = undefined
  }

  private thawTimer(room: Room): void {
    if (!room.timer || room.timer.remainingMs === undefined || room.pausedBy) return
    const remaining = room.timer.remainingMs
    room.timer.endsAt = this.clock.now() + remaining
    room.timer.remainingMs = undefined
    this.armTimer(room, remaining)
  }

  private clearTimer(room: Room): void {
    if (room.timerHandle !== undefined) this.clock.clearTimeout(room.timerHandle)
    room.timerHandle = undefined
    room.timer = undefined
    room.timerCallback = undefined
  }

  private restoreHostManager(room: Room): void {
    if (!room.game) return
    const hostManager = room.managers.get(room.hostId) ?? room.managers.values().next().value
    if (hostManager) room.game.manager = structuredClone(hostManager)
  }

  private managedClubIds(room: Room): string[] {
    return room.players.flatMap((player) => player.clubId ? [player.clubId] : [])
  }

  private contextFor(connection: RoomConnection): { room: Room; player: RoomPlayer } | undefined {
    const session = this.sessions.get(connection)
    const room = session ? this.rooms.get(session.roomCode) : undefined
    const player = room?.players.find((candidate) => candidate.id === session?.playerId)
    return room && player?.connected && player.connection === connection ? { room, player } : undefined
  }

  private snapshotFor(room: Room, recipient: RoomPlayer): MultiplayerSnapshot {
    let game: GameState | undefined
    if (room.game) {
      game = structuredClone(room.game)
      const manager = room.managers.get(recipient.id)
      if (manager) game.manager = structuredClone(manager)
      if (game.pendingMatchDay && recipient.clubId) {
        game.pendingMatchDay.substitutionsUsed = game.pendingMatchDay.substitutionsByClub?.[recipient.clubId] ?? 0
      }
    }
    const showClubNames = room.game?.phase !== 'manager-registration'
    return {
      code: room.code,
      mode: room.mode,
      status: room.status,
      revision: room.revision,
      hostId: room.mode === 'private' ? room.hostId : undefined,
      pause: room.pausedBy ? { playerId: room.pausedBy, name: room.players.find((player) => player.id === room.pausedBy)!.name } : undefined,
      players: room.players.map((player) => {
        const club = showClubNames && player.clubId && room.game ? getClub(room.game, player.clubId) : undefined
        return {
          id: player.id,
          name: player.name,
          clubId: player.clubId,
          clubName: club?.name,
          clubPrimary: club?.primary,
          clubSecondary: club?.secondary,
          connected: player.connected,
          ready: player.ready,
          isHost: room.mode === 'private' && player.id === room.hostId,
        }
      }),
      chat: room.chat.slice(-CHAT_HISTORY_LIMIT),
      timer: room.timer ? { ...room.timer } : undefined,
      game,
      submittedPlayerIds: [...room.submitted],
      notice: room.notice,
    }
  }

  private welcome(room: Room, player: RoomPlayer): void {
    player.connection?.send({
      type: 'welcome',
      playerId: player.id,
      reconnectToken: player.reconnectToken,
      snapshot: this.snapshotFor(room, player),
    })
  }

  private broadcast(room: Room): void {
    for (const player of room.players) {
      if (player.connected && player.connection) {
        player.connection.send({ type: 'snapshot', snapshot: this.snapshotFor(room, player) })
      }
    }
  }

  private sendError(connection: RoomConnection, message: string, room?: Room, player?: RoomPlayer): void {
    connection.send({ type: 'error', message, snapshot: room && player ? this.snapshotFor(room, player) : undefined })
  }

  private sendErrorToPlayer(room: Room, player: RoomPlayer, message: string): void {
    if (player.connection) this.sendError(player.connection, message, room, player)
  }

  private addChat(room: Room, player: RoomPlayer, text: string): void {
    room.chat.push({
      id: randomUUID(),
      playerId: player.id,
      author: player.name,
      text: text.trim(),
      sentAt: this.clock.now(),
    })
    room.chat = room.chat.slice(-CHAT_HISTORY_LIMIT)
    this.broadcast(room)
  }

  private systemChat(room: Room, text: string): void {
    room.chat.push({
      id: randomUUID(),
      author: 'EMIFOOT',
      text,
      sentAt: this.clock.now(),
      system: true,
    })
    room.chat = room.chat.slice(-CHAT_HISTORY_LIMIT)
  }
}
