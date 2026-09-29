import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { DosFrame } from './DosFrame'

const originalWidth = window.innerWidth
const originalHeight = window.innerHeight

function resizeViewport(width: number, height: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height })
  act(() => window.dispatchEvent(new Event('resize')))
}

afterEach(() => {
  cleanup()
  resizeViewport(originalWidth, originalHeight)
})

describe('responsive DOS frame', () => {
  it('reflows narrow portrait screens instead of shrinking the canvas', () => {
    resizeViewport(390, 844)
    render(<DosFrame><div>EMIFOOT</div></DosFrame>)

    expect(screen.getByLabelText('Emifoot')).toHaveAttribute('data-layout', 'portrait')
    expect(screen.getByText('EMIFOOT').parentElement?.style.transform).toBe('')
  })

  it('keeps the original scaled canvas in phone landscape', () => {
    resizeViewport(844, 390)
    render(<DosFrame><div>EMIFOOT</div></DosFrame>)

    expect(screen.getByLabelText('Emifoot')).toHaveAttribute('data-layout', 'scaled')
    expect(screen.getByText('EMIFOOT').parentElement?.style.transform).toContain('scale(')
  })

  it('switches layouts when the device rotates', () => {
    resizeViewport(390, 844)
    render(<DosFrame><div>EMIFOOT</div></DosFrame>)
    resizeViewport(844, 390)

    expect(screen.getByLabelText('Emifoot')).toHaveAttribute('data-layout', 'scaled')
  })

  it('stays in mobile layout when a narrow phone keyboard reduces the height', () => {
    resizeViewport(390, 320)
    render(<DosFrame><div>EMIFOOT</div></DosFrame>)

    expect(screen.getByLabelText('Emifoot')).toHaveAttribute('data-layout', 'portrait')
  })
})
