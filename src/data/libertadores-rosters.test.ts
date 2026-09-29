import { describe, expect, it } from 'vitest'
import { LIBERTADORES_ROSTER_SNAPSHOT_ID, RAW_LIBERTADORES_ROSTERS } from './libertadores-rosters.generated'

describe('current Libertadores invited-club roster snapshot', () => {
  it('contains 12 unique invited clubs with current, viable 18-player squads', () => {
    expect(LIBERTADORES_ROSTER_SNAPSHOT_ID).toBe('CONMEBOL-2026-09-01')
    expect(RAW_LIBERTADORES_ROSTERS).toHaveLength(12)
    expect(new Set(RAW_LIBERTADORES_ROSTERS.map((club) => club.id))).toHaveProperty('size', 12)
    for (const club of RAW_LIBERTADORES_ROSTERS) {
      expect(club.players, club.id).toHaveLength(18)
      expect(new Set(club.players.map((player) => player.sourceId)).size, club.id).toBe(18)
      expect(club.players.filter((player) => player.position === 'G').length, club.id).toBeGreaterThanOrEqual(1)
      expect(club.players.filter((player) => player.position === 'D').length, club.id).toBeGreaterThanOrEqual(3)
      expect(club.players.filter((player) => player.position === 'M').length, club.id).toBeGreaterThanOrEqual(2)
      expect(club.players.every((player) => player.name.length > 1 && player.age >= 15), club.id).toBe(true)
      expect(club.source).toContain('ESPN')
    }
  })
})
