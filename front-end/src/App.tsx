import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
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
import Layout from './components/Layout'
import AccountDetail from './pages/AccountDetail'
import BudgetCategoryDetail from './pages/BudgetCategoryDetail'
import FoodHome from './pages/FoodHome'
import FoodDiary from './pages/FoodDiary'
import FoodAdd from './pages/FoodAdd'
import FoodInsights from './pages/FoodInsights'
import FoodSettings from './pages/FoodSettings'
import FoodDatabase from './pages/FoodDatabase'

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

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<Protected />}>
          <Route element={<Layout />}>
            <Route path="/personal" element={<Personal />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/home" element={<Home />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/transactions/:transactionId" element={<TransactionDetail />} />
            <Route path="/expenses/new" element={<AddExpense />} />
            <Route path="/insights" element={<Insights />} />
            <Route path="/budgets" element={<Budgets />} />
            <Route path="/budgets/categories/:categoryId" element={<BudgetCategoryDetail />} />
            <Route path="/settings/accounts" element={<SettingsAccounts />} />
            <Route path="/accounts/:accountId" element={<AccountDetail />} />
            <Route path="/settings/categories" element={<SettingsCategories />} />
            <Route path="/groups" element={<Groups />} />
            <Route path="/groups/:groupId" element={<GroupDetail />} />
            <Route path="/food" element={<FoodHome />} />
            <Route path="/food/diary" element={<FoodDiary />} />
            <Route path="/food/diary/:date/:mealType" element={<FoodDiary />} />
            <Route path="/food/add" element={<FoodAdd />} />
            <Route path="/food/insights" element={<FoodInsights />} />
            <Route path="/food/settings" element={<FoodSettings />} />
            <Route path="/food/settings/database" element={<FoodDatabase />} />
            <Route index element={<Navigate to="/home" replace />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
