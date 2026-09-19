import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Medium #14 -- shared focus trap + Escape-to-close + focus-restore behavior for the dialog-role overlays
 * (completion modal, archive viewer) that previously had none: keyboard users could tab straight past the
 * modal into the page behind it, Escape did nothing, and closing never returned focus to whatever opened it.
 *
 * Not meaningfully unit-testable (jsdom doesn't run real browser focus/tab-order), so this is verified by
 * manual keyboard testing instead of a test file -- see the item's commit message for what was checked.
 */
export function useModalA11y(open: boolean, onClose: () => void): RefObject<HTMLElement | null> {
  const containerRef = useRef<HTMLElement | null>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    previouslyFocused.current = document.activeElement as HTMLElement | null
    const container = containerRef.current
    const focusable = container?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
    ;(focusable?.[0] ?? container)?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return }
      if (event.key !== 'Tab' || !container) return
      const items = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      if (items.length === 0) return
      const first = items[0], last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previouslyFocused.current?.focus()
    }
  }, [open, onClose])

  return containerRef
}
