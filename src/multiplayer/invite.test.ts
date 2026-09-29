import { describe, expect, it } from 'vitest'
import inviteCardHtml from '../../invite/index.html?raw'
import { buildInviteClipboardText, buildInviteText, buildInviteUrl, INVITE_CARD_TITLE, readInviteContext } from './invite'

describe('multiplayer invitations', () => {
  it('uses a dedicated card URL carrying only the room code', () => {
    const url = buildInviteUrl('https://example.com/football/?old=1#game', 'abc234', '/football/')

    expect(url).toBe('https://example.com/football/invite/?room=ABC234')
    expect(url).not.toContain('creator')
  })

  it('keeps the creator in the invitation copy without putting it in the URL', () => {
    const url = 'https://example.com/football/invite/?room=ABC234'
    const text = buildInviteText('abc234', '  Emiliano  Abad ')

    expect(text).toBe('Emiliano Abad te chamou para a sala ABC234 do EMIFOOT MULTIPLAYER.\nA saudade entrou em campo.')
    expect(buildInviteClipboardText('abc234', '  Emiliano  Abad ', url)).toBe(`${text}\n${url}`)
  })

  it('reads only a normalized room code from room links with unrelated query parameters', () => {
    expect(readInviteContext('https://example.com/football/?room=abc234&creator=Old+Name')).toEqual({ code: 'ABC234' })
    expect(readInviteContext('https://example.com/football/?room=ABC<script>')).toEqual({ code: 'ABCSCR' })
  })

  it('uses the root invite card while running locally', () => {
    expect(buildInviteUrl('http://127.0.0.1:5174/', 'abc234')).toBe('http://127.0.0.1:5174/invite/?room=ABC234')
  })

  it('ships a dedicated social card with branded metadata', () => {
    const card = new DOMParser().parseFromString(inviteCardHtml, 'text/html')

    expect(card.title).toBe(INVITE_CARD_TITLE)
    expect(card.querySelector('meta[property="og:title"]')?.getAttribute('content')).toBe(INVITE_CARD_TITLE)
    expect(card.querySelector('meta[property="og:description"]')?.getAttribute('content')).toContain('Emifoot Multiplayer')
    expect(card.querySelector('meta[property="og:image"]')?.getAttribute('content')).toBe('__EMIFOOT_IMAGE_URL__')
    expect(card.querySelector('script[type="module"]')?.getAttribute('src')).toBe('/src/invite.ts')
  })
})
