import { useEffect, useState } from 'react'
import { formatMoney, getManagerClub, promoteAcademyPlayers, type EngineResult, type GameState, type Position } from '../game'
import { useGameKeyboard } from './useGameKeyboard'

const POSITIONS: readonly Position[] = ['G', 'D', 'M', 'A']

interface Props {
  state: GameState
  command: (run: (state: GameState) => EngineResult) => void
  message?: string
  onNetworkChoice?: (playerIds: string[]) => void
}

export function AcademyScreen({ state, command, message, onNetworkChoice }: Props) {
  const club = getManagerClub(state)
  const plan = state.offseason?.plans[club.id]
  const required = plan ? Object.values(plan.required).reduce((sum, count) => sum + count, 0) : 0
  const pending = required > 0 && Boolean(state.offseason?.pendingAcademyClubIds?.includes(club.id))
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [attempted, setAttempted] = useState(false)
  const candidates = plan?.candidates ?? []
  const selected = candidates.filter((player) => selectedIds.includes(player.id))
  const selectedCounts = Object.fromEntries(POSITIONS.map((position) => [position, selected.filter((player) => player.position === position).length])) as Record<Position, number>
  const complete = pending && required > 0 && POSITIONS.every((position) => selectedCounts[position] === plan!.required[position])
  const confirm = () => {
    if (!complete) return
    setAttempted(true)
    const playerIds = selected.map((player) => player.id)
    if (onNetworkChoice) onNetworkChoice(playerIds)
    else command((current) => promoteAcademyPlayers(current, playerIds))
  }
  const keyboardRef = useGameKeyboard<HTMLElement>((key) => {
    if (key === 'Enter') { confirm(); return true }
  })
  useEffect(() => {
    keyboardRef.current?.closest('.dos-viewport--portrait')?.scrollTo({ top: 0 })
  }, [keyboardRef])

  return (
    <section ref={keyboardRef} className="academy-screen screen-blue" aria-label="Promoção da base">
      <h1 className="academy-title screen-red dos-double">PROMOÇÃO DA BASE · {state.season}</h1>
      <div className="academy-club">{club.name}</div>
      {pending && plan ? (
        <>
          <div className="academy-choice-count">ESCOLHA {required} {required === 1 ? 'JOGADOR' : 'JOGADORES'}</div>
          <div className="academy-quotas" aria-label="Vagas por posição">
            {POSITIONS.map((position) => <span key={position} className={selectedCounts[position] === plan.required[position] ? 'complete' : ''}>{position}&nbsp; {selectedCounts[position]}/{plan.required[position]}</span>)}
          </div>
          <div className="academy-list screen-black dos-double" role="group" aria-label="Jogadores da base">
            <div className="academy-row academy-list-heading" aria-hidden="true"><span /><span>POS.</span><span>JOGADOR</span><span>IDADE</span><span>FOR.</span><span>ORD.</span></div>
            {candidates.map((player) => {
              const checked = selectedIds.includes(player.id)
              return (
                <button type="button" key={player.id} className="academy-row academy-candidate" aria-pressed={checked}
                  aria-label={`${player.name}, posição ${player.position}, ${player.age} anos, força ${player.strength}, ordenado ${formatMoney(player.salary)}`}
                  disabled={!checked && selectedCounts[player.position] >= plan.required[player.position]}
                  onClick={() => setSelectedIds((current) => current.includes(player.id) ? current.filter((id) => id !== player.id) : [...current, player.id])}>
                  <span>{checked ? '[X]' : '[ ]'}</span><span>{player.position}</span><span>{player.name}</span><span>{player.age}</span><span>{player.strength}</span><span>{formatMoney(player.salary)}</span>
                </button>
              )
            })}
          </div>
          <div className="academy-actions">
            {attempted && message && message !== 'COMANDO ACEITE.' ? <div className="academy-message" role="alert">{message}</div> : null}
            <button type="button" className="academy-confirm" disabled={!complete} onClick={confirm}>ENTER&nbsp; PROMOVER</button>
          </div>
        </>
      ) : <div className="academy-waiting" role="status">AGUARDE OS OUTROS TREINADORES.</div>}
    </section>
  )
}
