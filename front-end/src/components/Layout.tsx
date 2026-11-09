import { Fragment, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  BookOpen,
  CalendarCheck,
  ChartNoAxesColumnIncreasing,
  Heart,
  House,
  Plus,
  Receipt,
  RefreshCw,
  Settings as SettingsIcon,
  Utensils,
  User,
  Users,
  WalletCards,
} from 'lucide-react'
import { useAuth } from '@/auth/AuthContext'
import { Button } from '@/components/kit'
import { useSync } from '@/sync/SyncProvider'

const tabs = [
  { to: '/money/home', label: 'Home', Icon: House },
  { to: '/money/transactions', label: 'Ledger', Icon: Receipt },
  { to: '/money/groups', label: 'Groups', Icon: Users },
  { to: '/money/settings', label: 'Settings', Icon: SettingsIcon },
]

const foodTabs = [
  { to: '/food/home', label: 'Home', Icon: House },
  { to: '/food/diary', label: 'Diary', Icon: BookOpen },
  { to: '/food/insights', label: 'Insights', Icon: ChartNoAxesColumnIncreasing },
  { to: '/food/profile', label: 'Profile', Icon: User },
]

const apps = [
  { id: 'money', label: 'My Money', Icon: WalletCards },
  { id: 'food', label: 'MyFood', Icon: Utensils },
  { id: 'habit', label: 'MyHabbit', Icon: Heart },
] as const

const habitTabs = [
  { label: 'Today', Icon: CalendarCheck },
]

export default function Layout({ app }: { app: 'money' | 'food' | 'habit' | 'shared' }) {
  const { user, token } = useAuth()
  const sync = useSync()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [failedPicture, setFailedPicture] = useState<string | null>(null)
  const picture = user?.picture
  const isPersonal = pathname === '/personal'
  const selectedApp = app === 'shared' ? null : app
  const comingSoon = selectedApp === 'habit'
  const appInfo = apps.find((app) => app.id === selectedApp) ?? apps[0]
  const navigationItems = selectedApp === 'food' ? foodTabs : tabs
  const addPath = selectedApp === 'food' ? '/food/add' : '/money/expenses/new'
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
    <div
      data-app={selectedApp ?? 'money'}
      className="mx-auto min-h-screen max-w-md"
    >
      <div
        role="group"
        aria-label="App selector"
        className="grid h-16 grid-cols-[repeat(3,minmax(0,1fr))_2.5rem] items-center"
      >
        {apps.map(({ id, label, Icon }) => {
          const selected = selectedApp === id
          const appTheme =
            id === 'money'
              ? 'text-[#4b8bff]'
              : id === 'food'
                ? 'text-[#39c98a]'
                : 'text-[#ed2939]'
          return (
            <button
              key={label}
              type="button"
              aria-pressed={selected}
              onClick={() =>
                navigate(
                  id === 'money'
                    ? '/money/home'
                    : id === 'food'
                      ? '/food/home'
                      : '/habits/today',
                )
              }
              className={`flex min-w-0 items-center justify-center gap-1.5 px-1.5 py-2 text-xs font-semibold transition-colors ${
                selected
                  ? 'app-connected-surface app-selector-tab-active h-16 self-stretch text-primary'
                  : `h-16 self-stretch rounded-xl ${appTheme}`
              }`}
            >
              <Icon size={16} aria-hidden="true" />
              <span className="truncate">{label}</span>
            </button>
          )
        })}
        <Link
          to="/personal"
          aria-label="Personal"
          aria-current={pathname === '/personal' ? 'page' : undefined}
          className={`flex items-center justify-center text-muted-foreground transition-colors ${
            isPersonal
            ? 'personal-selector-tab-active h-16 w-full bg-card hover:bg-card'
            : 'h-16 w-full rounded-xl'
          }`}
        >
          {picture && picture !== failedPicture ? (
            <img
              src={picture}
              alt=""
              aria-hidden="true"
              referrerPolicy="no-referrer"
              onError={() => setFailedPicture(picture)}
              className="size-7 rounded-full object-cover ring-2 ring-primary/30"
            />
          ) : (
            <User size={20} aria-hidden="true" />
          )}
        </Link>
      </div>
      {sync.pending > 10 && !isPersonal ? (
        <aside
          role="status"
          aria-live="polite"
          className="mx-5 mt-2 flex items-center justify-between gap-3 rounded-xl border border-primary/25 bg-primary/10 px-4 py-3"
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
            {sync.state === 'syncing' ? 'Syncing…' : isOffline ? 'Offline' : !token ? 'Waiting…' : 'Sync now'}
          </Button>
        </aside>
      ) : null}
      <main
        className={`space-y-5 px-5 pt-2 ${
          isPersonal
            ? 'min-h-[calc(100vh-4rem)] bg-card pb-5'
            : selectedApp
              ? 'app-connected-surface min-h-[calc(100vh-4rem)] pb-[calc(8rem+1.25rem)]'
              : ''
        }`}
      >
        <Outlet />
      </main>
      {pathname === '/personal' ? null : comingSoon ? (
        <nav
          aria-label={`${appInfo.label} navigation`}
          className="bottom-nav fixed inset-x-0 bottom-0 z-10 mx-auto flex w-full max-w-md items-center justify-around py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
        >
          {habitTabs.map(({ label, Icon }) => (
            <button
              key={label}
              type="button"
              disabled
              aria-disabled="true"
              className="flex min-w-16 flex-col items-center gap-0.5 rounded-2xl px-3 py-1.5 text-[11px] font-medium text-primary"
            >
              <Icon size={21} className="text-primary" />
              {label}
            </button>
          ))}
        </nav>
      ) : (
        <nav
          aria-label={`${appInfo.label} navigation`}
          className="bottom-nav fixed inset-x-0 bottom-0 z-10 mx-auto grid w-full max-w-md grid-cols-5 items-center justify-items-center py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
        >
          {navigationItems.map(({ to, label, Icon }, index) => (
            <Fragment key={to}>
              {index === 2 && (
                <Link
                  to={addPath}
                  aria-label={selectedApp === 'food' ? 'Add meal' : 'Add expense'}
                  aria-current={pathname === addPath ? 'page' : undefined}
                  className={`gloss flex size-12 shrink-0 items-center justify-center rounded-full text-primary-foreground shadow-lg transition-transform active:scale-95 ${pathname === addPath ? 'ring-2 ring-white/70' : ''}`}
                >
                  <Plus size={23} strokeWidth={2.5} />
                </Link>
              )}
              <NavLink
                to={to}
                className={({ isActive }) =>
                  `flex w-16 max-w-full flex-col items-center gap-0.5 rounded-2xl px-1 py-1.5 text-[11px] font-medium whitespace-nowrap text-primary transition-colors ${
                    isActive ? 'bg-primary/20 ring-1 ring-primary/30' : ''
                  }`
                }
              >
                <Icon size={21} className="text-primary" />
                {label}
              </NavLink>
            </Fragment>
          ))}
        </nav>
      )}
    </div>
  )
}
