import { useState } from 'react'
import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  Button,
  CategorySelector,
  CurrencyInput,
  ListItem,
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

  const spent = (categoryId: string | null) =>
    txs
      .filter(
        (t) =>
          (t.transaction_type === 'expense' || t.transaction_type === 'refund') &&
          t.transaction_date.startsWith(month) &&
          (!categoryId || t.category_id === categoryId),
      )
      .reduce(
        (n, t) => n + (t.transaction_type === 'expense' ? t.amount_minor : -t.amount_minor),
        0,
      )

  function resetForm() {
    setAmount(0)
    setCategory(null)
    setEditingId(null)
    setShowForm(false)
  }

  function addBudget() {
    setAmount(0)
    setCategory(null)
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
        ) : (
          <button
            type="button"
            aria-label="Add budget"
            onClick={addBudget}
            className="gloss flex size-10 items-center justify-center rounded-full text-primary-foreground"
          >
            <Plus size={21} />
          </button>
        )}
      </div>
      {showForm ? (
        <div className="surface space-y-3 rounded-card p-5">
          <SectionTitle>{editingId ? 'Edit Budget' : 'Add Budget'}</SectionTitle>
          <CurrencyInput label="Monthly limit" value={amount} onChange={setAmount} />
          <CategorySelector
            value={category}
            onChange={setCategory}
            options={cats
              .filter(
                (category) =>
                  category.transaction_type === 'expense' &&
                  category.status === 'active' &&
                  !category.is_hidden,
              )
              .map((c) => c.name)}
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
          {budgets.map((b) => {
            const used = spent(b.category_id)
            const pct = Math.round((used / b.amount_minor) * 100)
            return (
              <div key={b.id} className="space-y-1">
                <ListItem
                  title={b.name}
                  subtitle={`${formatMinor(used)} of ${formatMinor(b.amount_minor)}`}
                  trailing={
                    <span className="flex items-center gap-3">
                      <span>{pct}%</span>
                      <button aria-label={`Edit ${b.name}`} onClick={() => edit(b.id)}>
                        <Pencil size={16} />
                      </button>
                      <button
                        aria-label={`Delete ${b.name}`}
                        onClick={() => {
                          if (window.confirm(`Delete the "${b.name}" budget?`))
                            void budgetsRepo.remove(b.id)
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </span>
                  }
                />
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full ${pct >= 100 ? 'bg-destructive' : 'bg-primary'}`}
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>
              </div>
            )
          })}
          {budgets.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">No budgets yet</p>
          )}
        </>
      )}
    </div>
  )
}
