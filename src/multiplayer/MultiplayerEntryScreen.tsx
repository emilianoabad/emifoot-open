import { useState } from 'react'
import { useGameKeyboard } from '../ui/useGameKeyboard'
import { readManagerName, rememberManagerName } from './sessions'

interface Props {
  inviteCode: string
  entryMode?: 'private' | 'open' | 'resume'
  connectionState: 'idle' | 'connecting' | 'connected' | 'disconnected'
  message: string
  onCreatePrivate: (name: string) => void
  onJoinPrivate: (code: string, name: string) => void
  onJoinOpen: (name: string) => void
  onExit: () => void
}

type EntryStep = 'menu' | 'create' | 'join' | 'open' | 'invite'

function cleanRoomCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 6)
}

export function MultiplayerEntryScreen({
  inviteCode,
  entryMode = 'private',
  connectionState,
  message,
  onCreatePrivate,
  onJoinPrivate,
  onJoinOpen,
  onExit,
}: Props) {
  const [step, setStep] = useState<EntryStep>(() => inviteCode ? 'invite' : entryMode === 'open' ? 'open' : 'menu')
  const [name, setName] = useState(readManagerName)
  const [code, setCode] = useState(inviteCode)
  const busy = connectionState === 'connecting'
  const validName = Boolean(name.trim())
  const validCode = code.length === 6

  const rememberName = (): string | undefined => {
    const nextName = name.trim()
    if (!nextName) return undefined
    rememberManagerName(nextName)
    return nextName
  }

  const submit = () => {
    const nextName = rememberName()
    if (!nextName) return
    if (step === 'create') onCreatePrivate(nextName)
    else if (step === 'open') onJoinOpen(nextName)
    else if ((step === 'join' || step === 'invite') && validCode) onJoinPrivate(code, nextName)
  }

  const back = () => {
    if (step === 'menu' || step === 'invite' || step === 'open') onExit()
    else setStep('menu')
  }
  const keyboardRef = useGameKeyboard<HTMLElement>((key) => {
    if (key === 'Escape') { back(); return true }
    if (busy || step !== 'menu') return
    if (key.toLowerCase() === 'c') { setStep('create'); return true }
    if (key.toLowerCase() === 'e') { setStep('join'); return true }
  }, true)

  return (
    <section ref={keyboardRef} className="multiplayer-entry screen-blue">
      <div className="multiplayer-entry-title screen-red">EMIFOOT · {step === 'open' ? 'LIGA ONLINE' : 'LIGA COM AMIGOS'}</div>

      {step === 'menu' ? (
        <div className="multiplayer-entry-menu">
          <button type="button" disabled={busy} onClick={() => setStep('create')}>C&nbsp; CRIAR SALA</button>
          <button type="button" disabled={busy} onClick={() => setStep('join')}>E&nbsp; ENTRAR COM CÓDIGO</button>
        </div>
      ) : (
        <form
          className="multiplayer-entry-form dos-double screen-black"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <div className="multiplayer-entry-form-title">
            {step === 'create' && 'CRIAR SALA'}
            {step === 'join' && 'ENTRAR NUMA SALA'}
            {step === 'open' && 'ENCONTRE OUTROS TREINADORES'}
            {step === 'invite' && `SALA ${inviteCode}`}
          </div>
          {step === 'join' ? (
            <label>
              CÓDIGO
              <input
                autoFocus
                aria-label="Código da sala"
                maxLength={6}
                value={code}
                onChange={(event) => setCode(cleanRoomCode(event.target.value))}
              />
            </label>
          ) : null}
          <label>
            NOME DO TREINADOR
            <input
              autoFocus={step !== 'join'}
              aria-label="Nome do treinador multijogador"
              maxLength={18}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <button type="submit" disabled={busy || !validName || ((step === 'join' || step === 'invite') && !validCode)}>
            ENTER&nbsp; {step === 'create' ? 'CRIAR' : step === 'open' ? 'BUSCAR LIGA' : 'ENTRAR'}
          </button>
        </form>
      )}

      {message ? <div className="multiplayer-entry-message">{message}</div> : null}
      <button type="button" className="multiplayer-exit" onClick={back}>ESC&nbsp; {step === 'menu' || step === 'invite' ? 'VOLTAR AO TÍTULO' : 'VOLTAR'}</button>
    </section>
  )
}
