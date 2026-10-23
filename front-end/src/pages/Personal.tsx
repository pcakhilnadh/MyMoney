import { useAuth } from '@/auth/AuthContext'
import { Button, Card, PageHeader, SectionTitle } from '@/components/kit'
import { useSync } from '@/sync/SyncProvider'

const STATE = {
  idle: { label: 'Up to date', dot: 'bg-positive' },
  syncing: { label: 'Syncing…', dot: 'bg-primary animate-pulse' },
  offline: { label: 'Offline', dot: 'bg-muted-foreground' },
  error: { label: 'Error', dot: 'bg-destructive' },
} as const

export default function Personal() {
  const { user, signOut } = useAuth()
  const sync = useSync()
  const st = STATE[sync.state]

  return (
    <div className="space-y-5">
      <PageHeader title="Personal" />

      <Card className="flex items-center gap-4">
        {user?.picture ? (
          <img
            src={user.picture}
            alt=""
            referrerPolicy="no-referrer"
            className="size-14 rounded-full ring-2 ring-primary/40"
          />
        ) : (
          <div className="gloss flex size-14 items-center justify-center rounded-full text-xl font-bold">
            {user?.name?.[0]}
          </div>
        )}
        <div className="min-w-0">
          <div className="truncate text-lg font-semibold">{user?.name}</div>
          <div className="truncate text-sm text-muted-foreground">{user?.email}</div>
        </div>
      </Card>

      <section className="space-y-2.5">
        <SectionTitle>Sync</SectionTitle>
        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 font-medium">
              <span className={`size-2 rounded-full ${st.dot}`} />
              <span data-testid="sync-state">{st.label}</span>
            </span>
            <Button variant="outline" size="sm" onClick={sync.syncNow}>
              Sync now
            </Button>
          </div>
          <div className="text-sm text-muted-foreground">
            {sync.pending} pending ·{' '}
            {sync.lastSyncedAt
              ? `last synced ${new Date(sync.lastSyncedAt).toLocaleTimeString()}`
              : 'never synced'}
          </div>
          {sync.error && <div className="text-sm text-destructive">{sync.error}</div>}
        </Card>
      </section>

      <Button variant="outline" className="w-full text-destructive" onClick={signOut}>
        Sign out
      </Button>
    </div>
  )
}
