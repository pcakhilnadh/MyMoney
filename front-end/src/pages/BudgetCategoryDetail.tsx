import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Check } from 'lucide-react'
import { Button, Card, Input, PageHeader } from '@/components/kit'
import { TransactionList } from '@/components/TransactionList'
import { budgetsRepo, categoriesRepo, transactionsRepo } from '@/db/repos'
import { formatMinor, toMinor } from '@/lib/money'
import { currentMonth } from '@/lib/summary'

export default function BudgetCategoryDetail() {
  const { categoryId = '' } = useParams()
  const [settingBudget, setSettingBudget] = useState(false)
  const [amount, setAmount] = useState(0)
  const [amountInput, setAmountInput] = useState('')
  const [saveError, setSaveError] = useState<string | null>(null)
  const category = useLiveQuery(() => categoriesRepo.get(categoryId), [categoryId])
  const budgets = useLiveQuery(() => budgetsRepo.list(), [])
  const transactions = useLiveQuery(() => transactionsRepo.listByDate(), [])
  const month = currentMonth()

  if (category === undefined || budgets === undefined || transactions === undefined)
    return (
      <div className="space-y-4">
        <Link to="/budgets" className="text-sm text-primary">
          ← Budgets
        </Link>
        <p className="text-muted-foreground">Loading category…</p>
      </div>
    )

  const budget = budgets.find(
    (item) =>
      item.category_id === categoryId || (!item.category_id && item.name === category?.name),
  )
  const categoryName = category?.name ?? budget?.name

  if (!categoryName)
    return (
      <div className="space-y-4">
        <Link to="/budgets" className="text-sm text-primary">
          ← Budgets
        </Link>
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
  const remainder = budget ? budget.amount_minor - spent : null

  async function saveBudget() {
    if (!category || amount <= 0) return
    setSaveError(null)
    try {
      await budgetsRepo.create({
        group_id: null,
        category_id: category.id,
        name: category.name,
        amount_minor: amount,
        currency: 'INR',
        period: 'monthly',
        period_start: `${month}-01`,
        period_end: null,
        alert_threshold_percent: 80,
        is_active: true,
      })
      setAmount(0)
      setAmountInput('')
      setSettingBudget(false)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Unable to save this budget.')
    }
  }

  return (
    <div className="space-y-4">
      <Link to="/budgets" className="text-sm text-primary">
        ← Budgets
      </Link>
      <PageHeader title={categoryName} subtitle="Monthly category breakdown" />

      <Card className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[9px] font-medium tracking-[0.16em] text-white/45 uppercase">
              Spent this month
            </p>
            <p className="money mt-1 text-sm font-medium text-white/80">{formatMinor(spent)}</p>
          </div>
          <div>
            <p className="text-[9px] font-medium tracking-[0.16em] text-white/45 uppercase">
              Remaining
            </p>
            <p className="money mt-1 text-sm font-medium text-white/80">
              {budget && remainder !== null ? formatMinor(Math.max(remainder, 0)) : '—'}
            </p>
          </div>
        </div>
        <div className="min-w-0">
          <div className="min-w-0">
            <p className="text-[9px] font-medium tracking-[0.16em] text-white/45 uppercase">
              Monthly limit
            </p>
            {budget && (
              <p className="money mt-1 text-sm font-medium text-white/80">
                {formatMinor(budget.amount_minor)}
              </p>
            )}
          </div>
          {budget ? null : settingBudget ? (
            <div className="mt-2 flex w-fit items-center gap-2">
              <Input
                aria-label="Monthly limit"
                inputMode="decimal"
                value={amountInput}
                onChange={(event) => {
                  setAmountInput(event.target.value)
                  setAmount(toMinor(event.target.value))
                }}
                placeholder="Amount"
                className="h-9 w-28 px-2 py-0 text-xs"
              />
              <Button
                size="icon"
                variant="outline"
                className="size-9"
                aria-label={`Save ${categoryName} budget`}
                onClick={() => void saveBudget()}
                disabled={amount <= 0}
              >
                <Check size={16} />
              </Button>
            </div>
          ) : (
            <div className="mt-2">
              <Button size="sm" variant="outline" onClick={() => setSettingBudget(true)}>
                Set budget
              </Button>
            </div>
          )}
        </div>
        {saveError && <p className="text-sm text-destructive">{saveError}</p>}
        {budget && remainder !== null && remainder < 0 && (
          <p className="text-xs text-destructive">
            Over budget by {formatMinor(Math.abs(remainder))}
          </p>
        )}
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
