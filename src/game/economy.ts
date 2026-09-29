import type { Competition, Division, FormResult } from './types'

export function calculatePlayerSalary(strength: number, age: number): number {
  return Math.max(1_000, Math.round((strength * strength * 4 + age * 20) / 100) * 100)
}

export function calculateRegularAuctionMinimum(salary: number): number {
  return Math.max(1_000, Math.round(salary * 0.65 / 100) * 100)
}

export function calculateAiAuctionSalary(minimumSalary: number, roll: number, fairSalary?: number): number {
  const boundedRoll = Math.max(0, Math.min(1, roll))
  const qualityLimit = fairSalary === undefined ? 64_000 : Math.round(fairSalary * 1.6 / 100) * 100
  return Math.min(64_000, qualityLimit, Math.round(minimumSalary * (1.05 + boundedRoll * 0.55) / 100) * 100)
}

export function normalizeSalaryOffer(salary: number): number {
  return Math.max(0, Math.min(64_000, Math.round(salary / 50) * 50))
}

export function calculatePlayerValue(strength: number, age: number): number {
  const ageFactor = Math.max(0.55, 1.35 - Math.max(0, age - 24) * 0.045)
  // Keep entry-level prices while making standout signings reachable in division four.
  const strengthValue = Math.min(strength ** 3 * 4, strength ** 2 * 65)
  return Math.max(1_000, Math.round(strengthValue * ageFactor / 1_000) * 1_000)
}

export function calculateAuctionFee(playerValue: number): number {
  return Math.max(1_000, Math.round(playerValue * 0.9 / 1_000) * 1_000)
}

export function startingClubCash(rating: number, division: Division): number {
  return Math.round((95_000 + rating * rating * 80 + (5 - division) * 50_000) / 1_000) * 1_000
}

export function sponsorPerRound(rating: number, division: Division): number {
  return Math.round((4_000 + rating * 250 + (5 - division) * 2_000) / 500) * 500
}

export function initialSupporters(capacity: number, rating: number): number {
  return Math.round(capacity * (0.32 + rating / 150))
}

function calculateSupporterGrowthRate(
  clubRating: number,
  opponentRating: number,
  outcome: FormResult,
  goalDifference: number,
  competition: Competition,
  recentForm: readonly FormResult[] = [],
): number {
  const base = outcome === 'V' ? 0.012 : outcome === 'D' ? -0.006 : 0.0015
  const ratingDifference = opponentRating - clubRating
  const surprise = outcome === 'V'
    ? Math.max(0, ratingDifference) / 10_000
    : outcome === 'D'
      ? -Math.max(0, -ratingDifference) / 12_000
      : ratingDifference / 30_000
  const margin = Math.max(-4, Math.min(4, goalDifference)) * 0.001
  // recentForm includes this result. Reward a sustained run, up to five wins.
  const form = recentForm.slice(-5)
  let winningRun = 0
  for (let index = form.length - 1; index >= 0 && form[index] === 'V'; index--) winningRun++
  const momentum = outcome === 'V' ? Math.max(0, winningRun - 1) * 0.0025 : 0
  const competitionWeight = competition === 'libertadores' ? 1.25 : competition === 'cup' ? 1.15 : 1
  return Math.max(-0.012, Math.min(0.04, (base + surprise + margin + momentum) * competitionWeight))
}

export function updateSupportersAfterMatch(
  supporters: number,
  clubRating: number,
  opponentRating: number,
  outcome: FormResult,
  goalDifference: number,
  competition: Competition,
  recentForm: readonly FormResult[] = [],
): number {
  const rate = calculateSupporterGrowthRate(clubRating, opponentRating, outcome, goalDifference, competition, recentForm)
  const next = Math.max(800, Math.round(supporters * (1 + rate)))
  if (next !== supporters) return next
  return Math.max(800, supporters + (rate < 0 ? -1 : 1))
}
