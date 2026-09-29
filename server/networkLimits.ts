import type { IncomingMessage } from 'node:http'
import { isIP } from 'node:net'

// Only a loopback reverse proxy may supply X-Real-IP. It must overwrite the
// header with a verified client address, never a client-provided forwarding chain.
export function clientAddress(request: IncomingMessage): string {
  const peer = request.socket.remoteAddress ?? 'unknown'
  const forwarded = request.headers['x-real-ip']
  const loopback = peer === '127.0.0.1' || peer === '::1' || peer === '::ffff:127.0.0.1'
  return loopback && typeof forwarded === 'string' && isIP(forwarded) ? forwarded : peer
}

export class UpgradeLimiter {
  private readonly buckets = new Map<string, { count: number; expires: number }>()
  private nextSweep = 0

  allow(key: string, now = Date.now()): boolean {
    if (now >= this.nextSweep) {
      for (const [address, bucket] of this.buckets) {
        if (bucket.expires <= now) this.buckets.delete(address)
      }
      this.nextSweep = now + 60_000
    }
    let bucket = this.buckets.get(key)
    if (bucket && bucket.expires <= now) {
      this.buckets.delete(key)
      bucket = undefined
    }
    if (!bucket) {
      if (this.buckets.size >= 4096) return false
      bucket = { count: 0, expires: now + 60_000 }
      this.buckets.set(key, bucket)
    }
    if (bucket.count >= 30) return false
    bucket.count += 1
    return true
  }
}

export function messageBudget(now = Date.now()): (at?: number) => boolean {
  let tokens = 20
  let updated = now
  return (at = Date.now()) => {
    tokens = Math.min(20, tokens + Math.max(0, at - updated) / 200)
    updated = at
    if (tokens < 1) return false
    tokens -= 1
    return true
  }
}
