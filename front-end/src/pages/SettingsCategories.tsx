import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Trash2 } from 'lucide-react'
import { Button, Input, ListItem, PageHeader } from '@/components/kit'
import { categoriesRepo } from '@/db/repos'

export default function SettingsCategories() {
  const categories = useLiveQuery(() => categoriesRepo.list(), []) ?? []
  const [name, setName] = useState('')

  async function add() {
    await categoriesRepo.create({
      name: name.trim(),
      icon: 'tag',
      color: null,
      transaction_type: 'expense',
      is_system: false,
    })
    setName('')
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Categories" />
      {categories.map((c) => (
        <ListItem
          key={c.id}
          title={c.name}
          subtitle={c.is_system ? 'Default' : 'Custom'}
          trailing={
            !c.is_system && (
              <button aria-label={`Delete ${c.name}`} onClick={() => categoriesRepo.remove(c.id)}>
                <Trash2 size={16} />
              </button>
            )
          }
        />
      ))}
      <div className="surface flex gap-2 rounded-card p-4">
        <Input placeholder="New category" value={name} onChange={(e) => setName(e.target.value)} />
        <Button disabled={!name.trim()} onClick={add}>
          Add
        </Button>
      </div>
    </div>
  )
}
