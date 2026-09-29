import { describe, expect, it } from 'vitest'
import { siteConfig } from './site.ts'

describe('installation URLs', () => {
  it('defaults to a portable root installation without a hard-coded domain', () => {
    expect(siteConfig({})).toEqual({ base: '/', publicUrl: undefined })
  })

  it('derives a subpath from the public URL and normalizes its trailing slash', () => {
    expect(siteConfig({ EMIFOOT_PUBLIC_URL: 'https://games.example.com/football' })).toEqual({
      base: '/football/', publicUrl: 'https://games.example.com/football/',
    })
    expect(siteConfig({ EMIFOOT_BASE_PATH: '/games/football/' }).base).toBe('/games/football/')
  })

  it.each(['//example.com/', '/a b/', '/x?secret=1', '/a/../b', '/x"'])('rejects unsafe base path %s', (path) => {
    expect(() => siteConfig({ EMIFOOT_BASE_PATH: path })).toThrow()
  })

  it.each(['file:///game', 'https://user:password@example.com', 'https://example.com/?key=secret', 'https://example.com/#game'])('rejects invalid public URL %s', (url) => {
    expect(() => siteConfig({ EMIFOOT_PUBLIC_URL: url })).toThrow()
  })
})
