import { useState } from 'react'
import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import * as api from '@/plate/api'
import { usePlate } from '@/plate/context'
import { ContextLine, KitchenTitle, SectionLabel } from '@/plate/components'
import { addDays, todayKey, weekStart } from '@/plate/dates'
import { useGroceries, useKitchens, useMeals, usePeople, usePlateMutation } from '@/plate/hooks'
import {
  AISLE_ICON,
  AISLES,
  groupBy,
  guessAisle,
  inSelection,
  mealLabel,
  orderKitchens,
} from '@/plate/logic'
import { ShoppingPresence } from '@/plate/shopping'
import type { Aisle, GroceryItem, Kitchen, Meal } from '@/plate/types'
import { Avatar, ErrorLine, KitchenDot, RoundCheck, Tabs } from '@/plate/ui'

type Grouping = 'aisle' | 'kitchen'

export default function PlateCart() {
  const { selection, personalId } = usePlate()
  const kitchens = useKitchens().data
  const all = useGroceries().data
  const week = weekStart(todayKey())
  // Items can point at last week's or next week's meals too.
  const meals = useMeals(addDays(week, -7), addDays(week, 13)).data ?? []
  const [grouping, setGrouping] = useState<Grouping>('aisle')
  const [draft, setDraft] = useState('')
  const [aisle, setAisle] = useState<Aisle | 'auto'>('auto')
  const add = usePlateMutation(api.addGrocery)
  const check = usePlateMutation(({ id, checked }: { id: string; checked: boolean }) =>
    api.setGroceryChecked(id, checked),
  )
  const clear = usePlateMutation(api.clearChecked)

  const kitchen = kitchens?.find((k) => k.id === selection)
  const items = inSelection(all ?? [], selection)
  const toBuy = items.filter((i) => !i.checked_at)
  const basket = items.filter((i) => i.checked_at)
  const kitchenOf = (id: string) => kitchens?.find((k) => k.id === id)
  const mealOf = (id: string | null) => (id ? meals.find((m) => m.id === id) : undefined)
  const target = kitchen ?? kitchenOf(personalId ?? '')
  const toBuyByKitchen: Record<string, number> = {}
  for (const item of all ?? []) {
    if (!item.checked_at) toBuyByKitchen[item.group_id] = (toBuyByKitchen[item.group_id] ?? 0) + 1
  }
  const byKitchen = !kitchen && grouping === 'kitchen'
  const groups = byKitchen
    ? groupBy(
        toBuy,
        (i) => i.group_id,
        orderKitchens(kitchens ?? [], null).map((k) => k.id),
      ).map((g) => {
        const k = kitchenOf(g.key)
        return { key: g.key, icon: k?.emoji ?? '', label: k?.name ?? '', rows: g.rows }
      })
    : groupBy(toBuy, (i) => i.aisle, AISLES).map((g) => ({
        key: g.key,
        icon: AISLE_ICON[g.key],
        label: g.key,
        rows: g.rows,
      }))

  function quickAdd(event: React.FormEvent) {
    event.preventDefault()
    if (!target || !draft.trim()) return
    add.mutate(
      { group_id: target.id, name: draft, aisle: aisle === 'auto' ? guessAisle(draft) : aisle },
      {
        onSuccess: () => {
          setDraft('')
          setAisle('auto')
        },
      },
    )
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <KitchenTitle title="Cart" mode="cart" />
        <ContextLine count={`${toBuy.length} to buy`} />
      </div>

      {kitchens && (
        <ShoppingPresence
          kitchens={kitchen ? [kitchen] : kitchens}
          toBuyByKitchen={toBuyByKitchen}
        />
      )}

      {target && (
        <form onSubmit={quickAdd} className="flex gap-2">
          <input
            aria-label={`Add an item to ${target.name}`}
            placeholder={kitchen ? 'Add an item…' : `Add to ${target.name}…`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="pl-input min-w-0 flex-1"
          />
          <select
            aria-label="Aisle"
            value={aisle}
            onChange={(e) => setAisle(e.target.value as Aisle | 'auto')}
            className="pl-input w-[6.25rem] shrink-0 px-3 text-sm"
          >
            <option value="auto">Auto</option>
            {AISLES.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <button
            type="submit"
            aria-label="Add item"
            disabled={!draft.trim() || add.isPending}
            className="pl-btn pl-btn-primary size-[2.875rem] shrink-0 rounded-[12px] px-0"
          >
            <Plus size={20} strokeWidth={2.5} />
          </button>
        </form>
      )}

      {!kitchen && (
        <Tabs<Grouping>
          label="Group the cart"
          value={grouping}
          onChange={setGrouping}
          options={[
            { value: 'aisle', label: 'By aisle' },
            { value: 'kitchen', label: 'By kitchen' },
          ]}
        />
      )}

      {!kitchens || !all ? (
        <p className="text-sm text-muted-foreground">Loading the cart…</p>
      ) : toBuy.length === 0 ? (
        <p className="pl-card p-5 text-center text-sm text-muted-foreground">
          Nothing left to buy.
        </p>
      ) : (
        groups.map((group) => (
          <section key={group.key} aria-label={group.label} className="pl-card px-3.5 pt-3 pb-1">
            <div className="flex items-center justify-between pb-1">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <span aria-hidden="true">{group.icon}</span>
                {group.label}
              </h2>
              <span className="text-xs text-muted-foreground tabular-nums">
                {group.rows.length}
              </span>
            </div>
            <ul className="divide-y divide-white/[0.06]">
              {group.rows.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  meal={mealOf(item.meal_plan_id)}
                  kitchen={kitchenOf(item.group_id)}
                  showKitchen={!kitchen && !byKitchen}
                  onCheck={(checked) => check.mutate({ id: item.id, checked })}
                />
              ))}
            </ul>
          </section>
        ))
      )}

      {basket.length > 0 && (
        <section aria-label="In the basket" className="space-y-2">
          <SectionLabel
            action={
              <button
                type="button"
                onClick={() => clear.mutate([...new Set(basket.map((i) => i.group_id))])}
                className="text-[13px] font-semibold text-[#ff6b78]"
              >
                Clear
              </button>
            }
          >
            In the basket · {basket.length}
          </SectionLabel>
          <ul className="pl-card divide-y divide-white/[0.06] px-3.5">
            {basket.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                meal={mealOf(item.meal_plan_id)}
                kitchen={kitchenOf(item.group_id)}
                showKitchen={!kitchen}
                onCheck={(checked) => check.mutate({ id: item.id, checked })}
              />
            ))}
          </ul>
        </section>
      )}
      <ErrorLine error={add.error ?? check.error ?? clear.error} />
    </div>
  )
}

function ItemRow({
  item,
  meal,
  kitchen,
  showKitchen,
  onCheck,
}: {
  item: GroceryItem
  meal?: Meal
  kitchen?: Kitchen
  showKitchen?: boolean
  onCheck: (checked: boolean) => void
}) {
  const { nameOf } = usePeople()
  const checked = !!item.checked_at
  // Who it's on: whoever put it in the basket, otherwise whoever added it.
  const who = (checked ? item.checked_by : null) ?? item.added_by
  const shared = kitchen && !kitchen.is_personal

  return (
    <li className="flex items-center gap-3 py-2.5">
      <RoundCheck checked={checked} onChange={onCheck} label={item.name} />
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'truncate text-[15px] font-medium',
            checked && 'text-muted-foreground line-through',
          )}
        >
          {item.name}
          {item.quantity && <span className="text-muted-foreground"> · {item.quantity}</span>}
        </p>
        <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          {meal ? (
            <span className="rounded-[6px] bg-primary/20 px-1.5 py-px font-semibold text-[#ff8a94]">
              {mealLabel(meal)}
            </span>
          ) : (
            <span className="rounded-[6px] bg-black/30 px-1.5 py-px font-semibold">Quick Add</span>
          )}
          {showKitchen && kitchen && (
            <>
              <KitchenDot color={kitchen.color} className="size-1.5" />
              <span className="truncate">{kitchen.name}</span>
            </>
          )}
          {shared && !showKitchen && <span className="truncate">· {nameOf(who)}</span>}
        </p>
      </div>
      {shared && <Avatar userId={who} size={26} />}
    </li>
  )
}
