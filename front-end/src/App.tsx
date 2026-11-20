import type { ReactNode } from 'react'
import { Share, X } from 'lucide-react'
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './auth/AuthContext'
import AddExpense from './pages/AddExpense'
import Budgets from './pages/Budgets'
import GroupDetail from './pages/GroupDetail'
import Groups from './pages/Groups'
import Home from './pages/Home'
import SettingsAccounts from './pages/SettingsAccounts'
import SettingsCategories from './pages/SettingsCategories'
import Insights from './pages/Insights'
import Login from './pages/Login'
import Transactions from './pages/Transactions'
import TransactionDetail from './pages/TransactionDetail'
import Personal from './pages/Personal'
import Feedback from './pages/Feedback'
import OwnerDashboard from './pages/OwnerDashboard'
import { RequireFeature, RequireOwner } from './account/entitlements'
import Welcome, { BreathingScreen } from './pages/Welcome'
import Settings from './pages/Settings'
import CurrencySettings from './pages/CurrencySettings'
import Layout from './components/Layout'
import AccountDetail from './pages/AccountDetail'
import BudgetCategoryDetail from './pages/BudgetCategoryDetail'
import FoodHome from './pages/FoodHome'
import FoodLog from './pages/FoodLog'
import { FoodDataProvider } from './food/FoodDataProvider'
import { FoodDiary, FoodInsights, FoodProfile } from './pages/FoodSections'
import { PlateProvider } from './plate/PlateProvider'
import PlateToday from './pages/plate/Today'
import PlatePlan from './pages/plate/Plan'
import PlateCart from './pages/plate/Cart'
import PlateKitchens from './pages/plate/Kitchens'
import PlateKitchenSettings from './pages/plate/KitchenSettings'
import PlateIdeas from './pages/plate/Ideas'
import { CurrencyProvider } from './money/CurrencyContext'
import { useInstall } from './pwa/useInstall'

const INSTALL_STEPS: Record<'ios' | 'safari-mac' | 'firefox-android', ReactNode> = {
  ios: (
    <>
      Tap <Share className="inline size-3.5 align-[-2px]" aria-label="Share" /> Share, then{' '}
      <b>Add to Home Screen</b>.
    </>
  ),
  'safari-mac': (
    <>
      In Safari, choose <b>File → Add to Dock</b>.
    </>
  ),
  'firefox-android': (
    <>
      Open the Firefox menu <b>⋮</b>, then tap <b>Install</b> or <b>Add to Home screen</b>.
    </>
  ),
}

function InstallPrompt() {
  const { method, dismissed, dismiss, install } = useInstall()
  if (!method || dismissed) return null

  return (
    <aside
      role="region"
      aria-label="Install MyTracker"
      className="fixed inset-x-0 bottom-24 z-50 mx-auto max-w-md px-4"
    >
      <div className="surface flex items-center gap-3 rounded-xl py-3 pr-2 pl-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Install MyTracker</p>
          <p className="text-xs text-muted-foreground">
            {method === 'prompt' ? 'Quick access, including offline.' : INSTALL_STEPS[method]}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {method === 'prompt' && (
            <button
              type="button"
              aria-label="Install MyTracker as an app"
              onClick={() =>
                void install().catch((error: unknown) => {
                  console.error('Unable to open the app install prompt', error)
                })
              }
              className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"
            >
              Install
            </button>
          )}
          <button
            type="button"
            aria-label="Dismiss install prompt"
            onClick={dismiss}
            className="rounded-lg p-2 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>
    </aside>
  )
}

function Protected() {
  const { user, ready } = useAuth()
  if (!ready) return <BreathingScreen />
  if (!user) return <Navigate to="/login" replace />
  return <Outlet />
}

function LegacyMoneyRedirect() {
  const { pathname, search, hash } = useLocation()
  return <Navigate to={{ pathname: `/money${pathname}`, search, hash }} replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <CurrencyProvider>
        <InstallPrompt />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<Protected />}>
            <Route index element={<Navigate to="/money/home" replace />} />
            <Route path="/welcome" element={<Welcome />} />
            <Route path="/home" element={<LegacyMoneyRedirect />} />
            <Route path="/transactions/*" element={<LegacyMoneyRedirect />} />
            <Route path="/expenses/*" element={<LegacyMoneyRedirect />} />
            <Route path="/insights" element={<LegacyMoneyRedirect />} />
            <Route path="/budgets/*" element={<LegacyMoneyRedirect />} />
            <Route path="/settings/*" element={<LegacyMoneyRedirect />} />
            <Route path="/accounts/*" element={<LegacyMoneyRedirect />} />
            <Route path="/groups/*" element={<LegacyMoneyRedirect />} />
            <Route element={<Layout app="money" />}>
              <Route path="/money" element={<Navigate to="/money/home" replace />} />
              <Route path="/money/home" element={<Home />} />
              <Route path="/money/settings" element={<Settings />} />
              <Route path="/money/settings/currency" element={<CurrencySettings />} />
              <Route path="/money/transactions" element={<Transactions />} />
              <Route path="/money/transactions/:transactionId" element={<TransactionDetail />} />
              <Route path="/money/expenses/new" element={<AddExpense />} />
              <Route path="/money/insights" element={<Insights />} />
              <Route path="/money/budgets" element={<Budgets />} />
              <Route
                path="/money/budgets/categories/:categoryId"
                element={<BudgetCategoryDetail />}
              />
              <Route path="/money/settings/accounts" element={<SettingsAccounts />} />
              <Route path="/money/accounts/:accountId" element={<AccountDetail />} />
              <Route path="/money/settings/categories" element={<SettingsCategories />} />
              <Route path="/money/groups" element={<Groups />} />
              <Route path="/money/groups/:groupId" element={<GroupDetail />} />
            </Route>
            <Route
              element={
                <RequireFeature feature="food">
                  <FoodDataProvider>
                    <Layout app="food" />
                  </FoodDataProvider>
                </RequireFeature>
              }
            >
              <Route path="/food" element={<Navigate to="/food/home" replace />} />
              <Route path="/food/home" element={<FoodHome />} />
              <Route path="/food/diary" element={<FoodDiary />} />
              <Route path="/food/add" element={<FoodLog />} />
              <Route path="/food/insights" element={<FoodInsights />} />
              <Route path="/food/profile" element={<FoodProfile />} />
              <Route path="/food/*" element={<Navigate to="/food/home" replace />} />
            </Route>
            <Route
              element={
                <RequireFeature feature="plate">
                  <PlateProvider>
                    <Layout app="plate" />
                  </PlateProvider>
                </RequireFeature>
              }
            >
              <Route path="/plate" element={<Navigate to="/plate/today" replace />} />
              <Route path="/plate/today" element={<PlateToday />} />
              <Route path="/plate/plan" element={<PlatePlan />} />
              <Route path="/plate/ideas" element={<PlateIdeas />} />
              <Route path="/plate/cart" element={<PlateCart />} />
              <Route path="/plate/kitchens" element={<PlateKitchens />} />
              <Route path="/plate/kitchens/:kitchenId" element={<PlateKitchenSettings />} />
              <Route path="/plate/*" element={<Navigate to="/plate/today" replace />} />
            </Route>
            <Route element={<Layout app="shared" />}>
              <Route path="/personal" element={<Personal />} />
              <Route path="/personal/feedback" element={<Feedback />} />
              <Route
                path="/personal/dashboard"
                element={
                  <RequireOwner>
                    <OwnerDashboard />
                  </RequireOwner>
                }
              />
            </Route>
          </Route>
        </Routes>
      </CurrencyProvider>
    </BrowserRouter>
  )
}
