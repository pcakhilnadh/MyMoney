import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
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
  { to: '/money/home', label: 'Home', Icon: House },
  { to: '/money/transactions', label: 'Transactions', Icon: Receipt },
  { to: '/money/groups', label: 'Groups', Icon: Users },
  { to: '/money/settings', label: 'Settings', Icon: SettingsIcon },
]

const foodTabs = [
  { to: '/food/home', label: 'Home', Icon: House },
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
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const selectedApp = app === 'shared' ? null : app
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
              onClick={() =>
                navigate(
                  id === 'money'
                    ? '/money/home'
                    : id === 'food'
                      ? '/food/home'
                      : '/habits/today',
                )
              }
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
          className={`flex size-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted/50 ${
            pathname === '/personal' ? 'bg-muted/50' : ''
          }`}
        >
          <User size={20} aria-hidden="true" />
        </Link>
      </div>
      <main className="space-y-5 px-5 pt-2">
        <Outlet />
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
            to="/money/expenses/new"
            aria-label="Add expense"
            className={`gloss flex size-12 shrink-0 items-center justify-center rounded-full text-primary-foreground shadow-lg transition-transform active:scale-95 ${pathname === '/money/expenses/new' ? 'ring-2 ring-white/70' : ''}`}
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
