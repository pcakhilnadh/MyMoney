import { Fragment, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  BookOpen,
  CalendarDays,
  ChartNoAxesColumnIncreasing,
  ChefHat,
  House,
  Plus,
  Receipt,
  Settings as SettingsIcon,
  ShoppingCart,
  Sun,
  Utensils,
  User,
  Users,
  WalletCards,
} from 'lucide-react'
import { useEntitlements } from '@/account/entitlements'
import { useAuth } from '@/auth/AuthContext'
import { PlateIcon } from '@/components/PlateIcon'
import { PlateAddButton } from '@/plate/PlateProvider'
import { PlateNavBadge } from '@/plate/NavBadge'

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

const allApps = [
  { id: 'money', label: 'My Money', Icon: WalletCards },
  { id: 'food', label: 'My Food', Icon: Utensils },
  { id: 'plate', label: 'My Plate', Icon: PlateIcon },
] as const

// Today stays first: it's what MyPlate opens on. Ideas lives in the Plan header.
const plateTabs = [
  { to: '/plate/today', label: 'Today', Icon: Sun },
  { to: '/plate/plan', label: 'Plan', Icon: CalendarDays },
  { to: '/plate/cart', label: 'Cart', Icon: ShoppingCart },
  { to: '/plate/kitchens', label: 'Kitchens', Icon: ChefHat },
]

export default function Layout({ app }: { app: 'money' | 'food' | 'plate' | 'shared' }) {
  const { user } = useAuth()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [failedPicture, setFailedPicture] = useState<string | null>(null)
  const picture = user?.picture
  const isPersonal = pathname === '/personal' || pathname.startsWith('/personal/')
  const isFoodHome = pathname === '/food/home'
  const selectedApp = app === 'shared' ? null : app
  const { has } = useEntitlements()
  const apps = allApps.filter((a) => has(a.id))
  // With one app available, the profile button shares the app tab's surface (until Personal is open).
  const singleApp = apps.length === 1
  const appInfo = apps.find((app) => app.id === selectedApp) ?? apps[0] ?? allApps[0]
  const navigationItems =
    selectedApp === 'food' ? foodTabs : selectedApp === 'plate' ? plateTabs : tabs
  const addPath = selectedApp === 'food' ? '/food/add' : '/money/expenses/new'

  return (
    <div
      data-app={selectedApp ?? 'money'}
      data-food-home={isFoodHome || undefined}
      className="mx-auto min-h-screen max-w-md"
    >
      <div
        role="group"
        aria-label="App selector"
        className="grid h-16 items-center"
        style={{ gridTemplateColumns: `repeat(${apps.length}, minmax(0, 1fr)) 2.5rem` }}
      >
        {apps.map(({ id, label, Icon }) => {
          const selected = selectedApp === id
          const appTheme =
            id === 'money' ? 'text-[#4b8bff]' : id === 'food' ? 'text-[#39c98a]' : 'text-[#ed2939]'
          return (
            <button
              key={label}
              type="button"
              aria-pressed={selected}
              onClick={() =>
                navigate(
                  id === 'money' ? '/money/home' : id === 'food' ? '/food/home' : '/plate/today',
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
              : singleApp && selectedApp
                ? 'app-connected-surface app-selector-tab-active h-16 w-full'
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
      {isPersonal ? null : (
        <nav
          aria-label={`${appInfo.label} navigation`}
          className={`bottom-nav fixed inset-x-0 bottom-0 z-10 mx-auto grid w-full max-w-md grid-cols-5 items-center justify-items-center py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] ${isFoodHome ? 'food-home-nav' : ''}`}
        >
          {navigationItems.map(({ to, label, Icon }, index) => (
            <Fragment key={to}>
              {index === 2 && selectedApp === 'plate' && <PlateAddButton />}
              {index === 2 && selectedApp !== 'plate' && (
                <Link
                  to={addPath}
                  aria-label={selectedApp === 'food' ? 'Add meal' : 'Add expense'}
                  aria-current={pathname === addPath ? 'page' : undefined}
                  className={`${isFoodHome ? 'food-home-add size-14' : 'gloss size-12 shadow-lg'} flex shrink-0 items-center justify-center rounded-full text-primary-foreground transition-transform active:scale-95 ${pathname === addPath ? 'ring-2 ring-white/70' : ''}`}
                >
                  <Plus size={23} strokeWidth={2.5} />
                </Link>
              )}
              <NavLink
                to={to}
                className={({ isActive }) =>
                  isFoodHome
                    ? `flex w-16 max-w-full flex-col items-center justify-center gap-1 py-1 text-[11px] whitespace-nowrap ${isActive ? 'font-semibold text-[#6fcf97]' : 'font-medium text-[#a9bfb5]'}`
                    : `flex w-16 max-w-full flex-col items-center gap-0.5 rounded-2xl px-1 py-1.5 text-[11px] font-medium whitespace-nowrap text-primary transition-colors ${
                        isActive ? 'bg-primary/20 ring-1 ring-primary/30' : ''
                      }`
                }
              >
                {isFoodHome ? (
                  <span
                    className={`flex h-7 w-12 items-center justify-center rounded-full ${pathname === to ? 'bg-[#173a2a]' : ''}`}
                  >
                    <Icon size={20} aria-hidden="true" />
                  </span>
                ) : (
                  <span className="relative">
                    <Icon size={21} className="text-primary" />
                    {selectedApp === 'plate' && <PlateNavBadge to={to} />}
                  </span>
                )}
                {label}
              </NavLink>
            </Fragment>
          ))}
        </nav>
      )}
    </div>
  )
}
