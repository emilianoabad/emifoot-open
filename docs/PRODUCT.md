# Product and game rules

## Product promise

Emifoot should feel like a football universe hidden inside a 640 x 400 DOS
screen: fast to read, immediate to operate, surprising over long careers, and
free of modern dashboard decoration. Fixed panels, bitmap typography, VGA colors,
and direct keyboard controls define its visual style.

## Browser layout

Desktop and landscape screens use a fixed 640 x 400 panel geometry
and scale it uniformly to the available browser area. On portrait phones, the
same DOS panels reflow into a vertical layout with readable type, scrollable
squads, and touch targets of at least 40 pixels. Dense structures that depend on
their horizontal relationships, such as the Copa bracket, remain tables and can
be scrolled sideways instead of being redesigned as modern cards.

In multiplayer portrait mode, chat becomes a bottom terminal drawer. Its header
and active decision clock remain visible while collapsed; opening it exposes
the room members, message history, and touch-sized composer without changing
the game rules. Safe-area insets are respected on phones with display cutouts.

## Competition structure

- Four national divisions, eight clubs each.
- A division season is a double round robin: 14 rounds and 56 matches.
- Each club plays seven league matches at home and seven away. The first leg
  contains three or four of each, with no run longer than two consecutive
  matches at the same venue; the return leg reverses every pairing.
- Three points for a win, one for a draw. Ranking order is points, wins, goal
  difference, goals scored, then club name.
- The top two clubs are promoted and the bottom two are relegated. Division 1
  has no promotion; Division 4 has no relegation.
- A 32-club national cup is played as five single-match knockout rounds. It uses
  the same match model as the league, with draws going to penalties. The
  phases run in parallel after league rounds 2, 5, 8, 11, and 14. The manager
  screen names the competition explicitly as `COPA DO BRASIL` and its bracket
  shows the next scheduled phase.
- The Taça Libertadores da América has 16 clubs: the previous Brazilian
  first-division top four and 12 invited leading CONMEBOL clubs. Four groups of
  four play six home-and-away matchdays after league rounds 1, 3, 5, 7, 9, and
  11. The top two in each group reach single-match quarterfinals, semifinals,
  and final after league rounds 12, 13, and 14. The first season seeds its four
  Brazilian places by the initial first-division strength order.
- Competition dates are queued after the league table. If no human-managed
  club appears in a Copa or Libertadores fixture, the complete event resolves
  immediately. If any human club participates, that event opens the normal
  squad/tactics decision, first half, half-time, second half, and results flow.
  Overlapping national and continental dates are played sequentially, never
  skipped.
- A season ends after league round 14 and both cup finals. Awards, prize money,
  promotion/relegation, player aging, and manager offers are then resolved
  before the new season.

## Match day

Each club fields 11 players and up to seven substitutes. A valid side needs
exactly one goalkeeper and may start at most four non-Brazilian players. Injured
or suspended players cannot start. The game supports ten formations:

1. 3-4-3
2. 4-3-3
3. 4-4-2
4. 4-5-1
5. 5-2-3
6. 5-3-2
7. 5-4-1
8. 5-5-0
9. 6-3-1
10. 6-4-0

Selecting a formation immediately shows the exact starting eleven—position,
player, and strength—in the large main squad area, while the tactics panel
remains the formation menu. The match starts automatically after a brief DOS
reveal; there is no confirmation action. Mouse, touch, and `1`–`0` perform the
same action.

The menu and numeric shortcuts only offer formations that available players can
cover in their natural positions, respecting injuries, suspensions and the
four-foreigner limit. If no natural formation is possible, only the existing
tactic remains for the emergency lineup; normal kickoff validation still
applies. X switches to an available formation if the current one no longer fits.
Multiplayer submissions use the same availability check.

Automatic selection fills the formation's natural positions first, then maximizes
the combined match strength: `strength × (0.65 + fitness / 250) × (0.8 + morale / 500)`.
It respects injuries and suspensions and chooses
foreign-player places across the whole eleven, rather than giving earlier
positions priority. If a position is short, another available outfield player
fills the gap; a reserve goalkeeper is not used as an outfield player. The
Brazilian four-foreigner limit does not apply to invited international clubs.

The displayed keyboard prompts work after mouse selection too: selecting a sale
player focuses its Enter confirmation; Escape cancels a salary proposal even
inside its input. X selects the best eleven, left/right arrows switch command
menus, and Enter starts from fixtures or continues to the next season. Shortcuts
are scoped to the active game screen and do not consume multiplayer chat, fire
twice alongside a focused button, or run on paused screens.

Matches stop at half-time for the human manager. Formation and up to three
substitutions may be changed before the second half. The deterministic engine
combines player strength, positional coverage, fitness, morale, tactical shape,
a fixed home advantage, and a seeded random stream. Supporters and stadium
condition affect attendance, rather than goal probabilities. The engine produces a
minute-by-minute log for goals, cards, injuries, and substitutions. Injuries
are uncommon and weighted by a stable per-player proneness value. The match
board displays `[+]` when one occurs, automatically sends on the strongest
available positional replacement, and reports the one-to-four-game absence
after the match on a dedicated injury screen, never inside the standings or
competition-results table. That screen only appears for the human club in
single player and for human-controlled clubs in multiplayer. Injured squad rows
retain `[+]` until the player is available.

The on-field and bench lists at half-time inherit the manager club's primary,
secondary, and border colors, including inverted selection colors.

On the live board, every fixture has its own scorer slot between the scoreline
and attendance. It displays that match's latest visible goal in the scoring
club's colors, keeping the event aligned with the correct game.

The browser match board advances one simulated minute every 400 ms, so a half
lasts about 18 seconds unless the player uses the visible skip control. This is
slow enough to read scorers and changing scores while keeping rounds short.

Starting repeatedly reduces fitness and resting restores it. Morale follows
results and playing time, so both values change effective match strength.
Red cards produce one-match suspensions.

### Match probabilities and scorers

Each half draws separate Poisson goal counts for both teams, then assigns the
goals to outfield players. The second half uses the current lineup, so halftime
changes affect the remaining match without rewriting the first half. The model
is shared by league, Copa, Libertadores, AI clubs and human managers.

Every player contributes effective strength `E` (the fitness/morale-adjusted
value above) to both attacking and defensive quality:

| Position | Attack weight | Defence weight | Scoring weight |
| --- | ---: | ---: | ---: |
| Goalkeeper | 0.05 | 1.20 | 0 |
| Defender | 0.20 | 0.80 | 0.10 |
| Midfielder | 0.55 | 0.45 | 0.35 |
| Forward | 0.90 | 0.20 | 1.00 |

For each phase of play, quality is `coverage × sum(E × weight) / sum(n × weight)`,
where `n` is the number of slots at each position in the selected formation.
The denominator uses required slots, not the number of present players.
`coverage = exp(-0.35 m)`, where `m` is half the sum of absolute differences
between actual and required positional counts. A natural lineup of equally
strong players therefore has the same quality in every formation. Claiming a
different shape without supplying its players loses positional coverage.

An attacking formation opens both ends of the pitch. Its tempo contribution is
`t = 0.07 (forwards - 2) - 0.035 (defenders - 4)`. For one team, the expected
goals in a half are:

```text
lambda = 0.7 exp(1.6 tanh(log(own attack / opponent defence))
                 + own tempo + opponent tempo + venue)
venue = +0.1 at home, -0.1 away
```

Relative quality keeps the goal scale stable as divisions and squads improve.
The contrast is smooth, bounded and strictly increasing: improving any player
helps both ends, with the player's position determining how much. Stronger
forwards help prevent goals, but a defender's contribution to defensive quality
is four times as large for the same improvement within the same lineup.
Formation tempo changes scoring and conceding together, rather than granting
a free attacking bonus. The expected goals remain positive and below five per
half; the actual Poisson draw has no artificial goal cap. Better quality raises
winning chances without fixing the winner of a particular game.

A scorer's relative weight is `position scoring weight × E^1.25`, normalized
over the eligible outfield players. Exceptional forwards receive a larger share
of goals, while teammates still score. Goalkeepers have zero weight. Condition
affects both team performance and finishing; hidden talent affects matches only
through the player's current displayed strength.

### Player development

Base strength follows an immutable, hidden peak talent and a smooth age curve.
Playing with stronger teammates helps; playing in a weaker team can reduce
current ability, but neither changes the player's underlying talent. Fractional
ability is saved, so small improvements accumulate before the displayed integer
changes.

For peak talent `P`, age `a` and current fractional ability `x`:

- `s = softplus(a - 33)` and `f(a) = (1 - 0.32 exp(-(a - 17)/3)) exp(-0.018 s²)`.
  The age-adjusted anchor is `A = P f(a)`: rapid early maturation, a prime near
  30, then increasingly steep decline after 33. At 40, even peak talent 50 has
  an anchor near 21.
- Company `M` weights actual teammates 80% and opponents 20%, using a frozen
  pre-development snapshot and excluding the player from their teammate mean.
  The target is `T = A + 3 asinh(0.3(M-A)/3)`, clamped to 1–50. This inverts
  the exponential restoring force `3 sinh((T-A)/3) = 0.3(M-A)`; a talent-10
  player surrounded by 50s remains around 16, while a talent-50 player amongst
  10s stays around 43–44 in their prime.
  Its sensitivity to company is at most 0.3, so mutual teammate influence
  contracts toward a stable level instead of amplifying itself.
- Per appearance, `r = exp(-(2 + 4 exp(-(a-17)/4))/14)` and
  `x' = T + (x-T)r + 0.45 sqrt(1-r²) z`, where seeded `z` is uniform on
  `[-sqrt(3), sqrt(3)]`. Ability stays in 1–50. The seed and fractional ability
  survive saves; roster array order cannot change the result.
- Annual aging adds `P(f(a+1)-f(a))` before retirement, including for reserves.
  Transfers, club promotions and relegations never reroll `P`.

## Transfers and squad management

- Clubs must retain at least 14 players including one goalkeeper.
- The market opens before every round with six domestic candidates. An independent
  `1/14` draw can append one real player from abroad to the same auction queue.
  This averages one arrival per season; zero to three is usual, with no hard cap.
  Eligible players are 31–38 in that career's year. A 75% preference favors
  Brazilians returning home; the other category brings foreign veterans.
  Current domestic/invited players and previously offered identities are excluded.
  An unsold arrival stays abroad. The saved pool includes today's young players
  who become eligible in later seasons; an exhausted pool produces no arrival.
- The selling club sets a fixed fee. Competing clubs bid salary. The human bid
  is resolved on match day against a deterministic AI ceiling.
- A successful purchase transfers the player, fee, wage, and at most one
  rolling season of protection. Failed bids reveal the winning wage.
- Auction inputs receive focus as each player appears. The seller panel, human
  prompt, and winning-club result use the respective club colors. A result stays
  visible for three seconds (or until clicked) before the next player appears.
- `DINHEIRO DISPONÍVEL` appears directly below the salary input and shows the
  current manager club's cash, including personalized multiplayer snapshots.
- Base salaries are roughly Cr$ 1,000 for
  the weakest players and Cr$ 7,000–9,000 for elite strength-40 players. A
  regular auction opens at about 65% of the current wage, and AI offers range
  from 1.05× to 1.60× that minimum. The salary input accepts bids up to Cr$ 64,000.
- Selling is a separate mode on the main squad screen, not part of the buying
  market. Every eligible row shows position, strength, and an exact quoted
  price. The interested club remains secret until the manager confirms; only
  the completed result names the buyer on the same club-colored presentation
  used for auction results.
- `O NOVO ORDENADO` opens contract mode on the squad screen. The manager sees
  free players and players in their final protected round and can offer at least
  the requested wage to secure a new rolling year.
- A salary-auction offer is accepted only when the club has room in its squad
  and enough cash for the transfer fee. An ineligible auction explains the exact
  reason for one second, automatically records no offer, and shows its buyer for
  two seconds; it is never silently beaten by a lower salary.
- Regular auction fees are 90% of player valuation, rounded to thousands with
  a Cr$ 1,000 minimum. Entry-level prices retain their original curve; above
  strength 16, the quality premium grows quadratically instead of cubically.
  Valuation decreases with age after 24. At age 26, strength-40 players cost
  about Cr$ 118,000 and strength-50 players about Cr$ 185,000. Against starting
  fourth-division cash of Cr$ 195,000–232,000, a standout signing is a major
  purchase, with younger superstars requiring more saving or sales. Neither
  the buyer's cash nor another human club's balance changes the quote. Salary-demand
  listings remain fee-free. Markets reserve up to two affordable offers
  (Cr$ 40,000 or less) when eligible players are available, alongside special
  and higher-value offers. Every market features up to two eligible 40+ players when
  available, and ordinary listings prioritize useful squad reinforcements. Neymar still leads the third-round auction at his
  normal valuation. Managers must have enough cash to pay the quoted fee.
- AI clubs retain two rounds of payroll and stadium maintenance after buying,
  plus enough cash to fund any projected operating deficit over the full
  14-round contract. A briefly full bank account cannot justify unaffordable wages.
  Their salary bids cannot exceed 160% of the salary benchmark for that player's
  strength and age; an inflated human contract does not reset the AI benchmark.
  They evaluate positional improvement and depth, with a smooth preference for
  their division's level (45/35/25/15). Rich clubs do not buy players they cannot
  use. Full AI squads sell unprotected surplus to interested clubs at normal
  prices, retaining starters, positional reserves and the squad minimum. Expired
  AI wages track current ability without starting a new protection period.
  If the asking salary exceeds the wage limit, AI clubs do not bid. Human clubs can
  still offer higher wages and bear the ongoing cost.
- AI clubs choose the lowest ticket price between Cr$ 10 and 40 that can cover
  the greater of contracted or fair wages, stadium maintenance and two ordinary
  signings per year, after guaranteed non-betting sponsorship income. The estimate uses half a typical home gate
  per league round. New human careers start at Cr$ 25; human ticket choices
  are never overwritten. AI repairs worn stadiums and expands after sustained
  near-sellouts, paying the same costs as a human. Stadium spending protects
  the greater of four payrolls or the season's operating reserve, plus two
  division-appropriate transfer fees. There is no cash levy or bailout.
- Every domestic paid transfer records matching income and expense for seller and buyer.
  Fees paid abroad leave the domestic economy and record one purchase expense.
  Imported players count against the academy's saved population target, so
  recruiting abroad does not permanently increase the annual replacement quota.
  Older saves update player valuations
  and reprice unresolved paid listings once without resetting balances, wages,
  development, contracts or completed transfers; a pending bid is cancelled
  if its purchase price changes.
- Contracts count down over the 14 national league rounds and never exceed one
  rolling season. `*` means two or more protected rounds remain, so the manager
  cannot sell the player. `.` means the final protected round: the manager may
  sell him, but he cannot demand a raise or list himself. No marker means the
  player is unprotected.
- Every player in the 32 domestic clubs starts a new career unprotected. The
  manager can immediately use `O NOVO ORDENADO` to secure selected players for
  one rolling year.
- Before each regular turn, an unprotected player compares his salary with the
  fair wage implied by strength and age. Materially underpaid players lose
  morale and may demand a raise and put themselves in the salary auction for no
  transfer fee. The current club can bid to retain them. Protected players never
  self-list or request a raise.
- Squads are capped at 24 so line-up decisions remain legible on the DOS screen.

Neymar starts in Santos's roster with peak talent 50 and age-adjusted strength 48. His first auction is guaranteed
as the first of the six candidates before league round three; early auctions
and salary demands cannot sell him first. After that offer he follows the normal
ownership and contract rules, with no duplicate or forced resale each season.
His hidden tradeoff is a guaranteed injury between minutes 46 and 90 whenever
he plays the second half, followed by two to four games out. The pattern repeats
after recovery in the league, Copa and Libertadores, for human and AI clubs.
Substituting him at halftime avoids that match's injury. This scripted exit
takes precedence over random injuries/red cards. His strength follows the same
aging and development model as every other player.

The squad panel scrolls vertically when the roster is taller than its fixed DOS
frame, so all 24 players remain reachable without changing the panel
geometry.

The visible 1–50 strength scale targets approximate first-team levels in the
40s/30s/20s/teens by division. Initial and academy peak talent is based on
46/36/26/16, with small variation and occasional standout academy prospects.
Youth and older players naturally sit below their peak. These are cohort targets,
not automatic strength changes when a club changes divisions. A lower-division
manager can still buy and retain exceptional talent.

Older browser saves migrate once to the new model using the bundled player's
original identity and peak talent, regardless of which club purchased them.
Legacy academy records have no birth-division history, so their old strength
scale is mapped to peak talent with `P = clamp(6.5 + 4 strength / 3, 1, 50)`.
Other players without historical provenance retain talent inferred from their
current ability and age. Cash, ownership, contracts and results survive; unresolved
paid quotes are repriced and a changed pending bid is cancelled. Subsequent
loads preserve every player's saved talent and development.

At season renewal, retirement has zero probability through age 33, then an
annual probability of `min(1, 0.06 × 1.55^(age - 34))`: 6% at 34, roughly 83%
at 40, and certainty at 41. The decision is saved once per season. Retired
players leave the roster and all lineup/market references are rebuilt.
Affected managers see the names, positions and ages after sponsorship selection
and before choosing academy graduates. Multiplayer allows 15 seconds to read or continue;
unaffected managers wait without an extra decision.

Academy intake replenishes the domestic population to its saved starting size.
Places first protect the 14-player minimum and a goalkeeper, then fill vacancies
in the smallest squads (own retirees break ties),
without exceeding 24 players. Prospects are 17–20, with bounded
division-based strengths and normal value, wage and contract rules. No cash is
created by retirements or promotions. Existing saves establish the population
target on their first renewal.

Each managed club with vacancies chooses exactly its assigned number of
graduates, filling the indicated goalkeeper, defender, midfielder and attacker
quotas before the Copa draw. Each position has two spare candidates to choose
from. Candidate pools and quotas are saved, so reloading does not reroll them.
The choice replaces the provisional intake and never creates extra roster
places. Clubs without vacancies skip the screen. AI clubs choose automatically;
multiplayer managers have 60 seconds, after which the strongest eligible
prospects fill any pending choice.

## Manager screen commands

The right-hand command panel has four manual pages: tactics, championship,
finances, and miscellaneous. Arrow text controls switch pages and every command
is clickable. Browser-safe keys provide the same direct access: `1`–`0` select
tactics; `C`, `R`, `T`, `Q`, `L`, `M`, `F`, `E`, `P`, and `N` open the
corresponding screens; `L` opens the Libertadores; `V` opens player sales; `O`
opens new-salary offers; `Esc` returns or exits. Command pages never rotate on
their own.

## Money and stadium

Cash changes through net ticket receipts, sponsors, league/cup prizes,
transfers, wages, maintenance, and construction. Transfer fees circulate money
between clubs; wages and maintenance are the principal sinks. The manager
controls ticket price. Attendance depends on supporters, opposition, division,
form, price, and capacity; 26% of gross gate sales reaches club cash after match
costs.

Supporters change after every match. A league win starts at 1.2% growth, with
bonuses for consecutive wins, goal margin, and upsets. Draws produce a small
change and defeats lose members; Copa and Libertadores results carry more
weight. A sustained winning season can build a visibly larger membership base.
The stadium screen shows the exact member change from the latest game.

### Annual sponsorships

After the season-end club decision, promotion/relegation is applied and the
manager chooses one of exactly three offers before the Copa draw. Contracts
last for that season's 14 league rounds and cannot be exchanged mid-season.
Existing careers keep their current-season fixed sponsorship until renewal.
There are 30 fictional brands, including Duomed, Ulbrax, GL and Larpamat, each
with a one-line description.

One offer favors guaranteed income with small result bonuses; another trades
some guaranteed income for larger win/draw bonuses. Each league round pays
the base plus the applicable result bonus. Copa/Libertadores matches do not
create extra sponsorship installments. The offer screen shows only the season
title and three brands, each with its description, base per round, win/draw
bonuses and signing button.

Offers depend on the new division, current sócios, last league points and
honors: a division title, Copa/Libertadores title, best attack, best defense,
and the leading scorer. The division bases are Cr$ 18,000 / 14,500 / 11,500 /
9,000. Membership adds up to 60% with diminishing returns; league performance
contributes a factor from 0.85 to 1.15, with honors adding at most 0.40. Neither
cash nor previous contract prices enter the formula.

When betting is legal, the third offer comes from a betting brand and has the
highest projected revenue. During a ban, all three brands are non-betting; the
third balances guaranteed income and performance bonuses. Pending offers in
older saves follow the same rule without changing signed contracts.
A shared, fictional government has a 1/14 chance of changing
its position after each league round, before that round's payment: one change
per season on average. Its position persists between seasons and is drawn from
an independent saved RNG stream. While betting is banned, both the base and
bonuses pay zero; the same contract resumes if the ban is lifted, with no back
pay. After the standings, a separate notice screen appears only when the position
changes and only for managers with a current betting contract. Continuing from
that notice resumes the normal calendar; saving/reloading preserves this step.
In multiplayer, unaffected managers keep the standings while affected managers
read the notice, with an eight-second deadline to continue.

Betting quotes account for the risk of a future ban; expected revenue is about
90% of the better non-betting projection. These are estimates for the
projected performance, not a guaranteed realized outcome. A late ban or early
reinstatement can still make the risk pay off in an individual season.

AI clubs choose the better non-betting projection. In multiplayer, each human
manager has a separate proposal and 60 seconds to choose; the same safe default
is used for unanswered offers. All managers continue to the draw together.

### Other income and stadiums

Attendance responds to the last five results as well as the member base, ticket
price, opponent, and stadium condition. Once at least three league games have
been played, first and second place add crowd bonuses. Unplayed opening rounds
do not count as wins or establish a leader bonus. Strong form brings more fans
and gate income in every division; higher prices still reduce demand, and
crowds cannot exceed capacity. Existing saves use these rules for future games;
their completed scores and cash transactions remain intact, and standings
recalculate immediately at three points per win.

Every Copa round pays both clubs. Winners receive Cr$ 50,000, 100,000,
200,000, 400,000, and 1,000,000, respectively; eliminated clubs receive half
that round's winner prize, including Cr$ 500,000 for the runner-up. Payments
are cumulative: winning all five rounds earns Cr$ 1,750,000. The result screen
shows the manager's credited prize before continuing. The season-end screen
shows each champion's title prize and every individual award; the Copa title
row shows the final prize, excluding earlier rounds. Displays use recorded
payments, so older saves retain their original payouts. The leading scorer's
club, best attack and best defense each receive Cr$ 200,000. League prizes are:

| Division | Champion | Runner-up (25%) |
| --- | ---: | ---: |
| 1 | Cr$ 2,000,000 | Cr$ 500,000 |
| 2 | Cr$ 500,000 | Cr$ 125,000 |
| 3 | Cr$ 300,000 | Cr$ 75,000 |
| 4 | Cr$ 150,000 | Cr$ 37,500 |

The Libertadores champion receives Cr$ 250,000. The annual domestic prize
budget is Cr$ 10,587,500, plus Cr$ 250,000 when a Brazilian club wins the
Libertadores. Larger purses deliberately increase purchasing power. Player
valuations depend on strength and age, and AI salary limits depend on a fair
wage benchmark; neither compounds with club cash or earlier transfer prices.

[Economy regression tests](TESTING.md#economy-and-inflation) run four 50-season
careers with actual auctions. They check price and wage indices, no-offer rates,
sale availability, a linear cash ceiling and exact financial reconciliation.
Profitable clubs can accumulate reserves and loss-making clubs can enter debt;
stable player prices do not imply equal wealth or guaranteed solvency.

Stadium condition deteriorates over time and affects attendance and home
advantage. Maintenance restores it immediately. Capacity upgrades take several
rounds and lock their construction cost when commissioned.

Insolvency does not silently end the save. Debt reduces reputation, blocks
construction, and can lead to board dismissal if results do not compensate.

## Manager career

The manager has reputation, club tenure, trophies, promotions, and a career
history. Reputation changes after every result relative to expectations.
Boards set a league objective and track confidence. At season end, clubs make
offers based on reputation; the manager can accept one before starting the next
season. Repeated failure or severe debt can trigger the period-appropriate
"chicotada psicológica" dismissal and a lower-division job offer.

## Solo careers

A solo career lets a player enter one manager name and
receive a randomly assigned 4th-division club, manage the squad and tactics,
play both halves of every match day,
complete cup and league seasons, transfer players, manage cash and stadium,
receive awards/offers/dismissals, continue across seasons, and save/load in the
browser without a network connection.

Every ordinary new career receives fresh browser-generated entropy. Reusing a
manager name therefore does not reproduce the same club draw, Copa bracket, or
opening salary market. Explicit seeds remain available internally for tests,
simulations, and synchronized multiplayer rooms.

## Multiplayer

Multiplayer keeps the same rules. A host creates an ephemeral room, shares a
link, and up to eight managers receive distinct randomly assigned clubs before
everyone starts together. When the room starts, every client first sees the
fourth-division club draw reveal each manager and full club name in the same
order, using the same manager-registration table as single player. The Copa draw
begins only after every assignment has been shown. A side chat is present
throughout. The room process owns the game state and seed; clients submit
commands and receive events. No permanent database is required for disposable
rooms. `LIGA ONLINE` places the manager in the oldest room with a free
seat or creates one; the room starts immediately at eight or after a short queue
countdown with at least two. Empty clubs remain AI-controlled, and single player
continues to use the same engine locally with one browser autosave.
Once the draw is complete, the player/team strip above chat renders every club
in its authoritative primary and secondary colors.

The title screen separates `CARREIRA SOLO`, `LIGA COM AMIGOS`, and `LIGA ONLINE`.
Only the original private league creator can start, pause, or resume a league.
Pausing freezes all phases and blocks gameplay decisions while keeping chat
available. Public leagues have no creator privileges and start automatically
with two to eight connected managers. Leaving the public queue frees the seat;
a running league reserves each club for its returning manager.

Browser credentials survive tab closure and appear under `RETOMAR LIGA`.
Empty private lobbies and running leagues freeze for up to 30 minutes; returning
players restore their exact manager and club. Manual pauses still require the
creator to resume. This recovery requires the same browser profile and a live
server process; there is no durable multiplayer save across server restarts.

Only multiplayer uses decision clocks: ten seconds for each salary auction,
45 seconds to sell players, prepare the squad, and choose a tactic before a
round, and 15 seconds for half-time substitutions. A phase advances as soon as
every connected manager is ready or when its clock expires. Match animation and
standings use short server clocks so all clients see the same phase. At season
end the room keeps its managers and clubs together and begins the next season
after ten seconds.

Local development has an explicit fast-play mode for season testing. It
plays each half in one second, for two seconds of match animation. Solo games
stop at half-time until the manager continues; multiplayer keeps its normal
15-second half-time decision window and ready controls. The browser and
room-server flags both refuse to activate in production.
