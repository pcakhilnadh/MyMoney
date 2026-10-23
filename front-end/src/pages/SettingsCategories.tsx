import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, Eye, EyeOff, Plus, Trash2 } from 'lucide-react'
import { Button, Input, ListItem, PageHeader, SegmentedControl } from '@/components/kit'
import { categoriesRepo } from '@/db/repos'
import type { CategoryType } from '@/db/types'

const CATEGORY_TYPES: { value: CategoryType; label: string }[] = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
  { value: 'transfer', label: 'Transfer' },
]

export default function SettingsCategories() {
  const categories = useLiveQuery(() => categoriesRepo.list(), []) ?? []
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState<CategoryType>('expense')

  async function add() {
    await categoriesRepo.create({
      name: name.trim(),
      icon: 'tag',
      color: null,
      transaction_type: type,
      is_system: false,
      is_hidden: false,
    })
    setName('')
    setShowForm(false)
  }

  async function deleteCategory(id: string, categoryName: string) {
    if (
      !window.confirm(
        `Delete the "${categoryName}" category, all its transactions, and its budgets?`,
      )
    ) {
      return
    }

    try {
      await categoriesRepo.removeWithTransactions(id)
    } catch (error) {
      console.error(`Unable to delete category "${categoryName}"`, error)
      window.alert(`Unable to delete "${categoryName}". Please try again.`)
    }
  }

  const shown = categories
    .filter((category) => category.transaction_type === type)
    .sort((a, b) => a.name.localeCompare(b.name))
  const duplicateName = shown.some(
    (category) => category.name.toLocaleLowerCase() === name.trim().toLocaleLowerCase(),
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        {showForm ? (
          <button
            type="button"
            onClick={() => {
              setName('')
              setShowForm(false)
            }}
            className="flex items-center gap-1 text-sm font-medium text-muted-foreground"
          >
            <ArrowLeft size={18} />
            Back
          </button>
        ) : (
          <PageHeader title="Categories" />
        )}
        {showForm ? (
          <span className="text-sm font-medium text-muted-foreground">New category</span>
        ) : (
          <button
            type="button"
            aria-label="Add category"
            onClick={() => setShowForm(true)}
            className="gloss flex size-10 items-center justify-center rounded-full text-primary-foreground"
          >
            <Plus size={21} />
          </button>
        )}
      </div>
      <SegmentedControl
        options={CATEGORY_TYPES.map((item) => item.label)}
        value={CATEGORY_TYPES.find((item) => item.value === type)!.label}
        onChange={(label) => {
          setType(CATEGORY_TYPES.find((item) => item.label === label)!.value)
          setName('')
        }}
      />
      <p className="text-sm text-muted-foreground">
        {type === 'expense'
          ? 'Default categories cannot be deleted. Deleting a custom category also deletes its transactions and budgets.'
          : 'Refunds use expense categories. Default categories cannot be deleted. Deleting a custom category also deletes its transactions and budgets.'}
      </p>
      {showForm ? (
        <>
          <div className="surface flex gap-2 rounded-card p-4">
            <Input
              placeholder={`New ${type} category`}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Button disabled={!name.trim() || duplicateName} onClick={() => void add()}>
              Add
            </Button>
          </div>
          {duplicateName && (
            <p className="text-sm text-destructive">A category with this name already exists.</p>
          )}
        </>
      ) : (
        <>
          {shown.map((category) => (
            <ListItem
              key={category.id}
              title={category.name}
              subtitle={`${category.is_system ? 'Default' : 'Custom'}${category.is_hidden ? ' · Hidden' : ''}`}
              trailing={
                <span className="flex items-center gap-4">
                  <button
                    aria-label={`${category.is_hidden ? 'Show' : 'Hide'} ${category.name}`}
                    onClick={() =>
                      void categoriesRepo.update(category.id, { is_hidden: !category.is_hidden })
                    }
                  >
                    {category.is_hidden ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                  {!category.is_system && (
                    <button
                      aria-label={`Delete ${category.name}`}
                      onClick={() => void deleteCategory(category.id, category.name)}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </span>
              }
            />
          ))}
        </>
      )}
    </div>
  )
}
