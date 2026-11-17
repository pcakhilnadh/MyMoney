import { useState } from 'react'
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import {
  Button,
  CurrencyInput,
  MetalActionButton,
  MetalBadge,
  MetalCard,
  PageHeader,
  SectionTitle,
} from '@/components/kit'
import { AllocationInput } from '@/components/AllocationInput'
import { db } from '@/db/db'
import { budgetsRepo, categoriesRepo, transactionsRepo } from '@/db/repos'
import type { Budget, Category } from '@/db/types'
import { formatMinor } from '@/lib/money'
import {
  TOTAL_BUDGET_NAME,
  allocationError,
  categoryBudgets,
  findTotalBudget,
  totalAllocated,
  totalBudgetError,
} from '@/lib/budget'
import { currentMonth } from '@/lib/summary'
import { useCurrency } from '@/money/CurrencyContext'

export default function Budgets() {
  const { currency } = useCurrency()
  const allBudgets = useLiveQuery(() => budgetsRepo.list(), []) ?? []
  const totalBudget = findTotalBudget(allBudgets)
  const budgets = categoryBudgets(allBudgets)
  const txs = useLiveQuery(() => transactionsRepo.list(), []) ?? []
  const cats = useLiveQuery(() => db.categories.toArray(), []) ?? []
  // The monthly-budget form replaces the list; category allocations are edited inline in the list.
  const [showForm, setShowForm] = useState(false)
  const [amount, setAmount] = useState(0)
  // Which category card has its inline allocation form open: a budget id, or `new:<categoryId>`.
  const [inlineKey, setInlineKey] = useState<string | null>(null)
  const [inlineAmount, setInlineAmount] = useState(0)
  const month = currentMonth()
  const allocated = totalAllocated(allBudgets)
  const formError = showForm && amount > 0 ? totalBudgetError(allBudgets, amount) : null
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
    setShowForm(false)
  }

  function closeInline() {
    setInlineKey(null)
    setInlineAmount(0)
  }

  function editTotal() {
    closeInline()
    setAmount(totalBudget?.amount_minor ?? 0)
    setShowForm(true)
  }

  async function saveTotal() {
    if (totalBudgetError(allBudgets, amount)) return
    const values = {
      group_id: null,
      category_id: null,
      name: TOTAL_BUDGET_NAME,
      amount_minor: amount,
      currency,
      period: 'monthly' as const,
      period_start: `${month}-01`,
      period_end: null,
      alert_threshold_percent: 80,
      is_active: true,
    }
    if (totalBudget) await budgetsRepo.update(totalBudget.id, values)
    else await budgetsRepo.create(values)
    resetForm()
  }

  async function deleteCategory(category: Category) {
    if (
      !window.confirm(
        `Delete the "${category.name}" category, all its transactions, and its budgets?`,
      )
    ) {
      return
    }

    try {
      await categoriesRepo.removeWithTransactions(category.id)
    } catch (error) {
      console.error(`Unable to delete category "${category.name}"`, error)
      window.alert(`Unable to delete "${category.name}". Please try again.`)
    }
  }

  function openNewAllocation(categoryId: string) {
    if (!totalBudget) return
    setInlineKey(`new:${categoryId}`)
    setInlineAmount(0)
  }

  function openEditAllocation(budget: Budget) {
    setInlineKey(budget.id)
    setInlineAmount(budget.amount_minor)
  }

  /** Saves the open inline form. `category` is only needed when creating. */
  async function saveAllocation(category?: Category) {
    if (inlineAmount <= 0) return
    const existingId = inlineKey && !inlineKey.startsWith('new:') ? inlineKey : null
    if (allocationError(allBudgets, inlineAmount, existingId)) return

    if (existingId) {
      await budgetsRepo.update(existingId, { amount_minor: inlineAmount, currency })
    } else if (category) {
      await budgetsRepo.create({
        group_id: null,
        category_id: category.id,
        name: category.name,
        amount_minor: inlineAmount,
        currency,
        period: 'monthly',
        period_start: `${month}-01`,
        period_end: null,
        alert_threshold_percent: 80,
        is_active: true,
      })
    }
    closeInline()
  }

  /** The inline allocation form with a live check against the monthly budget. */
  function renderAllocationForm(args: { category?: Category; budgetId?: string }) {
    const { category, budgetId } = args
    const error = inlineAmount > 0 ? allocationError(allBudgets, inlineAmount, budgetId) : null
    const available = totalBudget
      ? Math.max(totalBudget.amount_minor - totalAllocated(allBudgets, budgetId), 0)
      : 0
    return (
      <div className="space-y-3 border-t border-white/10 pt-4">
        <AllocationInput
          value={inlineAmount}
          onChange={setInlineAmount}
          total={totalBudget?.amount_minor ?? 0}
          available={available}
          currency={currency}
        />
        <p className="text-xs text-muted-foreground">
          {formatMinor(available, currency)} of the monthly budget is available to allocate.
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <Button
            className="flex-1"
            disabled={inlineAmount <= 0 || error !== null}
            onClick={() => void saveAllocation(category)}
          >
            {budgetId ? 'Save Budget' : 'Add Budget'}
          </Button>
          <Button variant="outline" className="flex-1" onClick={closeInline}>
            Cancel
          </Button>
        </div>
        {budgetId && (
          <Button
            variant="destructive"
            className="w-full"
            onClick={() => void deleteBudget(budgetId)}
          >
            Delete budget
          </Button>
        )}
      </div>
    )
  }

  async function deleteBudget(id: string) {
    const budget = budgets.find((item) => item.id === id)
    if (!budget || !window.confirm(`Delete the "${budget.name}" budget?`)) return

    try {
      await budgetsRepo.remove(id)
      closeInline()
    } catch (error) {
      console.error(`Unable to delete budget "${budget.name}"`, error)
      window.alert(`Unable to delete the "${budget.name}" budget. Please try again.`)
    }
  }

  function renderBudgetCard(b: (typeof budgets)[number]) {
    const categoryId = b.category_id ?? cats.find((item) => item.name === b.name)?.id
    const category = cats.find((item) => item.id === categoryId)
    const used = spent(categoryId ?? null)
    const progress = Math.min(Math.max((used / b.amount_minor) * 100, 0), 100)
    const overBudget = used > b.amount_minor
    const remaining = Math.max(b.amount_minor - used, 0)
    const categoryPath = categoryId ? `/money/budgets/categories/${categoryId}` : null
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
              {formatMinor(overBudget ? used - b.amount_minor : remaining, currency)}
            </p>
          </div>
          <div className="shrink-0 border-l border-white/10 pb-0.5 pl-4 text-right">
            <p className="text-[9px] font-medium tracking-[0.16em] text-white/45 uppercase">
              Monthly limit
            </p>
            <p className="money mt-1 text-sm font-medium text-white/80">
              {formatMinor(b.amount_minor, currency)}
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
              <span className="font-medium text-foreground">{formatMinor(used, currency)}</span>{' '}
              spent
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
            <MetalActionButton label={`Edit ${b.name}`} onClick={() => openEditAllocation(b)}>
              <Pencil size={15} />
            </MetalActionButton>
            {category && !category.is_system && (
              <MetalActionButton
                label={`Delete category ${category.name}`}
                onClick={() => void deleteCategory(category)}
                destructive
              >
                <Trash2 size={15} />
              </MetalActionButton>
            )}
          </div>
        </header>

        {inlineKey === b.id ? (
          renderAllocationForm({ budgetId: b.id })
        ) : categoryPath ? (
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
          <span className="text-sm font-medium text-muted-foreground">Monthly budget</span>
        ) : null}
      </div>
      {showForm ? (
        <div className="surface space-y-3 rounded-card p-5">
          <SectionTitle>Monthly Budget</SectionTitle>
          <CurrencyInput label="Monthly budget" value={amount} onChange={setAmount} />
          {allocated > 0 && (
            <p className="text-xs text-muted-foreground">
              {formatMinor(allocated, currency)} is already allocated to categories.
            </p>
          )}
          {formError && <p className="text-sm text-destructive">{formError}</p>}
          <Button
            className="w-full"
            disabled={amount <= 0 || formError !== null}
            onClick={() => void saveTotal()}
          >
            Save monthly budget
          </Button>
          <Button variant="outline" className="w-full" onClick={resetForm}>
            Cancel
          </Button>
        </div>
      ) : (
        <>
          <MetalCard className="space-y-4 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[9px] font-medium tracking-[0.16em] text-white/45 uppercase">
                  Monthly budget
                </p>
                <p className="money mt-1 truncate text-lg font-semibold">
                  {totalBudget ? formatMinor(totalBudget.amount_minor, currency) : 'Not set'}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 whitespace-nowrap"
                onClick={editTotal}
                aria-label={totalBudget ? 'Edit monthly budget' : 'Set monthly budget'}
              >
                {totalBudget ? 'Edit' : 'Set monthly budget'}
              </Button>
            </div>
            {totalBudget ? (
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div>
                  <p className="text-muted-foreground">Spent</p>
                  <p className="money font-medium">{formatMinor(spent(null), currency)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Allocated</p>
                  <p className="money font-medium">{formatMinor(allocated, currency)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Unallocated</p>
                  <p className="money font-medium">
                    {formatMinor(Math.max(totalBudget.amount_minor - allocated, 0), currency)}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Set a monthly budget first, then allocate portions of it to categories.
              </p>
            )}
            {totalBudget && allocated > totalBudget.amount_minor && (
              <p className="text-xs text-destructive">
                Allocations exceed the monthly budget by{' '}
                {formatMinor(allocated - totalBudget.amount_minor, currency)}. Increase the monthly
                budget.
              </p>
            )}
          </MetalCard>
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
            const canSetBudget = item.status === 'active' && !item.is_hidden && !!totalBudget

            const formOpen = inlineKey === `new:${item.id}`

            return (
              <MetalCard key={item.id} className="p-0">
                <div className="flex w-full items-center justify-between gap-3 p-4">
                  <Link
                    to={`/money/budgets/categories/${item.id}`}
                    aria-label={`Open ${item.name} budget details`}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <MetalBadge label={item.name} />
                    <div className="min-w-0">
                      <h2 className="truncate font-semibold">{item.name}</h2>
                      {categoryTransactions.length > 0 && (
                        <p className="money mt-1 text-xs text-muted-foreground">
                          {formatMinor(spent(item.id), currency)} spent this month
                        </p>
                      )}
                    </div>
                  </Link>
                  {canSetBudget && !formOpen && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="ml-auto shrink-0 whitespace-nowrap"
                      onClick={() => openNewAllocation(item.id)}
                      aria-label={`Set ${item.name} budget`}
                    >
                      Set budget
                    </Button>
                  )}
                  {!item.is_system && (
                    <MetalActionButton
                      label={`Delete category ${item.name}`}
                      onClick={() => void deleteCategory(item)}
                      destructive
                    >
                      <Trash2 size={15} />
                    </MetalActionButton>
                  )}
                </div>
                {formOpen && (
                  <div className="px-4 pb-4">{renderAllocationForm({ category: item })}</div>
                )}
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
