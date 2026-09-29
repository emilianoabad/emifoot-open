import type { ReactNode } from 'react'
import { formatMoney, getClub, getCompetitionClub, getPrizeAmount, type Division, type GameState } from '../game'

function AwardRow({ label, winner, amount, compact = false }: { label: string; winner: string; amount?: number; compact?: boolean }) {
  return (
    <div className={`award-row${compact ? ' award-row--compact' : ''}`}>
      <span>{label}</span>
      <b className="award-winner">{winner}</b>
      <strong className="award-amount">{amount === undefined ? '—' : formatMoney(amount)}</strong>
    </div>
  )
}

export function SeasonAwardsPanel({ state, children }: { state: GameState; children?: ReactNode }) {
  const award = state.awards.at(-1)
  if (!award) return null
  const scorer = state.clubs.flatMap((club) => club.players).find((player) => player.id === award.topScorerId)
  return (
    <>
      <div className="awards-grid">
        <div className="award-panel dos-double screen-cyan">
          <div className="panel-title">LIGAS · PRÊMIOS</div>
          {([1, 2, 3, 4] as Division[]).map((division) => (
            <div className="division-awards" key={division}>
              <div className="division-awards-title">{division}ª DIVISÃO</div>
              <AwardRow compact label="1º" winner={getClub(state, award.champions[String(division)]).name}
                amount={getPrizeAmount(state, award.season, { kind: 'division', division }, award.champions[String(division)])} />
              {award.runnersUp?.[String(division)] && (
                <AwardRow compact label="2º" winner={getClub(state, award.runnersUp[String(division)]).name}
                  amount={getPrizeAmount(state, award.season, { kind: 'division-runner-up', division }, award.runnersUp[String(division)])} />
              )}
            </div>
          ))}
        </div>
        <div className="award-panel dos-double screen-green">
          <div className="panel-title">COPAS E DESTAQUES</div>
          <AwardRow label="COPA DO BRASIL (FINAL)" winner={getClub(state, award.cupChampionId).name}
            amount={getPrizeAmount(state, award.season, { kind: 'cup', roundIndex: 4 }, award.cupChampionId)} />
          <AwardRow label="LIBERTADORES" winner={award.libertadoresChampionId ? getCompetitionClub(state, award.libertadoresChampionId).name : '---'}
            amount={getPrizeAmount(state, award.season, { kind: 'libertadores' }, award.libertadoresChampionId)} />
          <AwardRow label="ARTILHEIRO" winner={`${scorer?.name ?? '---'} · ${award.topScorerGoals}`}
            amount={getPrizeAmount(state, award.season, { kind: 'top-scorer' })} />
          <AwardRow label="MELHOR ATAQUE" winner={`${award.bestAttackClubId ? getClub(state, award.bestAttackClubId).name : '---'} · ${award.bestAttackGoals ?? 0}`}
            amount={getPrizeAmount(state, award.season, { kind: 'best-attack' })} />
          <AwardRow label="MELHOR DEFESA" winner={`${award.bestDefenceClubId ? getClub(state, award.bestDefenceClubId).name : '---'} · ${award.bestDefenceGoalsAgainst ?? 0}`}
            amount={getPrizeAmount(state, award.season, { kind: 'best-defence' })} />
        </div>
      </div>
      {children}
    </>
  )
}
