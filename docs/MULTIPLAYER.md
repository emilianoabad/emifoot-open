# Multiplayer protocol and operations

## Room model

The browser connects to one same-origin WebSocket endpoint at `/emifoot/ws` in
production and `/ws` in local development. A private room has a six-character
code and a shareable `/invite/?room=CODE` link. Open matchmaking joins the oldest waiting
open room with a free seat or creates one. Eight is the hard room limit.

The title screen has three modes: `CARREIRA SOLO`, `LIGA COM AMIGOS`, and
`LIGA ONLINE`. Friends leagues offer create-room and enter-code choices; online
leagues ask for a manager name and immediately enter the automatic queue.
Room and manager fields only appear after the choice. The URL contains only the
room code; the creator's name stays in the
human-readable invitation text and is never exposed as a query parameter. A
dedicated static invitation page gives social crawlers the Emifoot Multiplayer
title, nostalgic description, and 1200×630 image, then redirects a real browser
to the room's name-entry screen. The share control uses the device share sheet
when available and otherwise copies the invitation and link.

The coordinator stores rooms only in process memory. It owns the game seed,
clubs, market, fixtures, ready flags, timers, and the last 100 chat messages.
There is intentionally no database, account, or permanent multiplayer save.
Restarting the process removes every room.

Each browser receives an unguessable reconnect token for its seat. A versioned
localStorage list stores the token, room code, manager name, mode, and club label;
it never stores authoritative game state. The title screen's `RETOMAR LIGA` opens
this list. Closing the tab, returning to the menu, or following the room invite
again resumes the same manager and club. Previous sessionStorage credentials
are migrated after the next successful reconnect. Tokens never enter invite
URLs, public snapshots, or chat. Recovery works in the same browser profile and
device, while its storage remains available.

Network loss retries automatically. Only one connection can control a seat: a
new tab replaces the old socket, whose 4001 close code stops automatic retries.
Unavailable/expired rooms remove the stale local entry and display an error
instead of retrying indefinitely.

When the last manager leaves a private lobby or a running league, the server
freezes its phase clock and retains it for up to 30 minutes. A returning manager
cancels expiry and restores the remaining time, except that manual pauses still
require the original creator. Another complete disconnection starts a new
30-minute window. Public queue seats have no assigned club and are released
immediately on disconnect; an empty public lobby is removed immediately.
Server restarts still remove all rooms; this is reconnect retention, not a
durable multiplayer save.

At the 32-room limit, a new room reclaims an empty room rather than rejecting
all new games until retention expires. Unstarted empty lobbies are reclaimed
first, then the longest-idle empty running room. A room with any connected
manager is never reclaimed. Credentials for reclaimed rooms become unavailable.

## Creator controls and automatic leagues

Only the original creator of a private room can start, pause, or resume it.
Creator rights never transfer on disconnect, and filling all eight private
seats does not start a league automatically. `PAUSAR LIGA` freezes every phase
timer and blocks every gameplay command on the server; chat remains available.
`RETOMAR LIGA` restores the exact remaining duration and any submitted decisions.
The pause survives the creator's disconnect and reconnect.

Public leagues expose no creator or manual start/pause controls. They fill the
oldest waiting room, start after 15 seconds with at least two connected managers,
or immediately at eight. Dropping below two cancels the countdown; reaching two
again starts a fresh 15-second countdown. After kickoff, new entrants go to a
new lobby; only returning seat owners can enter a running league.

## Authority and synchronization

Clients send Zod-validated commands; they never submit scores, tables, money, or
complete replacement state. The server applies commands to the shared pure game
engine and broadcasts a revisioned snapshot personalized with the receiving
manager's club. Commands are validated again against phase, squad membership,
lineup rules, cash, contracts, and stadium constraints.

Every human manager receives a distinct club drawn from the eight clubs that
start in Division 4. The server assigns every club at once, then runs a shared
club-draw phase that reveals one manager and full club name every 1.5 seconds and
holds the completed list for three seconds in the same manager-registration
table used by single player. A reconnecting client derives the
current reveal from the authoritative room clock, so it rejoins the same point
in the sequence. Remaining clubs in all divisions are controlled by the existing
deterministic AI. The server prevents ordinary market listings from selling
contracted human-club players without that manager's action.
Direct player sales can choose only AI-controlled buyers, including when another
human manager is disconnected; their club cannot be charged without consent.
After the reveal, the player strip above chat receives each assigned club's
authoritative name, primary color, and secondary color from the server.

## Phase clocks

| Phase | Duration | Early completion |
| --- | ---: | --- |
| Club assignment draw | 1.5 seconds per manager + 3 seconds | No; synchronized presentation |
| Salary offer | 10 seconds | Every connected manager submits or passes |
| Pre-round management | 45 seconds | Every connected manager marks ready |
| First half | 19 seconds | Server animation clock |
| Half-time decisions | 15 seconds | Every connected manager marks ready |
| Second half | 19 seconds | Server animation clock |
| Relevant injury notice | 5 seconds | No; only human-controlled clubs are shown |
| Standings | 5 seconds | Every connected manager continues |
| Season change | 10 seconds | Every connected manager continues |

Disconnected managers do not block an early transition; the phase clock still
protects the rhythm when somebody stops responding. AI controls unassigned
clubs. Disconnected managers keep their clubs, pass
new auctions, and retain valid lineups; necessary automatic injury substitutions
still apply. Their clubs do not receive AI purchases or voluntary sales. Already
submitted financial decisions remain valid. The interface only displays a
blinking countdown above chat
while the connected receiving manager still has an auction, pre-round, or
half-time decision to make and the league is not paused. Draw, match, result,
lobby, and already-submitted states keep
the countdown hidden. The open lobby displays its own start countdown. Live-match
progress and both club/cup draws follow the server clock, including reconnection
and frozen remaining time.

## Local operation

```bash
pnpm install
pnpm dev:server
```

Run `pnpm dev` in another terminal. Vite proxies `/ws` to the room process on
`127.0.0.1:8789`. The server exposes `GET /health` for deployment checks.

The production build produces static browser files under `dist/` and one
Node.js server bundle at `server-dist/index.js`. Run it with:

```bash
HOST=127.0.0.1 PORT=8789 node server-dist/index.js
```

The reverse proxy forwards WebSocket upgrades for `/ws` (or the configured
base path plus `ws`) to that local port. See [installation](INSTALLATION.md)
for release downloads, reverse proxy examples, updates, and rollback.

## Configuration and deployment limits

| Setting | Default | Purpose |
| --- | --- | --- |
| `EMIFOOT_PUBLIC_URL` | Unset | Build-time canonical URL; its path also sets the browser base |
| `EMIFOOT_BASE_PATH` | `/` | Browser build path and server route prefix; takes precedence over the URL path |
| `HOST` | `127.0.0.1` | Server bind address; keep loopback behind a local proxy |
| `PORT` | `8789` | Server listening port |
| `VITE_MULTIPLAYER_WS_URL` | Same origin plus base path and `/ws` | Optional public browser endpoint, set at client build time |
| `VITE_LOCAL_FAST_MODE` | Off | Local Vite fast clock only |
| `EMIFOOT_LOCAL_FAST_MODE` | Off | Server fast clock, also requires `NODE_ENV=development` |

`VITE_*` values are embedded in browser code; never put credentials in them.
The Node process reads environment variables supplied by its launcher and does
not load an `.env` file itself.

Use HTTPS/WSS outside local development. Serve the built static files with your
web server and forward WebSocket upgrades to the room process. `GET /health`
and the configured base path plus `health` return the running version and room count.
The Vite development server is not a production server.

The transport caps payloads at 16 KiB, active sockets at 256 overall and 16 per
address, upgrade attempts at 30 per address per minute, and outgoing buffers at
4 MiB per socket. Data and control frames share a per-socket burst budget.
`X-Real-IP` is trusted only from loopback: the local proxy must overwrite it
with a verified client address. Never forward an untrusted incoming value.
When using a CDN, accept its client-IP header only from verified CDN traffic.
Without a trusted proxy header, all clients behind the proxy share its limits.

Rooms live in one process. Multiple replicas need consistent room routing and
additional coordination; there is no shared state or restart recovery.

Builds default to the origin root. Set `EMIFOOT_PUBLIC_URL` for canonical and
social metadata, and `EMIFOOT_BASE_PATH` when using a subdirectory. The browser,
invite page, development proxy, and image paths use the same configuration.
Set the same base path on the production server and reverse proxy. Build-time
settings require a rebuild; they cannot be changed by restarting the server.

## Casual multiplayer

The deterministic snapshot is shared with each client, so a modified client can
predict simulation outcomes. The server validates actions and owns all state;
this game is designed for casual multiplayer with friends.
