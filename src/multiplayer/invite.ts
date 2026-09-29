const MAX_CREATOR_LENGTH = 18

export const INVITE_CARD_TITLE = 'Emifoot Multiplayer — A saudade entrou em campo'

function cleanCreator(value: string): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, MAX_CREATOR_LENGTH)
}

export interface InviteContext {
  code: string
}

function cleanRoomCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 6)
}

export function readInviteContext(href: string): InviteContext {
  const params = new URL(href).searchParams
  return {
    code: cleanRoomCode(params.get('room') ?? ''),
  }
}

export function buildInviteUrl(href: string, code: string, basePath = import.meta.env.BASE_URL): string {
  const current = new URL(href)
  const invite = new URL(`${basePath}invite/`, current.origin)
  invite.searchParams.set('room', cleanRoomCode(code))
  return invite.toString()
}

export function buildInviteText(code: string, creator: string): string {
  const cleanName = cleanCreator(creator)
  const invitation = cleanName ? `${cleanName} te chamou` : 'Você foi chamado'
  return `${invitation} para a sala ${cleanRoomCode(code)} do EMIFOOT MULTIPLAYER.\nA saudade entrou em campo.`
}

export function buildInviteClipboardText(code: string, creator: string, url: string): string {
  return `${buildInviteText(code, creator)}\n${url}`
}
