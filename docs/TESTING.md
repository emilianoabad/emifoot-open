# Testing

Use Node.js 24 and the pinned pnpm version. CI uses a frozen lockfile and runs
the same commands as local development:

```bash
pnpm install --frozen-lockfile
pnpm verify
pnpm exec playwright install --with-deps chromium
pnpm test:e2e
```

`pnpm verify` runs lint, Knip unused-code checks, strict TypeScript, Vitest,
browser/server builds, live WebSocket checks, and release installer tests.
Browser journeys run separately against production builds at `/qa/`, exercising
subdirectory hosting as well as game behavior.

## Coverage

| Layer | What it protects |
| --- | --- |
| Engine and property tests | Seed determinism, legal lineups, fixtures, competitions, accounting, contracts, finance, injuries, career transitions |
| Multi-season simulations | Population, ownership, balance, competition and roster invariants over long careers |
| Persistence | Schema validation, older-career migrations, serialized autosaves, storage failures, loading after queued writes |
| React components | Keyboard/focus behavior, auctions, commands, match phases, error feedback, saved careers |
| Room coordinator | Seat ownership, revisions, creator controls, timers, reconnect retention, room reclamation, human-club permissions |
| Live transport | Upgrade paths, invalid messages, payload/socket/rate limits, backpressure and proxy address handling |
| Playwright | Desktop/phone solo create/manage/resume, cup receipts, season awards, sponsorship offers and finances, government notices, invitations, two-browser league start/pause/reconnect |
| Release installer | Checksums, idempotent install, staged activation, rollback, concurrency lock, unsafe archives |

## Focused commands

```bash
pnpm test src/ui/useGame.test.tsx
pnpm test:simulation
pnpm test:economy
pnpm test:server
pnpm test:release
pnpm test:e2e --project=phone
pnpm test:watch
```

Playwright saves title, squad, cup payout, season awards, sponsorship, and multiplayer
screenshots in `test-results/`.
Failures retain a trace and screenshot. Inspect interface changes at both
viewport sizes: automated checks cannot judge visual quality. Review keyboard
navigation, touch targets, contrast, and console output. Generated test outputs
are ignored by Git.

Simulation seeds are fixed and each long seed runs as a separate case. Reproduce
a failure with its reported seed before changing an invariant or timeout. Add
regressions at the boundary where a bug entered the system.

## Economy and inflation

Lifecycle tests exercise 45,000 retirement decisions and 50 annual renewals,
including entire squads and all goalkeepers retiring together. They preserve
population, squad limits, ownership, lineup/market references and exact cash
accounting. Academy regressions reject missing, duplicate, foreign-club and
wrong-position selections, check saved candidate pools across reloads, and
prove that manual picks replace the automatic intake without adding players.
Multiplayer tests cover per-club ownership, unaffected managers and automatic
selection at the deadline. Desktop/phone checks cover the retirement list,
academy choices, scrolling, saves and continuation before the next season.

`pnpm test:economy` includes 24 opening-season seeds, four 50-season careers
(two seeds, with the human manager either passing and signing safe sponsors or
buying upgrades and signing betting sponsors when legal), prize accounting and a 200-resale
stress test in a league with Cr$ 32 billion. Every
auction uses the real engine. The long runs clear historical ledger/news rows
between seasons for speed, retaining balances, squads, wages, contracts,
standings and career progress. Saves are validated after every season.

Sponsorship tests also run 50,000 financial seasons with bets initially legal,
and check the exact active fraction for both initial government positions.
They verify the one-change-per-season
average and a betting/safe realized income ratio between 0.88 and 0.92 under
the advertised result probabilities. Engine, save, UI and room tests cover
club changes, promotion, all award premiums, offer ownership, deadlines,
three non-betting offers during bans, migration of old pending proposals,
one-season expiry, suspension, reinstatement without arrears and selective
government notices. Desktop/phone journeys cover offer selection and reloads,
the signed contract and finance ledger, and both government messages on their
own screen after the full standings, including reload and continuation.

For per-season JSON measurements alongside the test results:

```bash
EMIFOOT_ECONOMY_REPORT=1 pnpm test:economy --reporter=default
```

The mathematical checks distinguish money creation from player-price inflation:

- **Price index:** the total fee for a fixed basket of strength-10/20/30/40/50,
  age-26 players divided by the opening basket price must remain 1. Nonzero
  auction quotes divided by reference quotes for the same strength and age must
  also remain 1. This catches both valuation drift and cash-dependent markups.
  Annualized inflation is `(P_50 / P_1)^(1/49) - 1`, which must remain zero.
  Every active player's valuation must also equal the strength/age formula.
  Raw median prices may change as retirees are replaced by younger players;
  that change in the roster is not a change in the price of the same player.
- **Wage index:** total salaries divided by the fair salaries for current
  strength/age must stay at or below 1.6. Repeated sales may not compound wages
  past the AI's quality-based limit.
- **Market activity:** each season must resolve at least 70 auctions, including
  at least 12 for strength-40+ players. Clubs no longer buy unusable players to
  inflate transfer counts: liquidity measures auctions with genuine AI sporting
  demand and a squad vacancy. At least 60% must find funding in any single year,
  and at least 75% across the final decade. For players of strength 30+, at least
  95% of wanted auctions must be funded in every season. Useful direct-sale
  quotes must find a buyer at least 80% of the time each year and 90% across the
  final decade. Raw no-offer rates are still reported, including human-only
  opportunities that the simulated manager declines.
- **Talent and division strength:** peak talent must remain exactly unchanged
  for every surviving player across transfers, promotions and 50 season renewals.
  Fractional ability must agree with displayed strength; no 40-year-old may
  remain strength 30+. Every season needs at least 64 active strength-40+ players,
  and division first-team means must stay above 38/30/21/11. Whole-roster means
  must stay above 36/27/18/10, with division four below 25, catching both talent
  dilution and uniform growth toward the top of the scale. At least 28 of the
  32 clubs must remain solvent.
- **Accounting:** for every club, cash change must equal its ledger. Across
  the 32 domestic clubs, domestic transfer payments sum to zero and
  `M_next - M = prizes + tickets + sponsors - wages - maintenance - construction - fees paid abroad`.
  The prize budget must equal Cr$ 10,587,500, plus Cr$ 250,000 for a domestic
  Libertadores winner; duplicate payouts cannot be hidden as ordinary growth.
- **Sponsorship:** each club receives exactly 14 ledger entries, one per league
  round. Non-betting totals equal `14 × base + wins × winBonus + draws × drawBonus`.
  No cup match creates an installment. Offers are bounded independently of club
  wealth, previous contracts and unlimited member growth.
- **Betting risk:** with `p = 1/14`, the chance of allowed betting on round `t`
  is `q_t = 1/2 + (q_0 - 1/2) × (1 - 2p)^t`. Let `A` be the average of
  `q_1 … q_14`. The betting quote multiplies the better safe offer's terms by
  `0.9 / A`; rounding aside, its forecast expected revenue is 90% of that safe
  offer. Independent match-result and regulation draws validate the expectation.
- **Cash growth:** each club's ledger must reconcile exactly. Income ceilings
  use full stadiums, the AI ticket ceiling (or a human's higher chosen price),
  bounded sponsorships and all available prizes. Each season's ceiling accounts
  for seven home league dates per club, 31 Copa matches, at most 12 domestic
  Libertadores home group games and seven home knockout games. Closing stadium
  capacity bounds earlier capacity even when clubs build during the season;
  opening capacity supplies the minimum maintenance-cost bound.
  Cumulative cash cannot exceed opening money plus those yearly ceilings minus
  unavoidable wages and maintenance. No revenue, valuation or wage benchmark
  compounds with accumulated cash. Prize savings may grow; the tests distinguish
  those savings from a rising price for the same player.

Development unit tests additionally exercise the smooth age curve, bounded
teammate effects, exponential resistance away from talent, seeded fluctuations,
bench aging, save migration and roster-order independence. AI business tests
check ticket affordability, real repair/construction costs, cash reserves and
protection of every human-controlled club.

These tests detect price spirals and a market that dries up; they do not promise
every club stays solvent or every contract attracts offers. A human can still
offer an excessive wage that AI clubs refuse to take on. The larger prizes
increase total cash even when the player-price index remains flat.

International-arrival tests sample 50,000 seasons and 100,000 opening draws:
the mean is one arrival per season, over 98% have zero to three, more than three
remains possible, and eligible draws favor Brazilians about 75% of the time.
Integration checks cover normal auction order, age eligibility, saved draws,
duplicate identities, human/AI purchases, squad and cash limits, multiplayer
deadlines, unsold players, and external fee accounting. Desktop/phone journeys
reload both an international offer and its completed result.
