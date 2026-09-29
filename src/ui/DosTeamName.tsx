import type { CSSProperties } from 'react'
import type { Club } from '../game'

export function DosTeamName({ club, className = '' }: { club: Club; className?: string }) {
  const style = { '--team-bg': club.primary, '--team-fg': club.secondary } as CSSProperties
  return <span className={`dos-team-name ${className}`} style={style}>{club.name.toUpperCase()}</span>
}
