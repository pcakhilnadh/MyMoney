import { useCallback, useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { ApiError, revokeAuthSession, type AuthSession } from '@/auth/api'
import { useAuth } from '@/auth/AuthContext'
import { Button, Card, PageHeader, SectionTitle } from '@/components/kit'
import { cachedAuthSessions, useSync } from '@/sync/SyncProvider'

const STATE = {
  idle: { label: 'Up to date', dot: 'bg-positive' },
  syncing: { label: 'Syncing…', dot: 'bg-primary animate-pulse' },
  offline: { label: 'Offline', dot: 'bg-muted-foreground' },
  error: { label: 'Error', dot: 'bg-destructive' },
} as const

export default function Personal() {
  const { user, token, signOut } = useAuth()
  const sync = useSync()
  const st = STATE[sync.state]
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

      <section className="space-y-2.5">
        <SectionTitle>Active sessions</SectionTitle>
        <Card className="space-y-3">
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

      <Button variant="outline" className="w-full text-destructive" onClick={signOut}>
        Sign out
      </Button>
    </div>
  )
}
