import { RefreshCw } from 'lucide-react'
import { useAuth } from '@/auth/AuthContext'
import { Button } from '@/components/kit'
import { useSync } from './SyncProvider'

/** Shown on the profile when many changes are waiting to sync. */
export function PendingChangesBanner() {
  const { token } = useAuth()
  const sync = useSync()
  if (sync.pending <= 10) return null
  const isOffline = sync.state === 'offline' || !navigator.onLine
  const syncMessage =
    sync.state === 'syncing'
      ? `Syncing your ${sync.pending} pending changes.`
      : !token && !isOffline
        ? `${sync.pending} changes are waiting. Preparing your session to sync.`
        : isOffline
          ? `${sync.pending} changes are waiting. Reconnect to sync your data.`
          : sync.state === 'error'
            ? `${sync.pending} changes are waiting. Sync failed; tap to retry.`
            : `You have ${sync.pending} changes waiting. Sync now to back them up.`

  return (
    <aside
      role="status"
      aria-live="polite"
      className="flex items-center justify-between gap-3 rounded-xl border border-primary/25 bg-primary/10 px-4 py-3"
    >
      <div className="flex min-w-0 items-start gap-2.5">
        <RefreshCw
          size={17}
          className={`mt-0.5 shrink-0 text-primary ${sync.state === 'syncing' ? 'animate-spin' : ''}`}
          aria-hidden="true"
        />
        <div className="min-w-0">
          <p className="text-sm font-semibold">Sync your data</p>
          <p className="text-xs text-muted-foreground">{syncMessage}</p>
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        className="shrink-0"
        onClick={() => void sync.syncNow()}
        disabled={sync.state === 'syncing' || isOffline || !token}
      >
        {sync.state === 'syncing'
          ? 'Syncing…'
          : isOffline
            ? 'Offline'
            : !token
              ? 'Waiting…'
              : 'Sync now'}
      </Button>
    </aside>
  )
}
