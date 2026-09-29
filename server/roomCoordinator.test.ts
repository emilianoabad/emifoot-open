import { describe, expect, it, vi } from 'vitest'
import { clubDrawDurationMs, type MultiplayerSnapshot, type ServerMessage } from '../src/multiplayer/protocol'
import { autoPickLineup, automaticAcademySelection, bestSafeSponsorship, bettingRegulationNotice, getPlayerSaleQuote, type GameState } from '../src/game'
import { fastForwardSeason } from '../src/test/simulation'
import { drawInternationalArrival, INTERNATIONAL_ARRIVAL_PROBABILITY } from '../src/game/international'
import * as rng from '../src/game/rng'
import { isLocalFastMultiplayerMode, multiplayerMatchPacing, MAX_ROOMS, EMPTY_ROOM_RETENTION_MS, RoomCoordinator, type RoomConnection } from './roomCoordinator'

class FakeClock {
  private current = 1_000
  private nextId = 1
  private tasks = new Map<number, { at: number; callback: () => void }>()

  now = () => this.current

  setTimeout = (callback: () => void, delayMs: number): number => {
    const id = this.nextId
    this.nextId += 1
    this.tasks.set(id, { at: this.current + delayMs, callback })
    return id
  }

  clearTimeout = (handle: unknown): void => {
    this.tasks.delete(Number(handle))
  }

  advance(milliseconds: number): void {
    const target = this.current + milliseconds
    while (true) {
      const next = [...this.tasks.entries()]
        .filter(([, task]) => task.at <= target)
        .sort((left, right) => left[1].at - right[1].at)[0]
      if (!next) break
      const [id, task] = next
      this.tasks.delete(id)
      this.current = task.at
      task.callback()
    }
    this.current = target
  }
}

class FakeConnection implements RoomConnection {
  messages: ServerMessage[] = []

  send = (message: ServerMessage): void => {
    this.messages.push(structuredClone(message))
  }
}

function snapshot(connection: FakeConnection): MultiplayerSnapshot {
  const event = connection.messages.findLast((message) => message.type === 'snapshot' || message.type === 'welcome')
  if (!event || (event.type !== 'snapshot' && event.type !== 'welcome')) throw new Error('Snapshot not found')
  return event.snapshot
}

function internationalAuction() {
  let seed = 1
  while (seed < 1_000 && !drawInternationalArrival(undefined, 2026, 1, seed, [], 576).listing) seed++
  if (seed === 1_000) throw new Error('Expected an international arrival seed')
  const randomSeed = vi.spyOn(rng, 'createRandomSeed').mockReturnValue(seed)
  const clock = new FakeClock()
  const coordinator = new RoomCoordinator(clock)
  const host = new FakeConnection()
  const guest = new FakeConnection()
  try {
    coordinator.handle(host, { type: 'create-private', name: 'Oferta internacional A' })
    coordinator.handle(guest, { type: 'join-private', code: snapshot(host).code, name: 'Oferta internacional B' })
    coordinator.handle(host, { type: 'start-room', expectedRevision: snapshot(host).revision })
  } finally {
    randomSeed.mockRestore()
  }
  const room = (coordinator as unknown as { rooms: Map<string, { game: GameState }> }).rooms.get(snapshot(host).code)!
  const listing = room.game.market.find((candidate) => candidate.internationalPlayer)
  if (!listing?.internationalPlayer) throw new Error('Expected opening international arrival')
  const hostId = snapshot(host).game!.manager.clubId
  const guestId = snapshot(guest).game!.manager.clubId
  clock.advance(clubDrawDurationMs(2) + 5_000)
  expect(room.game.phase).toBe('auction')
  expect(room.game.market.at(-1)).toEqual(listing)
  return { coordinator, clock, host, guest, room, listing, hostId, guestId }
}

describe('authoritative multiplayer rooms', () => {
  it('starts every assigned human club with the same editable ticket price', () => {
    const randomSeed = vi.spyOn(rng, 'createRandomSeed').mockReturnValue(13)
    const coordinator = new RoomCoordinator(new FakeClock())
    const host = new FakeConnection()
    const guest = new FakeConnection()
    try {
      coordinator.handle(host, { type: 'create-private', name: 'Bilhete A' })
      coordinator.handle(guest, { type: 'join-private', code: snapshot(host).code, name: 'Bilhete B' })
      coordinator.handle(host, { type: 'start-room', expectedRevision: snapshot(host).revision })
      for (const connection of [host, guest]) {
        const game = snapshot(connection).game!
        expect(game.clubs.find((club) => club.id === game.manager.clubId)!.ticketPrice).toBe(25)
      }
    } finally {
      randomSeed.mockRestore()
    }
  })

  it.each(['update-club', 'ready-round'] as const)('rejects unavailable formations submitted through %s', (type) => {
    const coordinator = new RoomCoordinator(new FakeClock())
    const host = new FakeConnection()
    const guest = new FakeConnection()
    coordinator.handle(host, { type: 'create-private', name: 'Tactics' })
    coordinator.handle(guest, { type: 'join-private', code: snapshot(host).code, name: 'Opponent' })
    coordinator.handle(host, { type: 'start-room', expectedRevision: snapshot(host).revision })
    const room = (coordinator as unknown as { rooms: Map<string, { game: GameState }> }).rooms.get(snapshot(host).code)!
    room.game.phase = 'pre-round'
    const club = room.game.clubs.find((candidate) => candidate.id === snapshot(host).game!.manager.clubId)!
    // Make an otherwise unrestricted squad with only two available attackers.
    club.players.forEach((player) => { player.nationality = 'BRA'; player.injuryRounds = 0; player.suspensionRounds = 0 })
    club.players.filter((player) => player.position === 'A').slice(2).forEach((player) => { player.suspensionRounds = 1 })
    const before = structuredClone(room.game)
    coordinator.handle(host, { type: 'action', expectedRevision: snapshot(host).revision,
      action: { type, setup: { tactic: '4-3-3', ...autoPickLineup(club, '4-3-3') } } })
    expect(host.messages.at(-1)).toMatchObject({ type: 'error', message: 'Não há jogadores disponíveis para esta tática.' })
    expect(room.game).toEqual(before)
    coordinator.handle(host, { type: 'action', expectedRevision: snapshot(host).revision,
      action: { type, setup: { tactic: '4-4-2', ...autoPickLineup(club, '4-4-2') } } })
    expect(host.messages.at(-1)).toMatchObject({ type: 'snapshot' })
    expect(room.game.clubs.find((candidate) => candidate.id === club.id)?.tactic).toBe('4-4-2')
  })

  it.each([false, true])('shows sponsorship news after standings and waits only for affected managers (timeout: %s)', (timeout) => {
    const clock = new FakeClock()
    const coordinator = new RoomCoordinator(clock)
    const host = new FakeConnection()
    const guest = new FakeConnection()
    coordinator.handle(host, { type: 'create-private', name: 'Safe sponsor' })
    coordinator.handle(guest, { type: 'join-private', code: snapshot(host).code, name: 'Bet sponsor' })
    coordinator.handle(host, { type: 'start-room', expectedRevision: snapshot(host).revision })
    const room = (coordinator as unknown as { rooms: Map<string, { game: GameState }> }).rooms.get(snapshot(host).code)!
    const guestId = snapshot(guest).game!.manager.clubId
    room.game.clubs.find((club) => club.id === guestId)!.sponsorship = {
      id: 'guest-betting-contract', brandId: 'betezao', kind: 'betting', season: room.game.season,
      basePerRound: 10_000, winBonus: 1_000, drawBonus: 500, projectedIncome: 147_000, expectedIncome: 100_000,
    }
    room.game.phase = 'standings'
    room.game.lastReport = { leagueResults: [], cupResults: [], transferMessages: [], headlines: [], bettingRegulationChange: { allowed: false } }
    room.game.sponsorship!.bettingAllowed = false
    coordinator.handle(host, { type: 'action', expectedRevision: snapshot(host).revision, action: { type: 'continue' } })
    expect(room.game.phase).toBe('standings')
    coordinator.handle(guest, { type: 'action', expectedRevision: snapshot(guest).revision, action: { type: 'continue' } })
    expect(room.game.phase).toBe('sponsorship-notice')
    expect(snapshot(host).submittedPlayerIds).toEqual([snapshot(host).hostId])
    expect(bettingRegulationNotice(snapshot(host).game!)).toBeUndefined()
    expect(bettingRegulationNotice(snapshot(guest).game!)).toContain('Medida Provisória')
    expect(snapshot(host).notice).not.toMatch(/APOSTAS/)
    if (timeout) clock.advance(snapshot(guest).timer!.durationMs)
    else coordinator.handle(guest, { type: 'action', expectedRevision: snapshot(guest).revision, action: { type: 'continue' } })
    expect(snapshot(host).game).toMatchObject({ phase: 'auction', currentRound: 2 })
    expect(snapshot(guest).game?.phase).toBe('auction')
  })

  it.each([false, true])('orders sponsors, retirements and academy choices before the cup draw (timeout: %s)', (timeout) => {
    const clock = new FakeClock()
    const coordinator = new RoomCoordinator(clock)
    const host = new FakeConnection()
    const guest = new FakeConnection()
    coordinator.handle(host, { type: 'create-private', name: 'Patrocínio A' })
    coordinator.handle(guest, { type: 'join-private', code: snapshot(host).code, name: 'Patrocínio B' })
    coordinator.handle(host, { type: 'start-room', expectedRevision: snapshot(host).revision })
    const room = (coordinator as unknown as { rooms: Map<string, { game: GameState }> }).rooms.get(snapshot(host).code)!
    const completed = fastForwardSeason(room.game)
    if (!completed.ok) throw new Error(completed.error)
    room.game = completed.state
    const managedIds = [snapshot(host).game!.manager.clubId, snapshot(guest).game!.manager.clubId]
    for (const club of room.game.clubs.filter((club) => managedIds.includes(club.id))) {
      for (const player of club.players) player.age = 25
    }
    room.game.clubs.find((club) => club.id === managedIds[1])!.players[0].age = 60
    const aiClubId = room.game.clubs.find((club) => !managedIds.includes(club.id))!.id
    room.game.clubs.find((club) => club.id === aiClubId)!.players[0].age = 60
    for (const connection of [host, guest]) coordinator.handle(connection, { type: 'action', expectedRevision: snapshot(connection).revision, action: { type: 'continue' } })
    const start = snapshot(host)
    expect(start.game?.phase).toBe('sponsorship')
    expect(start.timer?.kind).toBe('sponsorship')
    expect(start.game!.sponsorship!.pendingClubIds).toHaveLength(2)
    const hostId = start.game!.manager.clubId
    const guestId = snapshot(guest).game!.manager.clubId
    const hostProposal = start.game!.sponsorship!.proposals[hostId]
    const guestProposal = start.game!.sponsorship!.proposals[guestId]
    expect(hostProposal.offers).toHaveLength(3)
    expect(guestProposal.offers).toHaveLength(3)
    if (timeout) {
      clock.advance(start.timer!.durationMs)
      for (const [id, proposal] of [[hostId, hostProposal], [guestId, guestProposal]] as const) {
        expect(room.game.clubs.find((club) => club.id === id)!.sponsorship?.id).toBe(bestSafeSponsorship(proposal).id)
      }
    } else {
      coordinator.handle(guest, { type: 'action', expectedRevision: snapshot(guest).revision, action: { type: 'sponsorship-offer', offerId: hostProposal.offers[2].id } })
      expect(guest.messages.at(-1)).toMatchObject({ type: 'error' })
      expect(room.game.sponsorship!.pendingClubIds).toHaveLength(2)
      coordinator.handle(host, { type: 'action', expectedRevision: snapshot(host).revision, action: { type: 'sponsorship-offer', offerId: hostProposal.offers[2].id } })
      expect(room.game.phase).toBe('sponsorship')
      expect(room.game.sponsorship!.pendingClubIds).toEqual([guestId])
      coordinator.handle(guest, { type: 'action', expectedRevision: snapshot(guest).revision, action: { type: 'sponsorship-offer', offerId: guestProposal.offers[0].id } })
      expect(room.game.clubs.find((club) => club.id === hostId)!.sponsorship?.id).toBe(hostProposal.offers[2].id)
      expect(room.game.clubs.find((club) => club.id === guestId)!.sponsorship?.id).toBe(guestProposal.offers[0].id)
    }
    expect(snapshot(host).game?.phase).toBe('retirement-notice')
    expect(snapshot(host).submittedPlayerIds).toEqual([snapshot(host).hostId])
    expect(snapshot(guest).game?.offseason?.plans[guestId].retired).toHaveLength(1)
    expect(snapshot(host).game?.offseason?.plans[hostId].retired).toHaveLength(0)
    if (timeout) clock.advance(snapshot(guest).timer!.durationMs)
    else coordinator.handle(guest, { type: 'action', expectedRevision: snapshot(guest).revision, action: { type: 'continue' } })
    expect(snapshot(host).game?.phase).toBe('academy')
    expect(snapshot(guest).timer).toMatchObject({ kind: 'academy', durationMs: 60_000 })
    expect(snapshot(host).submittedPlayerIds).toEqual([snapshot(host).hostId])
    expect(room.game.offseason!.pendingAcademyClubIds).toEqual([guestId])
    const plan = room.game.offseason!.plans[guestId]
    let selected = automaticAcademySelection(plan)
    const population = room.game.clubs.flatMap((club) => club.players).length
    if (timeout) clock.advance(snapshot(guest).timer!.durationMs)
    else {
      const before = structuredClone(room.game)
      coordinator.handle(host, { type: 'action', expectedRevision: snapshot(host).revision, action: { type: 'academy-selection', playerIds: selected } })
      expect(host.messages.at(-1)).toMatchObject({ type: 'error' })
      expect(room.game).toEqual(before)
      const foreignIds = [...selected]
      foreignIds[0] = room.game.offseason!.plans[aiClubId].candidates[0].id
      coordinator.handle(guest, { type: 'action', expectedRevision: snapshot(guest).revision, action: { type: 'academy-selection', playerIds: foreignIds } })
      expect(guest.messages.at(-1)).toMatchObject({ type: 'error' })
      expect(room.game).toEqual(before)
      const position = plan.candidates.find((player) => player.id === selected[0])!.position
      selected = [plan.candidates.find((player) => player.position === position && !selected.includes(player.id))!.id, ...selected.slice(1)]
      coordinator.handle(guest, { type: 'action', expectedRevision: snapshot(guest).revision, action: { type: 'academy-selection', playerIds: selected } })
    }
    expect(snapshot(host).game?.phase).toBe('cup-draw')
    expect(snapshot(guest).timer?.kind).toBe('cup-draw')
    expect(room.game.offseason!.pendingAcademyClubIds).toEqual([])
    expect(room.game.offseason!.plans[guestId].promotedIds).toEqual(selected)
    expect(room.game.clubs.flatMap((club) => club.players)).toHaveLength(population)
    expect(selected.every((id) => room.game.clubs.find((club) => club.id === guestId)!.players.some((player) => player.id === id))).toBe(true)
  })

  it.each([false, true])('never makes another human club buy a direct sale (disconnected: %s)', (disconnected) => {
    const coordinator = new RoomCoordinator(new FakeClock())
    const host = new FakeConnection()
    const guest = new FakeConnection()
    coordinator.handle(host, { type: 'create-private', name: 'Seller' })
    coordinator.handle(guest, { type: 'join-private', code: snapshot(host).code, name: 'Other manager' })
    coordinator.handle(host, { type: 'start-room', expectedRevision: snapshot(host).revision })
    const room = (coordinator as unknown as { rooms: Map<string, { game: GameState }> }).rooms.get(snapshot(host).code)!
    const sellerId = snapshot(host).game!.manager.clubId
    const guestId = snapshot(guest).game!.manager.clubId
    room.game.phase = 'pre-round'
    for (const club of room.game.clubs) club.cash = club.id === guestId ? 1_000_000 : -1
    const seller = room.game.clubs.find((club) => club.id === sellerId)!
    const player = seller.players.find((candidate) => candidate.position !== 'G')!
    player.contractRounds = 0
    player.contractSeasons = 0
    player.salary = 100
    for (const candidate of room.game.clubs.find((club) => club.id === guestId)!.players) {
      if (candidate.position === player.position) candidate.strength = Math.max(1, player.strength - 2)
    }
    const managedClubIds = [sellerId, guestId]
    expect(getPlayerSaleQuote(room.game, player.id)).toMatchObject({ ok: true, buyerId: guestId })
    expect(getPlayerSaleQuote(room.game, player.id, managedClubIds).ok).toBe(false)
    if (disconnected) coordinator.disconnect(guest)
    const otherClub = structuredClone(room.game.clubs.find((club) => club.id === guestId)!)
    const before = structuredClone(room.game)
    const sell = () => coordinator.handle(host, { type: 'action', expectedRevision: snapshot(host).revision, action: { type: 'sell-player', playerId: player.id } })
    sell()
    expect(host.messages.at(-1)).toMatchObject({ type: 'error' })
    expect(room.game).toEqual(before)

    const aiBuyer = room.game.clubs.find((club) => !managedClubIds.includes(club.id))!
    aiBuyer.cash = 1_000_000
    for (const candidate of aiBuyer.players) {
      if (candidate.position === player.position) candidate.strength = Math.max(1, player.strength - 2)
    }
    expect(getPlayerSaleQuote(room.game, player.id, managedClubIds)).toMatchObject({ ok: true, buyerId: aiBuyer.id })
    sell()
    expect(room.game.playerSaleResults?.[sellerId]).toMatchObject({ success: true, clubId: aiBuyer.id })
    expect(room.game.clubs.find((club) => club.id === guestId)).toEqual(otherClub)
    expect(room.game.clubs.find((club) => club.id === aiBuyer.id)?.players.some((candidate) => candidate.id === player.id)).toBe(true)
  })

  it('reclaims the longest-idle empty lobby at capacity and invalidates its credentials', () => {
    const clock = new FakeClock()
    const coordinator = new RoomCoordinator(clock)
    const hosts = Array.from({ length: MAX_ROOMS }, () => new FakeConnection())
    for (const host of hosts) coordinator.handle(host, { type: 'create-private', name: 'Host' })
    const firstWelcome = hosts[0].messages.find((message) => message.type === 'welcome')!
    const secondWelcome = hosts[1].messages.find((message) => message.type === 'welcome')!
    coordinator.disconnect(hosts[1])
    clock.advance(1000)
    coordinator.disconnect(hosts[0])
    const replacement = new FakeConnection()
    coordinator.handle(replacement, { type: 'join-open', name: 'New manager' })
    expect(replacement.messages.at(-1)?.type).toBe('welcome')
    expect(coordinator.roomCount()).toBe(MAX_ROOMS)
    const stale = new FakeConnection()
    coordinator.handle(stale, { type: 'resume', code: secondWelcome.snapshot.code, token: secondWelcome.reconnectToken })
    expect(stale.messages.at(-1)).toMatchObject({ type: 'error', code: 'resume-unavailable' })
    const retained = new FakeConnection()
    coordinator.handle(retained, { type: 'resume', code: firstWelcome.snapshot.code, token: firstWelcome.reconnectToken })
    expect(retained.messages.some((message) => message.type === 'welcome')).toBe(true)
    coordinator.handle(hosts[2], { type: 'chat', text: 'Still connected' })
    expect(snapshot(hosts[2]).chat.at(-1)?.text).toBe('Still connected')
    const full = new FakeConnection()
    coordinator.handle(full, { type: 'create-private', name: 'No room' })
    expect(full.messages.at(-1)?.type).toBe('error')
  })

  it('reclaims an empty lobby before an older empty running game', () => {
    const clock = new FakeClock()
    const coordinator = new RoomCoordinator(clock)
    const hosts = Array.from({ length: MAX_ROOMS }, () => new FakeConnection())
    for (const host of hosts) coordinator.handle(host, { type: 'create-private', name: 'Host' })
    coordinator.handle(hosts[0], { type: 'start-room', expectedRevision: snapshot(hosts[0]).revision })
    const runningWelcome = hosts[0].messages.find((message) => message.type === 'welcome')!
    coordinator.disconnect(hosts[0])
    clock.advance(1000)
    coordinator.disconnect(hosts[1])
    coordinator.handle(new FakeConnection(), { type: 'create-private', name: 'New manager' })
    const returning = new FakeConnection()
    coordinator.handle(returning, { type: 'resume', code: runningWelcome.snapshot.code, token: runningWelcome.reconnectToken })
    expect(snapshot(returning).status).toBe('playing')
  })

  it('reclaims an empty running game when no empty lobby remains', () => {
    const coordinator = new RoomCoordinator(new FakeClock())
    const hosts = Array.from({ length: MAX_ROOMS }, () => new FakeConnection())
    for (const host of hosts) coordinator.handle(host, { type: 'create-private', name: 'Host' })
    coordinator.handle(hosts[0], { type: 'start-room', expectedRevision: snapshot(hosts[0]).revision })
    coordinator.disconnect(hosts[0])
    const extra = new FakeConnection()
    coordinator.handle(extra, { type: 'create-private', name: 'New manager' })
    expect(extra.messages.at(-1)?.type).toBe('welcome')
    expect(coordinator.roomCount()).toBe(MAX_ROOMS)
  })

  it('offers the same Santos Neymar to everyone in round three and preserves the winner’s player', () => {
    const clock = new FakeClock()
    const coordinator = new RoomCoordinator(clock)
    const host = new FakeConnection()
    const guest = new FakeConnection()
    coordinator.handle(host, { type: 'create-private', name: 'Host Neymar' })
    coordinator.handle(guest, { type: 'join-private', code: snapshot(host).code, name: 'Guest Neymar' })
    coordinator.handle(host, { type: 'start-room', expectedRevision: snapshot(host).revision })
    for (let step = 0; step < 200; step++) {
      const current = snapshot(host)
      if (current.game?.currentRound === 3 && current.timer?.kind === 'auction') break
      if (current.game && current.game.currentRound < 3) {
        expect(current.game.market.some((listing) => listing.playerId === 'santos:espn-132948')).toBe(false)
      }
      const timer = current.timer
      if (!timer) throw new Error('Expected a running phase timer')
      clock.advance(timer.endsAt - clock.now())
      // Keep only the latest snapshots to avoid retaining many full game copies.
      host.messages = host.messages.slice(-1)
      guest.messages = guest.messages.slice(-1)
    }
    const auction = snapshot(host)
    expect(auction.game).toMatchObject({ currentRound: 3, phase: 'auction' })
    expect(auction.game!.market[0]).toMatchObject({ sellerId: 'santos', playerId: 'santos:espn-132948' })
    expect(snapshot(guest).game!.market).toEqual(auction.game!.market)
    const strength = auction.game!.clubs.find((club) => club.id === 'santos')!.players.find((player) => player.sourceId === 'espn-132948')!.strength
    const room = (coordinator as unknown as { rooms: Map<string, { game: GameState }> }).rooms.get(auction.code)!
    room.game.clubs.find((club) => club.id === snapshot(guest).game!.manager.clubId)!.cash = auction.game!.market[0].fee + 200_000
    coordinator.handle(host, { type: 'action', expectedRevision: snapshot(host).revision, action: { type: 'auction-offer' } })
    coordinator.handle(guest, { type: 'action', expectedRevision: snapshot(guest).revision, action: { type: 'auction-offer', salary: 15_000 } })
    const won = snapshot(guest).game!
    expect(won.auctionResult).toMatchObject({ success: true, clubId: won.manager.clubId, auction: { playerName: 'Neymar', strength } })
    expect(won.clubs.find((club) => club.id === won.manager.clubId)?.players.find((player) => player.sourceId === 'espn-132948')).toMatchObject({ neymarAuctionPending: false, strength })
  })

  it.each(['waiting', 'playing'] as const)('retains the last disconnected %s room for 30 minutes, then expires it', (status) => {
    const clock = new FakeClock()
    const coordinator = new RoomCoordinator(clock)
    const host = new FakeConnection()
    coordinator.handle(host, { type: 'create-private', name: 'Host' })
    const welcome = host.messages.find((message) => message.type === 'welcome')!
    if (status === 'playing') coordinator.handle(host, { type: 'start-room', expectedRevision: snapshot(host).revision })
    coordinator.disconnect(host)
    expect(coordinator.roomCount()).toBe(1)
    const count = host.messages.length
    clock.advance(EMPTY_ROOM_RETENTION_MS)
    expect(coordinator.roomCount()).toBe(0)
    expect(host.messages).toHaveLength(count)
    const resumed = new FakeConnection()
    coordinator.handle(resumed, { type: 'resume', code: welcome.snapshot.code, token: welcome.reconnectToken })
    expect(resumed.messages.at(-1)?.type).toBe('error')
  })

  it('preserves reconnect while someone remains and revokes the replaced socket', () => {
    const coordinator = new RoomCoordinator(new FakeClock())
    const host = new FakeConnection()
    const guest = new FakeConnection()
    coordinator.handle(host, { type: 'create-private', name: 'Host' })
    const welcome = host.messages.find((message) => message.type === 'welcome')!
    coordinator.handle(guest, { type: 'join-private', code: welcome.snapshot.code, name: 'Guest' })
    coordinator.disconnect(host)
    expect(coordinator.roomCount()).toBe(1)
    const resumed = new FakeConnection()
    coordinator.handle(resumed, { type: 'resume', code: welcome.snapshot.code, token: welcome.reconnectToken })
    expect(snapshot(resumed).players.every((player) => player.connected)).toBe(true)
    const replacement = new FakeConnection()
    coordinator.handle(replacement, { type: 'resume', code: welcome.snapshot.code, token: welcome.reconnectToken })
    coordinator.handle(resumed, { type: 'chat', text: 'stale socket' })
    expect(resumed.messages.at(-1)?.type).toBe('error')
    coordinator.disconnect(resumed)
    expect(snapshot(replacement).players.every((player) => player.connected)).toBe(true)
    coordinator.disconnect(guest)
    coordinator.disconnect(replacement)
    expect(coordinator.roomCount()).toBe(1)
  })

  it('rejects moving an already assigned socket into another room via resume', () => {
    const coordinator = new RoomCoordinator(new FakeClock())
    const first = new FakeConnection()
    const second = new FakeConnection()
    coordinator.handle(first, { type: 'create-private', name: 'First' })
    coordinator.handle(second, { type: 'create-private', name: 'Second' })
    const welcome = second.messages.find((message) => message.type === 'welcome')!
    coordinator.handle(first, { type: 'resume', code: welcome.snapshot.code, token: welcome.reconnectToken })
    expect(first.messages.at(-1)?.type).toBe('error')
    coordinator.disconnect(first)
    coordinator.disconnect(second)
    expect(coordinator.roomCount()).toBe(2)
  })

  it('cancels an empty open lobby and reclaims room capacity', () => {
    const clock = new FakeClock()
    const coordinator = new RoomCoordinator(clock)
    const first = new FakeConnection()
    const second = new FakeConnection()
    coordinator.handle(first, { type: 'join-open', name: 'First' })
    coordinator.handle(second, { type: 'join-open', name: 'Second' })
    coordinator.disconnect(first)
    coordinator.disconnect(second)
    clock.advance(60_000)
    expect(coordinator.roomCount()).toBe(0)
    const hosts = Array.from({ length: MAX_ROOMS }, () => new FakeConnection())
    for (const host of hosts) coordinator.handle(host, { type: 'create-private', name: 'Host' })
    const extra = new FakeConnection()
    coordinator.handle(extra, { type: 'create-private', name: 'Extra' })
    expect(extra.messages.at(-1)?.type).toBe('error')
    coordinator.disconnect(hosts[0])
    clock.advance(EMPTY_ROOM_RETENTION_MS)
    coordinator.handle(extra, { type: 'create-private', name: 'Extra' })
    expect(extra.messages.at(-1)?.type).toBe('welcome')
    expect(coordinator.roomCount()).toBe(MAX_ROOMS)
  })

  it('keeps the two-second multiplayer match mode local-only', () => {
    expect(isLocalFastMultiplayerMode({ NODE_ENV: 'development', EMIFOOT_LOCAL_FAST_MODE: 'true' })).toBe(true)
    expect(isLocalFastMultiplayerMode({ NODE_ENV: 'production', EMIFOOT_LOCAL_FAST_MODE: 'true' })).toBe(false)
    expect(isLocalFastMultiplayerMode({ EMIFOOT_LOCAL_FAST_MODE: 'true' })).toBe(false)
    expect(isLocalFastMultiplayerMode({ NODE_ENV: 'test', EMIFOOT_LOCAL_FAST_MODE: 'true' })).toBe(false)
    const fast = multiplayerMatchPacing(true)
    expect(fast.matchHalfMs).toBe(1_000)
    expect(fast.halfTimeMs).toBe(15_000)
    expect(multiplayerMatchPacing(false)).toEqual({ matchHalfMs: 19_000, halfTimeMs: 15_000 })
  })

  it('creates a private room, assigns unique fourth-division clubs, and relays chat', () => {
    const clock = new FakeClock()
    const coordinator = new RoomCoordinator(clock)
    const host = new FakeConnection()
    const guest = new FakeConnection()

    coordinator.handle(host, { type: 'create-private', name: 'Emiliano' })
    const code = snapshot(host).code
    coordinator.handle(guest, { type: 'join-private', code, name: 'Ana' })
    coordinator.handle(host, { type: 'start-room', expectedRevision: snapshot(host).revision })

    const started = snapshot(host)
    expect(started.status).toBe('playing')
    expect(started.game?.phase).toBe('manager-registration')
    expect(started.timer).toMatchObject({ kind: 'club-draw', durationMs: clubDrawDurationMs(2) })
    expect(started.players).toHaveLength(2)
    expect(new Set(started.players.map((player) => player.clubId)).size).toBe(2)
    for (const player of started.players) {
      expect(player.clubName).toBeUndefined()
      expect(player.clubPrimary).toBeUndefined()
      expect(player.clubSecondary).toBeUndefined()
      expect(started.game?.clubs.find((club) => club.id === player.clubId)?.division).toBe(4)
    }

    clock.advance(clubDrawDurationMs(2) - 1)
    expect(snapshot(host).game?.phase).toBe('manager-registration')
    clock.advance(1)
    expect(snapshot(host).game?.phase).toBe('cup-draw')
    expect(snapshot(host).timer?.kind).toBe('cup-draw')
    expect(snapshot(host).players.every((player) => player.clubName && player.clubPrimary && player.clubSecondary)).toBe(true)
    for (const player of snapshot(host).players) {
      const club = snapshot(host).game?.clubs.find((candidate) => candidate.id === player.clubId)
      expect(player).toMatchObject({ clubName: club?.name, clubPrimary: club?.primary, clubSecondary: club?.secondary })
    }

    coordinator.handle(guest, { type: 'chat', text: 'Boa sorte!' })
    expect(snapshot(host).chat.at(-1)?.text).toBe('Boa sorte!')
    expect(snapshot(host).chat.at(-1)?.author).toBe('Ana')
  })

  it('fills the same open room and starts it after the lobby countdown', () => {
    const clock = new FakeClock()
    const coordinator = new RoomCoordinator(clock)
    const first = new FakeConnection()
    const second = new FakeConnection()

    coordinator.handle(first, { type: 'join-open', name: 'Um' })
    coordinator.handle(second, { type: 'join-open', name: 'Dois' })

    expect(snapshot(first).code).toBe(snapshot(second).code)
    expect(snapshot(first).timer?.kind).toBe('open-lobby')
    clock.advance(15_000)
    expect(snapshot(first).status).toBe('playing')
    expect(snapshot(first).players).toHaveLength(2)
  })

  it('awards a salary auction to the highest normalized human offer', () => {
    const clock = new FakeClock()
    const coordinator = new RoomCoordinator(clock)
    const host = new FakeConnection()
    const guest = new FakeConnection()

    coordinator.handle(host, { type: 'create-private', name: 'Oferta menor' })
    const code = snapshot(host).code
    coordinator.handle(guest, { type: 'join-private', code, name: 'Oferta maior' })
    coordinator.handle(host, { type: 'start-room', expectedRevision: snapshot(host).revision })
    clock.advance(clubDrawDurationMs(2) + 5_000)
    expect(snapshot(host).game?.phase).toBe('auction')

    const internalRoom = (coordinator as unknown as { rooms: Map<string, { game?: GameState }> }).rooms.get(code)
    if (!internalRoom?.game) throw new Error('Expected room game')
    for (const club of internalRoom.game.clubs) club.cash = 100_000_000
    const guestClubId = snapshot(guest).players.find((player) => player.id !== snapshot(guest).hostId)?.clubId
    if (!guestClubId) throw new Error('Expected guest club')
    const balances = new Map(internalRoom.game.clubs.map((club) => [club.id, club.cash]))
    const ledgerStart = internalRoom.game.ledger.length

    coordinator.handle(host, {
      type: 'action',
      expectedRevision: snapshot(host).revision,
      action: { type: 'auction-offer', salary: 63_920 },
    })
    coordinator.handle(guest, {
      type: 'action',
      expectedRevision: snapshot(guest).revision,
      action: { type: 'auction-offer', salary: 63_930 },
    })

    expect(snapshot(host).game?.auctionResult).toMatchObject({ clubId: guestClubId, success: true })
    expect(snapshot(host).game?.auctionResult?.text).toContain('63.950')
    const game = snapshot(host).game!
    const transfers = game.ledger.slice(ledgerStart).filter((entry) => entry.type === 'transfer')
    expect(transfers).toHaveLength(2)
    expect(transfers.reduce((sum, entry) => sum + entry.amount, 0)).toBe(0)
    for (const club of game.clubs) {
      expect(club.cash - balances.get(club.id)!).toBe(transfers.filter((entry) => entry.clubId === club.id).reduce((sum, entry) => sum + entry.amount, 0))
    }
  })

  it('rejects an unaffordable salary bid instead of letting a lower AI offer appear to beat it', () => {
    const clock = new FakeClock()
    const coordinator = new RoomCoordinator(clock)
    const host = new FakeConnection()

    coordinator.handle(host, { type: 'create-private', name: 'Sem verba' })
    coordinator.handle(host, { type: 'start-room', expectedRevision: snapshot(host).revision })
    clock.advance(clubDrawDurationMs(1) + 5_000)
    const started = snapshot(host)
    const internalRoom = (coordinator as unknown as { rooms: Map<string, { game?: GameState }> }).rooms.get(started.code)
    const listing = internalRoom?.game?.market[0]
    const club = internalRoom?.game?.clubs.find((candidate) => candidate.id === started.players[0]?.clubId)
    if (!listing || !club) throw new Error('Expected active auction and managed club')
    club.cash = Math.max(0, listing.fee - 1)

    coordinator.handle(host, {
      type: 'action',
      expectedRevision: started.revision,
      action: { type: 'auction-offer', salary: Math.max(9_000, listing.minimumSalary) },
    })

    expect(host.messages.at(-1)).toMatchObject({ type: 'error', message: expect.stringContaining('DINHEIRO INSUFICIENTE') })
    expect(snapshot(host).submittedPlayerIds).not.toContain(started.players[0]?.id)
    expect(snapshot(host).game?.auctionResult).toBeUndefined()
  })

  it('keeps the international listing after regular auctions and debits only its highest human bidder', () => {
    const { coordinator, clock, host, guest, room, listing, hostId, guestId } = internationalAuction()
    // Reach the final listing through the ordinary shared-room decisions.
    for (let auction = 0; auction < 10 && !room.game.market[0].internationalPlayer; auction++) {
      for (const connection of [host, guest]) coordinator.handle(connection, { type: 'action', expectedRevision: snapshot(connection).revision, action: { type: 'auction-offer' } })
      clock.advance(snapshot(host).timer!.durationMs)
    }
    expect(snapshot(host).game!.market[0]).toEqual(listing)
    expect(snapshot(guest).game!.market[0]).toEqual(listing)
    for (const club of room.game.clubs) club.cash = 100_000_000
    const balances = new Map(room.game.clubs.map((club) => [club.id, club.cash]))
    const population = room.game.clubs.flatMap((club) => club.players).length
    const ledgerStart = room.game.ledger.length
    coordinator.handle(host, { type: 'action', expectedRevision: snapshot(host).revision, action: { type: 'auction-offer', salary: 63_000 } })
    coordinator.handle(guest, { type: 'action', expectedRevision: snapshot(guest).revision, action: { type: 'auction-offer', salary: 64_000 } })
    expect(room.game.auctionResult).toMatchObject({ success: true, clubId: guestId, auction: { playerName: listing.internationalPlayer!.name } })
    const transfers = room.game.ledger.slice(ledgerStart).filter((entry) => entry.type === 'transfer')
    expect(transfers).toHaveLength(1)
    expect(transfers[0]).toMatchObject({ clubId: guestId, amount: -listing.fee, externalTransfer: true })
    expect(room.game.clubs.find((club) => club.id === hostId)!.cash).toBe(balances.get(hostId))
    for (const club of room.game.clubs) expect(club.cash).toBe(balances.get(club.id)! - (club.id === guestId ? listing.fee : 0))
    const player = room.game.clubs.find((club) => club.id === guestId)!.players.find((candidate) => candidate.id === listing.playerId)
    expect(player).toMatchObject({ salary: 64_000, contractSeasons: 1, contractRounds: 14 })
    expect(room.game.clubs.flatMap((club) => club.players)).toHaveLength(population + 1)
    expect(room.game.clubs.flatMap((club) => club.players).filter((candidate) => candidate.id === listing.playerId)).toHaveLength(1)
  })

  it.each(['full squad', 'insufficient cash'] as const)('rejects an international bid with %s without recording a decision', (reason) => {
    const { coordinator, host, room, listing, hostId } = internationalAuction()
    room.game.market = [listing]
    const club = room.game.clubs.find((candidate) => candidate.id === hostId)!
    club.cash = 100_000_000
    if (reason === 'full squad') {
      while (club.players.length < 24) club.players.push({ ...club.players[0], id: `full-squad-${club.players.length}` })
    } else club.cash = listing.fee - 1
    const before = structuredClone(room.game)
    coordinator.handle(host, { type: 'action', expectedRevision: snapshot(host).revision, action: { type: 'auction-offer', salary: 64_000 } })
    expect(host.messages.at(-1)).toMatchObject({ type: 'error', message: expect.stringContaining(reason === 'full squad' ? 'PLANTEL CHEIO' : 'DINHEIRO INSUFICIENTE') })
    expect(snapshot(host).submittedPlayerIds).not.toContain(snapshot(host).hostId)
    expect(room.game).toEqual(before)
  })

  it('never chooses either human club as an AI buyer after an international auction timeout', () => {
    const { clock, host, room, listing, hostId, guestId } = internationalAuction()
    room.game.market = [listing]
    for (const club of room.game.clubs) club.cash = [hostId, guestId].includes(club.id) ? 100_000_000 : -1
    const before = structuredClone(room.game)
    clock.advance(snapshot(host).timer!.durationMs)
    expect(room.game.auctionResult).toMatchObject({ success: false, text: expect.stringContaining('NÃO FOI TRANSFERIDO') })
    expect(room.game.auctionResult?.clubId).toBeUndefined()
    expect(room.game.clubs).toEqual(before.clubs)
    expect(room.game.ledger).toEqual(before.ledger)
    expect(room.game.market).toEqual([])
  })

  it('retains a new international arrival through the next-round multiplayer market filter', () => {
    const { coordinator, host, guest, room } = internationalAuction()
    room.game.phase = 'standings'
    room.game.lastReport = { leagueResults: [], cupResults: [], transferMessages: [], headlines: [] }
    let arrivalRng = 1
    while (rng.random(arrivalRng).value >= INTERNATIONAL_ARRIVAL_PROBABILITY) arrivalRng++
    room.game.internationalMarket!.rngState = arrivalRng
    const expected = drawInternationalArrival(room.game.internationalMarket, room.game.season, 2, room.game.seed,
      [...room.game.clubs, ...(room.game.libertadores?.invitedClubs ?? [])].flatMap((club) => club.players),
      room.game.internationalMarket!.targetPlayerCount).listing
    expect(expected).toBeDefined()
    for (const connection of [host, guest]) coordinator.handle(connection, { type: 'action', expectedRevision: snapshot(connection).revision, action: { type: 'continue' } })
    expect(room.game).toMatchObject({ phase: 'auction', currentRound: 2 })
    expect(room.game.market.at(-1)).toEqual(expected)
    expect(snapshot(host).game!.market.at(-1)).toEqual(expected)
    expect(snapshot(guest).game!.market.at(-1)).toEqual(expected)
  })

  it('cancels a stale international listing and continues the shared auction queue', () => {
    const { clock, host, room, listing, hostId, guestId } = internationalAuction()
    const next = room.game.market.find((candidate) => !candidate.internationalPlayer)!
    room.game.market = [listing, next]
    room.game.clubs.find((club) => ![hostId, guestId].includes(club.id))!.players.push({ ...listing.internationalPlayer! })
    const before = structuredClone(room.game)
    clock.advance(snapshot(host).timer!.durationMs)
    expect(room.game.auctionResult).toMatchObject({ success: false, text: 'A TRANSFERÊNCIA FOI CANCELADA' })
    expect(room.game.market).toEqual([next])
    expect(room.game.clubs).toEqual(before.clubs)
    expect(room.game.ledger).toEqual(before.ledger)
    clock.advance(snapshot(host).timer!.durationMs)
    expect(snapshot(host).timer?.kind).toBe('auction')
    expect(room.game.auctionResult).toBeUndefined()
    expect(room.game.market[0]).toEqual(next)
  })

  it('enforces auction, regular-turn, and halftime clocks on the shared game', () => {
    const clock = new FakeClock()
    const coordinator = new RoomCoordinator(clock)
    const host = new FakeConnection()

    coordinator.handle(host, { type: 'create-private', name: 'Relógio' })
    coordinator.handle(host, { type: 'start-room', expectedRevision: snapshot(host).revision })
    expect(snapshot(host).timer).toMatchObject({ kind: 'club-draw', durationMs: clubDrawDurationMs(1) })
    clock.advance(clubDrawDurationMs(1))
    expect(snapshot(host).game?.phase).toBe('cup-draw')
    clock.advance(5_000)
    expect(snapshot(host).game?.phase).toBe('auction')
    expect(snapshot(host).timer?.durationMs).toBe(10_000)

    let safety = 0
    while (snapshot(host).game?.phase === 'auction' && safety < 10) {
      clock.advance(12_500)
      safety += 1
    }
    expect(snapshot(host).game?.phase).toBe('pre-round')
    expect(snapshot(host).timer).toMatchObject({ kind: 'regular-turn', durationMs: 45_000 })

    clock.advance(45_000)
    expect(snapshot(host).game?.phase).toBe('first-half')
    clock.advance(19_000)
    expect(snapshot(host).game?.phase).toBe('half-time')
    expect(snapshot(host).timer).toMatchObject({ kind: 'half-time', durationMs: 15_000 })
    clock.advance(15_000)
    expect(snapshot(host).game?.phase).toBe('second-half')
  })
})
