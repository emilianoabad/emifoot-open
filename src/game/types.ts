import type { InternationalMarketState } from './international'

export type Division = 1 | 2 | 3 | 4
export type Position = 'G' | 'D' | 'M' | 'A'
export type TacticId = '3-4-3' | '4-3-3' | '4-4-2' | '4-5-1' | '5-2-3' | '5-3-2' | '5-4-1' | '5-5-0' | '6-3-1' | '6-4-0'
export type GamePhase =
  | 'manager-registration'
  | 'cup-draw'
  | 'auction'
  | 'pre-round'
  | 'first-half'
  | 'half-time'
  | 'second-half'
  | 'standings'
  | 'sponsorship-notice'
  | 'competition-results'
  | 'season-end'
  | 'sponsorship'
  | 'retirement-notice'
  | 'academy'
export type FormResult = 'V' | 'E' | 'D'
export type Competition = 'league' | 'cup' | 'libertadores'
export type TournamentCompetition = Exclude<Competition, 'league'>

export interface Player {
  id: string
  sourceId: string
  name: string
  position: Position
  age: number
  nationality: string
  strength: number
  /** Hidden peak talent and fractional ability; preserved across clubs and seasons. */
  development?: { potential: number; ability: number }
  fitness: number
  morale: number
  salary: number
  value: number
  contractRounds: number
  /** Kept for save compatibility; 0 or 1 mirrors contractRounds. */
  contractSeasons: number
  goals: number
  appearances: number
  yellowCards: number
  suspensionRounds: number
  injuryRounds: number
  injuryProneness: number
  listed: boolean
  /** Reserve Neymar's first salary auction for league round three. */
  neymarAuctionPending?: boolean
}

export interface Stadium {
  name: string
  capacity: number
  condition: number
  expansionSeats: number
  expansionRounds: number
}

export interface Club {
  id: string
  name: string
  shortName: string
  city: string
  state: string
  division: Division
  rating: number
  primary: string
  secondary: string
  source: string
  players: Player[]
  lineup: string[]
  bench: string[]
  tactic: TacticId
  cash: number
  supporters: number
  lastSupporterChange?: number
  ticketPrice: number
  sponsorPerRound: number
  sponsorship?: SponsorshipOffer
  stadium: Stadium
  form: FormResult[]
}

export interface SponsorshipOffer {
  id: string
  brandId: string
  kind: 'steady' | 'performance' | 'betting'
  season: number
  basePerRound: number
  winBonus: number
  drawBonus: number
  projectedIncome: number
  expectedIncome: number
}

export interface SponsorshipProposal {
  season: number
  division: Division
  supporters: number
  previousPosition: number
  achievements: string[]
  expectedWins: number
  expectedDraws: number
  offers: SponsorshipOffer[]
}

export interface SponsorshipState {
  bettingAllowed: boolean
  /** Independent stream: choosing a sponsor cannot reroll matches or government decisions. */
  rngState: number
  pendingClubIds: string[]
  proposals: Record<string, SponsorshipProposal>
}

export interface AcademyPlan {
  retired: Player[]
  candidates: Player[]
  required: Record<Position, number>
  promotedIds: string[]
}

export interface OffseasonState {
  season: number
  targetPlayerCount: number
  plans: Record<string, AcademyPlan>
  retirementPendingClubIds: string[]
  pendingAcademyClubIds?: string[]
}

export interface MatchEvent {
  minute: number
  type: 'goal' | 'yellow' | 'red' | 'injury' | 'substitution'
  clubId: string
  playerId?: string
  playerName: string
  detail?: string
  durationRounds?: number
}

export interface MatchResult {
  homeGoals: number
  awayGoals: number
  homePenalties?: number
  awayPenalties?: number
  attendance: number
  events: MatchEvent[]
}

export interface Fixture {
  id: string
  competition: Competition
  division?: Division
  round: number
  homeId: string
  awayId: string
  result?: MatchResult
}

export interface LeagueState {
  division: Division
  rounds: Fixture[][]
}

export interface CupRound {
  name: string
  matches: Fixture[]
}

export interface CupState {
  rounds: CupRound[]
  nextRoundIndex: number
  championId?: string
}

export interface LibertadoresGroup {
  name: string
  clubIds: string[]
  rounds: Fixture[][]
}

export interface LibertadoresState {
  season: number
  brazilianClubIds: string[]
  invitedClubs: Club[]
  groups: LibertadoresGroup[]
  groupRoundIndex: number
  knockoutRounds: CupRound[]
  nextKnockoutRoundIndex: number
  championId?: string
}

export interface CompetitionEvent {
  competition: TournamentCompetition
  stage: 'group' | 'knockout'
  roundIndex: number
  title: string
  roundName: string
}

export interface TableEntry {
  clubId: string
  played: number
  wins: number
  draws: number
  losses: number
  goalsFor: number
  goalsAgainst: number
  goalDifference: number
  points: number
}

export interface PendingMatch {
  fixtureId: string
  homeId: string
  awayId: string
  homeGoals: number
  awayGoals: number
  attendance: number
  events: MatchEvent[]
  homeLineup: string[]
  awayLineup: string[]
}

export interface PendingMatchDay {
  round: number
  competition?: Competition
  title?: string
  roundName?: string
  matches: PendingMatch[]
  substitutionsUsed: number
  substitutionsByClub?: Record<string, number>
}

export interface MarketListing {
  id: string
  sellerId: string
  playerId: string
  fee: number
  minimumSalary: number
  expiresAfterRound: number
  internationalPlayer?: Player
}

export interface TransferBid {
  listingId: string
  salary: number
}

export interface TransferMessage {
  id: string
  success: boolean
  text: string
  clubId?: string
  auction?: {
    sellerId: string
    playerName: string
    nationality: string
    position: Position
    strength: number
    fee: number
    minimumSalary: number
  }
}

export type PrizeAward =
  | { kind: 'division' | 'division-runner-up'; division: Division }
  | { kind: 'cup'; roundIndex: number }
  | { kind: 'libertadores' | 'top-scorer' | 'best-attack' | 'best-defence' }

export interface LedgerEntry {
  id: string
  season: number
  round: number
  clubId: string
  type: 'tickets' | 'sponsor' | 'wages' | 'maintenance' | 'construction' | 'transfer' | 'prize'
  amount: number
  description: string
  prize?: PrizeAward
  externalTransfer?: boolean
}

export interface CareerHistoryEntry {
  season: number
  clubId: string
  division: Division
  position: number
  note: string
}

export interface JobOffer {
  clubId: string
  wage: number
  objective: string
}

export interface Manager {
  name: string
  clubId: string
  reputation: number
  boardConfidence: number
  trophies: number
  promotions: number
  dismissed: boolean
  history: CareerHistoryEntry[]
  offers: JobOffer[]
}

export interface SeasonAwards {
  season: number
  champions: Record<string, string>
  runnersUp?: Record<string, string>
  cupChampionId: string
  libertadoresChampionId?: string
  libertadoresQualifiedIds?: string[]
  topScorerId: string
  topScorerGoals: number
  bestAttackClubId?: string
  bestAttackGoals?: number
  bestDefenceClubId?: string
  bestDefenceGoalsAgainst?: number
  managerClubId: string
  managerPosition: number
}

export interface RoundReport {
  leagueResults: Fixture[]
  cupResults: Fixture[]
  libertadoresResults?: Fixture[]
  transferMessages: TransferMessage[]
  headlines: string[]
  injuryMessages?: string[]
  bettingRegulationChange?: { allowed: boolean }
}

export interface GameState {
  schemaVersion: 1
  economyModelVersion: number
  playerModelVersion?: number
  rosterSnapshotId: string
  id: string
  revision: number
  seed: number
  rngState: number
  phase: GamePhase
  season: number
  currentRound: number
  clubs: Club[]
  sponsorship?: SponsorshipState
  offseason?: OffseasonState
  internationalMarket?: InternationalMarketState
  leagues: LeagueState[]
  cup: CupState
  libertadores?: LibertadoresState
  competitionQueue?: CompetitionEvent[]
  activeCompetition?: CompetitionEvent
  manager: Manager
  pendingMatchDay?: PendingMatchDay
  market: MarketListing[]
  bid?: TransferBid
  auctionResult?: TransferMessage
  playerSaleResults?: Record<string, TransferMessage>
  injuryNoticePending?: boolean
  ledger: LedgerEntry[]
  lastReport?: RoundReport
  awards: SeasonAwards[]
  news: string[]
}

export interface NewCareerInput {
  managerName: string
  seed?: number
}

export type EngineResult = { ok: true; state: GameState; message?: string } | { ok: false; error: string }
