import { describe, expect, it } from 'vitest'
import { serverConfig } from './config'

describe('server configuration', () => {
  it('supports root and prefixed installations with an ephemeral test port', () => {
    expect(serverConfig({})).toEqual({ host: '127.0.0.1', port: 8789, basePath: '/' })
    expect(serverConfig({ PORT: '0', EMIFOOT_BASE_PATH: '/games/football/' }).port).toBe(0)
  })
  it.each(['invalid', '-1', '65536', '2.5'])('rejects invalid port %s', (port) => {
    expect(() => serverConfig({ PORT: port })).toThrow('PORT')
  })
  it.each(['relative', '//elsewhere/', '/missing-trailing-slash', '/a/../b/'])('rejects invalid base path %s', (path) => {
    expect(() => serverConfig({ EMIFOOT_BASE_PATH: path })).toThrow('EMIFOOT_BASE_PATH')
  })
})
