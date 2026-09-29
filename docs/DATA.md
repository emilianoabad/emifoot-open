# Roster maintenance

## Snapshots

The Brazilian snapshot is `BRA-2026-08-30-r3`. It contains 32 clubs and 18 active
players per club. The club grouping is a deliberately game-like historical
strength ladder, not the real 2026 league membership.

Revision r3 restores Neymar to Santos's four-forward allocation. He replaces
the last forward selected in r2; all other player identities remain unchanged.
The generator reserves his place within the positional quota.

The 12 invited Libertadores clubs use the separate `CONMEBOL-2026-09-01`
snapshot, also with 18 players per club. The four Brazilian entrants retain
the main Brazilian snapshot.

## Arrivals from abroad

`src/data/international-veterans.ts` contains 76 real identities, including
48 Brazilians, with birth years, nationalities and positions. Official FIFA,
UEFA and club references are recorded alongside the data. Strengths are fictional
game ratings. A future arrival is a simulated career event, not a prediction
or a claim about a player's current club. Today's younger players become eligible
as the saved season advances. The game never substitutes generated names when
the eligible pool runs out.

Academy candidates use generated Brazilian names and game attributes. Their
IDs are unique to the club, season and candidate; they are not real-player data.

## Refreshing

The generation scripts are `scripts/fetch-rosters.mjs` and
`scripts/fetch-libertadores-rosters.mjs`:

```bash
pnpm data:refresh
pnpm test src/data
```

A refresh does not reproduce a past snapshot byte for byte. Before running it,
update `SNAPSHOT_ID` and `FETCHED_AT` in the relevant script; review the generated
diff and update this document. Do not run refreshes automatically in CI or
during installation. Runtime play and normal tests use the committed snapshots.

## Ratings

Strength, salary, value, morale, fitness, contract state, and injury proneness
are Emifoot simulation values. They are deterministically derived from the club
tier, roster role, age, and a name hash. Top first-division players can begin in
the low 40s; fourth-division squads remain in the original-style lower range.

Neymar's peak talent 50 and recurring second-half injury are a fictional
Easter egg. He starts at Santos and his first auction is reserved for league
round three. Existing r2 careers add the missing player to Santos without
resetting development, transfers, or wages. If that squad is full, restoration
waits for space on a later load. An existing career that has passed the
third-round market gets the reserved offer at the next third-round market it
reaches.

## Save compatibility

- A roster refresh creates a new snapshot ID and is reviewed like source code.
- New games use the latest snapshot.
- Saves embed their full roster and continue unchanged.
- Keep existing player IDs stable when updating a snapshot.
- Players may transfer or develop within the fictional game universe.
