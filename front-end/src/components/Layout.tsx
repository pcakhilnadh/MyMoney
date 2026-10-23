import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  Activity,
  CalendarCheck,
  Heart,
  House,
  Plus,
  Receipt,
  Utensils,
  User,
  Users,
  WalletCards,
} from 'lucide-react'

const tabs = [
  { to: '/home', label: 'Home', Icon: House },
  { to: '/transactions', label: 'Transactions', Icon: Receipt },
  { to: '/groups', label: 'Groups', Icon: Users },
  { to: '/settings', label: 'Personal', Icon: User },
]

const apps = [
  { id: 'money', label: 'My Money', Icon: WalletCards },
  { id: 'food', label: 'MyFood', Icon: Utensils },
  { id: 'habit', label: 'MyHabbit', Icon: Heart },
] as const

const comingSoonTabs = {
  food: [{ label: 'Home', Icon: House }],
  habit: [
    { label: 'Today', Icon: CalendarCheck },
    { label: 'Habits', Icon: Heart },
    { label: 'Progress', Icon: Activity },
  ],
}

export default function Layout() {
  const { pathname } = useLocation()
  const [selectedApp, setSelectedApp] = useState<'money' | 'food' | 'habit'>('money')
  const comingSoon = selectedApp !== 'money'
  const appInfo = apps.find((app) => app.id === selectedApp) ?? apps[0]
  const navigationItems =
    selectedApp === 'food'
      ? comingSoonTabs.food
      : selectedApp === 'habit'
        ? comingSoonTabs.habit
        : []

  return (
    <div data-app={selectedApp} className="mx-auto min-h-screen max-w-md pb-32">
      <div
        role="group"
        aria-label="App selector"
        className="grid h-16 grid-cols-3 items-center gap-1 px-3"
      >
        {apps.map(({ id, label, Icon }) => {
          const selected = selectedApp === id
          return (
            <button
              key={label}
              type="button"
              aria-pressed={selected}
              onClick={() => setSelectedApp(id)}
              className={`flex min-w-0 items-center justify-center gap-1.5 rounded-xl px-1.5 py-2 text-xs font-semibold transition-colors ${
                selected ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted/50'
              }`}
            >
              <Icon size={16} aria-hidden="true" />
              <span className="truncate">{label}</span>
            </button>
          )
        })}
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
              {appInfo.label}
            </h1>
            <p className="mt-2 text-sm font-medium text-primary">Coming Soon</p>
            <p className="mt-2 max-w-xs text-sm text-muted-foreground">
              {selectedApp === 'food' ? 'Track the food you eat.' : 'Track the habits you do.'}
            </p>
          </section>
        ) : (
          <Outlet />
        )}
      </main>
      {comingSoon ? (
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
              className="flex min-w-16 flex-col items-center gap-0.5 rounded-2xl px-3 py-1.5 text-[11px] font-medium text-muted-foreground opacity-60"
            >
              <Icon size={21} />
              {label}
            </button>
          ))}
        </nav>
      ) : (
        <nav className="bottom-nav fixed inset-x-0 bottom-0 z-10 mx-auto flex w-full max-w-md items-center justify-around py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {tabs.slice(0, 2).map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex min-w-16 flex-col items-center gap-0.5 rounded-2xl px-3 py-1.5 text-[11px] font-medium transition-colors ${
                  isActive
                    ? 'bg-primary/20 text-primary ring-1 ring-primary/30'
                    : 'text-muted-foreground'
                }`
              }
            >
              <Icon size={21} />
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
                `flex min-w-16 flex-col items-center gap-0.5 rounded-2xl px-3 py-1.5 text-[11px] font-medium transition-colors ${
                  isActive
                    ? 'bg-primary/20 text-primary ring-1 ring-primary/30'
                    : 'text-muted-foreground'
                }`
              }
            >
              <Icon size={21} />
              {label}
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  )
}
