import { useState } from 'react'
import { cn } from '@/lib/utils'
import * as api from '../api'
import { usePlate, type PlateSheet, type PlateTab } from '../context'
import { addDays, todayKey, weekDays, weekStart } from '../dates'
import { useKitchens, useMeals, usePlateMutation } from '../hooks'
import { AISLES, guessAisle, mealLabel, nextEmptySlot, orderKitchens } from '../logic'
import type { Aisle, Idea, Kitchen } from '../types'
import { Checkbox, ErrorLine, FieldLabel, PlateSelect, Sheet } from '../ui'

type Action = 'meal' | 'idea' | 'item' | 'invite' | 'newKitchen'

/** Highlighted for the tab you're on; the list itself keeps one order. */
const FIRST_ACTION: Record<PlateTab, Action> = {
  today: 'meal',
  plan: 'meal',
  cart: 'item',
  kitchens: 'newKitchen',
}

/** Kitchen picker used at the top of the create sheet: "Adding to [🏡 Home ▾]". */
function AddingTo({
  kitchens,
  value,
  onChange,
}: {
  kitchens: Kitchen[]
  value: string
  onChange: (id: string) => void
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="shrink-0 text-sm text-muted-foreground">Adding to</span>
      <PlateSelect
        label="Adding to kitchen"
        value={value}
        onChange={onChange}
        options={kitchens.map((k) => ({ value: k.id, label: `${k.emoji} ${k.name}` }))}
      />
    </div>
  )
}

// ─── + sheet ─────────────────────────────────────────────────────────────────────────────

export function CreateSheet({ tab }: { tab: PlateTab }) {
  const { selection, personalId, open, close } = usePlate()
  const kitchens = orderKitchens(useKitchens().data ?? [], null)
  const today = todayKey()
  const upcoming = useMeals(today, addDays(today, 6)).data ?? []
  // The selected kitchen, or My Kitchen when on Today or All.
  const initial = tab === 'today' || selection === 'all' ? personalId : selection
  const [kitchenId, setKitchenId] = useState(initial ?? kitchens[0]?.id)
  const kitchen = kitchens.find((k) => k.id === kitchenId)
  if (!kitchen) return null
  const solo = kitchen.is_personal
  const next = nextEmptySlot(upcoming, kitchen, weekDays(today))

  const actions: Record<Action, { icon: string; label: string; hint: string; sheet: PlateSheet }> =
    {
      meal: {
        icon: '🍽️',
        label: 'Plan a meal',
        hint: next
          ? `Next empty slot in ${kitchen.name}: ${mealLabel({ meal_date: next.date, meal_slot: next.slot })}`
          : `Add to ${kitchen.name}'s week`,
        sheet: { kind: 'meal', kitchenId: kitchen.id, date: next?.date, slot: next?.slot },
      },
      item: {
        icon: '🛒',
        label: 'Add to cart',
        hint: 'For your next shop · aisle picked for you',
        sheet: { kind: 'item', kitchenId: kitchen.id },
      },
      idea: {
        icon: '😋',
        label: 'Suggest a craving',
        hint: solo ? 'Only you see it' : 'Everyone votes on it',
        sheet: { kind: 'idea', kitchenId: kitchen.id },
      },
      invite: {
        icon: '👋',
        label: 'Invite people',
        hint: `By email or a code, to ${kitchen.name}`,
        sheet: { kind: 'invite', kitchenId: kitchen.id },
      },
      newKitchen: {
        icon: '🏡',
        label: 'New kitchen',
        hint: 'Plan with others in a kitchen you share',
        sheet: { kind: 'newKitchen' },
      },
    }
  const first = FIRST_ACTION[tab]
  // My Kitchen can't be shared, so there's nobody to invite there.
  const rows: Action[] = [
    'meal',
    'idea',
    'item',
    ...(solo ? [] : ['invite' as const]),
    'newKitchen',
  ]

  return (
    <Sheet title="Create" onClose={close} bare>
      <AddingTo kitchens={kitchens} value={kitchen.id} onChange={setKitchenId} />
      <ul className="space-y-1">
        {rows.map((action) => {
          const { icon, label, hint, sheet } = actions[action]
          const primary = action === first
          return (
            <li key={action}>
              <button
                type="button"
                onClick={() => open(sheet)}
                className={cn(
                  'flex w-full items-center gap-3.5 rounded-[16px] p-2.5 text-left transition-colors',
                  primary ? 'bg-white/[0.07]' : 'hover:bg-white/[0.04]',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'flex size-11 shrink-0 items-center justify-center rounded-[12px] text-xl',
                    primary ? 'bg-primary' : 'pl-sunken',
                  )}
                >
                  {icon}
                </span>
                <span className="min-w-0">
                  <span className="block text-[15px] font-semibold">{label}</span>
                  <span className="block truncate text-[13px] text-muted-foreground">{hint}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </Sheet>
  )
}

function useKitchen(kitchenId: string) {
  return useKitchens().data?.find((k) => k.id === kitchenId)
}

const eyebrowOf = (kitchen?: Kitchen) => (kitchen ? `${kitchen.emoji} ${kitchen.name}` : undefined)

// ─── Cart item ───────────────────────────────────────────────────────────────────────────

export function ItemSheet({ kitchenId }: { kitchenId: string }) {
  const { close } = usePlate()
  const kitchen = useKitchen(kitchenId)
  const week = weekStart(todayKey())
  const meals = (useMeals(week, addDays(week, 13)).data ?? []).filter(
    (m) => m.group_id === kitchenId && m.meal_date >= todayKey() && !m.leftover_of,
  )
  const [name, setName] = useState('')
  const [aisle, setAisle] = useState<Aisle | 'auto'>('auto')
  const [mealId, setMealId] = useState('')
  const [added, setAdded] = useState<string[]>([])
  const add = usePlateMutation(api.addGrocery)
  const picked = aisle === 'auto' ? guessAisle(name) : aisle

  return (
    <Sheet
      eyebrow={eyebrowOf(kitchen)}
      title="Add to cart"
      onClose={close}
      footer={
        <div className="flex gap-2">
          <button type="button" className="pl-btn pl-btn-secondary flex-1" onClick={close}>
            Done
          </button>
          <button
            type="submit"
            form="item-form"
            className="pl-btn pl-btn-primary flex-1"
            disabled={!name.trim() || add.isPending}
          >
            Add item
          </button>
        </div>
      }
    >
      <form
        id="item-form"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          add.mutate(
            { group_id: kitchenId, name, aisle: picked, meal_plan_id: mealId || null },
            {
              onSuccess: (item) => {
                // Stays open so several items can go in one after another.
                setAdded([item.name, ...added])
                setName('')
                setAisle('auto')
              },
            },
          )
        }}
      >
        <div>
          <FieldLabel htmlFor="item-name">Item</FieldLabel>
          <input
            id="item-name"
            className="pl-input"
            placeholder="e.g. Paneer (400g)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <FieldLabel>Aisle</FieldLabel>
            <PlateSelect
              label="Aisle"
              value={aisle}
              onChange={(next) => setAisle(next as Aisle | 'auto')}
              options={[
                { value: 'auto', label: `Auto${name.trim() ? ` · ${picked}` : ''}` },
                ...AISLES.map((a) => ({ value: a, label: a })),
              ]}
            />
          </div>
          <div>
            <FieldLabel>For</FieldLabel>
            <PlateSelect
              label="For"
              value={mealId || 'quick'}
              onChange={(next) => setMealId(next === 'quick' ? '' : next)}
              options={[
                { value: 'quick', label: 'Quick add' },
                ...meals.map((m) => ({ value: m.id, label: `${mealLabel(m)} · ${m.title}` })),
              ]}
            />
          </div>
        </div>
        {added.length > 0 && (
          <p role="status" className="text-sm text-[#7fdca7]">
            Added {added.slice(0, 3).join(', ')}
            {added.length > 3 ? ` and ${added.length - 3} more` : ''}
          </p>
        )}
        <ErrorLine error={add.error} />
      </form>
    </Sheet>
  )
}

// ─── Idea ────────────────────────────────────────────────────────────────────────────────

export function IdeaSheet({ kitchenId }: { kitchenId: string }) {
  const { close } = usePlate()
  const kitchen = useKitchen(kitchenId)
  const [title, setTitle] = useState('')
  const [link, setLink] = useState('')
  const save = usePlateMutation(api.saveIdea)

  return (
    <Sheet
      eyebrow={eyebrowOf(kitchen)}
      title={kitchen?.is_personal ? 'Add a craving' : 'Suggest a craving'}
      onClose={close}
      footer={
        <button
          type="submit"
          form="idea-form"
          className="pl-btn pl-btn-primary w-full"
          disabled={!title.trim() || save.isPending}
        >
          Save idea
        </button>
      }
    >
      <form
        id="idea-form"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate(
            { group_id: kitchenId, title, recipe_url: link || null },
            { onSuccess: close },
          )
        }}
      >
        <div>
          <FieldLabel htmlFor="idea-title">Dish</FieldLabel>
          <input
            id="idea-title"
            className="pl-input"
            placeholder="e.g. Malai kofta"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
        </div>
        <div>
          <FieldLabel htmlFor="idea-link">Recipe link</FieldLabel>
          <input
            id="idea-link"
            type="url"
            className="pl-input"
            placeholder="Optional"
            value={link}
            onChange={(e) => setLink(e.target.value)}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {kitchen?.is_personal
            ? 'Only you can see your cravings.'
            : 'Your vote is added. The most-voted cravings show first.'}
        </p>
        <ErrorLine error={save.error} />
      </form>
    </Sheet>
  )
}

// ─── Import a recipe ─────────────────────────────────────────────────────────────────────

export function ImportSheet({ kitchenId }: { kitchenId: string }) {
  const { close, open } = usePlate()
  const kitchen = useKitchen(kitchenId)
  const [url, setUrl] = useState('')
  const [recipe, setRecipe] = useState<api.ImportedRecipe | null>(null)
  const [title, setTitle] = useState('')
  const [skipped, setSkipped] = useState<string[]>([])
  const fetchRecipe = usePlateMutation(api.importRecipe)
  const save = usePlateMutation(api.saveIdea)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const chosen = recipe?.ingredients.filter((i) => !skipped.includes(i)) ?? []

  // One mutation for the whole list, so the cart refreshes once at the end.
  const addAll = usePlateMutation(async (names: string[]) => {
    for (const name of names) await api.addGrocery({ group_id: kitchenId, name })
  })

  async function finish(next: 'idea' | 'plan') {
    setBusy(true)
    setError(null)
    try {
      if (chosen.length) await addAll.mutateAsync(chosen)
      if (next === 'idea') {
        await save.mutateAsync({ group_id: kitchenId, title, recipe_url: url })
        close()
      } else {
        const asIdea: Idea = {
          id: 'import',
          group_id: kitchenId,
          title,
          added_by: '',
          votes: [],
          recipe_url: url,
          created_at: '',
        }
        open({ kind: 'meal', kitchenId, fromIdea: asIdea })
      }
    } catch (caught) {
      setError(caught)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet eyebrow={eyebrowOf(kitchen)} title="Import a recipe" onClose={close}>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          fetchRecipe.mutate(url, {
            onSuccess: (found) => {
              setRecipe(found)
              setTitle(found.title)
              setSkipped([])
            },
          })
        }}
      >
        <input
          type="url"
          inputMode="url"
          aria-label="Recipe link"
          placeholder="Paste a recipe link"
          className="pl-input"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value)
            setRecipe(null)
          }}
          autoFocus
        />
        <button
          type="submit"
          className="pl-btn pl-btn-secondary h-[2.875rem] shrink-0 px-4 text-sm"
          disabled={!url.trim() || fetchRecipe.isPending}
        >
          Fetch
        </button>
      </form>
      <ErrorLine error={fetchRecipe.error} />

      {recipe && (
        <>
          <div>
            <FieldLabel htmlFor="import-title">Dish</FieldLabel>
            <input
              id="import-title"
              className="pl-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          {recipe.ingredients.length > 0 ? (
            <div>
              <FieldLabel aside={`${chosen.length} to add`}>Add to cart</FieldLabel>
              <ul className="pl-card divide-y divide-white/[0.06]">
                {recipe.ingredients.map((ingredient) => (
                  <li key={ingredient} className="flex items-center gap-3 px-3.5 py-2.5">
                    <Checkbox
                      label={ingredient}
                      checked={!skipped.includes(ingredient)}
                      onChange={(on) =>
                        setSkipped(
                          on ? skipped.filter((s) => s !== ingredient) : [...skipped, ingredient],
                        )
                      }
                    />
                    <span className="min-w-0 flex-1 text-sm">{ingredient}</span>
                    <span className="text-xs text-muted-foreground">{guessAisle(ingredient)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No ingredient list on that page. You can add items to the cart yourself.
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className="pl-btn pl-btn-secondary"
              disabled={!title.trim() || busy}
              onClick={() => void finish('idea')}
            >
              Save as craving
            </button>
            <button
              type="button"
              className="pl-btn pl-btn-primary"
              disabled={!title.trim() || busy}
              onClick={() => void finish('plan')}
            >
              Plan it
            </button>
          </div>
          <ErrorLine error={error ?? save.error} />
        </>
      )}
    </Sheet>
  )
}
