import { useEffect, useState } from 'react'
import { completeCupDraw, getClub, type EngineResult, type GameState } from '../game'
import { DosTeamName } from './DosTeamName'
import type { MultiplayerTimer } from '../multiplayer/protocol'
import { useGameKeyboard } from './useGameKeyboard'
import { useTimerElapsed } from '../multiplayer/useTimerElapsed'

interface Props {
  state: GameState
  command: (run: (state: GameState) => EngineResult) => void
  networkTimer?: MultiplayerTimer
}

export function CupDrawScreen({ state, command, networkTimer }: Props) {
  const fixtures = state.cup.rounds[0]?.matches ?? []
  const drawOrder = fixtures.flatMap((fixture) => [fixture.homeId, fixture.awayId])
  const [localVisible, setVisible] = useState(0)
  const elapsed = useTimerElapsed(networkTimer)
  const visible = elapsed !== undefined && networkTimer
    ? Math.min(drawOrder.length, Math.floor(elapsed / (networkTimer.durationMs * 0.9) * drawOrder.length))
    : localVisible

  useEffect(() => {
    if (networkTimer) return
    if (visible >= drawOrder.length) {
      const timeout = window.setTimeout(() => command(completeCupDraw), 2_500)
      return () => window.clearTimeout(timeout)
    }
    const timeout = window.setTimeout(() => setVisible((count) => count + 1), 500)
    return () => window.clearTimeout(timeout)
  }, [command, drawOrder.length, visible, networkTimer])

  const keyboardRef = useGameKeyboard<HTMLElement>((key) => {
    if (key === 'Enter' || key === 'Escape') {
      command(completeCupDraw)
      return true
    }
  })

  const drawnIds = new Set(drawOrder.slice(0, visible))
  return (
    <section ref={keyboardRef} className="original-cup-draw screen-green">
      <div className="original-cup-title">SORTEIO DA COPA DO BRASIL · 32 CLUBES</div>
      <button className="cup-draw-skip" type="button" onClick={() => command(completeCupDraw)} aria-label="Concluir sorteio">
        <div className="cup-drawn-box" style={{ overflow: 'hidden' }}>
          <div className="cup-pairs-grid">
            {fixtures.map((fixture, index) => (
              <div className="cup-pair" key={fixture.id}>
                {visible > index * 2 && <DosTeamName club={getClub(state, fixture.homeId)} />}
                {visible > index * 2 + 1 && <DosTeamName club={getClub(state, fixture.awayId)} />}
              </div>
            ))}
          </div>
        </div>
        <div className="cup-pool-box">
          <div className="cup-pool-grid">
            {state.clubs.filter((club) => !drawnIds.has(club.id)).map((club) => <DosTeamName key={club.id} club={club} />)}
          </div>
        </div>
      </button>
    </section>
  )
}
