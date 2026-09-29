import { z } from 'zod'
import type { MultiplayerSnapshot } from './protocol'

const STORAGE_KEY = 'emifoot:leagues:v1'
const NAME_KEY = 'emifoot:manager-name'
const leagueSchema = z.object({
  code: z.string().regex(/^[A-Z2-9]{6}$/),
  token: z.string().min(20).max(200),
  name: z.string().max(18),
  clubName: z.string().optional(),
  mode: z.enum(['private', 'open']),
  status: z.enum(['waiting', 'playing']),
})
export type SavedLeague = z.infer<typeof leagueSchema>

export function readSavedLeagues(): SavedLeague[] {
  try {
    const parsed = z.array(leagueSchema).safeParse(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'))
    return parsed.success ? parsed.data : []
  } catch {
    return []
  }
}

export function readLeagueCredentials(code: string): { code: string; token: string } | undefined {
  const normalized = code.toUpperCase()
  const saved = readSavedLeagues().find((league) => league.code === normalized)
  if (saved) return saved
  // Migrate the previous tab-only session on its first successful reconnect.
  try {
    const parsed = leagueSchema.pick({ code: true, token: true }).safeParse(
      JSON.parse(sessionStorage.getItem(`emifoot:multiplayer:${normalized}`) ?? 'null'),
    )
    return parsed.success && parsed.data.code === normalized ? parsed.data : undefined
  } catch {
    return undefined
  }
}

export function rememberLeague(snapshot: MultiplayerSnapshot, playerId: string, token: string): void {
  const player = snapshot.players.find((candidate) => candidate.id === playerId)
  if (!player) return
  const league: SavedLeague = {
    code: snapshot.code, token, name: player.name, clubName: player.clubName,
    mode: snapshot.mode, status: snapshot.status,
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([league, ...readSavedLeagues().filter((item) => item.code !== league.code)]))
  } catch {
    // Storage may be unavailable; live play and in-memory reconnect still work.
  }
}

export function forgetLeague(code: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(readSavedLeagues().filter((item) => item.code !== code)))
    sessionStorage.removeItem(`emifoot:multiplayer:${code}`)
  } catch { /* Storage is optional. */ }
}

export function readManagerName(): string {
  try { return localStorage.getItem(NAME_KEY) ?? sessionStorage.getItem(NAME_KEY) ?? '' } catch { return '' }
}

export function rememberManagerName(name: string): void {
  try { localStorage.setItem(NAME_KEY, name) } catch { /* Storage is optional. */ }
}
