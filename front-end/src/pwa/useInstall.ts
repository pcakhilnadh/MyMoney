import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/**
 * How the app can be installed in this browser.
 * - `prompt`: Chromium browsers fire `beforeinstallprompt`; we show our own Install button.
 * - `ios`: every iOS/iPadOS browser installs only through Share → Add to Home Screen.
 * - `safari-mac`: Safari 17+ on macOS installs through File → Add to Dock.
 * - `firefox-android`: Firefox for Android installs from its menu.
 * - `null`: nothing we can offer (e.g. Firefox desktop, which does not install web apps).
 */
export type InstallMethod = 'prompt' | 'ios' | 'safari-mac' | 'firefox-android' | null

const DISMISS_KEY = 'mytracker.install-dismissed-at'
const DISMISS_DAYS = 14

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as unknown as { standalone?: boolean }).standalone === true

function manualMethod(): InstallMethod {
  const ua = navigator.userAgent
  // iPadOS reports itself as a Mac; touch support gives it away.
  const ios = /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)
  if (ios) return 'ios'
  if (/android/i.test(ua) && /firefox/i.test(ua)) return 'firefox-android'
  const safari = /safari/i.test(ua) && !/chrome|chromium|crios|edg|opr|firefox|fxios|android/i.test(ua)
  if (safari && /macintosh/i.test(ua)) return 'safari-mac'
  return null
}

function recentlyDismissed() {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY))
    return at > 0 && Date.now() - at < DISMISS_DAYS * 86_400_000
  } catch {
    return false
  }
}

/** Install state for the PWA: native prompt where available, manual steps elsewhere. */
export function useInstall() {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(isStandalone)
  const [dismissed, setDismissed] = useState(recentlyDismissed)

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setEvent(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setInstalled(true)
      setEvent(null)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const method: InstallMethod = installed ? null : event ? 'prompt' : manualMethod()

  return {
    installed,
    method,
    canPrompt: !!event,
    dismissed,
    dismiss: () => {
      setDismissed(true)
      try {
        localStorage.setItem(DISMISS_KEY, String(Date.now()))
      } catch {
        // Only hidden for this visit.
      }
    },
    install: async () => {
      if (!event) return
      await event.prompt()
      const choice = await event.userChoice
      setEvent(null)
      if (choice.outcome === 'accepted') setInstalled(true)
    },
  }
}
