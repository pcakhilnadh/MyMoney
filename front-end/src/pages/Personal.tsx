import { useCallback, useEffect, useState } from 'react'
import { Heart, RefreshCw, Utensils, WalletCards, X } from 'lucide-react'
import { ApiError, revokeAuthSession, type AuthSession } from '@/auth/api'
import { useAuth } from '@/auth/AuthContext'
import { Button, Card, SectionTitle } from '@/components/kit'
import { cachedAuthSessions, useSync } from '@/sync/SyncProvider'

const STATE = {
  idle: { label: 'Up to date', dot: 'bg-muted-foreground' },
  syncing: { label: 'Syncing…', dot: 'bg-primary animate-pulse' },
  offline: { label: 'Offline', dot: 'bg-muted-foreground' },
  error: { label: 'Error', dot: 'bg-destructive' },
} as const

const greeting = () => {
  const hour = new Date().getHours()
  if (hour < 12) return { text: 'Good morning', emoji: '🌅' }
  if (hour < 17) return { text: 'Good afternoon', emoji: '☀️' }
  return { text: 'Good evening', emoji: '🌙' }
}

export default function Personal() {
  const { user, token, signOut } = useAuth()
  const sync = useSync()
  const st = STATE[sync.state]
  const welcome = greeting()
  const firstName = user?.name?.trim().split(/\s+/)[0]
  const syncNeedsAttention =
    sync.state !== 'idle' || sync.pending > 0 || !sync.lastSyncedAt
  const syncLabel =
    sync.state === 'idle' && sync.pending > 0
      ? 'Changes waiting'
      : sync.state === 'idle' && !sync.lastSyncedAt
        ? 'Not synced'
        : st.label
  const [sessions, setSessions] = useState<AuthSession[]>([])
  const [sessionsError, setSessionsError] = useState<string | null>(null)
  const [revokingId, setRevokingId] = useState<string | null>(null)

  const loadSessions = useCallback(async (sub?: string) => {
    if (!token) return
    try {
      if (sub) setSessions(cachedAuthSessions(sub))
      setSessionsError(null)
    } catch (error) {
      console.error('Unable to load active sessions', error)
      setSessionsError('Unable to load sessions. Please try again.')
    }
  }, [token])

  useEffect(() => {
    if (!token || !user?.sub) return
    try {
      setSessions(cachedAuthSessions(user.sub))
    } catch (error) {
      console.error('Unable to read cached active sessions', error)
      setSessionsError('Unable to load saved sessions.')
    }
  }, [token, user?.sub])

  async function endSession(session: AuthSession) {
    const description = [session.device, session.browser, session.location]
      .filter(Boolean)
      .join(' · ')
    const label = description || 'Unknown device or browser'
    if (!window.confirm(`End this session${session.is_current ? ' (this device)' : ''}? ${label}`)) {
      return
    }
    if (!token) return
    setRevokingId(session.id)
    try {
      if (session.is_current) {
        await signOut()
        return
      }
      await revokeAuthSession(token, session.id)
      await loadSessions(user?.sub)
    } catch (error) {
      console.error('Unable to end session', error)
      window.alert(
        error instanceof ApiError && error.status === 404
          ? 'That session is already ended.'
          : 'Unable to end this session. Please try again.',
      )
      await loadSessions(user?.sub)
    } finally {
      setRevokingId(null)
    }
  }

  return (
    <div className="space-y-5 pb-28">
      <section className="cyber-greeting">
        <div className="cyber-greeting__grid" aria-hidden="true" />
        <div className="cyber-greeting__scan" aria-hidden="true" />
        <div className="relative min-w-0">
          <p className="cyber-greeting__eyebrow">
            <span className="cyber-greeting__pulse" aria-hidden="true" />
            {welcome.text}
            <span
              data-testid="personal-greeting-emoji"
              aria-hidden="true"
              className="cyber-greeting__emoji"
            >
              {welcome.emoji}
            </span>
          </p>
          <h1 className="cyber-greeting__name">
            {firstName ? `${firstName}!` : 'Welcome back!'}
          </h1>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-white/70">
            Your personal hub to track <span className="personal-theme-money">money</span>,{' '}
            <span className="personal-theme-food">food</span>, and{' '}
            <span className="personal-theme-habit">habits</span> — all in one place.
          </p>
          <div className="mt-4 flex flex-wrap gap-2" role="list" aria-label="Things you can track">
            <span className="cyber-feature" role="listitem">
              <WalletCards size={14} aria-hidden="true" /> Money
            </span>
            <span className="cyber-feature" role="listitem">
              <Utensils size={14} aria-hidden="true" /> Food
            </span>
            <span className="cyber-feature" role="listitem">
              <Heart size={14} aria-hidden="true" /> Habits
            </span>
          </div>
        </div>
      </section>

      <section className="space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <SectionTitle>Sync status</SectionTitle>
          <span
            data-testid="sync-state"
            aria-live="polite"
            className={`cyber-status cyber-status--${sync.state}`}
          >
            <span className={`size-1.5 rounded-full ${st.dot}`} />
            {syncLabel}
          </span>
        </div>
        <Card className="cyber-panel space-y-4">
          <div className="flex items-start gap-3">
            <span className={`cyber-sync-icon ${sync.state === 'syncing' ? 'is-syncing' : ''}`}>
              <RefreshCw size={18} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold">
                {sync.state === 'syncing'
                  ? 'Syncing your data'
                  : sync.state === 'offline'
                    ? 'You’re offline'
                    : sync.state === 'error'
                      ? 'Sync needs attention'
                      : sync.pending > 0
                        ? 'Changes waiting to sync'
                        : !sync.lastSyncedAt
                          ? 'Sync your data'
                          : 'Everything is up to date'}
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {sync.state === 'syncing'
                  ? 'Your latest updates are being synced across your devices.'
                  : sync.state === 'offline'
                    ? 'Reconnect to sync your latest updates across devices.'
                    : sync.state === 'error'
                      ? 'We couldn’t sync your latest updates. Try again when you’re ready.'
                      : sync.pending > 0 || !sync.lastSyncedAt
                        ? 'Sync now to back up your latest changes.'
                        : 'Your money, food, and habit data is backed up.'}
              </p>
            </div>
          </div>
          <div className="cyber-sync-details">
            <span>{sync.pending} pending</span>
            <span className="cyber-sync-details__divider" aria-hidden="true" />
            <span>
              {sync.lastSyncedAt
                ? `Last synced ${new Date(sync.lastSyncedAt).toLocaleString()}`
                : 'Not synced yet'}
            </span>
          </div>
          {sync.error && <div className="text-sm text-destructive">{sync.error}</div>}
          <Button
            variant="outline"
            className="cyber-sync-button w-full"
            onClick={() => void sync.syncNow()}
            disabled={sync.state === 'syncing' || sync.state === 'offline'}
          >
            <RefreshCw
              size={15}
              className={sync.state === 'syncing' ? 'animate-spin' : ''}
              aria-hidden="true"
            />
            {sync.state === 'syncing' ? 'Syncing…' : syncNeedsAttention ? 'Sync now' : 'Sync again'}
          </Button>
        </Card>
      </section>

      <section className="space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <SectionTitle>Active sessions</SectionTitle>
          <span className="cyber-session-count">{sessions.length}</span>
        </div>
        <Card className="cyber-panel space-y-3">
          {sessionsError && <p className="text-sm text-destructive">{sessionsError}</p>}
          {!sessionsError && sessions.length === 0 && (
            <p className="text-sm text-muted-foreground">No active sessions found.</p>
          )}
          {sessions.map((session) => {
            const details = [
              session.device,
              session.browser,
              session.location,
            ].filter(Boolean)
            return (
              <div
                key={session.id}
                className="flex items-start justify-between gap-3 border-b border-border/60 pb-3 last:border-0 last:pb-0"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 font-medium">
                    {details.length ? details.join(' · ') : 'Unknown device or browser'}
                    {session.is_current && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                        Current session
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Signed in {new Date(session.created_at * 1000).toLocaleString()}
                    {' · '}Last active {new Date(session.last_used_at * 1000).toLocaleString()}
                  </div>
                </div>
                <button
                  type="button"
                  aria-label={`End session: ${details.join(' ') || 'unknown device'}`}
                  title="End session"
                  disabled={revokingId === session.id}
                  onClick={() => void endSession(session)}
                  className="shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-muted/50 hover:text-destructive disabled:opacity-50"
                >
                  <X className="size-4" />
                </button>
              </div>
            )
          })}
          {sessionsError && (
            <Button variant="outline" size="sm" onClick={() => void loadSessions()}>
              Retry
            </Button>
          )}
        </Card>
      </section>

      <div className="personal-fixed-action">
        <Button
          variant="outline"
          className="cyber-signout w-full"
          onClick={() => void signOut()}
        >
          Sign out
        </Button>
      </div>
    </div>
  )
}
