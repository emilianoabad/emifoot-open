import { useEffect, useState } from 'react'
import type { MultiplayerTimer } from './protocol'

/** Presentation follows the authoritative phase clock, including pause/resume. */
export function useTimerElapsed(timer?: MultiplayerTimer): number | undefined {
  const [now, setNow] = useState(Date.now)
  const endsAt = timer?.endsAt
  const remainingMs = timer?.remainingMs
  useEffect(() => {
    if (endsAt === undefined || remainingMs !== undefined) return
    const interval = window.setInterval(() => setNow(Date.now()), 100)
    return () => window.clearInterval(interval)
  }, [endsAt, remainingMs])
  if (!timer) return undefined
  const remaining = timer.remainingMs ?? Math.max(0, timer.endsAt - now)
  return Math.max(0, Math.min(timer.durationMs, timer.durationMs - remaining))
}
