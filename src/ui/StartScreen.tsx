import { useState } from 'react'
import { useGameKeyboard } from './useGameKeyboard'
import type { NewCareerInput } from '../game'
import type { SaveSummary } from './useGame'
import { readSavedLeagues } from '../multiplayer/sessions'

interface StartScreenProps {
  saves: SaveSummary[]
  message: string
  onCreate: (input: NewCareerInput) => void
  onLoad: (slotId: string) => void
  onMultiplayer: (mode: 'private' | 'open') => void
  onResumeLeague: (code: string) => void
}

export function StartScreen({ saves, message, onCreate, onLoad, onMultiplayer, onResumeLeague }: StartScreenProps) {
  const [currentScreen, setCurrentScreen] = useState<'splash' | 'manager' | 'leagues'>('splash')
  const [managerName, setManagerName] = useState('')
  const [leagues] = useState(readSavedLeagues)

  const keyboardRef = useGameKeyboard<HTMLElement>((pressedKey) => {
    if (pressedKey === 'Escape') { setCurrentScreen('splash'); return true }
    if (currentScreen !== 'splash') return
    const key = pressedKey.toLowerCase()
    if (key === 'n' || pressedKey === 'Enter') { setCurrentScreen('manager'); return true }
    if (key === 's' && saves[0]) { onLoad(saves[0].slotId); return true }
    if (key === 'm') { onMultiplayer('private'); return true }
    if (key === 'o') { onMultiplayer('open'); return true }
    if (key === 'r' && leagues.length) { setCurrentScreen('leagues'); return true }
  }, true)

  if (currentScreen === 'leagues') {
    return (
      <section ref={keyboardRef} className="saved-leagues screen-blue">
        <div className="screen-heading">RETOMAR LIGA</div>
        <p>VOLTE COMO O MESMO TREINADOR, NO MESMO CLUBE.</p>
        <div className="saved-leagues-list">
          {leagues.map((league) => (
            <button type="button" className="dos-double" key={league.code} onClick={() => onResumeLeague(league.code)}>
              <b>{league.clubName ?? 'AGUARDANDO SORTEIO'} · {league.name}</b>
              <span>{league.mode === 'private' ? 'COM AMIGOS' : 'ONLINE'} · SALA {league.code}</span>
            </button>
          ))}
        </div>
        <p>SALAS VAZIAS DURAM ATÉ 30 MINUTOS, CONFORME A CAPACIDADE.</p>
        <button type="button" onClick={() => setCurrentScreen('splash')}>ESC&nbsp; VOLTAR</button>
      </section>
    )
  }

  if (currentScreen === 'manager') {
    return (
      <section ref={keyboardRef} className="manager-entry-screen screen-black">
        <div className="manager-entry-head dos-red-line">
          <span>NOME</span><span>EQUIPA</span>
        </div>
        <form
          className="manager-entry-row dos-red-line"
          onSubmit={(event) => {
            event.preventDefault()
            if (managerName.trim()) onCreate({ managerName })
          }}
        >
          <input
            autoFocus
            aria-label="Nome do treinador"
            value={managerName}
            maxLength={18}
            onChange={(event) => setManagerName(event.target.value)}
          />
          <button type="submit" aria-label="Confirmar treinador">_</button>
        </form>
        <div className="manager-entry-message">{message}</div>
      </section>
    )
  }

  return (
    <section ref={keyboardRef} className="title-screen screen-red">
      <div className="title-logo" aria-label="EMIFOOT">EMIFOOT</div>
      <div className="continue-question">ESCOLHA COMO JOGAR <span>_</span></div>
      <div className="continue-actions">
        <button type="button" onClick={() => setCurrentScreen('manager')}>N&nbsp; CARREIRA SOLO</button>
        <button type="button" onClick={() => onMultiplayer('private')}>M&nbsp; LIGA COM AMIGOS</button>
        <button type="button" onClick={() => onMultiplayer('open')}>O&nbsp; LIGA ONLINE</button>
        {saves[0] && <button type="button" onClick={() => onLoad(saves[0].slotId)}>S&nbsp; CONTINUAR CARREIRA</button>}
        {leagues.length > 0 && <button type="button" onClick={() => setCurrentScreen('leagues')}>R&nbsp; RETOMAR LIGA</button>}
      </div>
      <footer className="title-attribution" aria-label="Créditos e afiliação">
        <div>
          <p>Emifoot é um remake em tributo ao Elifoot II original, de <a href="https://www.elifoot.com/" target="_blank" rel="noopener noreferrer">André Elias</a>.</p>
          <p>Sem afiliação ou endosso. Visite o <a href="https://www.elifoot.com/" target="_blank" rel="noopener noreferrer">site oficial do Elifoot</a>.</p>
        </div>
        <a className="title-github" href="https://github.com/emilianoabad/emifoot-open" target="_blank" rel="noopener noreferrer" aria-label="Emifoot no GitHub (abre em nova aba)">
          <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" shapeRendering="crispEdges">
            <path fill="currentColor" fillRule="evenodd" d="M5 1h6v1h2v1h1v2h1v6h-1v2h-2v1h-1v1H5v-1H3v-1H2v-2H1V5h1V3h1V2h2Z M4 4h2v1h4V4h2v4h-1v2H9v1h1v4H6v-3H4v-1H3V9h1v1h2v-1H5V8H4Z" />
          </svg>
          GitHub
        </a>
      </footer>
    </section>
  )
}
