import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Eye, EyeOff, Trash2 } from 'lucide-react'
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
  }

  const shown = categories.filter((category) => category.transaction_type === type)
  const duplicateName = shown.some(
    (category) => category.name.toLocaleLowerCase() === name.trim().toLocaleLowerCase(),
  )

  return (
    <div className="space-y-4">
      <PageHeader title="Categories" />
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
          ? 'Default expense categories cannot be deleted. Hide unused categories to remove them from transactions and budgets.'
          : 'Refunds use expense categories. Hide unused categories to remove them from transaction entry.'}
      </p>
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
                {category.is_hidden ? <Eye size={16} /> : <EyeOff size={16} />}
              </button>
              {!category.is_system && (
                <button
                  aria-label={`Delete ${category.name}`}
                  onClick={() => void categoriesRepo.remove(category.id)}
                >
                  <Trash2 size={16} />
                </button>
              )}
            </span>
          }
        />
      ))}
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
    </div>
  )
}
