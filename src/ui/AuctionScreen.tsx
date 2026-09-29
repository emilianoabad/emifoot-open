import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { useGameKeyboard } from './useGameKeyboard'
import {
  acknowledgeAuctionResult,
  acknowledgePlayerSale,
  formatMoney,
  getAuctionBidEligibilityError,
  getAuctionSeller,
  getManagerClub,
  getMarketPlayer,
  submitAuctionOffer,
  type EngineResult,
  type GameState,
  type TransferMessage,
} from '../game'

interface Props {
  state: GameState
  message: string
  command: (run: (state: GameState) => EngineResult) => void
  onNetworkOffer?: (salary?: number) => void
  playerSaleResult?: TransferMessage
  offerSubmitted?: boolean
}

export function AuctionScreen({ state, message, command, onNetworkOffer, playerSaleResult, offerSubmitted = false }: Props) {
  const listing = state.market[0]
  const listingSeller = listing ? getAuctionSeller(state, listing.sellerId) : undefined
  const listingPlayer = listing ? getMarketPlayer(state, listing) : undefined
  const displayedResult = playerSaleResult ?? state.auctionResult
  const auction = displayedResult?.auction
  const seller = auction ? getAuctionSeller(state, auction.sellerId) : listingSeller
  const playerName = auction?.playerName ?? listingPlayer?.name
  const nationality = auction?.nationality ?? listingPlayer?.nationality
  const position = auction?.position ?? listingPlayer?.position
  const strength = auction?.strength ?? listingPlayer?.strength
  const fee = auction?.fee ?? listing?.fee
  const minimumSalary = auction?.minimumSalary ?? listing?.minimumSalary
  const managerClub = getManagerClub(state)
  const bidEligibilityError = listing ? getAuctionBidEligibilityError(state, listing, managerClub.id) : undefined
  const resultClub = displayedResult?.clubId ? getAuctionSeller(state, displayedResult.clubId) : undefined
  const [offer, setOffer] = useState({ listingId: listing?.id, salary: '' })
  const inputRef = useRef<HTMLInputElement>(null)
  const salary = offer.listingId === listing?.id ? offer.salary : ''
  const clubStyle = (club: typeof seller): CSSProperties | undefined => club ? {
    color: club.secondary,
    backgroundColor: club.primary,
    borderColor: club.secondary,
  } : undefined

  useEffect(() => {
    if (displayedResult || !listing?.id) return
    const frame = window.requestAnimationFrame(() => {
      const active = document.activeElement
      if (active && active !== document.body && !inputRef.current?.closest('.original-auction')?.contains(active)) return
      inputRef.current?.focus()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [displayedResult, listing?.id])

  const acknowledge = useCallback(() => {
    if (playerSaleResult) command(acknowledgePlayerSale)
    else if (!onNetworkOffer) command(acknowledgeAuctionResult)
  }, [command, onNetworkOffer, playerSaleResult])

  useEffect(() => {
    if (!displayedResult || (onNetworkOffer && !playerSaleResult)) return
    const timeout = window.setTimeout(acknowledge, 2_000)
    return () => window.clearTimeout(timeout)
  }, [acknowledge, displayedResult, onNetworkOffer, playerSaleResult])

  useEffect(() => {
    if (displayedResult || !bidEligibilityError || offerSubmitted) return
    const timeout = window.setTimeout(() => {
      if (onNetworkOffer) onNetworkOffer()
      else command((current) => submitAuctionOffer(current))
    }, 1_000)
    return () => window.clearTimeout(timeout)
  }, [bidEligibilityError, command, displayedResult, offerSubmitted, onNetworkOffer])

  const keyboardRef = useGameKeyboard<HTMLElement>((key) => {
    if (displayedResult && key === 'Enter' && (!onNetworkOffer || playerSaleResult)) {
      acknowledge()
      return true
    }
    if (!displayedResult && !bidEligibilityError && !offerSubmitted && key === 'Escape') {
      if (onNetworkOffer) onNetworkOffer()
      else command((current) => submitAuctionOffer(current))
      return true
    }
  }, true)

  const submit = () => {
    const amount = salary.trim() ? Number(salary) : undefined
    if (onNetworkOffer) onNetworkOffer(amount)
    else command((current) => submitAuctionOffer(current, amount))
  }

  return (
    <section ref={keyboardRef} className="original-auction screen-blue">
      <div className="original-auction-title">{playerSaleResult ? 'VENDA DE JOGADOR' : 'VENDA PELA MELHOR OFERTA DE ORDENADO'}</div>
      <div className={`original-auction-detail ${displayedResult ? 'result-pending' : ''}`} style={clubStyle(seller)}>
        {seller && playerName && nationality && position && strength !== undefined && fee !== undefined && minimumSalary !== undefined && (
          <>
            <div>JOGADOR&nbsp;&nbsp; <span>{playerName}</span>&nbsp;&nbsp;&nbsp;&nbsp; {nationality === 'BRA' ? 'BRA' : nationality}</div>
            <div>POSIÇÃO&nbsp;&nbsp; <span>{position === 'G' ? 'Guarda-redes' : position === 'D' ? 'Defesa' : position === 'M' ? 'Médio' : 'Avançado'}</span></div>
            <div>FORÇA&nbsp;&nbsp;&nbsp;&nbsp; <span>{strength}</span></div>
            <div>EQUIPA&nbsp;&nbsp;&nbsp; <span>{seller.name.toUpperCase()}</span></div>
            <div>PREÇO&nbsp;&nbsp;&nbsp;&nbsp; <span>{fee}</span></div>
            {!playerSaleResult ? <div className="auction-minimum">ORDENADO MÍNIMO: {minimumSalary}</div> : null}
          </>
        )}
      </div>
      {displayedResult ? (
        <button type="button" className="auction-result" style={clubStyle(resultClub)} onClick={acknowledge}>
          {displayedResult.text.split('\n').map((line) => <span key={line}>{line}</span>)}
        </button>
      ) : bidEligibilityError ? (
        <div className="auction-prompt auction-prompt--blocked" role="status" style={clubStyle(managerClub)}>
          {bidEligibilityError.toUpperCase()}
        </div>
      ) : (
        <form className="auction-prompt" style={clubStyle(managerClub)} onSubmit={(event) => { event.preventDefault(); submit() }}>
          <label>{state.manager.name.toLowerCase()}:
            <input ref={inputRef} aria-label="Oferta de ordenado" aria-describedby="auction-cash" inputMode="numeric" min={minimumSalary} max={64_000} step={50} value={salary} onChange={(event) => setOffer({ listingId: listing?.id, salary: event.target.value.replace(/\D/g, '').slice(0, 5) })} />
          </label>
          <button type="submit" aria-label="Enviar oferta">_</button>
        </form>
      )}
      {!displayedResult ? <div id="auction-cash" className="auction-cash">DINHEIRO DISPONÍVEL: {formatMoney(managerClub.cash)}</div> : null}
      {!displayedResult && message && message !== 'COMANDO ACEITE.' ? <div className="auction-message">{message}</div> : null}
    </section>
  )
}
