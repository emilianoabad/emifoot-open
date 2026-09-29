import { useGameKeyboard } from './useGameKeyboard'
import {
  acceptJobOffer,
  getClub,
  getManagerClub,
  startNextSeason,
  type EngineResult,
  type GameState,
} from '../game'
import { SeasonAwardsPanel } from './SeasonAwardsPanel'

interface SeasonEndScreenProps {
  state: GameState
  command: (run: (state: GameState) => EngineResult) => void
  message: string
}

export function SeasonEndScreen({ state, command, message }: SeasonEndScreenProps) {
  const keyboardRef = useGameKeyboard<HTMLElement>((key) => {
    if (key === 'Enter' && !state.manager.dismissed) { command(startNextSeason); return true }
  })
  const award = state.awards.at(-1)
  const club = getManagerClub(state)
  return (
    <section ref={keyboardRef} className="season-end screen-blue dos-double">
      <div className="season-banner screen-red dos-double">FIM DA TEMPORADA {state.season}</div>
      {award && (
        <SeasonAwardsPanel state={state}>
          <div className="season-manager-status">
            <div>{club.name.toUpperCase()} <b>{award.managerPosition}º LUGAR</b></div>
            <div>REPUTAÇÃO <b>{Math.round(state.manager.reputation)}</b></div>
            <div>DIRETORIA <b>{state.manager.dismissed ? 'DEMITIDO' : 'CONTRATO MANTIDO'}</b></div>
          </div>
        </SeasonAwardsPanel>
      )}
      <div className="job-offers dos-double">
        <div className="panel-title">PROPOSTAS DE EMPREGO</div>
        {state.manager.offers.map((offer) => (
          <button type="button" key={offer.clubId} onClick={() => command((current) => acceptJobOffer(current, offer.clubId))}>
            <span>{getClub(state, offer.clubId).name.toUpperCase()}</span>
            <span>{offer.objective}</span>
            <span>ORD. {offer.wage.toLocaleString('pt-BR')}</span>
            <span>[ACEITAR]</span>
          </button>
        ))}
      </div>
      <div className="season-actions">
        <span>{message || (state.manager.dismissed ? 'ESCOLHA UM NOVO CLUBE.' : 'PODE CONTINUAR OU ACEITAR UMA PROPOSTA.')}</span>
        <button type="button" className="dos-button action-yellow" disabled={state.manager.dismissed} onClick={() => command(startNextSeason)}>[ ENTER ] TEMPORADA {state.season + 1}</button>
      </div>
    </section>
  )
}
