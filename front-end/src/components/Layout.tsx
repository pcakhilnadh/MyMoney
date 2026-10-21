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
            ExpTracker
          </span>
        </div>
        {pathname !== '/expenses/new' && (
          <Link
            to="/expenses/new"
            aria-label="Add expense"
            className="gloss flex size-10 items-center justify-center rounded-full text-primary-foreground transition-transform active:scale-95"
          >
            <Plus size={20} strokeWidth={2.5} />
          </Link>
        )}
      </div>
      <main className="space-y-5 px-5 pt-2">
        <Outlet />
      </main>
      <nav className="glass fixed inset-x-4 bottom-4 mx-auto flex max-w-[26rem] justify-around rounded-[28px] px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_20px_40px_-12px_rgba(0,0,0,0.8)]">
        {tabs.map(({ to, label, Icon }) => (
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
