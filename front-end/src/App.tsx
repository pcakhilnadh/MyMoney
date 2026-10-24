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
import Settings from './pages/Settings'
import CurrencySettings from './pages/CurrencySettings'
import Layout from './components/Layout'
import AccountDetail from './pages/AccountDetail'
import BudgetCategoryDetail from './pages/BudgetCategoryDetail'
import FoodHome from './pages/FoodHome'
import HabitsHome from './pages/HabitsHome'
import { CurrencyProvider } from './money/CurrencyContext'

function Protected() {
  const { user, ready } = useAuth()
  if (!ready)
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Restoring your session…
      </div>
    )
  return user ? <Outlet /> : <Navigate to="/login" replace />
}

function LegacyMoneyRedirect() {
  const { pathname, search, hash } = useLocation()
  return <Navigate to={{ pathname: `/money${pathname}`, search, hash }} replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <CurrencyProvider>
        <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<Protected />}>
          <Route index element={<Navigate to="/money/home" replace />} />
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
          <Route element={<Layout app="food" />}>
            <Route path="/food" element={<Navigate to="/food/home" replace />} />
            <Route path="/food/home" element={<FoodHome />} />
            <Route path="/food/*" element={<Navigate to="/food/home" replace />} />
          </Route>
          <Route element={<Layout app="habit" />}>
            <Route path="/habits" element={<Navigate to="/habits/today" replace />} />
            <Route path="/habits/today" element={<HabitsHome />} />
            <Route path="/habits/*" element={<Navigate to="/habits/today" replace />} />
          </Route>
          <Route element={<Layout app="shared" />}>
            <Route path="/personal" element={<Personal />} />
          </Route>
        </Route>
        </Routes>
      </CurrencyProvider>
    </BrowserRouter>
  )
}
