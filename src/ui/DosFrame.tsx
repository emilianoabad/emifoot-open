import { useEffect, useState, type ReactNode } from 'react'

const WIDTH = 640
const HEIGHT = 400
const PORTRAIT_BREAKPOINT = 700

interface FrameLayout {
  mode: 'portrait' | 'scaled'
  scale: number
}

function currentLayout(width: number): FrameLayout {
  if (typeof window === 'undefined') return { mode: 'scaled', scale: 1 }
  const narrowPhone = window.innerWidth <= 520
  const portrait = window.innerWidth <= PORTRAIT_BREAKPOINT && (narrowPhone || window.innerHeight >= window.innerWidth)
  if (portrait) return { mode: 'portrait', scale: 1 }
  return {
    mode: 'scaled',
    scale: Math.max(0.35, Math.min(2, window.innerWidth / width, window.innerHeight / HEIGHT)),
  }
}

export function DosFrame({ children, width = WIDTH }: { children: ReactNode; width?: number }) {
  const [layout, setLayout] = useState(() => currentLayout(width))

  useEffect(() => {
    const resize = () => setLayout(currentLayout(width))
    window.addEventListener('resize', resize)
    window.visualViewport?.addEventListener('resize', resize)
    return () => {
      window.removeEventListener('resize', resize)
      window.visualViewport?.removeEventListener('resize', resize)
    }
  }, [width])

  const portrait = layout.mode === 'portrait'

  return (
    <main className={`dos-viewport dos-viewport--${layout.mode}`} data-layout={layout.mode} aria-label="Emifoot">
      <div className="dos-stage" style={portrait ? undefined : { width: width * layout.scale, height: HEIGHT * layout.scale }}>
        <div className="dos-screen" style={portrait ? undefined : { width, transform: `scale(${layout.scale})` }}>
          {children}
        </div>
      </div>
    </main>
  )
}
