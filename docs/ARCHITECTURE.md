# Architecture

## Stack

- React 19 and Vite 8 for the browser client.
- TypeScript 6 in strict mode.
- Plain CSS for a VGA/DOS interface; no component framework.
- Zod at persistence and multiplayer command boundaries.
- IndexedDB through `idb` for one automatically updated local career.
- Node.js and `ws` for ephemeral authoritative multiplayer rooms.
- Vitest, fast-check, Testing Library, and fake-indexeddb for engine and component tests.
- Playwright for desktop/mobile browser journeys; Knip for unused-code checks.

## Boundaries

```text
React screens -> useGame controller -> pure game commands -> GameState
                                           |
                                           +-> seeded RNG
                                           +-> match/league/cup/Libertadores engines
                                           +-> finance/transfer/career engines

save repository <-> versioned Zod snapshot <-> GameState
```

Everything under `src/game` is independent of React, the DOM, clocks, and
network calls. A command receives state plus explicit input and returns a new
state or a typed error. Randomness advances a serializable 32-bit RNG state.
This makes a game replayable and lets tests assert exact outcomes.

After standings and any sponsorship announcement, the engine creates a
serializable competition-event queue for that date.
The engine fast-simulates events without a managed participant and exposes a
normal pre-match phase for those with one. A single queue is shared by local
and multiplayer commands, so simultaneous Copa and Libertadores dates retain a
deterministic order and season finalization waits for both competitions.

Annual renewal records retirements, positional academy quotas, candidate pools
and selected players in a serializable offseason plan. Sponsorship selection
precedes retirement notices, academy selection and the Copa draw. Repeated
commands and reloads reuse the same plan. Each human choice replaces that club's
provisional automatic intake, preserving the roster population; the server uses
the same command when a manager's deadline expires. Older snapshots without a
pending academy list retain their already completed automatic intake.

The UI never derives authoritative scores, balances, tables, or transfers. It
renders engine state and dispatches commands. Autosave happens only after a
successful command.

## Persistence

Save snapshots carry a schema version, roster snapshot ID, and timestamp. Zod
validates reads. Migration functions are the only place allowed to reshape an
old snapshot. New careers use the latest bundled roster; an existing career
keeps its embedded players and never changes beneath the manager.

## Multiplayer

The pure engine is shared by browser and server. Multiplayer needs no database:
an ephemeral room coordinator keeps each authoritative room in memory
and serializes Zod-validated commands over WebSockets:

```text
browser -- command + expectedRevision --> authoritative room process
browser <-- event + newRevision -------- authoritative room process
                                  |
                                  +--> deterministic engine state in memory
```

The service assigns seats and random fourth-division clubs, advances when all human
managers are ready (or their timer expires), relays chat, and broadcasts a
revisioned personalized snapshot. A room supports one to eight humans and AI
fills every unassigned club. Private rooms start when the host chooses; open
rooms fill automatically, start immediately at eight, or begin after a short
queue countdown once at least two managers are present. The original private-room creator alone controls start and pause. Public
leagues have no creator privileges. Empty running leagues retain a frozen
snapshot and clock in memory for up to 30 minutes, subject to capacity; browser credentials survive tab
closure in versioned localStorage. If the room process stops, its disposable
game is lost.

## Visual system

The app renders a logical 640 x 400 surface with nearest-neighbour scaling. Its
palette is limited to VGA-like blue, cyan, green, red, yellow, gray, black, and
white. Borders are square one-pixel double lines; text uses a local monospace
fallback stack; there are no shadows, gradients, rounded cards, stock icons,
crests, or portraits. At small viewports the logical screen may scroll or fit,
but the internal arrangement stays recognizable rather than turning into a
modern mobile app. Narrow portrait layouts reflow panels and expose larger touch
targets while preserving the DOS palette and typography.

## Scope

- No original DOS binary or assets.
- No proprietary player ratings.
- No online accounts, permanent room history, or cross-device cloud saves.
- No database; server restarts intentionally discard multiplayer rooms.
- No payments or monetization.
