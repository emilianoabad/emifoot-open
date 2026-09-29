import { z } from 'zod'
import type { GameState } from '../game/types'

export const MAX_MULTIPLAYER_PLAYERS = 8
const MIN_MANAGER_NAME_LENGTH = 1
const MAX_MANAGER_NAME_LENGTH = 18
export const MAX_CHAT_LENGTH = 180
export const CLUB_DRAW_PLAYER_MS = 1_500
const CLUB_DRAW_HOLD_MS = 3_000

export function clubDrawDurationMs(playerCount: number): number {
  const normalizedCount = Math.max(0, Math.min(MAX_MULTIPLAYER_PLAYERS, Math.floor(playerCount)))
  return normalizedCount * CLUB_DRAW_PLAYER_MS + CLUB_DRAW_HOLD_MS
}

export type MultiplayerRoomMode = 'private' | 'open'
export type MultiplayerRoomStatus = 'waiting' | 'playing'
export type MultiplayerTimerKind =
  | 'open-lobby'
  | 'club-draw'
  | 'cup-draw'
  | 'auction'
  | 'auction-result'
  | 'regular-turn'
  | 'first-half'
  | 'half-time'
  | 'second-half'
  | 'injury-notice'
  | 'standings'
  | 'sponsorship-notice'
  | 'competition-results'
  | 'season-end'
  | 'sponsorship'
  | 'retirement-notice'
  | 'academy'

export interface MultiplayerPlayerView {
  id: string
  name: string
  clubId?: string
  clubName?: string
  clubPrimary?: string
  clubSecondary?: string
  connected: boolean
  ready: boolean
  isHost: boolean
}

export interface MultiplayerChatMessage {
  id: string
  playerId?: string
  author: string
  text: string
  sentAt: number
  system?: boolean
}

export interface MultiplayerTimer {
  kind: MultiplayerTimerKind
  label: string
  endsAt: number
  durationMs: number
  remainingMs?: number
}

export interface MultiplayerSnapshot {
  code: string
  mode: MultiplayerRoomMode
  status: MultiplayerRoomStatus
  revision: number
  hostId?: string
  pause?: { playerId: string; name: string }
  players: MultiplayerPlayerView[]
  chat: MultiplayerChatMessage[]
  timer?: MultiplayerTimer
  game?: GameState
  submittedPlayerIds: string[]
  notice: string
}

const managerNameSchema = z.string().trim().min(MIN_MANAGER_NAME_LENGTH).max(MAX_MANAGER_NAME_LENGTH)
const roomCodeSchema = z.string().trim().toUpperCase().regex(/^[A-Z2-9]{6}$/)
const reconnectTokenSchema = z.string().min(20).max(200)
const tacticSchema = z.enum(['3-4-3', '4-3-3', '4-4-2', '4-5-1', '5-2-3', '5-3-2', '5-4-1', '5-5-0', '6-3-1', '6-4-0'])

const clubSetupSchema = z.object({
  tactic: tacticSchema,
  lineup: z.array(z.string()).length(11),
  bench: z.array(z.string()).max(13),
})

const multiplayerActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('academy-selection'), playerIds: z.array(z.string().min(1).max(160)).min(1).max(24) }),
  z.object({ type: z.literal('sponsorship-offer'), offerId: z.string().min(1).max(100) }),
  z.object({ type: z.literal('auction-offer'), salary: z.number().int().min(0).max(64_000).optional() }),
  z.object({ type: z.literal('update-club'), setup: clubSetupSchema }),
  z.object({ type: z.literal('ready-round'), setup: clubSetupSchema }),
  z.object({ type: z.literal('half-time-substitution'), outId: z.string(), inId: z.string() }),
  z.object({ type: z.literal('ready-half-time') }),
  z.object({ type: z.literal('sell-player'), playerId: z.string() }),
  z.object({ type: z.literal('acknowledge-player-sale') }),
  z.object({ type: z.literal('renew-player'), playerId: z.string(), salary: z.number().int().min(0).max(64_000) }),
  z.object({ type: z.literal('place-transfer-bid'), listingId: z.string(), salary: z.number().int().min(0).max(64_000) }),
  z.object({ type: z.literal('set-ticket-price'), price: z.number().int().min(5).max(100) }),
  z.object({ type: z.literal('repair-stadium') }),
  z.object({ type: z.literal('expand-stadium'), seats: z.union([z.literal(1000), z.literal(5000)]) }),
  z.object({ type: z.literal('continue') }),
])

export type MultiplayerAction = z.infer<typeof multiplayerActionSchema>
export type ClubSetup = Extract<MultiplayerAction, { type: 'ready-round' }>['setup']

export const clientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('create-private'), name: managerNameSchema }),
  z.object({ type: z.literal('join-private'), code: roomCodeSchema, name: managerNameSchema }),
  z.object({ type: z.literal('join-open'), name: managerNameSchema }),
  z.object({ type: z.literal('resume'), code: roomCodeSchema, token: reconnectTokenSchema }),
  z.object({ type: z.literal('start-room'), expectedRevision: z.number().int().min(0) }),
  z.object({ type: z.literal('pause-room'), expectedRevision: z.number().int().min(0) }),
  z.object({ type: z.literal('unpause-room'), expectedRevision: z.number().int().min(0) }),
  z.object({ type: z.literal('chat'), text: z.string().trim().min(1).max(MAX_CHAT_LENGTH) }),
  z.object({
    type: z.literal('action'),
    expectedRevision: z.number().int().min(0),
    action: multiplayerActionSchema,
  }),
  z.object({ type: z.literal('ping') }),
])

export type ClientMessage = z.infer<typeof clientMessageSchema>

export type ServerMessage =
  | { type: 'welcome'; playerId: string; reconnectToken: string; snapshot: MultiplayerSnapshot }
  | { type: 'snapshot'; snapshot: MultiplayerSnapshot }
  | { type: 'error'; message: string; code?: 'resume-unavailable'; snapshot?: MultiplayerSnapshot }
  | { type: 'pong'; now: number }
