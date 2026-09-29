import { readInviteContext } from './multiplayer/invite'

const { code } = readInviteContext(window.location.href)
const destination = new URL(import.meta.env.BASE_URL, window.location.origin)
if (code) destination.searchParams.set('room', code)
const join = document.querySelector<HTMLAnchorElement>('#join')
if (join) join.href = destination.toString()
window.location.replace(destination)
