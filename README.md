# Emifoot

A browser football manager with the speed, dense screens, and keyboard controls
of classic DOS games. Built with TypeScript, React, and a deterministic game
engine shared by the browser and multiplayer server. The game is in Portuguese.

Emifoot is an independent remake in tribute to the original Elifoot II, created
by [André Elias](https://www.elifoot.com/). Emifoot is not affiliated with,
endorsed by, or sponsored by André Elias or the official Elifoot project.
Visit the [official Elifoot website](https://www.elifoot.com/) to discover and
support the original game.

## Play

- **Solo career:** four Brazilian divisions of eight clubs, a national cup,
  Libertadores groups and knockouts, tactics, transfers, contracts, annual
  sponsorship offers, finances, stadium management, promotions, relegations,
  and career awards.
- **Multiplayer:** private invite rooms or open matchmaking, up to eight human
  managers, shared match state, chat, and timed decisions. Private league creators
  can pause; online leagues start automatically.
- **Browser saves:** one automatically updated solo career. Multiplayer seats
  can reconnect from the same browser; empty rooms are retained for up to
  30 minutes, subject to server capacity. Restarting the server removes rooms.

No account, database, or API key is required. The game runs from the bundled
roster snapshots; it does not fetch player data while you play.

## Run locally

Use **Node.js 24** (`nvm use` if you use nvm) and **pnpm 10.12.1**. Install that
pnpm version with `npm install --global pnpm@10.12.1` if needed.

```bash
git clone https://github.com/emilianoabad/emifoot-open.git
cd emifoot-open
pnpm install --frozen-lockfile
pnpm dev
```

Open the local URL printed by Vite. Solo play works immediately. For multiplayer,
run `pnpm dev:server` in a second terminal; Vite proxies WebSockets to
`127.0.0.1:8789`.

For faster playtesting, use `pnpm dev:fast` and, for multiplayer,
`pnpm dev:server:fast`. Each half lasts one second. Solo halftime waits for your
input; multiplayer retains its 15-second decision window. Production ignores
these fast-mode flags.

## Verify

```bash
pnpm check     # lint, unused code, strict types, unit/property/component/simulation tests
pnpm verify    # all checks, production builds, WebSocket and release installer tests
pnpm exec playwright install chromium
pnpm test:e2e  # desktop/mobile solo, invites, multiplayer and reconnection
```

CI runs verification and browser journeys for pull requests and pushes to `main`. Use
`pnpm test:watch` while developing or `pnpm test:simulation` for season checks.
See [testing](docs/TESTING.md) for covered scenarios and focused commands.

## Install and update

[Tagged releases](https://github.com/emilianoabad/emifoot-open/releases) include
static browser files, a self-contained Node.js multiplayer server, dependency
licenses, and SHA-256 checksums. The runtime supports Node.js 22.12+ or 24.

See [installation and upgrades](docs/INSTALLATION.md) for a complete Linux setup,
versioned installs, reverse proxy configuration, and rollback. Builds support
both a domain root and a subdirectory without editing source files:

```bash
EMIFOOT_PUBLIC_URL=https://games.example.org/football/ pnpm build
pnpm build:server
EMIFOOT_BASE_PATH=/football/ pnpm start:server
```

The example hostname is replaced with your own installation URL. The browser
and server are deployed together. Restarting the server ends active multiplayer
rooms, so updates are explicit operations.

## Project map

| Path | Responsibility |
| --- | --- |
| `src/game/` | Pure game commands, seeded simulation, economy, competitions |
| `src/ui/` | DOS-style screens, keyboard controls, solo controller |
| `src/multiplayer/` | Client protocol, sessions, lobby, chat, synchronization |
| `src/persistence/` | IndexedDB saves, Zod validation, migrations |
| `src/data/` | Versioned roster snapshots and data tests |
| `server/` | Authoritative rooms, clocks, transport limits |
| `scripts/` | Roster tools, transport checks, release packaging and installation |
| `build/`, `e2e/` | Portable build configuration and real browser tests |
| `deploy/` | Generic systemd and reverse proxy examples |

## Contribute and learn

- [Contributing](CONTRIBUTING.md) and [security reporting](SECURITY.md)
- [Product and rules](docs/PRODUCT.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Multiplayer protocol and operations](docs/MULTIPLAYER.md)
- [Roster maintenance](docs/DATA.md)
- [Testing strategy](docs/TESTING.md)

## License and credits

The original application code is licensed under the [MIT License](LICENSE).
The bundled VGA font has its own CC BY-SA 4.0 license. See
[third-party notices](THIRD_PARTY_NOTICES.md) for font and dependency notices
and the Elifoot tribute.
