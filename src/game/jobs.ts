import { hashText } from './rng'
import { getManagerClub, getTable } from './selectors'
import type { Division, GameState, JobOffer } from './types'

/** Match vacancies to the manager's results and reputation, using next season's divisions. */
export function createJobOffers(state: GameState): JobOffer[] {
  const managerClub = getManagerClub(state)
  const nextDivisions = new Map<string, number>()
  let position = 8
  for (const division of [1, 2, 3, 4] as Division[]) {
    getTable(state, division).forEach((entry, index) => {
      const nextDivision = index < 2 ? Math.max(1, division - 1) : index >= 6 ? Math.min(4, division + 1) : division
      nextDivisions.set(entry.clubId, nextDivision)
      if (entry.clubId === managerClub.id) position = index + 1
    })
  }

  const cupWinner = state.cup.championId === managerClub.id || state.libertadores?.championId === managerClub.id
  // League success opens the next tier; national/continental titles can open two.
  // A poor finish normally lowers the market, even for a formerly famous manager.
  const divisionChange = cupWinner ? -2 : position >= 7 ? 1 : position <= 2 || state.manager.reputation >= 75 ? -1 : 0
  const targetDivision = Math.max(1, Math.min(4, managerClub.division + divisionChange))
  const performanceBonus = position <= 2 ? 4 : position >= 7 ? -6 : 0
  const targetRating = state.manager.reputation * 0.75 + managerClub.rating * 0.25 + performanceBonus
  const candidates = state.clubs.filter((club) => club.id !== managerClub.id).map((club) => {
    const division = nextDivisions.get(club.id) ?? club.division
    // Stable per career/season: reloading cannot reroll offers or alter match randomness.
    const variation = (hashText(`${state.id}:jobs:${state.season}:${club.id}`) % 10_000) / 2_500
    return { club, division, score: (division - targetDivision) * 12 + Math.abs(club.rating - targetRating) - variation }
  })
  const credible = candidates
    .filter(({ club, division }) => division >= targetDivision && club.rating <= targetRating + 5)
    .sort((a, b) => a.score - b.score || a.club.id.localeCompare(b.club.id))
  // Even a dismissed novice needs a way back into the game, without an elite-club offer.
  const recovery = [...candidates].sort((a, b) => b.division - a.division || a.club.rating - b.club.rating || a.club.id.localeCompare(b.club.id))
  const selected = [...credible]
  for (const candidate of recovery) {
    if (selected.length >= 3) break
    if (!selected.some(({ club }) => club.id === candidate.club.id)) selected.push(candidate)
  }
  return selected.slice(0, 3).map(({ club, division }) => ({
    clubId: club.id,
    wage: 12_000 + club.rating * 1_200,
    objective: division === 1 ? 'Classificar entre os quatro' : 'Lutar pelo acesso',
  }))
}
