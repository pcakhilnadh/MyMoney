import { Link } from 'react-router-dom'
import { ChevronRight, CreditCard, PiggyBank, Tags } from 'lucide-react'
import { useAuth } from '@/auth/AuthContext'
import { Button, Card, PageHeader, SectionTitle } from '@/components/kit'
import { useInstall } from '@/pwa/useInstall'
import { useSync } from '@/sync/SyncProvider'

const STATE = {
  idle: { label: 'Up to date', dot: 'bg-positive' },
  syncing: { label: 'Syncing…', dot: 'bg-primary animate-pulse' },
  offline: { label: 'Offline', dot: 'bg-muted-foreground' },
  error: { label: 'Error', dot: 'bg-destructive' },
} as const

const MENU = [
  { to: '/settings/accounts', label: 'Accounts and payment methods', Icon: CreditCard },
  { to: '/settings/categories', label: 'Categories', Icon: Tags },
  { to: '/budgets', label: 'Budgets', Icon: PiggyBank },
]

export default function Settings() {
  const { user, signOut } = useAuth()
  const sync = useSync()
  const install = useInstall()
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
        <SectionTitle>Manage</SectionTitle>
        {MENU.map(({ to, label, Icon }) => (
          <Link
            key={to}
            to={to}
            className="surface flex items-center gap-3 rounded-2xl px-4 py-3.5 font-medium"
          >
            <span className="flex size-9 items-center justify-center rounded-xl bg-secondary text-primary">
              <Icon size={18} />
            </span>
            <span className="flex-1">{label}</span>
            <ChevronRight size={18} className="text-muted-foreground" />
          </Link>
        ))}
      </section>

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

      {!install.installed && (install.canPrompt || install.showIosHint) && (
        <section className="space-y-2.5">
          <SectionTitle>Install</SectionTitle>
          <Card className="space-y-3">
            {install.canPrompt ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Add MyMoney to your home screen. It works offline.
                </p>
                <Button onClick={install.install}>Install app</Button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Tap the Share button in Safari, then “Add to Home Screen”.
              </p>
            )}
          </Card>
        </section>
      )}

      <Button variant="outline" className="w-full text-destructive" onClick={signOut}>
        Sign out
      </Button>
    </div>
  )
}
