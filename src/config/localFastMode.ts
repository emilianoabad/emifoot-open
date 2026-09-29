interface BrowserModeEnvironment {
  DEV: boolean
  MODE: string
  VITE_LOCAL_FAST_MODE?: string
}

export function isLocalFastMode(environment: BrowserModeEnvironment): boolean {
  return environment.DEV
    && environment.MODE === 'development'
    && environment.VITE_LOCAL_FAST_MODE === 'true'
}

const LOCAL_FAST_MODE = isLocalFastMode(import.meta.env)

export interface MatchPacing {
  minuteIntervalMs: number
  minuteStep: number
  phaseEndDelayMs: number
}

export function getMatchPacing(fastMode = LOCAL_FAST_MODE): MatchPacing {
  return fastMode
    ? { minuteIntervalMs: 90, minuteStep: 5, phaseEndDelayMs: 100 }
    : { minuteIntervalMs: 400, minuteStep: 1, phaseEndDelayMs: 700 }
}
