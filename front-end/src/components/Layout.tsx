import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { House, Plus, Receipt, User, Users } from 'lucide-react'

const tabs = [
  { to: '/home', label: 'Home', Icon: House },
  { to: '/transactions', label: 'Transactions', Icon: Receipt },
  { to: '/groups', label: 'Groups', Icon: Users },
  { to: '/settings', label: 'Personal', Icon: User },
]

export default function Layout() {
  const { pathname } = useLocation()
  return (
    <div className="mx-auto min-h-screen max-w-md pb-32">
      <div className="flex h-16 items-center justify-between px-5">
        <div className="flex items-center gap-2.5">
          <div className="gloss flex size-8 items-center justify-center rounded-xl text-base font-bold">
            ₹
          </div>
          <span className="text-sm font-semibold tracking-wide text-muted-foreground">
            MyMoney
          </span>
        </div>
      </div>
      <main className="space-y-5 px-5 pt-2">
        <Outlet />
      </main>
      <nav className="bottom-nav fixed inset-x-0 bottom-0 z-10 mx-auto flex w-full max-w-md items-center justify-around py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {tabs.slice(0, 2).map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex min-w-16 flex-col items-center gap-0.5 rounded-2xl px-3 py-1.5 text-[11px] font-medium transition-colors ${
                isActive ? 'bg-primary/15 text-primary' : 'text-muted-foreground'
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
                isActive ? 'bg-primary/15 text-primary' : 'text-muted-foreground'
              }`
            }
          >
            <Icon size={21} />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
