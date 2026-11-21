import { useLocation, useNavigate } from 'react-router-dom'
import { routeLabel } from './labels'
import { previousPath } from './memory'

/**
 * Where "back" goes from here: the screen you came from in this tab, or `fallback` when
 * this screen was opened directly (a shared link, a new tab).
 */
export function useBack(fallback: string) {
  const navigate = useNavigate()
  useLocation() // a new screen means a new answer
  const previous = previousPath()
  const to = previous ?? fallback
  return {
    to,
    label: routeLabel(to),
    /** Go back. The screen you return to puts you on the item you opened. */
    go: () => {
      if (previous) navigate(-1)
      else navigate(fallback, { replace: true, state: { restore: true } })
    },
  }
}
