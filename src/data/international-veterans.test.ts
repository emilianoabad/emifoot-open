import { describe, expect, it } from 'vitest'
import { REAL_VETERANS } from './international-veterans'
import { RAW_LIBERTADORES_ROSTERS } from './libertadores-rosters.generated'
import { RAW_CLUBS } from './rosters.generated'

function normalizedName(name: string): string {
  return name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function abbreviatedName(name: string): string | undefined {
  const parts = normalizedName(name).split(' ')
  return parts.length > 1 ? `${parts[0][0]} ${parts.slice(1).join(' ')}` : undefined
}

describe('real international veteran identity pool', () => {
  it('has unique real identities with valid age, role, nationality and gameplay strength data', () => {
    expect(REAL_VETERANS.length).toBeGreaterThanOrEqual(60)
    expect(REAL_VETERANS.length).toBeLessThanOrEqual(90)
    expect(new Set(REAL_VETERANS.map((player) => player.id)).size).toBe(REAL_VETERANS.length)
    expect(new Set(REAL_VETERANS.map((player) => normalizedName(player.name))).size).toBe(REAL_VETERANS.length)
    for (const player of REAL_VETERANS) {
      expect(player.id).toMatch(/^[a-z]+(?:-[a-z]+)*-\d{4}$/)
      expect(player.name.length).toBeGreaterThan(2)
      expect(player.id.endsWith(String(player.birthYear))).toBe(true)
      expect(player.birthYear).toBeGreaterThanOrEqual(1988)
      expect(player.birthYear).toBeLessThanOrEqual(2007)
      expect(player.nationality).toMatch(/^[A-Z]{3}$/)
      expect(['G', 'D', 'M', 'A']).toContain(player.position)
      expect(Number.isInteger(player.strength)).toBe(true)
      expect(player.strength).toBeGreaterThanOrEqual(35)
      expect(player.strength).toBeLessThanOrEqual(48)
    }
  })

  it('excludes bundled domestic and invited players, including accented or initial-name variants', () => {
    const existing = [...RAW_CLUBS, ...RAW_LIBERTADORES_ROSTERS].flatMap<{ name: string; sourceId: string }>((club) => club.players)
    // Resolve identity aliases rather than treating a short display name as a different person.
    const aliases: Record<string, string[]> = {
      'espn-347456': ['Kaio César', 'Kaio César Andrade Lima'],
      'espn-306764': ['Danilo dos Santos Oliveira'],
    }
    const names = new Set(existing.flatMap((player) => [player.name, ...(aliases[player.sourceId] ?? [])]).map(normalizedName))
    const abbreviations = new Set(existing.map((player) => abbreviatedName(player.name)).filter(Boolean))
    for (const player of REAL_VETERANS) {
      expect(names.has(normalizedName(player.name)), player.name).toBe(false)
      const abbreviation = abbreviatedName(player.name)
      if (abbreviation) expect(abbreviations.has(abbreviation), player.name).toBe(false)
    }
  })

  it('excludes Brazil-based returnees even when absent from the bundled 18-player squads', () => {
    // CBF registration and the 2026 Coritiba squad confirm these current domestic identities:
    // https://www.cbf.com.br/futebol-brasileiro/atletas/campeonato-brasileiro/serie-a/2026/628499
    // https://www.cbf.com.br/futebol-brasileiro/atletas/campeonato-brasileiro/sub-17/2026/883905
    // https://ge.globo.com/pr/futebol/times/coritiba/noticia/2026/07/25/coritiba-rodrigo-rodrigues-volta-a-ser-relacionado-apos-oito-meses.ghtml
    const excludedIdentities = new Set(['memphis-depay-1994', 'kaio-cesar-2004', 'rodrigo-rodrigues-1996'])
    expect(REAL_VETERANS.filter((player) => excludedIdentities.has(player.id))).toEqual([])
    // Namesakes retain their separate identities, with births/roles from the FIFA source.
    expect(REAL_VETERANS.find((player) => player.id === 'alisson-becker-1992')).toMatchObject({ position: 'G' })
    expect(REAL_VETERANS.find((player) => player.id === 'fabinho-tavares-1993')).toMatchObject({ position: 'M' })
    expect(REAL_VETERANS.find((player) => player.id === 'danilo-boza-1998')).toMatchObject({ position: 'D' })
    expect(REAL_VETERANS.find((player) => player.id === 'luis-henrique-2001')).toMatchObject({ position: 'A' })
  })

  it('keeps Brazilian returns more common and real players available throughout the first 15 seasons', () => {
    expect(REAL_VETERANS.filter((player) => player.nationality === 'BRA').length / REAL_VETERANS.length).toBeGreaterThan(0.6)
    for (let season = 2026; season <= 2041; season++) {
      const eligible = REAL_VETERANS.filter((player) => season - player.birthYear >= 31 && season - player.birthYear <= 38)
      expect(eligible.length, String(season)).toBeGreaterThanOrEqual(8)
      expect(eligible.some((player) => player.nationality === 'BRA'), String(season)).toBe(true)
    }
    expect(REAL_VETERANS.find((player) => player.name === 'Gabriel Jesus')?.birthYear).toBe(1997)
    expect(REAL_VETERANS.find((player) => player.name === 'Estêvão Willian')?.birthYear).toBe(2007)
  })
})
