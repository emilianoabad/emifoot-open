import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  ClientMessage,
  MultiplayerAction,
  MultiplayerSnapshot,
  ServerMessage,
} from './protocol'
import { forgetLeague, readLeagueCredentials, rememberLeague } from './sessions'

type ConnectionState = 'idle' | 'connecting' | 'connected' | 'disconnected'

function multiplayerSocketUrl(): string {
  const configured = import.meta.env.VITE_MULTIPLAYER_WS_URL
  if (configured) return configured
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, '')
  return `${protocol}//${window.location.host}${basePath}/ws`
}

function isServerMessage(value: unknown): value is ServerMessage {
  if (!value || typeof value !== 'object' || !('type' in value)) return false
  return ['welcome', 'snapshot', 'error', 'pong'].includes(String(value.type))
}

export function useMultiplayer() {
  const [snapshot, setSnapshot] = useState<MultiplayerSnapshot>()
  const [playerId, setPlayerId] = useState<string>()
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle')
  const [message, setMessage] = useState('')
  const socketRef = useRef<WebSocket | undefined>(undefined)
  const credentialsRef = useRef<{ code: string; token: string } | undefined>(undefined)
  const playerIdRef = useRef<string | undefined>(undefined)
  const reconnectTimerRef = useRef<number | undefined>(undefined)
  const unmountTimerRef = useRef<number | undefined>(undefined)
  const intentionalCloseRef = useRef(false)
  const initialMessageRef = useRef<ClientMessage | undefined>(undefined)

  const send = useCallback((payload: ClientMessage): boolean => {
    const socket = socketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setMessage('SEM LIGAÇÃO AO SERVIDOR MULTIJOGADOR.')
      return false
    }
    socket.send(JSON.stringify(payload))
    return true
  }, [])

  const connect = useCallback(function connectSocket(initialMessage?: ClientMessage): void {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      if (initialMessage) socketRef.current.send(JSON.stringify(initialMessage))
      return
    }
    if (socketRef.current?.readyState === WebSocket.CONNECTING) return
    intentionalCloseRef.current = false
    initialMessageRef.current = initialMessage
    setConnectionState('connecting')
    setMessage('A LIGAR AO SERVIDOR...')
    const socket = new WebSocket(multiplayerSocketUrl())
    socketRef.current = socket

    socket.addEventListener('open', () => {
      if (socketRef.current !== socket) return
      setConnectionState('connected')
      setMessage('LIGAÇÃO ESTABELECIDA.')
      const first = initialMessageRef.current
      initialMessageRef.current = undefined
      if (first) socket.send(JSON.stringify(first))
      else if (credentialsRef.current) {
        socket.send(JSON.stringify({ type: 'resume', ...credentialsRef.current } satisfies ClientMessage))
      }
    })
    socket.addEventListener('message', (event) => {
      if (socketRef.current !== socket) return
      let decoded: unknown
      try {
        decoded = JSON.parse(String(event.data))
      } catch {
        setMessage('RESPOSTA INVÁLIDA DO SERVIDOR.')
        return
      }
      if (!isServerMessage(decoded)) return
      if (decoded.type === 'welcome') {
        const credentials = { code: decoded.snapshot.code, token: decoded.reconnectToken }
        credentialsRef.current = credentials
        playerIdRef.current = decoded.playerId
        rememberLeague(decoded.snapshot, decoded.playerId, credentials.token)
        setPlayerId(decoded.playerId)
        setSnapshot(decoded.snapshot)
        setMessage(decoded.snapshot.notice)
        return
      }
      if (decoded.type === 'snapshot') {
        if (credentialsRef.current && playerIdRef.current) rememberLeague(decoded.snapshot, playerIdRef.current, credentialsRef.current.token)
        setSnapshot(decoded.snapshot)
        setMessage(decoded.snapshot.notice)
        return
      }
      if (decoded.type === 'error') {
        if (decoded.code === 'resume-unavailable') {
          if (credentialsRef.current) forgetLeague(credentialsRef.current.code)
          credentialsRef.current = undefined
          intentionalCloseRef.current = true
          setSnapshot(undefined)
          setPlayerId(undefined)
          socket.close()
        }
        if (decoded.snapshot) setSnapshot(decoded.snapshot)
        setMessage(decoded.message)
      }
    })
    socket.addEventListener('close', (event) => {
      if (socketRef.current !== socket) return
      socketRef.current = undefined
      setConnectionState('disconnected')
      if (event.code === 4001) {
        intentionalCloseRef.current = true
        setMessage('ESTA LIGA FOI ABERTA EM OUTRA ABA. CONTINUE POR LÁ OU VOLTE AO MENU.')
        return
      }
      if (intentionalCloseRef.current || !credentialsRef.current) return
      setMessage('LIGAÇÃO PERDIDA. A TENTAR RECUPERAR A SALA...')
      window.clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = window.setTimeout(() => connectSocket(), 1_200)
    })
    socket.addEventListener('error', () => {
      if (socketRef.current !== socket) return
      setMessage('NÃO FOI POSSÍVEL LIGAR AO MULTIJOGADOR.')
    })
  }, [])

  useEffect(() => {
    window.clearTimeout(unmountTimerRef.current)
    return () => {
      unmountTimerRef.current = window.setTimeout(() => {
        intentionalCloseRef.current = true
        window.clearTimeout(reconnectTimerRef.current)
        socketRef.current?.close()
      }, 0)
    }
  }, [])

  const resumeRoom = useCallback((code: string): boolean => {
    const credentials = readLeagueCredentials(code)
    if (!credentials) return false
    credentialsRef.current = { code: credentials.code, token: credentials.token }
    connect({ type: 'resume', code: credentials.code, token: credentials.token })
    return true
  }, [connect])

  const createPrivate = useCallback((name: string) => connect({ type: 'create-private', name }), [connect])
  const joinPrivate = useCallback((code: string, name: string) => {
    if (!resumeRoom(code)) connect({ type: 'join-private', code: code.toUpperCase(), name })
  }, [connect, resumeRoom])
  const joinOpen = useCallback((name: string) => connect({ type: 'join-open', name }), [connect])

  const startRoom = useCallback(() => {
    if (!snapshot) return
    send({ type: 'start-room', expectedRevision: snapshot.revision })
  }, [send, snapshot])

  const sendChat = useCallback((text: string) => {
    send({ type: 'chat', text })
  }, [send])

  const sendAction = useCallback((action: MultiplayerAction) => {
    if (!snapshot || snapshot.pause) return
    send({ type: 'action', expectedRevision: snapshot.revision, action })
  }, [send, snapshot])

  const togglePause = useCallback(() => {
    if (!snapshot) return
    send({ type: snapshot.pause ? 'unpause-room' : 'pause-room', expectedRevision: snapshot.revision })
  }, [send, snapshot])

  const leaveRoom = useCallback(() => {
    intentionalCloseRef.current = true
    window.clearTimeout(reconnectTimerRef.current)
    socketRef.current?.close()
    socketRef.current = undefined
    if (snapshot?.mode === 'open' && snapshot.status === 'waiting') forgetLeague(snapshot.code)
    credentialsRef.current = undefined
    playerIdRef.current = undefined
    setSnapshot(undefined)
    setPlayerId(undefined)
    setConnectionState('idle')
    setMessage('SAIU DA SALA MULTIJOGADOR.')
  }, [snapshot])

  return {
    snapshot,
    playerId,
    connectionState,
    message,
    setMessage,
    createPrivate,
    joinPrivate,
    joinOpen,
    resumeRoom,
    startRoom,
    togglePause,
    sendChat,
    sendAction,
    leaveRoom,
  }
}
