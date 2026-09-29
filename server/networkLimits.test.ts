import type { IncomingMessage } from 'node:http'
import { describe, expect, it } from 'vitest'
import { clientAddress, messageBudget, UpgradeLimiter } from './networkLimits'

describe('multiplayer transport limits', () => {
  it('allows normal bursts, rejects floods, and refills the message budget', () => {
    const allow = messageBudget(0)
    for (let i = 0; i < 20; i += 1) expect(allow(0)).toBe(true)
    for (let i = 0; i < 1000; i += 1) expect(allow(0)).toBe(false)
    expect(allow(200)).toBe(true)
    expect(allow(200)).toBe(false)
    expect(allow(10_000)).toBe(true)
  })
  it('bounds upgrade attempts and tracked identities and reclaims expired capacity', () => {
    const limiter = new UpgradeLimiter()
    for (let i = 0; i < 30; i += 1) expect(limiter.allow('a', 0)).toBe(true)
    for (let i = 0; i < 1000; i += 1) expect(limiter.allow('a', 0)).toBe(false)
    for (let i = 0; i < 4095; i += 1) expect(limiter.allow(String(i), 0)).toBe(true)
    expect(limiter.allow('extra', 0)).toBe(false)
    expect(limiter.allow('extra', 60_000)).toBe(true)
  })
  it('trusts only a valid visitor address forwarded by loopback', () => {
    const request = (peer: string, value: string) => ({ socket: { remoteAddress: peer }, headers: { 'x-real-ip': value } }) as unknown as IncomingMessage
    expect(clientAddress(request('203.0.113.1', '192.0.2.1'))).toBe('203.0.113.1')
    expect(clientAddress(request('127.0.0.1', '192.0.2.1'))).toBe('192.0.2.1')
    expect(clientAddress(request('127.0.0.1', '192.0.2.1, 192.0.2.2'))).toBe('127.0.0.1')
  })
})
