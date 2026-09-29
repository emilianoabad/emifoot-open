import { hashText, random, shuffle } from './rng'
import { getTable } from './selectors'
import type { Club, Division, FormResult, GameState, SponsorshipOffer, SponsorshipProposal, SponsorshipState } from './types'

export const SPONSOR_BRANDS = [
  { id: 'duomed', name: 'Duomed', description: 'Planos de saúde para a família.', betting: false },
  { id: 'ulbrax', name: 'Ulbrax', description: 'Lubrificantes para o seu motor.', betting: false },
  { id: 'gl', name: 'GL', description: 'Eletrônicos para toda a casa.', betting: false },
  { id: 'larpamat', name: 'Larpamat', description: 'Leite, iogurtes e derivados.', betting: false },
  { id: 'brumo', name: 'Brumo', description: 'Uniformes e material esportivo.', betting: false },
  { id: 'pelnaty', name: 'Pelnaty', description: 'Bolas, chuteiras e paixão.', betting: false },
  { id: 'tropper', name: 'Tropper', description: 'Calçados para dentro de campo.', betting: false },
  { id: 'pirelo', name: 'Pirelo', description: 'Pneus para todas as estradas.', betting: false },
  { id: 'sempra', name: 'Sempra', description: 'Televisores para ver seu time.', betting: false },
  { id: 'tozhiba', name: 'Tozhiba', description: 'Tecnologia e som de qualidade.', betting: false },
  { id: 'panafonica', name: 'Panafônica', description: 'Áudio, vídeo e eletrônicos.', betting: false },
  { id: 'gradial', name: 'Gradial', description: 'Aparelhos de som nacionais.', betting: false },
  { id: 'eletrux', name: 'Elétrux', description: 'Eletrodomésticos para o lar.', betting: false },
  { id: 'konsul', name: 'Konsul', description: 'Geladeiras e fogões da família.', betting: false },
  { id: 'braspel', name: 'Braspel', description: 'Papel e material de escritório.', betting: false },
  { id: 'gurgal', name: 'Gurgal', description: 'Automóveis feitos no Brasil.', betting: false },
  { id: 'banestelar', name: 'Banestelar', description: 'Banco de crédito e poupança.', betting: false },
  { id: 'utai', name: 'Utaí', description: 'Serviços bancários do dia a dia.', betting: false },
  { id: 'bradesca', name: 'Bradesca', description: 'Banco, seguros e investimentos.', betting: false },
  { id: 'telobras', name: 'Telobrás', description: 'Telefonia que liga o país.', betting: false },
  { id: 'teleps', name: 'Teleps', description: 'Telefonia fixa e móvel.', betting: false },
  { id: 'vagir', name: 'Vagir', description: 'Companhia aérea brasileira.', betting: false },
  { id: 'vaps', name: 'Vaps', description: 'Voos para torcedores viajantes.', betting: false },
  { id: 'brilbom', name: 'Brilbom', description: 'Produtos de limpeza para o lar.', betting: false },
  { id: 'betezao', name: 'Betezão', description: 'Casa de apostas esportivas.', betting: true },
  { id: 'palpitex', name: 'Palpitex', description: 'Apostas em jogos e resultados.', betting: true },
  { id: 'apostalia', name: 'Apostália', description: 'Plataforma de apostas online.', betting: true },
  { id: 'golbetim', name: 'Golbetim', description: 'Apostas no futebol nacional.', betting: true },
  { id: 'zebra365', name: 'Zebra365', description: 'Palpites e apostas esportivas.', betting: true },
  { id: 'beturama', name: 'Beturama', description: 'Casa de apostas pela internet.', betting: true },
] as const

export const SPONSOR_DIVISION_BASE: Record<Division, number> = { 1: 18_000, 2: 14_500, 3: 11_500, 4: 9_000 }
export const BETTING_CHANGE_PROBABILITY = 1 / 14
export const BETTING_EXPECTED_RETURN = 0.9
const SEASON_ROUNDS = 14
const roundMoney = (value: number) => Math.round(value / 50) * 50

export function getSponsorBrand(id: string) {
  const brand = SPONSOR_BRANDS.find((candidate) => candidate.id === id)
  if (!brand) throw new Error(`Patrocinador desconhecido: ${id}`)
  return brand
}

export function createSponsorshipState(seed: number): SponsorshipState {
  return { bettingAllowed: true, rngState: hashText(`${seed}:betting-regulation`), pendingClubIds: [], proposals: {} }
}

/** Symmetric two-state chain: E[changes in 14 rounds] = 1, even when a season starts banned. */
export function expectedBettingActiveFraction(initiallyAllowed: boolean): number {
  let allowed = initiallyAllowed ? 1 : 0
  let activeRounds = 0
  for (let round = 0; round < SEASON_ROUNDS; round++) {
    allowed = allowed * (1 - BETTING_CHANGE_PROBABILITY) + (1 - allowed) * BETTING_CHANGE_PROBABILITY
    activeRounds += allowed
  }
  return activeRounds / SEASON_ROUNDS
}

export function nextBettingRegulation(rngState: number, allowed: boolean) {
  const roll = random(rngState)
  return { rngState: roll.state, allowed: roll.value < BETTING_CHANGE_PROBABILITY ? !allowed : allowed }
}

export function advanceBettingRegulation(state: GameState): { allowed: boolean } | undefined {
  const sponsorship = state.sponsorship ??= createSponsorshipState(state.seed)
  const next = nextBettingRegulation(sponsorship.rngState, sponsorship.bettingAllowed)
  sponsorship.rngState = next.rngState
  if (next.allowed === sponsorship.bettingAllowed) return undefined
  sponsorship.bettingAllowed = next.allowed
  return { allowed: next.allowed }
}

/** Bounded membership and performance premiums never compound with cash or past contracts. */
export function sponsorshipValue(division: Division, supporters: number, points: number, honoursBonus: number): number {
  const members = Math.max(0, supporters)
  const memberFactor = 1 + 0.6 * (members / (members + 20_000))
  const performanceFactor = 0.85 + 0.3 * Math.max(0, Math.min(42, points)) / 42 + Math.max(0, Math.min(0.4, honoursBonus))
  return roundMoney(SPONSOR_DIVISION_BASE[division] * memberFactor * performanceFactor)
}

export function projectedSponsorshipIncome(offer: Pick<SponsorshipOffer, 'basePerRound' | 'winBonus' | 'drawBonus'>, wins: number, draws: number): number {
  return SEASON_ROUNDS * offer.basePerRound + wins * offer.winBonus + draws * offer.drawBonus
}

function balancedSponsorshipOffer(seed: number, clubId: string, proposal: SponsorshipProposal): SponsorshipOffer {
  const safeOffers = proposal.offers.filter((offer) => offer.kind !== 'betting')
  const brands = shuffle(hashText(`${seed}:${proposal.season}:${clubId}:sponsors`), SPONSOR_BRANDS).value
  const brand = brands.find((candidate) => !candidate.betting && !safeOffers.some((offer) => offer.brandId === candidate.id))!
  const average = (term: 'basePerRound' | 'winBonus' | 'drawBonus') => roundMoney(safeOffers.reduce((sum, offer) => sum + offer[term], 0) / safeOffers.length)
  const terms = { basePerRound: average('basePerRound'), winBonus: average('winBonus'), drawBonus: average('drawBonus') }
  const projectedIncome = projectedSponsorshipIncome(terms, proposal.expectedWins, proposal.expectedDraws)
  return { id: `${proposal.season}:${clubId}:${brand.id}`, brandId: brand.id, kind: 'steady', season: proposal.season,
    ...terms, projectedIncome, expectedIncome: projectedIncome }
}

/** Old saves may contain a betting proposal issued during a ban. Keep signed contracts intact. */
export function getAvailableSponsorshipProposal(state: GameState, clubId: string): SponsorshipProposal | undefined {
  const proposal = state.sponsorship?.proposals[clubId]
  if (!proposal || state.sponsorship?.bettingAllowed !== false || !state.sponsorship.pendingClubIds.includes(clubId)
    || !proposal.offers.some((offer) => offer.kind === 'betting')) return proposal
  const replacement = balancedSponsorshipOffer(state.seed, clubId, proposal)
  return { ...proposal, offers: proposal.offers.map((offer) => offer.kind === 'betting' ? replacement : offer) }
}

/** Read last season's state, but use the club's division after promotion/relegation. */
export function createSponsorshipProposal(state: GameState, club: Club): SponsorshipProposal {
  const oldLeague = state.leagues.find((league) => league.rounds[0].some((fixture) => fixture.homeId === club.id || fixture.awayId === club.id))!
  const table = getTable(state, oldLeague.division)
  const position = table.findIndex((entry) => entry.clubId === club.id)
  const record = table[position]
  const award = state.awards.at(-1)
  const achievements: string[] = []
  let honoursBonus = 0
  for (const [earned, label, premium] of [
    [Object.values(award?.champions ?? {}).includes(club.id), 'Campeão de divisão', 0.12],
    [award?.cupChampionId === club.id, 'Campeão da Copa', 0.16],
    [award?.libertadoresChampionId === club.id, 'Campeão da Libertadores', 0.18],
    [award?.bestAttackClubId === club.id, 'Melhor ataque', 0.06],
    [award?.bestDefenceClubId === club.id, 'Melhor defesa', 0.06],
    [club.players.some((player) => player.id === award?.topScorerId), 'Artilheiro', 0.06],
  ] as const) {
    if (earned) { achievements.push(label); honoursBonus += premium }
  }
  const value = sponsorshipValue(club.division, club.supporters, record.points, honoursBonus)
  const expectedWins = Math.max(2, Math.min(10, record.wins))
  const expectedDraws = Math.max(1, Math.min(SEASON_ROUNDS - expectedWins - 1, record.draws))
  const brands = shuffle(hashText(`${state.seed}:${state.season + 1}:${club.id}:sponsors`), SPONSOR_BRANDS).value
  const safeBrands = brands.filter((brand) => !brand.betting)
  const makeOffer = (kind: SponsorshipOffer['kind'], brandId: string, base: number, win: number, draw: number): SponsorshipOffer => {
    const terms = { basePerRound: roundMoney(base), winBonus: roundMoney(win), drawBonus: roundMoney(draw) }
    const projectedIncome = projectedSponsorshipIncome(terms, expectedWins, expectedDraws)
    return { id: `${state.season + 1}:${club.id}:${brandId}`, brandId, kind, season: state.season + 1, ...terms, projectedIncome, expectedIncome: projectedIncome }
  }
  const steady = makeOffer('steady', safeBrands[0].id, value * 0.9, value * 0.2, value * 0.08)
  const performance = makeOffer('performance', safeBrands[1].id, value * 0.6, value * 1.1, value * 0.35)
  const proposal: SponsorshipProposal = { season: state.season + 1, division: club.division, supporters: club.supporters,
    previousPosition: position + 1, achievements, expectedWins, expectedDraws, offers: [steady, performance] }
  if (state.sponsorship?.bettingAllowed === false) {
    proposal.offers.push(balancedSponsorshipOffer(state.seed, club.id, proposal))
    return proposal
  }
  const best = performance.projectedIncome > steady.projectedIncome ? performance : steady
  const activeFraction = expectedBettingActiveFraction(true)
  // Quote against the better safe offer while bets are legal.
  // The advertised projection is higher; its expected 14-round receipts are ~90% of that offer.
  const multiplier = BETTING_EXPECTED_RETURN / activeFraction
  const betting = makeOffer('betting', brands.find((brand) => brand.betting)!.id,
    best.basePerRound * multiplier, best.winBonus * multiplier, best.drawBonus * multiplier)
  betting.expectedIncome = Math.round(betting.projectedIncome * activeFraction)
  proposal.offers.push(betting)
  return proposal
}

export function bestSafeSponsorship(proposal: SponsorshipProposal): SponsorshipOffer {
  return proposal.offers.filter((offer) => offer.kind !== 'betting').reduce((best, offer) => offer.expectedIncome > best.expectedIncome ? offer : best)
}

export function signSponsorship(club: Club, offer: SponsorshipOffer): void {
  club.sponsorship = { ...offer }
  club.sponsorPerRound = offer.basePerRound
}

export function sponsorshipPayment(state: GameState, club: Club, outcome?: FormResult): number {
  const contract = club.sponsorship
  if (!contract) return club.sponsorPerRound // Keep an existing career's current-season agreement.
  if (contract.season !== state.season || (contract.kind === 'betting' && state.sponsorship?.bettingAllowed === false)) return 0
  return contract.basePerRound + (outcome === 'V' ? contract.winBonus : outcome === 'E' ? contract.drawBonus : 0)
}

export function bettingRegulationNotice(state: GameState, clubId = state.manager.clubId): string | undefined {
  const club = state.clubs.find((candidate) => candidate.id === clubId)
  const change = state.lastReport?.bettingRegulationChange
  if (!change || club?.sponsorship?.kind !== 'betting' || club.sponsorship.season !== state.season) return undefined
  const brand = getSponsorBrand(club.sponsorship.brandId).name
  return change.allowed
    ? `APOSTAS LIBERADAS. ${brand} voltou a pagar nesta jornada. As parcelas suspensas não serão repostas.`
    : `O Governo editou uma Medida Provisória proibindo as bets. A ${brand} suspendeu o patrocínio do clube ${club.name} até segunda ordem.`
}

/** Cash-injection ceiling; older saves can retain a contract quoted during a ban. */
export function maximumSponsorshipPerRound(division: Division, legacyBannedContract = false): number {
  return Math.ceil(SPONSOR_DIVISION_BASE[division] * 1.6 * 1.55 * 1.7 * BETTING_EXPECTED_RETURN / expectedBettingActiveFraction(!legacyBannedContract)) + 100
}
