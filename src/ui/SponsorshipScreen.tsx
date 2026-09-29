import { useEffect } from 'react'
import { acceptSponsorshipOffer, formatMoney, getAvailableSponsorshipProposal, getManagerClub, getSponsorBrand, type EngineResult, type GameState } from '../game'
import { useGameKeyboard } from './useGameKeyboard'

interface Props {
  state: GameState
  command: (run: (state: GameState) => EngineResult) => void
  onNetworkChoice?: (offerId: string) => void
}

export function SponsorshipScreen({ state, command, onNetworkChoice }: Props) {
  const club = getManagerClub(state)
  const proposal = getAvailableSponsorshipProposal(state, club.id)
  const signed = !state.sponsorship?.pendingClubIds.includes(club.id)
  const choose = (offerId: string) => {
    if (signed) return
    if (onNetworkChoice) onNetworkChoice(offerId)
    else command((current) => acceptSponsorshipOffer(current, offerId))
  }
  const keyboardRef = useGameKeyboard<HTMLElement>((key) => {
    const index = ['1', '2', '3'].indexOf(key)
    if (index >= 0 && proposal && !signed) { choose(proposal.offers[index].id); return true }
  })
  useEffect(() => {
    keyboardRef.current?.closest('.dos-viewport--portrait')?.scrollTo({ top: 0 })
  }, [keyboardRef])
  if (!proposal) return null
  return (
    <section ref={keyboardRef} className="sponsorship-screen screen-blue dos-double" aria-label="Propostas de patrocínio">
      <div className="sponsorship-title screen-red dos-double">PROPOSTAS DE PATROCINADOR MASTER PARA A TEMPORADA {proposal.season}</div>
      <div className="sponsorship-offers">
        {proposal.offers.map((offer) => {
          const brand = getSponsorBrand(offer.brandId)
          return (
            <article key={offer.id} className={`sponsor-offer dos-double ${offer.kind === 'betting' ? 'screen-red' : offer.kind === 'performance' ? 'screen-green' : 'screen-cyan'}`}>
              <div className="sponsor-brand">{brand.name}</div>
              <div className="sponsor-description">{brand.description}</div>
              <dl className="sponsor-terms">
                <div><dt>FIXO / JORNADA</dt><dd>{formatMoney(offer.basePerRound)}</dd></div>
                <div><dt>POR VITÓRIA</dt><dd>+{formatMoney(offer.winBonus)}</dd></div>
                <div><dt>POR EMPATE</dt><dd>+{formatMoney(offer.drawBonus)}</dd></div>
              </dl>
              <button type="button" className="sponsor-sign dos-button" aria-label={`Assinar com ${brand.name}`} disabled={signed} onClick={() => choose(offer.id)}>
                {signed && club.sponsorship?.id === offer.id ? 'ASSINADO' : 'ASSINAR'}
              </button>
            </article>
          )
        })}
      </div>
    </section>
  )
}
