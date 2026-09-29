import { useEffect, useRef } from 'react'

/** Screen shortcuts must not consume chat, native controls, or a paused game. */
export function useGameKeyboard<T extends HTMLElement>(
  handleKey: (key: string) => boolean | void,
  escapeInInput = false,
) {
  const ref = useRef<T>(null)
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const root = ref.current
      const target = event.target instanceof Element ? event.target : undefined
      if (!root || root.closest('[inert]') || event.defaultPrevented || event.repeat || event.isComposing
        || event.ctrlKey || event.metaKey || event.altKey) return
      if (target && target !== document.body && !root.contains(target)) return
      if (target?.closest('input, select, textarea, [contenteditable]:not([contenteditable="false"])')
        && !(escapeInInput && event.key === 'Escape')) return
      // Enter already activates the focused control. Running a shortcut as well
      // can dispatch twice or activate a different action than the focused one.
      if (event.key === 'Enter' && target?.closest('button, a, summary')) return
      if (handleKey(event.key)) event.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleKey, escapeInInput])
  return ref
}
