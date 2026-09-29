import { useState } from 'react'
import './App.css'
import { MultiplayerExperience } from './multiplayer/MultiplayerExperience'
import { AuctionScreen } from './ui/AuctionScreen'
import { AcademyScreen } from './ui/AcademyScreen'
import { CupDrawScreen } from './ui/CupDrawScreen'
import { CompetitionResultsScreen } from './ui/CompetitionResultsScreen'
import { DosFrame } from './ui/DosFrame'
import { GameShell } from './ui/GameShell'
import { HalfTimeScreen } from './ui/HalfTimeScreen'
import { InjuryScreen } from './ui/InjuryScreen'
import { ManagerRegistrationScreen } from './ui/ManagerRegistrationScreen'
import { MatchdayScreen } from './ui/MatchdayScreen'
import { RetirementNoticeScreen } from './ui/RetirementNoticeScreen'
import { SeasonEndScreen } from './ui/SeasonEndScreen'
import { SponsorshipScreen } from './ui/SponsorshipScreen'
import { SponsorshipNoticeScreen } from './ui/SponsorshipNoticeScreen'
import { StandingsScreen } from './ui/StandingsScreen'
import { StartScreen } from './ui/StartScreen'
import { useGame } from './ui/useGame'

function App() {
  const controller = useGame()
  const { game } = controller
  const playerSaleResult = game?.playerSaleResults?.[game.manager.clubId]
  const showInjuryNotice = Boolean(game?.injuryNoticePending && (game.phase === 'standings' || game.phase === 'competition-results'))
  const [mode, setMode] = useState<'single' | 'private' | 'open' | 'resume'>(() => new URLSearchParams(window.location.search).has('room') ? 'private' : 'single')
  const [resumeCode, setResumeCode] = useState<string>()

  if (mode !== 'single') {
    return (
      <DosFrame key="multiplayer" width={900}>
        <MultiplayerExperience entryMode={mode} resumeCode={resumeCode} onExit={() => { setResumeCode(undefined); setMode('single') }} />
      </DosFrame>
    )
  }

  return (
    <DosFrame key="single-player">
      {controller.storageError && <div role="alert" className="storage-warning">{controller.storageError}</div>}
      {!game && (
        <StartScreen
          saves={controller.saves}
          message={controller.message}
          onCreate={controller.createCareer}
          onLoad={(slot) => void controller.load(slot)}
          onMultiplayer={(nextMode) => setMode(nextMode)}
          onResumeLeague={(code) => { setResumeCode(code); setMode('resume') }}
        />
      )}
      {game && (playerSaleResult ? (
        <AuctionScreen state={game} command={controller.command} message={controller.message} playerSaleResult={playerSaleResult} />
      ) : showInjuryNotice ? (
        <InjuryScreen state={game} command={controller.command} />
      ) : (
        <>
          {game.phase === 'manager-registration' && <ManagerRegistrationScreen state={game} command={controller.command} />}
          {game.phase === 'cup-draw' && <CupDrawScreen state={game} command={controller.command} />}
          {game.phase === 'auction' && <AuctionScreen state={game} command={controller.command} message={controller.message} />}
          {(game.phase === 'first-half' || game.phase === 'second-half') && <MatchdayScreen state={game} command={controller.command} />}
          {game.phase === 'half-time' && <HalfTimeScreen state={game} command={controller.command} message={controller.message} />}
          {game.phase === 'standings' && <StandingsScreen state={game} command={controller.command} />}
          {game.phase === 'sponsorship-notice' && <SponsorshipNoticeScreen state={game} command={controller.command} />}
          {game.phase === 'competition-results' && <CompetitionResultsScreen state={game} command={controller.command} />}
          {game.phase === 'season-end' && <SeasonEndScreen state={game} command={controller.command} message={controller.message} />}
          {game.phase === 'sponsorship' && <SponsorshipScreen state={game} command={controller.command} />}
          {game.phase === 'retirement-notice' && <RetirementNoticeScreen state={game} command={controller.command} />}
          {game.phase === 'academy' && <AcademyScreen key={`${game.season}-${game.manager.clubId}`} state={game} command={controller.command} message={controller.message} />}
          {game.phase === 'pre-round' && (
            <GameShell
              state={game}
              command={controller.command}
              message={controller.message}
              onExit={controller.exitToTitle}
            />
          )}
        </>
      ))}
    </DosFrame>
  )
}

export default App
