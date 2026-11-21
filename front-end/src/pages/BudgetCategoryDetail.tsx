import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { useDialog } from '@/components/DialogProvider'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Button, Card, PageHeader } from '@/components/kit'
import { TransactionList } from '@/components/TransactionList'
import { budgetsRepo, categoriesRepo, transactionsRepo } from '@/db/repos'
import { AllocationInput } from '@/components/AllocationInput'
import { allocationError, categoryBudgets, findTotalBudget, totalAllocated } from '@/lib/budget'
import { hideCategory, showCategory } from '@/lib/hide-category'
import { formatMinor } from '@/lib/money'
import { currentMonth } from '@/lib/summary'
import { useCurrency } from '@/money/CurrencyContext'
import { BackButton } from '@/nav/BackButton'

const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

export default function BudgetCategoryDetail() {
  const { currency } = useCurrency()
  const { confirm } = useDialog()
  const { categoryId = '' } = useParams()
  const [settingBudget, setSettingBudget] = useState(false)
  const [amount, setAmount] = useState(0)
  const [saveError, setSaveError] = useState<string | null>(null)
  const category = useLiveQuery(() => categoriesRepo.get(categoryId), [categoryId])
  const budgets = useLiveQuery(() => budgetsRepo.list(), [])
  const transactions = useLiveQuery(() => transactionsRepo.listByDate(), [])
  const month = currentMonth()

  if (category === undefined || budgets === undefined || transactions === undefined)
    return (
      <div className="space-y-4">
        <BackButton fallback="/money/budgets" />
        <p className="text-muted-foreground">Loading category…</p>
      </div>
    )

  const totalBudget = findTotalBudget(budgets)
  const budget = categoryBudgets(budgets).find(
    (item) =>
      item.category_id === categoryId || (!item.category_id && item.name === category?.name),
  )
  const allocationBlocker = allocationError(budgets, amount > 0 ? amount : 0)
  const categoryName = category?.name ?? budget?.name

  if (!categoryName)
    return (
      <div className="space-y-4">
        <BackButton fallback="/money/budgets" />
        <p className="text-muted-foreground">Category not found.</p>
      </div>
    )

  const monthTransactions = transactions.filter(
    (transaction) =>
      transaction.category_id === categoryId &&
      transaction.transaction_date.startsWith(month) &&
      (transaction.transaction_type === 'expense' || transaction.transaction_type === 'refund'),
  )
  const spent = monthTransactions.reduce(
    (total, transaction) =>
      total +
      (transaction.transaction_type === 'expense'
        ? transaction.amount_minor
        : -transaction.amount_minor),
    0,
  )
  const currentYear = month.slice(0, 4)
  const spentThisYear = transactions
    .filter(
      (transaction) =>
        transaction.category_id === categoryId &&
        transaction.transaction_date.startsWith(`${currentYear}-`) &&
        (transaction.transaction_type === 'expense' || transaction.transaction_type === 'refund'),
    )
    .reduce(
      (total, transaction) =>
        total +
        (transaction.transaction_type === 'expense'
          ? transaction.amount_minor
          : -transaction.amount_minor),
      0,
    )
  const remainder = budget ? budget.amount_minor - spent : null
  const [year, monthNumber] = month.split('-').map(Number)
  const sixMonthSpending = Array.from({ length: 6 }, (_, index) => {
    const absoluteMonth = year * 12 + monthNumber - 1 - (5 - index)
    const monthYear = Math.floor(absoluteMonth / 12)
    const monthIndex = absoluteMonth % 12
    const key = `${monthYear}-${String(monthIndex + 1).padStart(2, '0')}`
    const monthSpend = transactions
      .filter(
        (transaction) =>
          transaction.category_id === categoryId &&
          transaction.transaction_date.startsWith(key) &&
          (transaction.transaction_type === 'expense' || transaction.transaction_type === 'refund'),
      )
      .reduce(
        (total, transaction) =>
          total +
          (transaction.transaction_type === 'expense'
            ? transaction.amount_minor
            : -transaction.amount_minor),
        0,
      )
    return {
      month: MONTH_LABELS[monthIndex],
      spending: Math.max(monthSpend, 0),
      budget: budget?.amount_minor ?? null,
    }
  })

  async function saveBudget() {
    if (!category || amount <= 0) return
    const blocker = allocationError(budgets ?? [], amount)
    if (blocker) {
      setSaveError(blocker)
      return
    }
    setSaveError(null)
    try {
      await budgetsRepo.create({
        group_id: null,
        category_id: category.id,
        name: category.name,
        amount_minor: amount,
        currency,
        period: 'monthly',
        period_start: `${month}-01`,
        period_end: null,
        alert_threshold_percent: 80,
        is_active: true,
      })
      setAmount(0)
      setSettingBudget(false)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Unable to save this budget.')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <BackButton fallback="/money/budgets" />
        {category && (
          <Button
            size="sm"
            variant="outline"
            aria-label={`${category.is_hidden ? 'Show' : 'Hide'} ${category.name}`}
            onClick={async () => {
              if (category.is_hidden) return void showCategory(category)
              if (
                budget &&
                !(await confirm({
                  title: `Hide ${category.name}?`,
                  message: `This also clears its ${formatMinor(budget.amount_minor, currency)} allocation. You can unhide it later and allocate again.`,
                  confirmLabel: 'Hide category',
                }))
              )
                return
              await hideCategory(category, budgets)
            }}
          >
            {category.is_hidden ? <EyeOff size={14} /> : <Eye size={14} />}
            {category.is_hidden ? 'Hidden · Show' : 'Hide'}
          </Button>
        )}
      </div>
      <PageHeader
        title={categoryName}
        subtitle={
          category?.is_hidden ? 'Hidden from budgets and new transactions' : 'Category Breakdown'
        }
      />

      <Card className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="min-w-0">
            <p className="text-[9px] font-medium tracking-[0.16em] text-white/45 uppercase">
              This Month
            </p>
            <p className="money mt-1 truncate text-sm font-medium text-white/80">
              {formatMinor(spent, currency)}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-[9px] font-medium tracking-[0.16em] text-white/45 uppercase">
              Remaining
            </p>
            <p className="money mt-1 truncate text-sm font-medium text-white/80">
              {budget && remainder !== null ? formatMinor(Math.max(remainder, 0), currency) : '—'}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-[9px] font-medium tracking-[0.16em] text-white/45 uppercase">
              This Year
            </p>
            <p className="money mt-1 truncate text-sm font-medium text-white/80">
              {formatMinor(spentThisYear, currency)}
            </p>
          </div>
        </div>
        <div className="border-t border-white/10 pt-3">
          <p className="text-[9px] font-medium tracking-[0.16em] text-white/45 uppercase">
            Monthly limit
          </p>
          {budget && (
            <p className="money mt-1 text-sm font-medium text-white/80">
              {formatMinor(budget.amount_minor, currency)}
            </p>
          )}
          {budget ? null : settingBudget ? (
            <div className="mt-3 space-y-3">
              <AllocationInput
                value={amount}
                onChange={setAmount}
                total={totalBudget?.amount_minor ?? 0}
                available={Math.max((totalBudget?.amount_minor ?? 0) - totalAllocated(budgets), 0)}
                currency={currency}
              />
              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  aria-label={`Save ${categoryName} budget`}
                  onClick={() => void saveBudget()}
                  disabled={amount <= 0 || allocationBlocker !== null}
                >
                  Save budget
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setSettingBudget(false)
                    setAmount(0)
                    setSaveError(null)
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : totalBudget ? (
            <div className="mt-2">
              <Button size="sm" variant="outline" onClick={() => setSettingBudget(true)}>
                Set budget
              </Button>
            </div>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
              Set a monthly budget on the{' '}
              <Link to="/money/budgets" className="text-primary">
                Budgets page
              </Link>{' '}
              before allocating to this category.
            </p>
          )}
          {settingBudget && !budget && amount > 0 && allocationBlocker && (
            <p className="mt-2 text-xs text-destructive">{allocationBlocker}</p>
          )}
        </div>
        {saveError && <p className="text-sm text-destructive">{saveError}</p>}
        {budget && remainder !== null && remainder < 0 && (
          <p className="text-xs text-destructive">
            Over budget by {formatMinor(Math.abs(remainder), currency)}
          </p>
        )}
      </Card>

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold">Last 6 months</h2>
        <div
          role="img"
          aria-label={`Last 6 months spending for ${categoryName} compared with monthly budget`}
        >
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={sixMonthSpending} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
              <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.08)" />
              <XAxis
                dataKey="month"
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#8e8ea0', fontSize: 11 }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                width={58}
                tick={{ fill: '#8e8ea0', fontSize: 10 }}
                tickFormatter={(value: number) => formatMinor(value, currency)}
              />
              <Tooltip
                formatter={(value) => [formatMinor(Number(value), currency), 'Spent']}
                cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                contentStyle={{
                  background: '#1a1a23',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8,
                  color: '#f4f4f8',
                  fontSize: 12,
                }}
                labelStyle={{ color: '#a1a1aa' }}
              />
              {budget && (
                <ReferenceLine
                  y={budget.amount_minor}
                  stroke="#e6c879"
                  strokeDasharray="5 4"
                  label={{
                    value: 'Budget',
                    fill: '#e6c879',
                    fontSize: 10,
                    position: 'insideTopRight',
                  }}
                />
              )}
              <Bar dataKey="spending" name="Spent" maxBarSize={28}>
                {sixMonthSpending.map((entry) => (
                  <Cell
                    key={entry.month}
                    fill={budget && entry.spending > budget.amount_minor ? '#f18a91' : '#a7a0ff'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          {budget ? (
            <>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 bg-[#a7a0ff]" />
                Within budget
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 bg-[#f18a91]" />
                Over budget
              </span>
            </>
          ) : (
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 bg-[#a7a0ff]" />
              Spending
            </span>
          )}
          {budget && (
            <span className="flex items-center gap-1.5">
              <span className="w-4 border-t border-dashed border-[#e6c879]" />
              Budget limit
            </span>
          )}
        </div>
      </Card>

      <h2 className="label px-1">Transactions this month</h2>
      {monthTransactions.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No transactions for this category this month.
        </p>
      ) : (
        <TransactionList transactions={monthTransactions} />
      )}
    </div>
  )
}
