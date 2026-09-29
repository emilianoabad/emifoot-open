import type { Player } from './types'

export function isNeymarEasterEgg(player: Player): boolean {
  return player.sourceId === 'espn-132948'
}
