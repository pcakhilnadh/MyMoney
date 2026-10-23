import { useState } from 'react'
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import {
  Button,
  CategorySelector,
  CurrencyInput,
  MetalActionButton,
  MetalBadge,
  MetalCard,
  PageHeader,
  SectionTitle,
} from '@/components/kit'
import { db } from '@/db/db'
import { budgetsRepo, transactionsRepo } from '@/db/repos'
import { formatMinor } from '@/lib/money'
import { currentMonth } from '@/lib/summary'

export default function Budgets() {
  const budgets = useLiveQuery(() => budgetsRepo.list(), []) ?? []
  const txs = useLiveQuery(() => transactionsRepo.list(), []) ?? []
  const cats = useLiveQuery(() => db.categories.toArray(), []) ?? []
  const [showForm, setShowForm] = useState(false)
  const [amount, setAmount] = useState(0)
  const [category, setCategory] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const month = currentMonth()
  const monthlyTransactions = txs.filter(
    (transaction) =>
      (transaction.transaction_type === 'expense' || transaction.transaction_type === 'refund') &&
      transaction.transaction_date.startsWith(month),
  )
  const monthlyCategoryIds = new Set(
    monthlyTransactions.flatMap((transaction) =>
      transaction.category_id ? [transaction.category_id] : [],
    ),
  )
  const expenseCategories = cats
    .filter(
      (item) =>
        item.transaction_type === 'expense' &&
        item.status !== 'deleted' &&
        ((!item.is_hidden && item.status === 'active') || monthlyCategoryIds.has(item.id)),
    )
    .sort((a, b) => a.name.localeCompare(b.name))
  const matchedBudgetIds = new Set<string>()

  const spent = (categoryId: string | null) =>
    monthlyTransactions
      .filter((transaction) => !categoryId || transaction.category_id === categoryId)
      .reduce(
        (total, transaction) =>
          total +
          (transaction.transaction_type === 'expense'
            ? transaction.amount_minor
            : -transaction.amount_minor),
        0,
      )
  const budgetCategories = [...expenseCategories].sort(
    (a, b) => spent(b.id) - spent(a.id) || a.name.localeCompare(b.name),
  )

  function resetForm() {
    setAmount(0)
    setCategory(null)
    setEditingId(null)
    setShowForm(false)
  }

  function addBudget(categoryName: string | null = null) {
    setAmount(0)
    setCategory(categoryName)
    setEditingId(null)
    setShowForm(true)
  }

  async function save() {
    if (!category || amount <= 0) return

    const values = {
      group_id: null,
      category_id:
        cats.find(
          (c) =>
            c.name === category &&
            c.transaction_type === 'expense' &&
            c.status === 'active' &&
            !c.is_hidden,
        )?.id ?? null,
      name: category,
      amount_minor: amount,
      currency: 'INR',
      period: 'monthly' as const,
      period_start: `${month}-01`,
      period_end: null,
      alert_threshold_percent: 80,
      is_active: true,
    }
    if (editingId) await budgetsRepo.update(editingId, values)
    else await budgetsRepo.create(values)
    resetForm()
  }

  function edit(id: string) {
    const budget = budgets.find((item) => item.id === id)
    if (!budget) return
    setEditingId(id)
    setAmount(budget.amount_minor)
    setCategory(cats.find((c) => c.id === budget.category_id && !c.is_hidden)?.name ?? null)
    setShowForm(true)
  }

  function renderBudgetCard(b: (typeof budgets)[number]) {
    const categoryId = b.category_id ?? cats.find((item) => item.name === b.name)?.id
    const used = spent(categoryId ?? null)
    const progress = Math.min(Math.max((used / b.amount_minor) * 100, 0), 100)
    const overBudget = used > b.amount_minor
    const remaining = Math.max(b.amount_minor - used, 0)
    const categoryPath = categoryId ? `/budgets/categories/${categoryId}` : null
    const summary = (
      <div className="space-y-5 rounded-lg py-1">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p
              className={`text-[9px] font-medium tracking-[0.16em] uppercase ${
                overBudget ? 'text-[#f39da3]' : 'text-white/45'
              }`}
            >
              {overBudget ? 'Over budget by' : 'Left this month'}
            </p>
            <p
              className={`money mt-1 truncate text-sm font-medium ${
                overBudget ? 'text-[#ffd9dc]' : 'text-white/80'
              }`}
            >
              {formatMinor(overBudget ? used - b.amount_minor : remaining)}
            </p>
          </div>
          <div className="shrink-0 border-l border-white/10 pb-0.5 pl-4 text-right">
            <p className="text-[9px] font-medium tracking-[0.16em] text-white/45 uppercase">
              Monthly limit
            </p>
            <p className="money mt-1 text-sm font-medium text-white/80">
              {formatMinor(b.amount_minor)}
            </p>
          </div>
        </div>
        <div className="space-y-2">
          <div
            role="progressbar"
            aria-label={`${b.name} budget used`}
            aria-valuemin={0}
            aria-valuemax={b.amount_minor}
            aria-valuenow={Math.min(Math.max(used, 0), b.amount_minor)}
            className="h-1 overflow-hidden bg-white/10"
          >
            <div
              className={`h-full transition-[width] duration-500 ${
                overBudget ? 'bg-[#f18a91]' : 'bg-[#a7a0ff]'
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="text-muted-foreground">
              <span className="font-medium text-foreground">{formatMinor(used)}</span> spent
            </span>
            <span className="text-muted-foreground">{Math.round(progress)}% used</span>
          </div>
        </div>
      </div>
    )

    return (
      <MetalCard key={b.id} className="space-y-5 p-4">
        <header className="flex items-center justify-between gap-3">
          {categoryPath ? (
            <Link
              to={categoryPath}
              aria-label={`Open ${b.name} budget details`}
              className="flex min-w-0 flex-1 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <MetalBadge label={b.name} />
              <div className="min-w-0">
                <h2 className="truncate font-semibold">{b.name}</h2>
              </div>
            </Link>
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <MetalBadge label={b.name} />
              <div className="min-w-0">
                <h2 className="truncate font-semibold">{b.name}</h2>
              </div>
            </div>
          )}
          <div className="flex shrink-0 items-center gap-1.5">
            <MetalActionButton label={`Edit ${b.name}`} onClick={() => edit(b.id)}>
              <Pencil size={15} />
            </MetalActionButton>
            <MetalActionButton
              label={`Delete ${b.name}`}
              onClick={() => {
                if (window.confirm(`Delete the "${b.name}" budget?`)) void budgetsRepo.remove(b.id)
              }}
              destructive
            >
              <Trash2 size={15} />
            </MetalActionButton>
          </div>
        </header>

        {categoryPath ? (
          <Link
            to={categoryPath}
            aria-label={`View ${b.name} monthly spending`}
            className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {summary}
          </Link>
        ) : (
          summary
        )}
      </MetalCard>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        {showForm ? (
          <button
            type="button"
            onClick={resetForm}
            className="flex items-center gap-1 text-sm font-medium text-muted-foreground"
          >
            <ArrowLeft size={18} />
            Back
          </button>
        ) : (
          <PageHeader title="Budgets" />
        )}
        {showForm ? (
          <span className="text-sm font-medium text-muted-foreground">
            {editingId ? 'Edit budget' : 'New budget'}
          </span>
        ) : null}
      </div>
      {showForm ? (
        <div className="surface space-y-3 rounded-card p-5">
          {editingId && <SectionTitle>Edit Budget</SectionTitle>}
          <CurrencyInput label="Monthly limit" value={amount} onChange={setAmount} />
          <CategorySelector
            value={category}
            onChange={setCategory}
            options={expenseCategories.map((item) => item.name)}
          />
          <Button
            className="w-full"
            disabled={amount <= 0 || !category}
            onClick={() => void save()}
          >
            {editingId ? 'Save Budget' : 'Add Budget'}
          </Button>
          {editingId && (
            <Button variant="outline" className="w-full" onClick={resetForm}>
              Cancel
            </Button>
          )}
        </div>
      ) : (
        <>
          {budgetCategories.map((item) => {
            const budget = budgets.find(
              (entry) =>
                entry.category_id === item.id || (!entry.category_id && entry.name === item.name),
            )
            if (budget) {
              matchedBudgetIds.add(budget.id)
              return renderBudgetCard(budget)
            }
            const categoryTransactions = monthlyTransactions.filter(
              (transaction) => transaction.category_id === item.id,
            )
            const canSetBudget = item.status === 'active' && !item.is_hidden

            return (
              <MetalCard key={item.id} className="p-0">
                <div className="flex w-full items-center justify-between gap-3 p-4">
                  <Link
                    to={`/budgets/categories/${item.id}`}
                    aria-label={`Open ${item.name} budget details`}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <MetalBadge label={item.name} />
                    <div className="min-w-0">
                      <h2 className="truncate font-semibold">{item.name}</h2>
                      {categoryTransactions.length > 0 && (
                        <p className="money mt-1 text-xs text-muted-foreground">
                          {formatMinor(spent(item.id))} spent this month
                        </p>
                      )}
                    </div>
                  </Link>
                  {canSetBudget && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="ml-auto shrink-0 whitespace-nowrap"
                      onClick={() => addBudget(item.name)}
                      aria-label={`Set ${item.name} budget`}
                    >
                      Set budget
                    </Button>
                  )}
                </div>
              </MetalCard>
            )
          })}
          {budgets.filter((item) => !matchedBudgetIds.has(item.id)).map(renderBudgetCard)}
          {expenseCategories.length === 0 && budgets.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No expense categories yet
            </p>
          )}
        </>
      )}
    </div>
  )
}
