# Contributing to Emifoot

Emifoot is a Portuguese-language football manager with a DOS-inspired interface.
Start with the [README](README.md), [product rules](docs/PRODUCT.md), and
[architecture](docs/ARCHITECTURE.md).

## Development

Use Node.js 24 and pnpm 10.12.1 (pinned in `package.json`). Run
`pnpm install --frozen-lockfile`, then `pnpm dev`. Multiplayer also needs
`pnpm dev:server` in another terminal. No account, API key, or database is needed.
See [multiplayer operations](docs/MULTIPLAYER.md) for production settings.

## Making changes

- Keep game rules deterministic in `src/game`. Pass explicit state and input;
  do not introduce browser APIs, wall clocks, or network calls into the engine.
- Keep multiplayer decisions authoritative on the server. Validate incoming
  commands and test seat ownership, phase restrictions, and reconnection.
- Preserve existing careers when changing state. Update the Zod schema and
  migration tests together; never silently replace saved player data.
- Follow the existing TypeScript, two-space indentation, single-quote, and
  plain-CSS conventions. Keep game text in Portuguese and project docs in English.
- Add a focused regression test for behavior changes. For interface changes,
  check keyboard controls, desktop and narrow screens, and browser console errors.
- Treat generated rosters as snapshots. Follow [roster maintenance](docs/DATA.md)
  and review player identities and save compatibility before committing changes.
- Do not commit credentials, local saves, reconnect tokens, generated builds,
  dependencies, or third-party material without documented provenance.

Run `pnpm check` while developing and `pnpm verify` before submitting a change.
Install Chromium with `pnpm exec playwright install chromium` and run
`pnpm test:e2e` for browser or multiplayer changes.
The latter includes lint, strict type checks, the full test suite (including
season simulations), both production builds, and real WebSocket transport checks.
See [testing](docs/TESTING.md) for the covered scenarios.

## Issues and pull requests

Describe the problem, expected behavior, and steps to reproduce it. For game-rule
bugs, include the season/round, game mode, and seed when available. Redact private
room credentials and personal information from screenshots or save excerpts.

Keep pull requests focused and explain what changes for a player, how it was
verified, and any save compatibility or deployment implications. Discuss large
design changes in an issue first. Report vulnerabilities using
[the security policy](SECURITY.md), not a public issue.
