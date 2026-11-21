import { useEffect, useState } from 'react'
import { BUILD, fetchServerVersion, matchVersions, type ServerVersion } from '@/lib/version'

/** Get the deployed build: fetch a fresh service worker, then reload onto it. */
async function reloadToUpdate() {
  try {
    const registration = await navigator.serviceWorker?.getRegistration()
    await registration?.update()
  } catch {
    // A plain reload still picks up whatever is already waiting.
  }
  window.location.reload()
}

function builtOn(iso: string | null) {
  if (!iso) return null
  const date = new Date(iso)
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

/** One quiet line with this build. Only a newer deploy adds anything to it. */
export function AppVersion() {
  const [server, setServer] = useState<ServerVersion | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetchServerVersion(controller.signal)
      .then(setServer)
      .catch((error: unknown) => {
        if (!controller.signal.aborted) console.error('Unable to check the server version', error)
      })
    return () => controller.abort()
  }, [])

  const match = server ? matchVersions(BUILD, server) : null
  const built = builtOn(BUILD.builtAt)
  const details = [built && `built ${built}`, BUILD.commit].filter(Boolean).join(' · ')

  return (
    <p className="flex flex-wrap items-center justify-center gap-x-2 px-1 text-[11px] text-muted-foreground/80">
      <span data-testid="app-version">
        v{BUILD.version}
        {details && ` · ${details}`}
      </span>
      {server && (match === 'update' || match === 'unsupported') && (
        <>
          <span data-testid="server-version">Server v{server.version}</span>
          <button
            type="button"
            onClick={() => void reloadToUpdate()}
            className="font-semibold text-primary underline-offset-2 hover:underline"
          >
            Reload to update
          </button>
        </>
      )}
    </p>
  )
}
