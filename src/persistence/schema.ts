import { z } from 'zod'
import type { GameState } from '../game/types'
import { SPONSOR_BRANDS } from '../game/sponsorship'

const sponsorshipOfferSchema = z.object({
  id: z.string().min(1),
  brandId: z.enum(SPONSOR_BRANDS.map((brand) => brand.id)),
  kind: z.enum(['steady', 'performance', 'betting']),
  season: z.number().int().min(2026),
  basePerRound: z.number().int().nonnegative(),
  winBonus: z.number().int().nonnegative(),
  drawBonus: z.number().int().nonnegative(),
  projectedIncome: z.number().int().nonnegative(),
  expectedIncome: z.number().int().nonnegative(),
})

const sponsorshipProposalSchema = z.object({
  season: z.number().int().min(2026),
  division: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  supporters: z.number().int().nonnegative(),
  previousPosition: z.number().int().min(1).max(8),
  achievements: z.array(z.string()),
  expectedWins: z.number().int().min(0).max(14),
  expectedDraws: z.number().int().min(0).max(14),
  offers: z.array(sponsorshipOfferSchema).length(3),
})

const playerSchema = z.object({
  id: z.string().min(1),
  sourceId: z.string().min(1),
  name: z.string().min(1),
  position: z.enum(['G', 'D', 'M', 'A']),
  age: z.number().int().min(15),
  nationality: z.string().min(2).max(3),
  strength: z.number().min(1).max(50),
  development: z.object({ potential: z.number().min(1).max(50), ability: z.number().min(1).max(50) }).optional(),
  fitness: z.number().min(0).max(100),
  morale: z.number().min(0).max(100),
  salary: z.number().nonnegative(),
  value: z.number().nonnegative(),
  contractRounds: z.number().int().min(0).max(14).optional(),
  contractSeasons: z.number().int().min(0),
  goals: z.number().int().nonnegative(),
  appearances: z.number().int().nonnegative(),
  yellowCards: z.number().int().nonnegative(),
  suspensionRounds: z.number().int().nonnegative(),
  injuryRounds: z.number().int().nonnegative(),
  injuryProneness: z.number().min(0.5).max(2).optional(),
  listed: z.boolean(),
  neymarAuctionPending: z.boolean().optional(),
})

const matchEventSchema = z.object({
  minute: z.number().int().min(0).max(130),
  type: z.enum(['goal', 'yellow', 'red', 'injury', 'substitution']),
  clubId: z.string(),
  playerId: z.string().optional(),
  playerName: z.string(),
  detail: z.string().optional(),
  durationRounds: z.number().int().min(1).max(4).optional(),
})

const resultSchema = z.object({
  homeGoals: z.number().int().nonnegative(),
  awayGoals: z.number().int().nonnegative(),
  homePenalties: z.number().int().nonnegative().optional(),
  awayPenalties: z.number().int().nonnegative().optional(),
  attendance: z.number().int().nonnegative(),
  events: z.array(matchEventSchema),
})

const fixtureSchema = z.object({
  id: z.string(),
  competition: z.enum(['league', 'cup', 'libertadores']),
  division: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(),
  round: z.number().int().positive(),
  homeId: z.string(),
  awayId: z.string(),
  result: resultSchema.optional(),
})

const clubSchema = z.object({
  id: z.string(),
  name: z.string(),
  shortName: z.string(),
  city: z.string(),
  state: z.string(),
  division: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  rating: z.number().min(1).max(50),
  primary: z.string(),
  secondary: z.string(),
  source: z.string(),
  players: z.array(playerSchema).min(14).max(24),
  // An injury-depleted selection is valid saved state; kickoff validates the eleven.
  lineup: z.array(z.string()).max(11),
  bench: z.array(z.string()).max(7),
  tactic: z.enum(['3-4-3', '4-3-3', '4-4-2', '4-5-1', '5-2-3', '5-3-2', '5-4-1', '5-5-0', '6-3-1', '6-4-0']),
  cash: z.number().finite(),
  supporters: z.number().int().nonnegative(),
  lastSupporterChange: z.number().int().optional(),
  ticketPrice: z.number().min(0),
  sponsorPerRound: z.number().finite(),
  sponsorship: sponsorshipOfferSchema.optional(),
  stadium: z.object({
    name: z.string(),
    capacity: z.number().int().positive(),
    condition: z.number().min(0).max(100),
    expansionSeats: z.number().int().nonnegative(),
    expansionRounds: z.number().int().nonnegative(),
  }),
  form: z.array(z.enum(['V', 'E', 'D'])).max(5),
})

const competitionEventSchema = z.object({
  competition: z.enum(['cup', 'libertadores']),
  stage: z.enum(['group', 'knockout']),
  roundIndex: z.number().int().nonnegative(),
  title: z.string(),
  roundName: z.string(),
})

const transferMessageSchema = z.object({
  id: z.string(),
  success: z.boolean(),
  text: z.string(),
  clubId: z.string().optional(),
  auction: z.object({
    sellerId: z.string(),
    playerName: z.string(),
    nationality: z.string(),
    position: z.enum(['G', 'D', 'M', 'A']),
    strength: z.number(),
    fee: z.number(),
    minimumSalary: z.number(),
  }).optional(),
})

const libertadoresSchema = z.object({
  season: z.number().int(),
  brazilianClubIds: z.array(z.string()).length(4),
  invitedClubs: z.array(clubSchema).length(12),
  groups: z.array(z.object({
    name: z.string(),
    clubIds: z.array(z.string()).length(4),
    rounds: z.array(z.array(fixtureSchema)).length(6),
  })).length(4),
  groupRoundIndex: z.number().int().min(0).max(6),
  knockoutRounds: z.array(z.object({ name: z.string(), matches: z.array(fixtureSchema) })),
  nextKnockoutRoundIndex: z.number().int().nonnegative(),
  championId: z.string().optional(),
})

export const gameStateSchema = z.object({
  schemaVersion: z.literal(1),
  economyModelVersion: z.number().int().nonnegative().optional(),
  playerModelVersion: z.number().int().nonnegative().optional(),
  rosterSnapshotId: z.string(),
  id: z.string(),
  revision: z.number().int().nonnegative(),
  seed: z.number().int().nonnegative(),
  rngState: z.number().int().nonnegative(),
  phase: z.enum([
    'manager-registration', 'cup-draw', 'auction', 'pre-round', 'first-half',
    'half-time', 'second-half', 'standings', 'sponsorship-notice', 'competition-results', 'season-end', 'sponsorship', 'retirement-notice', 'academy',
  ]),
  season: z.number().int().min(2026),
  currentRound: z.number().int().min(1).max(14),
  internationalMarket: z.object({
    rngState: z.number().int().nonnegative(),
    offeredIds: z.array(z.string()).max(500),
    lastSeason: z.number().int().min(2026),
    lastRound: z.number().int().min(1).max(14),
    targetPlayerCount: z.number().int().min(448).max(768),
  }).optional(),
  clubs: z.array(clubSchema).length(32),
  sponsorship: z.object({
    bettingAllowed: z.boolean(),
    rngState: z.number().int().nonnegative(),
    pendingClubIds: z.array(z.string()).max(8),
    proposals: z.record(z.string(), sponsorshipProposalSchema),
  }).optional(),
  offseason: z.object({
    season: z.number().int().min(2027),
    targetPlayerCount: z.number().int().min(448).max(768),
    plans: z.record(z.string(), z.object({
      retired: z.array(playerSchema).max(24),
      candidates: z.array(playerSchema).max(32),
      required: z.object({ G: z.number().int().nonnegative(), D: z.number().int().nonnegative(), M: z.number().int().nonnegative(), A: z.number().int().nonnegative() }),
      promotedIds: z.array(z.string()).max(24),
    })),
    retirementPendingClubIds: z.array(z.string()).max(8),
    pendingAcademyClubIds: z.array(z.string()).max(8).optional(),
  }).optional(),
  leagues: z.array(z.object({
    division: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
    rounds: z.array(z.array(fixtureSchema)).length(14),
  })).length(4),
  cup: z.object({
    rounds: z.array(z.object({ name: z.string(), matches: z.array(fixtureSchema) })),
    nextRoundIndex: z.number().int().nonnegative(),
    championId: z.string().optional(),
  }),
  libertadores: libertadoresSchema.optional(),
  competitionQueue: z.array(competitionEventSchema).optional(),
  activeCompetition: competitionEventSchema.optional(),
  manager: z.object({
    name: z.string(),
    clubId: z.string(),
    reputation: z.number().min(0).max(100),
    boardConfidence: z.number().min(0).max(100),
    trophies: z.number().int().nonnegative(),
    promotions: z.number().int().nonnegative(),
    dismissed: z.boolean(),
    history: z.array(z.object({
      season: z.number().int(),
      clubId: z.string(),
      division: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
      position: z.number().int().min(1).max(8),
      note: z.string(),
    })),
    offers: z.array(z.object({ clubId: z.string(), wage: z.number(), objective: z.string() })),
  }),
  pendingMatchDay: z.object({
    round: z.number().int(),
    competition: z.enum(['league', 'cup', 'libertadores']).optional(),
    title: z.string().optional(),
    roundName: z.string().optional(),
    matches: z.array(z.object({
      fixtureId: z.string(), homeId: z.string(), awayId: z.string(),
      homeGoals: z.number().int(), awayGoals: z.number().int(), attendance: z.number().int(),
      events: z.array(matchEventSchema), homeLineup: z.array(z.string()), awayLineup: z.array(z.string()),
    })),
    substitutionsUsed: z.number().int().min(0).max(3),
    substitutionsByClub: z.record(z.string(), z.number().int().min(0).max(3)).optional(),
  }).optional(),
  market: z.array(z.object({
    id: z.string(), sellerId: z.string(), playerId: z.string(), fee: z.number(), minimumSalary: z.number(), expiresAfterRound: z.number(),
    internationalPlayer: playerSchema.optional(),
  })),
  bid: z.object({ listingId: z.string(), salary: z.number() }).optional(),
  auctionResult: transferMessageSchema.optional(),
  playerSaleResults: z.record(z.string(), transferMessageSchema).optional(),
  injuryNoticePending: z.boolean().optional(),
  ledger: z.array(z.object({
    id: z.string(), season: z.number(), round: z.number(), clubId: z.string(),
    type: z.enum(['tickets', 'sponsor', 'wages', 'maintenance', 'construction', 'transfer', 'prize']),
    amount: z.number(), description: z.string(),
    externalTransfer: z.boolean().optional(),
    prize: z.discriminatedUnion('kind', [
      z.object({ kind: z.enum(['division', 'division-runner-up']), division: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]) }),
      z.object({ kind: z.literal('cup'), roundIndex: z.number().int().min(0).max(4) }),
      z.object({ kind: z.enum(['libertadores', 'top-scorer', 'best-attack', 'best-defence']) }),
    ]).optional(),
  })),
  lastReport: z.object({
    leagueResults: z.array(fixtureSchema),
    cupResults: z.array(fixtureSchema),
    libertadoresResults: z.array(fixtureSchema).optional(),
    transferMessages: z.array(transferMessageSchema),
    headlines: z.array(z.string()),
    injuryMessages: z.array(z.string()).optional(),
    bettingRegulationChange: z.object({ allowed: z.boolean() }).optional(),
  }).optional(),
  awards: z.array(z.object({
    season: z.number(), champions: z.record(z.string(), z.string()), cupChampionId: z.string(),
    runnersUp: z.record(z.string(), z.string()).optional(),
    libertadoresChampionId: z.string().optional(), libertadoresQualifiedIds: z.array(z.string()).length(4).optional(),
    topScorerId: z.string(), topScorerGoals: z.number(), managerClubId: z.string(), managerPosition: z.number(),
    bestAttackClubId: z.string().optional(), bestAttackGoals: z.number().optional(),
    bestDefenceClubId: z.string().optional(), bestDefenceGoalsAgainst: z.number().optional(),
  })),
  news: z.array(z.string()),
})

export function parseGameState(value: unknown): GameState {
  const parsed = gameStateSchema.parse(value)
  parsed.economyModelVersion ??= 1
  const clubs = [...parsed.clubs, ...(parsed.libertadores?.invitedClubs ?? [])]
  for (const player of clubs.flatMap((club) => club.players)) {
    player.contractRounds = Math.max(0, Math.min(14, player.contractRounds ?? (player.contractSeasons > 0 ? 14 : 0)))
    player.contractSeasons = player.contractRounds > 0 ? 1 : 0
    player.injuryProneness ??= 1
  }
  return parsed as GameState
}
