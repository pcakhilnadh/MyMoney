import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Activity,
  CalendarCheck,
  Heart,
  House,
  Plus,
  Receipt,
  Settings as SettingsIcon,
  Utensils,
  User,
  Users,
  WalletCards,
} from 'lucide-react'

const tabs = [
  { to: '/home', label: 'Home', Icon: House },
  { to: '/transactions', label: 'Transactions', Icon: Receipt },
  { to: '/groups', label: 'Groups', Icon: Users },
  { to: '/settings', label: 'Settings', Icon: SettingsIcon },
]

const foodTabs = [
  { to: '/food', label: 'Home', Icon: House },
  { to: '/food/diary', label: 'Diary', Icon: CalendarCheck },
  { to: '/food/insights', label: 'Insights', Icon: Activity },
  { to: '/food/settings', label: 'Settings', Icon: SettingsIcon },
]

const apps = [
  { id: 'money', label: 'My Money', Icon: WalletCards },
  { id: 'food', label: 'MyFood', Icon: Utensils },
  { id: 'habit', label: 'MyHabbit', Icon: Heart },
] as const

const habitTabs = [
  { label: 'Today', Icon: CalendarCheck },
  { label: 'Habits', Icon: Heart },
  { label: 'Progress', Icon: Activity },
]

export default function Layout() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [selectedApp, setSelectedApp] = useState<'money' | 'food' | 'habit' | null>('money')
  const comingSoon = selectedApp === 'habit'
  const appInfo = apps.find((app) => app.id === selectedApp) ?? apps[0]
  const navigationItems =
    selectedApp === 'food' ? foodTabs : selectedApp === 'habit' ? habitTabs : []

  return (
    <div data-app={selectedApp ?? 'money'} className="mx-auto min-h-screen max-w-md pb-32">
      <div
        role="group"
        aria-label="App selector"
        className="grid h-16 grid-cols-[repeat(3,minmax(0,1fr))_2.5rem] items-center gap-1 px-3"
      >
        {apps.map(({ id, label, Icon }) => {
          const selected = selectedApp === id
          return (
            <button
              key={label}
              type="button"
              aria-pressed={selected}
              onClick={() => {
                setSelectedApp(id)
                navigate(id === 'money' ? '/home' : id === 'food' ? '/food' : '/home')
              }}
              className={`flex min-w-0 items-center justify-center gap-1.5 rounded-xl px-1.5 py-2 text-xs font-semibold transition-colors ${
                selected ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted/50'
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
          onClick={() => setSelectedApp(null)}
          className={`flex size-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted/50 ${
            pathname === '/personal' ? 'bg-muted/50' : ''
          }`}
        >
          <User size={20} aria-hidden="true" />
        </Link>
      </div>
      <main className="space-y-5 px-5 pt-2">
        {comingSoon ? (
          <section
            aria-labelledby="coming-soon-title"
            className="flex min-h-[55vh] flex-col items-center justify-center text-center"
          >
            <div className="mb-5 flex size-16 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
              <appInfo.Icon size={30} aria-hidden="true" />
            </div>
            <h1 id="coming-soon-title" className="text-2xl font-bold">
              {selectedApp === 'habit' ? 'Today' : 'Home'}
            </h1>
            <p className="mt-2 text-sm font-medium text-primary">Coming Soon</p>
            <p className="mt-2 max-w-xs text-sm text-muted-foreground">
              {selectedApp === 'habit' ? 'Track the habits you do.' : 'More apps coming soon.'}
            </p>
          </section>
        ) : (
          <Outlet />
        )}
      </main>
      {pathname === '/personal' ? null : comingSoon ? (
        <nav
          aria-label={`${appInfo.label} navigation`}
          className="bottom-nav fixed inset-x-0 bottom-0 z-10 mx-auto flex w-full max-w-md items-center justify-around py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
        >
          {navigationItems.map(({ label, Icon }) => (
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
      ) : selectedApp === 'food' ? (
        <nav
          aria-label={`${appInfo.label} navigation`}
          className="bottom-nav fixed inset-x-0 bottom-0 z-10 mx-auto flex w-full max-w-md items-center justify-around py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
        >
          {foodTabs.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex min-w-16 flex-col items-center gap-0.5 rounded-2xl px-3 py-1.5 text-[11px] font-medium text-primary transition-colors ${
                  isActive ? 'bg-primary/20 ring-1 ring-primary/30' : ''
                }`
              }
            >
              <Icon size={21} className="text-primary" />
              {label}
            </NavLink>
          ))}
          <Link
            to="/food/add"
            aria-label="Add food"
            className={`gloss flex size-12 shrink-0 items-center justify-center rounded-full text-primary-foreground shadow-lg transition-transform active:scale-95 ${pathname === '/food/add' ? 'ring-2 ring-white/70' : ''}`}
          >
            <Plus size={23} strokeWidth={2.5} />
          </Link>
        </nav>
      ) : (
        <nav className="bottom-nav fixed inset-x-0 bottom-0 z-10 mx-auto flex w-full max-w-md items-center justify-around py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {tabs.slice(0, 2).map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex min-w-16 flex-col items-center gap-0.5 rounded-2xl px-3 py-1.5 text-[11px] font-medium text-primary transition-colors ${
                  isActive
                    ? 'bg-primary/20 ring-1 ring-primary/30'
                    : ''
                }`
              }
            >
              <Icon size={21} className="text-primary" />
              {label}
            </NavLink>
          ))}
          <Link
            to="/expenses/new"
            aria-label="Add expense"
            className={`gloss flex size-12 shrink-0 items-center justify-center rounded-full text-primary-foreground shadow-lg transition-transform active:scale-95 ${pathname === '/expenses/new' ? 'ring-2 ring-white/70' : ''}`}
          >
            <Plus size={23} strokeWidth={2.5} />
          </Link>
          {tabs.slice(2).map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex min-w-16 flex-col items-center gap-0.5 rounded-2xl px-3 py-1.5 text-[11px] font-medium text-primary transition-colors ${
                  isActive
                    ? 'bg-primary/20 ring-1 ring-primary/30'
                    : ''
                }`
              }
            >
              <Icon size={21} className="text-primary" />
              {label}
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  )
}
