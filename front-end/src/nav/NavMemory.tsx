import { useEffect, useLayoutEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'
import { rememberEntry, saveSpot, spotFor, type Spot } from './memory'

/*
 * Remembers where you were on every screen, and puts you back there when you return.
 *
 * Leaving a screen saves how far down it was and which row, card or link you tapped. Coming
 * back to it (a back button, the browser's back, or a reload) scrolls that item to the same
 * place on screen, focuses it and briefly highlights it. Lists mark their items with
 * `data-return-id`; links are found by their address without any marking.
 *
 * Mount once, inside the router.
 */

/** App chrome (nav bars, sheets): taps there say nothing about where you were in the page. */
const CHROME = 'nav, header, [role="dialog"], [data-no-return]'
const WAIT_MS = 2000
const SETTLE_MS = 600
const FLASH_MS = 1600

type Target = Pick<Spot, 'anchor' | 'href' | 'top'>

function findTarget(spot: Spot): HTMLElement | null {
  if (spot.anchor)
    return document.querySelector<HTMLElement>(`[data-return-id="${CSS.escape(spot.anchor)}"]`)
  if (spot.href)
    for (const link of document.querySelectorAll<HTMLElement>(`a[href="${CSS.escape(spot.href)}"]`))
      if (!link.closest(CHROME)) return link
  return null
}

function land(item: HTMLElement) {
  if (item.matches('a[href], button, [tabindex]')) item.focus({ preventScroll: true })
  item.setAttribute('data-returned', '')
  window.setTimeout(() => item.removeAttribute('data-returned'), FLASH_MS)
}

/** Scroll back to a saved spot once the screen has drawn it. Returns a cancel function. */
function restore(spot: Spot): () => void {
  let done = false
  let frame = 0
  let found: HTMLElement | null = null
  let foundAt = 0
  const started = performance.now()
  const events = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const

  const stop = () => {
    done = true
    cancelAnimationFrame(frame)
    events.forEach((name) => window.removeEventListener(name, stop))
  }
  // Scrolling or tapping takes over straight away.
  events.forEach((name) => window.addEventListener(name, stop, { passive: true }))

  const place = (item: HTMLElement) => {
    const drift = item.getBoundingClientRect().top - (spot.top ?? window.innerHeight / 3)
    if (Math.abs(drift) > 1) window.scrollBy(0, drift)
  }

  const tick = () => {
    if (done) return
    const now = performance.now()
    if (!found) {
      const item = findTarget(spot)
      const tallEnough = document.documentElement.scrollHeight - window.innerHeight >= spot.y - 1
      if (item) {
        found = item
        foundAt = now
        place(item)
        land(item)
      } else if ((!spot.anchor && !spot.href && tallEnough) || now - started > WAIT_MS) {
        // Nothing to aim for (or it's gone): the same scroll position will do.
        window.scrollTo(0, spot.y)
        return stop()
      }
    } else {
      // Keep it in place while the rest of the screen finishes loading around it.
      if (!found.isConnected || now - foundAt > SETTLE_MS) return stop()
      place(found)
    }
    frame = requestAnimationFrame(tick)
  }
  tick()
  return stop
}

export function NavMemory() {
  const location = useLocation()
  const navigationType = useNavigationType()
  const path = location.pathname + location.search
  const current = useRef<{ key: string; path: string; pathname: string } | null>(null)
  const lastY = useRef(0)
  const tapped = useRef<{ key: string; target: Target } | null>(null)

  useEffect(() => {
    window.history.scrollRestoration = 'manual'
    lastY.current = window.scrollY
    const onScroll = () => {
      lastY.current = window.scrollY
    }
    const onTap = (event: MouseEvent) => {
      const here = current.current
      const element = event.target instanceof Element ? event.target : null
      if (!here || !element) return
      const inChrome = element.closest(CHROME) !== null
      const item = inChrome ? null : element.closest<HTMLElement>('[data-return-id]')
      const link = inChrome || item ? null : element.closest<HTMLAnchorElement>('a[href]')
      const picked = item ?? link
      tapped.current = {
        key: here.key,
        target: {
          anchor: item?.dataset.returnId,
          href: link?.getAttribute('href') ?? undefined,
          top: picked?.getBoundingClientRect().top,
        },
      }
    }
    // A reload comes back to the same spot too.
    const onLeave = () => {
      const here = current.current
      if (!here) return
      saveSpot(here.key, {
        path: here.path,
        y: window.scrollY,
        ...(tapped.current?.key === here.key ? tapped.current.target : {}),
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    document.addEventListener('click', onTap, true)
    window.addEventListener('pagehide', onLeave)
    return () => {
      window.removeEventListener('scroll', onScroll)
      document.removeEventListener('click', onTap, true)
      window.removeEventListener('pagehide', onLeave)
    }
  }, [])

  useLayoutEffect(() => {
    const previous = current.current
    if (previous && previous.key !== location.key) {
      // The screen just left: where it was scrolled to (read before the new screen could
      // move it) and what was tapped on it.
      saveSpot(previous.key, {
        path: previous.path,
        y: lastY.current,
        ...(tapped.current?.key === previous.key ? tapped.current.target : {}),
      })
    }
    tapped.current = null
    current.current = { key: location.key, path, pathname: location.pathname }
    rememberEntry(path, navigationType === 'PUSH')

    const state = location.state as Record<string, unknown> | null
    const returning =
      navigationType === 'POP' ||
      (typeof state === 'object' && state !== null && 'restore' in state)
    const spot = returning ? spotFor(location.key, path) : null
    if (spot) return restore(spot)
    // A new screen starts at the top.
    if (previous && previous.pathname !== location.pathname) window.scrollTo(0, 0)
    // Only a change of entry matters here; `path` and state belong to it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key])

  return null
}
