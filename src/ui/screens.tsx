import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useGameKeyboard } from './useGameKeyboard'
import {
  CUP_AFTER_ROUNDS,
  CUP_ROUND_NAMES,
  autoPickLineup,
  contractMarker,
  expandStadium,
  formatMoney,
  getAuctionSeller,
  getAvailableTactics,
  getCompetitionClub,
  getClubPosition,
  getContractSalaryDemand,
  getManagerClub,
  getManagerFixture,
  getMarketPlayer,
  getPlayerSaleQuote,
  getSponsorBrand,
  getTable,
  getLibertadoresGroupTable,
  isSaleProtected,
  placeTransferBid,
  repairStadium,
  renewPlayerContract,
  sellPlayer,
  setTactic,
  setTicketPrice,
  startRound,
  sponsorshipPayment,
  swapStarter,
  type Division,
  type EngineResult,
  type Fixture,
  type GameState,
  type Player,
  type TacticId,
} from '../game'

export type ManagerScreenId = 'squad' | 'tables' | 'fixtures' | 'cup' | 'libertadores' | 'market' | 'finance' | 'stadium' | 'career' | 'news'
export type SquadMode = 'normal' | 'sell' | 'renew'

export interface ScreenProps {
  state: GameState
  command: (run: (state: GameState) => EngineResult) => void
  message?: string
  managedClubIds?: readonly string[]
  squadMode?: SquadMode
  onEnterSquadMode?: (mode: Exclude<SquadMode, 'normal'>) => void
  onExitSquadMode?: () => void
  onOpenScreen?: (screen: ManagerScreenId) => void
  selectedTactic?: TacticId
  onSelectTactic?: (tactic: TacticId) => void
  onExit?: () => void
}

function clubName(state: GameState, clubId: string): string {
  return getCompetitionClub(state, clubId).name
}

function resultText(fixture: Fixture): string {
  if (!fixture.result) return ' - '
  const penalties = fixture.result.homePenalties === undefined ? '' : ` (${fixture.result.homePenalties}-${fixture.result.awayPenalties})`
  return `${fixture.result.homeGoals}-${fixture.result.awayGoals}${penalties}`
}

const HELP_TITLES = ['TÁCTICAS', 'CAMPEONATO', 'FINANÇAS', 'DIVERSOS'] as const

function clubPanelStyle(club: ReturnType<typeof getManagerClub>): CSSProperties {
  return { color: club.secondary, backgroundColor: club.primary, borderColor: club.secondary }
}

function playerDisplayName(player: Player, maxLength = 18): string {
  const marker = contractMarker(player)
  const prefix = marker ? `${marker} ` : ''
  const suffix = player.injuryRounds > 0 ? ' [+]' : ''
  return `${prefix}${player.name.slice(0, Math.max(1, maxLength - prefix.length - suffix.length))}${suffix}`
}

export function SquadScreen({ state, command, message, managedClubIds, squadMode = 'normal', onEnterSquadMode, onExitSquadMode, onOpenScreen, selectedTactic, onSelectTactic, onExit }: ScreenProps) {
  const club = getManagerClub(state)
  const tactics = getAvailableTactics(club)
  const [selectedStarter, setSelectedStarter] = useState<string>()
  const [selectedManagementId, setSelectedManagementId] = useState<string>()
  const [managementAttempted, setManagementAttempted] = useState(false)
  const [renewSalary, setRenewSalary] = useState(0)
  const [helpPage, setHelpPage] = useState(0)
  const renewInputRef = useRef<HTMLInputElement>(null)
  const saleConfirmRef = useRef<HTMLButtonElement>(null)
  const fixture = getManagerFixture(state)
  const opponentId = fixture ? (fixture.homeId === club.id ? fixture.awayId : fixture.homeId) : undefined
  const opponent = opponentId ? getCompetitionClub(state, opponentId) : undefined
  const tableEntry = getTable(state, club.division).find((entry) => entry.clubId === club.id)
  const opponentGroup = opponentId && state.activeCompetition?.competition === 'libertadores' && state.activeCompetition.stage === 'group'
    ? state.libertadores?.groups.find((group) => group.clubIds.includes(opponentId))
    : undefined
  const opponentTable = opponentGroup
    ? getLibertadoresGroupTable(state, opponentGroup)
    : opponent ? getTable(state, opponent.division) : []
  const opponentPosition = opponentTable.findIndex((entry) => entry.clubId === opponentId)
  const opponentEntry = opponentTable[opponentPosition]
  const sortedPlayers = [...club.players].sort((a, b) => {
    const positionOrder = { G: 0, D: 1, M: 2, A: 3 }
    return positionOrder[a.position] - positionOrder[b.position] || b.strength - a.strength
  })
  const saleQuotes = new Map(club.players.map((player) => [player.id, getPlayerSaleQuote(state, player.id, managedClubIds)]))
  const previewLineupIds = selectedTactic ? autoPickLineup({ ...club, tactic: selectedTactic }, selectedTactic).lineup : []
  const visiblePlayers = squadMode === 'sell'
    ? sortedPlayers.filter((player) => saleQuotes.get(player.id)?.ok)
    : squadMode === 'renew'
      ? sortedPlayers.filter((player) => !isSaleProtected(player))
      : selectedTactic
        ? previewLineupIds.map((id) => club.players.find((player) => player.id === id)).filter((player): player is (typeof club.players)[number] => Boolean(player))
        : sortedPlayers
  const selectedManagementPlayer = club.players.find((player) => player.id === selectedManagementId)
  const managementPlayerId = selectedManagementPlayer?.id
  const selectedSaleQuote = selectedManagementId ? saleQuotes.get(selectedManagementId) : undefined
  const renewDemand = selectedManagementPlayer ? getContractSalaryDemand(selectedManagementPlayer) : 0

  useEffect(() => {
    if (squadMode === 'sell' && managementPlayerId) saleConfirmRef.current?.focus()
  }, [managementPlayerId, squadMode])

  useEffect(() => {
    if (squadMode !== 'renew' || !managementPlayerId) return
    const frame = window.requestAnimationFrame(() => renewInputRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [managementPlayerId, squadMode])

  const selectPlayer = (playerId: string) => {
    if (squadMode === 'sell') {
      setSelectedManagementId(playerId)
      setManagementAttempted(false)
      return
    }
    if (squadMode === 'renew') {
      const player = club.players.find((candidate) => candidate.id === playerId)
      setSelectedManagementId(playerId)
      setRenewSalary(player ? getContractSalaryDemand(player) : 0)
      setManagementAttempted(false)
      return
    }
    if (club.lineup.includes(playerId)) {
      setSelectedStarter(playerId)
    } else if (selectedStarter) {
      command((current) => swapStarter(current, selectedStarter, playerId))
      setSelectedStarter(undefined)
    }
  }

  const previousHelpPage = () => setHelpPage((page) => (page + HELP_TITLES.length - 1) % HELP_TITLES.length)
  const nextHelpPage = () => setHelpPage((page) => (page + 1) % HELP_TITLES.length)
  const selectBestPlayers = () => command((current) => {
    const currentClub = getManagerClub(current)
    const available = getAvailableTactics(currentClub)
    return setTactic(current, (available.find((candidate) => candidate.id === currentClub.tactic) ?? available[0]).id)
  })
  const enterManagementMode = (mode: Exclude<SquadMode, 'normal'>) => {
    setSelectedManagementId(undefined)
    setManagementAttempted(false)
    onEnterSquadMode?.(mode)
  }
  const exitManagementMode = () => {
    setSelectedManagementId(undefined)
    setManagementAttempted(false)
    onExitSquadMode?.()
  }
  const confirmSale = () => {
    if (!selectedManagementPlayer || !selectedSaleQuote?.ok) return
    const playerId = selectedManagementPlayer.id
    setSelectedManagementId(undefined)
    setManagementAttempted(true)
    command((current) => sellPlayer(current, playerId, managedClubIds))
  }
  const confirmRenewal = () => {
    if (!selectedManagementPlayer) return
    const playerId = selectedManagementPlayer.id
    setSelectedManagementId(undefined)
    setManagementAttempted(true)
    command((current) => renewPlayerContract(current, playerId, renewSalary))
  }
  const keyboardRef = useGameKeyboard<HTMLDivElement>((key) => {
    if (squadMode === 'sell' && key === 'Enter' && selectedSaleQuote?.ok) { confirmSale(); return true }
    if (squadMode !== 'normal') return
    if (key.toLowerCase() === 'x') { selectBestPlayers(); return true }
    if (key === 'ArrowLeft') { previousHelpPage(); return true }
    if (key === 'ArrowRight') { nextHelpPage(); return true }
  })

  return (
    <div ref={keyboardRef} className="original-manager-layout">
      <div className="original-squad-panel" style={{ ...clubPanelStyle(club), overflowX: 'hidden', overflowY: 'auto' }}>
        {squadMode !== 'normal' ? (
          <div className="original-player-row sale-player-row sale-player-header" style={clubPanelStyle(club)}>
            {squadMode === 'sell'
              ? <><span>POS</span><span>JOGADOR</span><span>FOR</span><span>PREÇO</span></>
              : <><span>POS</span><span>JOGADOR</span><span>CONTR.</span><span>ORD.</span></>}
          </div>
        ) : null}
        {visiblePlayers.map((player, index) => {
          const starter = selectedTactic ? previewLineupIds.includes(player.id) : club.lineup.includes(player.id)
          const previous = visiblePlayers[index - 1]
          const showPosition = squadMode !== 'normal' || !previous || previous.position !== player.position
          const saleQuote = saleQuotes.get(player.id)
          const marker = contractMarker(player)
          const displayName = playerDisplayName(player)
          return (
            <button
              type="button"
              key={player.id}
              aria-label={squadMode === 'sell' && saleQuote?.ok
                ? `Selecionar ${player.name}, posição ${player.position}, preço ${formatMoney(saleQuote.fee)}`
                : squadMode === 'renew'
                  ? `Selecionar ${player.name}, contrato ${marker === '.' ? 'perto do fim' : 'livre'}, ordenado ${formatMoney(player.salary)}`
                  : undefined}
              className={`original-player-row ${squadMode !== 'normal' ? 'sale-player-row' : ''} ${starter ? 'starter' : ''} ${selectedStarter === player.id || selectedManagementId === player.id ? 'selected' : ''}`}
              onClick={() => selectPlayer(player.id)}
            >
              {squadMode === 'sell' ? (
                <><span>{player.position}</span><span>{displayName}</span><span>{player.strength}</span><span>{saleQuote?.ok ? formatMoney(saleQuote.fee) : '---'}</span></>
              ) : squadMode === 'renew' ? (
                <><span>{player.position}</span><span>{displayName}</span><span>{marker || 'LIVRE'}</span><span>{formatMoney(player.salary)}</span></>
              ) : (
                <><span>{showPosition ? player.position : ''}</span><span>{displayName}</span><span>{player.nationality === 'BRA' ? '' : player.nationality.slice(0, 3)}</span><span>{player.strength}</span><span>{player.salary}</span><span>{player.goals}</span></>
              )}
            </button>
          )
        })}
      </div>
      <div className="original-club-panel" style={clubPanelStyle(club)}>
        <div className="original-club-title"><span>{club.name.toUpperCase()}</span><span>BRA</span></div>
        <div>{state.manager.name}</div>
        <div className="original-club-data"><span>{club.division}ª divisão</span><span>{getClubPosition(state, club.id)}º lugar&nbsp; {tableEntry?.points ?? 0} pontos</span></div>
        <div className="original-club-data"><span>{club.stadium.capacity} lugares</span><span>{club.supporters} sócios</span></div>
      </div>
      <div className="original-tactics-panel screen-green">
        {squadMode !== 'normal' ? (
          <div className="sale-mode-panel">
            <div className="sale-mode-title">{squadMode === 'sell' ? 'VENDER JOGADOR' : 'RENOVAR CONTRATO'}</div>
            {squadMode === 'sell' && selectedManagementPlayer && selectedSaleQuote?.ok ? (
              <div className="sale-mode-detail">
                <div><span>JOGADOR</span><b>{playerDisplayName(selectedManagementPlayer, 17)}</b></div>
                <div><span>POSIÇÃO / FORÇA</span><b>{selectedManagementPlayer.position} / {selectedManagementPlayer.strength}</b></div>
                <div><span>VALOR DA PROPOSTA</span><b>{formatMoney(selectedSaleQuote.fee)}</b></div>
                <button ref={saleConfirmRef} type="button" className="sale-confirm" aria-label={`Confirmar venda de ${selectedManagementPlayer.name}`} onClick={confirmSale}>ENTER&nbsp; CONFIRMAR VENDA</button>
              </div>
            ) : squadMode === 'renew' && selectedManagementPlayer ? (
              <form className="sale-mode-detail renew-mode-detail" onSubmit={(event) => { event.preventDefault(); confirmRenewal() }}>
                <div><span>JOGADOR / CONTRATO</span><b>{playerDisplayName(selectedManagementPlayer, 13)} · {contractMarker(selectedManagementPlayer) === '.' ? 'ÚLTIMA JORNADA' : 'LIVRE'}</b></div>
                <div><span>ORDENADO / PEDIDO</span><b>{formatMoney(selectedManagementPlayer.salary)} / {formatMoney(renewDemand)}</b></div>
                <label>NOVO ORDENADO <input ref={renewInputRef} aria-label="Novo ordenado" inputMode="numeric" value={renewSalary} onChange={(event) => setRenewSalary(Number(event.target.value.replace(/\D/g, '').slice(0, 5)))} /></label>
                <button type="submit" className="sale-confirm" aria-label={`Renovar contrato de ${selectedManagementPlayer.name}`}>ENTER&nbsp; FAZER PROPOSTA</button>
              </form>
            ) : (
              <div className="sale-mode-instruction">
                {managementAttempted && message && message !== 'COMANDO ACEITE.'
                  ? message
                  : visiblePlayers.length > 0 && squadMode === 'sell'
                    ? 'SELECIONE UM JOGADOR NO PLANTEL.'
                    : visiblePlayers.length > 0
                      ? 'SELECIONE UM JOGADOR E OFEREÇA UM NOVO ORDENADO PARA GARANTIR 1 ANO DE CONTRATO.'
                      : squadMode === 'sell'
                        ? 'NENHUM JOGADOR PODE SER VENDIDO.'
                        : 'NENHUM CONTRATO PODE SER RENOVADO AGORA.'}
              </div>
            )}
            <button type="button" className="sale-cancel" onClick={exitManagementMode}>ESC&nbsp; CANCELAR</button>
          </div>
        ) : (
          <>
            <div className="original-panel-title">
              <button type="button" aria-label="Menu anterior" onClick={previousHelpPage}>◄</button>
              <span>{HELP_TITLES[helpPage]}</span>
              <button type="button" aria-label="Próximo menu" onClick={nextHelpPage}>►</button>
            </div>
          </>
        )}
        {squadMode === 'normal' && helpPage === 0 ? (
          <div className="original-tactic-list">
            {tactics.map((tactic) => (
              <button
                type="button"
                className={(selectedTactic ?? club.tactic) === tactic.id ? 'tactic-active' : ''}
                key={tactic.id}
                onClick={() => onSelectTactic?.(tactic.id)}
              >
                {tactic.key === 10 ? 0 : tactic.key}&nbsp; {tactic.id}
              </button>
            ))}
          </div>
        ) : null}
        {squadMode === 'normal' && helpPage === 1 ? (
          <div className="original-command-list">
            <button type="button" onClick={() => onOpenScreen?.('fixtures')}>C&nbsp; CALENDÁRIO</button>
            <button type="button" onClick={() => onOpenScreen?.('fixtures')}>R&nbsp; RESULTADOS</button>
            <button type="button" onClick={() => onOpenScreen?.('tables')}>T&nbsp; CLASSIFICAÇÃO</button>
            <button type="button" onClick={() => onOpenScreen?.('cup')}>Q&nbsp; COPA DO BRASIL</button>
            <button type="button" onClick={() => onOpenScreen?.('libertadores')}>L&nbsp; LIBERTADORES</button>
          </div>
        ) : null}
        {squadMode === 'normal' && helpPage === 2 ? (
          <div className="original-command-list">
            <button type="button" onClick={() => onOpenScreen?.('market')}>M&nbsp; TRANSFERÊNCIAS</button>
            <button type="button" onClick={() => enterManagementMode('sell')}>V&nbsp; VENDER JOGADOR</button>
            <button type="button" onClick={() => enterManagementMode('renew')}>O&nbsp; NOVO ORDENADO</button>
            <button type="button" onClick={() => onOpenScreen?.('finance')}>F&nbsp; FINANÇAS</button>
            <button type="button" onClick={() => onOpenScreen?.('stadium')}>E&nbsp; ESTÁDIO</button>
          </div>
        ) : null}
        {squadMode === 'normal' && helpPage === 3 ? (
          <div className="original-command-list">
            <button type="button" onClick={() => onOpenScreen?.('career')}>P&nbsp; CARREIRA</button>
            <button type="button" onClick={() => onOpenScreen?.('news')}>N&nbsp; NOTÍCIAS</button>
            <button type="button" onClick={selectBestPlayers}>X&nbsp; MELHORES JOGADORES</button>
            <button type="button" onClick={onExit}>ESC&nbsp; SAIR</button>
          </div>
        ) : null}
      </div>
      <div className="original-next-match" style={opponent ? clubPanelStyle(opponent) : undefined}>
        <div><span>{opponentId ? clubName(state, opponentId).toUpperCase() : 'FIM DA TEMPORADA'}</span><span>{fixture ? fixture.homeId === club.id ? 'CASA' : 'FORA' : ''}</span></div>
        {opponentEntry ? <div>{opponentPosition + 1}º lugar&nbsp;&nbsp; {opponentEntry.points} pontos</div> : null}
        <div>{state.activeCompetition?.roundName ?? `${state.currentRound}ª JORNADA`}</div>
      </div>
      <div className="original-money-panel" style={clubPanelStyle(club)}>
        <div>Dinheiro:&nbsp;&nbsp;&nbsp; {Math.round(club.cash)}</div>
        <div>Ordenados:&nbsp;&nbsp; {club.players.reduce((sum, player) => sum + player.salary, 0)}</div>
        <div>Preço dos bilhetes: {club.ticketPrice}</div>
      </div>
    </div>
  )
}

export function TablesScreen({ state }: ScreenProps) {
  const [division, setDivision] = useState<Division>(getManagerClub(state).division)
  const table = getTable(state, division)
  return (
    <div className="full-screen-panel screen-cyan dos-double">
      <div className="screen-heading">CLASSIFICAÇÃO DO CAMPEONATO</div>
      <div className="division-tabs">
        {([1, 2, 3, 4] as Division[]).map((item) => <button className={item === division ? 'active' : ''} type="button" key={item} onClick={() => setDivision(item)}>{item}ª DIVISÃO</button>)}
      </div>
      <div className="standings-table">
        <div className="standings-row head"><span>#</span><span>CLUBE</span><span>J</span><span>V</span><span>E</span><span>D</span><span>GM</span><span>GS</span><span>DG</span><span>PTS</span></div>
        {table.map((entry, index) => (
          <div className={`standings-row ${entry.clubId === state.manager.clubId ? 'human-row' : ''}`} key={entry.clubId}>
            <span>{index + 1}</span><span>{clubName(state, entry.clubId)}</span><span>{entry.played}</span><span>{entry.wins}</span><span>{entry.draws}</span><span>{entry.losses}</span><span>{entry.goalsFor}</span><span>{entry.goalsAgainst}</span><span>{entry.goalDifference}</span><span>{entry.points}</span>
          </div>
        ))}
      </div>
      <div className="legend-line"><span>1º/2º: SOBEM</span><span>7º/8º: DESCEM</span><span>CRITÉRIOS: PTS · V · DG · GM</span></div>
    </div>
  )
}

export function FixturesScreen({ state, command }: ScreenProps) {
  const keyboardRef = useGameKeyboard<HTMLDivElement>((key) => {
    if (key === 'Enter') { command(startRound); return true }
  })
  const fixtures = state.lastReport?.leagueResults ?? state.leagues.flatMap((league) => league.rounds[state.currentRound - 1] ?? [])
  return (
    <div ref={keyboardRef} className="scoreboard screen-blue dos-double">
      <div className="screen-heading">{state.lastReport ? `RESULTADOS · ${Math.max(1, state.currentRound - 1)}ª JORNADA` : `${state.currentRound}ª JORNADA`}</div>
      {([1, 2, 3, 4] as Division[]).map((division) => (
        <div className="score-division" key={division}>
          <div className="division-marker">{division}ª</div>
          <div>
            {fixtures.filter((fixture) => fixture.division === division).map((fixture) => (
              <div className="score-row" key={fixture.id}>
                <span className={fixture.homeId === state.manager.clubId ? 'human-cell' : ''}>{clubName(state, fixture.homeId).slice(0, 16)}</span>
                <b>{resultText(fixture)}</b>
                <span className={fixture.awayId === state.manager.clubId ? 'human-cell' : ''}>{clubName(state, fixture.awayId).slice(0, 16)}</span>
                <span>{fixture.result?.attendance.toLocaleString('pt-BR') ?? '-----'}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
      <button type="button" className="score-play dos-button action-yellow" onClick={() => command(startRound)}>[ ENTER ] JOGAR {state.currentRound}ª JORNADA</button>
    </div>
  )
}

export function CupScreen({ state }: ScreenProps) {
  const nextCupRound = state.cup.championId ? undefined : CUP_AFTER_ROUNDS[state.cup.nextRoundIndex]
  return (
    <div className="cup-screen screen-green dos-double">
      <div className="screen-heading">COPA DO BRASIL · SORTEIO E RESULTADOS</div>
      <div className="cup-status-line">
        <span>32 CLUBES · 4 DIVISÕES · ELIMINATÓRIA</span>
        <span>{nextCupRound ? `PRÓXIMA FASE APÓS A ${nextCupRound}ª JORNADA` : 'COMPETIÇÃO ENCERRADA'}</span>
      </div>
      <div className="cup-bracket">
        {CUP_ROUND_NAMES.map((roundName, roundIndex) => {
          const round = state.cup.rounds[roundIndex]
          return (
          <div className="cup-column" key={roundName}>
            <div className="cup-round-title">{roundName}</div>
            {round ? round.matches.map((fixture) => {
              const winner = fixture.result
                ? fixture.result.homeGoals > fixture.result.awayGoals || (fixture.result.homeGoals === fixture.result.awayGoals && (fixture.result.homePenalties ?? 0) > (fixture.result.awayPenalties ?? 0))
                  ? fixture.homeId : fixture.awayId
                : undefined
              return (
                <div className="cup-match" key={fixture.id}>
                  <div className={`${winner === fixture.homeId ? 'winner' : ''} ${fixture.homeId === state.manager.clubId ? 'human-cell' : ''}`}>{clubName(state, fixture.homeId).slice(0, 12)} <span>{fixture.result?.homeGoals ?? ''}</span></div>
                  <div className={`${winner === fixture.awayId ? 'winner' : ''} ${fixture.awayId === state.manager.clubId ? 'human-cell' : ''}`}>{clubName(state, fixture.awayId).slice(0, 12)} <span>{fixture.result?.awayGoals ?? ''}</span></div>
                </div>
              )
            }) : <div className="cup-round-waiting">AGUARDA<br />VENCEDORES</div>}
          </div>
          )
        })}
      </div>
      <div className="legend-line">
        <span>JOGO ÚNICO · EMPATE = PENÁLTIS</span>
        <span>{state.cup.championId ? `CAMPEÃO: ${clubName(state, state.cup.championId).toUpperCase()}` : 'COPA EM DISPUTA'}</span>
      </div>
    </div>
  )
}

export function LibertadoresScreen({ state }: ScreenProps) {
  const competition = state.libertadores
  if (!competition) {
    return <div className="libertadores-screen screen-green dos-double"><div className="screen-heading">TAÇA LIBERTADORES DA AMÉRICA</div><div className="cup-round-waiting">A COMPETIÇÃO SERÁ SORTEADA NA PRÓXIMA TEMPORADA.</div></div>
  }
  return (
    <div className="libertadores-screen screen-green dos-double">
      <div className="screen-heading">TAÇA LIBERTADORES DA AMÉRICA · {competition.season}</div>
      <div className="libertadores-status">4 BRASILEIROS · 12 CONVIDADOS CONMEBOL · 4 GRUPOS · 2 CLASSIFICADOS POR GRUPO</div>
      <div className="libertadores-groups">
        {competition.groups.map((group) => (
          <div className="libertadores-group" key={group.name}>
            <div className="libertadores-group-title">{group.name}</div>
            {getLibertadoresGroupTable(state, group).map((entry, index) => (
              <div className={`libertadores-table-row ${entry.clubId === state.manager.clubId ? 'human-row' : ''}`} key={entry.clubId}>
                <span>{index + 1}</span><span>{clubName(state, entry.clubId).slice(0, 14)}</span><span>{entry.played}</span><span>{entry.goalDifference}</span><b>{entry.points}</b>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="libertadores-knockout">
        {['QUARTAS', 'SEMIFINAL', 'FINAL'].map((name, roundIndex) => {
          const round = competition.knockoutRounds[roundIndex]
          return (
            <div className="libertadores-knockout-round" key={name}>
              <div>{name}</div>
              {round ? round.matches.map((fixture) => (
                <div className="libertadores-knockout-match" key={fixture.id}>
                  <span>{clubName(state, fixture.homeId).slice(0, 11)}</span><b>{fixture.result ? resultText(fixture) : 'x'}</b><span>{clubName(state, fixture.awayId).slice(0, 11)}</span>
                </div>
              )) : <span>AGUARDA</span>}
            </div>
          )
        })}
      </div>
      <div className="legend-line"><span>FASE DE GRUPOS: 3 PONTOS POR VITÓRIA</span><span>{competition.championId ? `CAMPEÃO: ${clubName(state, competition.championId).toUpperCase()}` : 'LIBERTADORES EM DISPUTA'}</span></div>
    </div>
  )
}

export function MarketScreen({ state, command }: ScreenProps) {
  const [selectedId, setSelectedId] = useState(state.market[0]?.id ?? '')
  const listing = state.market.find((candidate) => candidate.id === selectedId) ?? state.market[0]
  const listedPlayer = listing ? getMarketPlayer(state, listing) : undefined
  const listedSeller = listing ? getAuctionSeller(state, listing.sellerId) : undefined
  const [salary, setSalary] = useState(listing?.minimumSalary ?? 0)
  const bidInputRef = useRef<HTMLInputElement>(null)
  const submit = () => { if (listing) command((current) => placeTransferBid(current, listing.id, salary)) }
  const keyboardRef = useGameKeyboard<HTMLDivElement>((key) => {
    if (key === 'Enter' && listing) { submit(); return true }
  })

  return (
    <div ref={keyboardRef} className="market-screen screen-blue">
      <div className="auction-title dos-double screen-red">VENDA PELA MELHOR OFERTA DE ORDENADO</div>
      <div className="market-list dos-double">
        <div className="market-head"><span>JOGADOR</span><span>POS</span><span>FOR</span><span>EQUIPA</span><span>PREÇO</span></div>
        {state.market.map((candidate) => {
          const seller = getAuctionSeller(state, candidate.sellerId)
          const player = getMarketPlayer(state, candidate)
          if (!player || !seller) return null
          return (
            <button type="button" className={`market-row ${candidate.id === listing?.id ? 'active' : ''}`} key={candidate.id} onClick={() => { setSelectedId(candidate.id); setSalary(candidate.minimumSalary); bidInputRef.current?.focus() }}>
              <span>{player.name.slice(0, 18)}</span><span>{player.position}</span><span>{player.strength}</span><span>{seller.shortName}</span><span>{Math.round(candidate.fee / 1000)}k</span>
            </button>
          )
        })}
      </div>
      <form className="auction-detail dos-double screen-red" onSubmit={(event) => { event.preventDefault(); submit() }}>
        {listing && listedPlayer ? (
          <>
            <div>JOGADOR&nbsp;&nbsp; {listedPlayer.name}</div>
            <div>POSIÇÃO&nbsp;&nbsp; {listedPlayer.position}</div>
            <div>FORÇA&nbsp;&nbsp;&nbsp;&nbsp; {listedPlayer.strength}</div>
            <div>EQUIPA&nbsp;&nbsp;&nbsp; {listedSeller?.name}</div>
            <div>PREÇO&nbsp;&nbsp;&nbsp;&nbsp; {formatMoney(listing.fee)}</div>
            <div>ORDENADO MÍNIMO: {formatMoney(listing.minimumSalary)}</div>
            <label className="salary-bid">{state.manager.name.slice(0, 12)}: <input ref={bidInputRef} aria-label="Oferta de ordenado" type="number" min={listing.minimumSalary} step="50" value={salary} onChange={(event) => setSalary(Number(event.target.value))} /></label>
            <button type="submit" className="dos-button action-yellow">[ ENTER ] LICITAR</button>
          </>
        ) : <div>MERCADO ENCERRADO.</div>}
      </form>
    </div>
  )
}

export function FinanceScreen({ state, command }: ScreenProps) {
  const club = getManagerClub(state)
  const sponsor = club.sponsorship
  const suspended = sponsor?.kind === 'betting' && state.sponsorship?.bettingAllowed === false
  const [price, setPrice] = useState(club.ticketPrice)
  const ledger = state.ledger.filter((entry) => entry.clubId === club.id).slice(-15).reverse()
  const income = ledger.filter((entry) => entry.amount > 0).reduce((sum, entry) => sum + entry.amount, 0)
  const expenses = ledger.filter((entry) => entry.amount < 0).reduce((sum, entry) => sum + entry.amount, 0)
  return (
    <div className="finance-screen screen-cyan dos-double">
      <div className="screen-heading">CONTABILIDADE DO {club.name.toUpperCase()}</div>
      <div className="finance-summary">
        <div><span>SALDO ACTUAL</span><b className={club.cash < 0 ? 'negative' : ''}>{formatMoney(club.cash)}</b></div>
        <div><span>PATROCÍNIO FIXO / JORNADA</span><b>{formatMoney(sponsorshipPayment(state, club))}</b></div>
        <div><span>ORDENADOS / JORNADA</span><b>{formatMoney(club.players.reduce((sum, player) => sum + player.salary, 0))}</b></div>
        <div><span>ÚLTIMAS RECEITAS / DESPESAS</span><b>{formatMoney(income)} / {formatMoney(expenses)}</b></div>
      </div>
      {sponsor && <div className="finance-sponsor-contract">
        {getSponsorBrand(sponsor.brandId).name} · até {sponsor.season} · {suspended ? 'SUSPENSO: APOSTAS PROIBIDAS' : `vitória +${formatMoney(sponsor.winBonus)} · empate +${formatMoney(sponsor.drawBonus)}`}
      </div>}
      <div className="ticket-control dos-double screen-green">
        <label>PREÇO DOS BILHETES <input aria-label="Preço dos bilhetes" type="number" min="5" max="100" value={price} onChange={(event) => setPrice(Number(event.target.value))} /></label>
        <button type="button" onClick={() => command((current) => setTicketPrice(current, price))}>[P] DEFINIR PREÇO</button>
        <span>PREÇO ALTO REDUZ A LOTAÇÃO</span>
      </div>
      <div className="ledger-table">
        <div className="ledger-row head"><span>JORN.</span><span>DESCRIÇÃO</span><span>VALOR</span></div>
        {ledger.length === 0 ? <div className="empty-ledger">AINDA NÃO EXISTEM MOVIMENTOS.</div> : ledger.map((entry) => (
          <div className="ledger-row" key={entry.id}><span>{entry.round}</span><span>{entry.description.slice(0, 42)}</span><span className={entry.amount < 0 ? 'negative' : 'positive'}>{formatMoney(entry.amount)}</span></div>
        ))}
      </div>
    </div>
  )
}

export function StadiumScreen({ state, command }: ScreenProps) {
  const club = getManagerClub(state)
  const stadium = club.stadium
  const repairCost = Math.round((100 - stadium.condition) * stadium.capacity * 0.75)
  return (
    <div className="stadium-screen screen-green dos-double">
      <div className="screen-heading">ESTÁDIO {stadium.name.toUpperCase()}</div>
      <div className="stadium-ascii" aria-hidden="true">
        <pre>{`     ┌────────────────────────────────────┐\n  ┌──┘████████████████████████████████████└──┐\n  │   ┌────────────────────────────────┐   │\n  │██ │                                │ ██│\n  │██ │          CAMPO DE JOGO         │ ██│\n  │██ │                                │ ██│\n  │   └────────────────────────────────┘   │\n  └──┐████████████████████████████████████┌──┘\n     └────────────────────────────────────┘`}</pre>
      </div>
      <div className="stadium-data dos-double screen-cyan">
        <div>CAPACIDADE <b>{stadium.capacity.toLocaleString('pt-BR')}</b></div>
        <div>CONDIÇÃO <b>{Math.round(stadium.condition)}%</b></div>
        <div>PREÇO BILHETE <b>{formatMoney(club.ticketPrice)}</b></div>
        <div>OBRAS <b>{stadium.expansionRounds > 0 ? `${stadium.expansionSeats.toLocaleString('pt-BR')} LUGARES · ${stadium.expansionRounds} JORN.` : 'NENHUMA'}</b></div>
      </div>
      <div className="stadium-supporters">
        SÓCIOS: {club.supporters.toLocaleString('pt-BR')}
        {club.lastSupporterChange !== undefined ? ` (${club.lastSupporterChange >= 0 ? '+' : ''}${club.lastSupporterChange.toLocaleString('pt-BR')} NO ÚLTIMO JOGO)` : ''}
      </div>
      <div className="stadium-actions">
        <button type="button" onClick={() => command(repairStadium)}>[R] REPARAR · {formatMoney(repairCost)}</button>
        <button type="button" onClick={() => command((current) => expandStadium(current, 1000))}>[1] +1.000 · {formatMoney(135_000)}</button>
        <button type="button" onClick={() => command((current) => expandStadium(current, 5000))}>[5] +5.000 · {formatMoney(675_000)}</button>
      </div>
    </div>
  )
}

export function CareerScreen({ state }: ScreenProps) {
  const club = getManagerClub(state)
  return (
    <div className="career-screen screen-blue dos-double">
      <div className="screen-heading">CARREIRA DE {state.manager.name.toUpperCase()}</div>
      <div className="career-card dos-double screen-cyan">
        <div>CLUBE ACTUAL <b>{club.name.toUpperCase()}</b></div>
        <div>REPUTAÇÃO <b>{Math.round(state.manager.reputation)} / 100</b></div>
        <div>CONFIANÇA DA DIRETORIA <b>{Math.round(state.manager.boardConfidence)}%</b></div>
        <div>TROFÉUS <b>{state.manager.trophies}</b></div>
        <div>PROMOÇÕES <b>{state.manager.promotions}</b></div>
      </div>
      <div className="career-history dos-double">
        <div className="panel-title">HISTÓRICO</div>
        {state.manager.history.length === 0 ? <div>PRIMEIRA TEMPORADA EM CURSO.</div> : state.manager.history.map((entry) => (
          <div className="history-row" key={`${entry.season}-${entry.clubId}`}><span>{entry.season}</span><span>{clubName(state, entry.clubId)}</span><span>{entry.division}ª DIV.</span><span>{entry.position}º</span><span>{entry.note}</span></div>
        ))}
      </div>
      <div className="career-objective screen-red dos-double">OBJECTIVO: TERMINAR ENTRE OS QUATRO PRIMEIROS · DÍVIDA GRAVE PODE CAUSAR CHICOTADA PSICOLÓGICA</div>
    </div>
  )
}

export function NewsScreen({ state }: ScreenProps) {
  const reports = state.lastReport?.transferMessages.map((message) => message.text) ?? []
  return (
    <div className="news-screen screen-blue dos-double">
      <div className="screen-heading">TELEX EMIFOOT · TEMPORADA {state.season}</div>
      <div className="telex-paper screen-gray">
        {[...reports, ...state.news].slice(0, 17).map((item, index) => <div key={`${index}-${item}`}><span>{String(index + 1).padStart(2, '0')}.</span> {item.toUpperCase()}</div>)}
      </div>
      <div className="telex-footer">*** FIM DA TRANSMISSÃO ***</div>
    </div>
  )
}
