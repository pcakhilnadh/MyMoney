import { useState } from 'react'
import { Minus, Plus, Recycle, Trash2 } from 'lucide-react'
import { useDialog } from '@/components/DialogProvider'
import { cn } from '@/lib/utils'
import * as api from '../api'
import { usePlate, type PlateSheet } from '../context'
import { addDays, formatDay, todayKey, weekStart } from '../dates'
import { useKitchens, useMe, useMeals, usePeople, usePlateMutation } from '../hooks'
import { mealLabel, orderKitchens, SLOT_LABEL, SLOT_ORDER } from '../logic'
import type { ChefType, Kitchen, Meal, MealDraft, MealSlot } from '../types'
import { Avatar, Chip, ErrorLine, FieldLabel, Sheet, Switch } from '../ui'

type Props = Extract<PlateSheet, { kind: 'meal' }>

export function MealSheet(props: Props) {
  const { close } = usePlate()
  const kitchens = useKitchens().data
  if (!kitchens) return null
  return <MealForm {...props} kitchens={kitchens} onClose={close} />
}

const rank = (meal: Pick<Meal, 'meal_date' | 'meal_slot'>) =>
  `${meal.meal_date}|${SLOT_ORDER.indexOf(meal.meal_slot)}`

function MealForm({
  kitchens,
  kitchenId,
  meal,
  date,
  slot,
  fromIdea,
  onClose,
}: Props & { kitchens: Kitchen[]; onClose: () => void }) {
  const me = useMe()
  const { nameOf } = usePeople()
  const dialog = useDialog()
  const { personalId } = usePlate()
  const startKitchen =
    kitchens.find((k) => k.id === (meal?.group_id ?? fromIdea?.group_id ?? kitchenId)) ??
    kitchens.find((k) => k.id === personalId) ??
    kitchens[0]
  const [groupId, setGroupId] = useState(startKitchen.id)
  const kitchen = kitchens.find((k) => k.id === groupId) ?? startKitchen
  const memberIds = kitchen.members.map((m) => m.user_id)

  const [mealDate, setMealDate] = useState(meal?.meal_date ?? date ?? todayKey())
  const [mealSlot, setMealSlot] = useState<MealSlot>(
    meal?.meal_slot ?? slot ?? kitchen.meal_slots[kitchen.meal_slots.length - 1] ?? 'D',
  )
  const [title, setTitle] = useState(meal?.title ?? fromIdea?.title ?? '')
  const [sides, setSides] = useState<string[]>(meal?.sides ?? [])
  const [leftoverOf, setLeftoverOf] = useState<string | null>(meal?.leftover_of ?? null)
  const [chefType, setChefType] = useState<ChefType>(meal?.chef_type ?? 'MEMBER')
  const [chefUser, setChefUser] = useState(meal?.chef_user_id ?? me)
  const [attendees, setAttendees] = useState<string[]>(meal?.attendees ?? memberIds)
  const [guests, setGuests] = useState(meal?.guest_count ?? 0)
  const [recipeUrl, setRecipeUrl] = useState(meal?.recipe_url ?? fromIdea?.recipe_url ?? '')
  const [tasks, setTasks] = useState<{ id?: string; title: string }[]>(
    meal?.prep_tasks.map((t) => ({ id: t.id, title: t.title })) ?? [],
  )

  // Leftovers can come from anything this kitchen cooked in the three days before.
  const recent = useMeals(addDays(mealDate, -3), mealDate).data ?? []
  const candidates = recent
    .filter(
      (m) =>
        m.group_id === kitchen.id &&
        m.id !== meal?.id &&
        !m.leftover_of &&
        m.chef_type !== 'EATING_OUT' &&
        rank(m) < rank({ meal_date: mealDate, meal_slot: mealSlot }),
    )
    .sort((a, b) => rank(b).localeCompare(rank(a)))

  const save = usePlateMutation(api.saveMeal)
  const leftovers = usePlateMutation(api.planLeftovers)
  const remove = usePlateMutation(api.deleteMeal)

  const solo = kitchen.is_personal
  const isLeftovers = leftoverOf !== null
  const noPrep = isLeftovers || chefType === 'TAKEOUT' || chefType === 'EATING_OUT'
  const slots = SLOT_ORDER.filter((s) => kitchen.meal_slots.includes(s) || s === mealSlot)
  const days = Array.from({ length: 14 }, (_, i) => addDays(weekStart(mealDate), i))
  const servings = (solo ? 1 : attendees.length) + guests

  function switchKitchen(next: Kitchen) {
    setGroupId(next.id)
    setAttendees(next.members.map((m) => m.user_id))
    setLeftoverOf(null)
    if (next.is_personal && chefType === 'TOGETHER') setChefType('MEMBER')
    if (!next.is_personal && chefType === 'EATING_OUT') setChefType('MEMBER')
    if (!next.members.some((m) => m.user_id === chefUser)) setChefUser(me)
    if (!next.meal_slots.includes(mealSlot)) setMealSlot(next.meal_slots[0] ?? 'D')
  }

  function toggleLeftovers(on: boolean) {
    if (!on) return setLeftoverOf(null)
    const source = candidates[0]
    if (source) pickSource(source)
  }

  function pickSource(source: Meal) {
    setLeftoverOf(source.id)
    setTitle(`${source.title.replace(/ [(]leftovers[)]$/, '')} (leftovers)`)
    setSides(source.sides)
  }

  function draft(): MealDraft & { id?: string } {
    return {
      id: meal?.id,
      group_id: kitchen.id,
      meal_date: mealDate,
      meal_slot: mealSlot,
      title,
      sides,
      leftover_of: leftoverOf,
      chef_type: chefType,
      chef_user_id: chefType === 'MEMBER' ? chefUser : null,
      attendees: solo ? [me] : attendees,
      guest_count: guests,
      recipe_url: recipeUrl || null,
      prep_tasks: noPrep ? [] : tasks.filter((t) => t.title.trim()),
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    save.mutate(draft(), { onSuccess: onClose })
  }

  function saveAndPlanLeftovers() {
    save.mutate(draft(), {
      onSuccess: (saved) => leftovers.mutate(saved.id, { onSuccess: onClose }),
    })
  }

  async function onDelete() {
    if (!meal) return
    const ok = await dialog.confirm({
      title: `Remove ${meal.title}?`,
      message: solo ? undefined : `It disappears from ${kitchen.name} for everyone.`,
      confirmLabel: 'Remove',
      tone: 'destructive',
    })
    if (ok) remove.mutate(meal.id, { onSuccess: onClose })
  }

  const cookOptions: { value: ChefType; label: string; user?: string }[] = solo
    ? [
        { value: 'MEMBER', label: 'Me', user: me },
        { value: 'TAKEOUT', label: 'Takeout' },
        { value: 'EATING_OUT', label: 'Eating out' },
      ]
    : [
        ...memberIds.map((id) => ({ value: 'MEMBER' as const, label: nameOf(id), user: id })),
        { value: 'TOGETHER', label: 'Together' },
        { value: 'TAKEOUT', label: 'Takeout' },
      ]
  const busy = save.isPending || leftovers.isPending
  const canPlanLeftovers = !isLeftovers && chefType !== 'EATING_OUT'

  return (
    <Sheet
      eyebrow={`${kitchen.emoji} ${kitchen.name}`}
      title={`${formatDay(mealDate, { weekday: 'short', day: 'numeric' })} · ${SLOT_LABEL[mealSlot]}`}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          {meal && (
            <button
              type="button"
              aria-label="Remove meal"
              onClick={() => void onDelete()}
              className="pl-btn pl-btn-secondary w-12 shrink-0 px-0 text-muted-foreground"
            >
              <Trash2 size={18} />
            </button>
          )}
          {isLeftovers ? (
            <button
              type="submit"
              form="meal-form"
              disabled={busy}
              className="pl-btn pl-btn-success flex-1"
            >
              Save as leftovers
            </button>
          ) : (
            <>
              {canPlanLeftovers && (
                <button
                  type="button"
                  disabled={busy || !title.trim()}
                  onClick={saveAndPlanLeftovers}
                  className="pl-btn pl-btn-secondary flex-1 px-3"
                >
                  Save + leftovers
                </button>
              )}
              <button
                type="submit"
                form="meal-form"
                disabled={busy}
                className="pl-btn pl-btn-primary flex-1"
              >
                Save
              </button>
            </>
          )}
        </div>
      }
    >
      <form id="meal-form" onSubmit={submit} className="space-y-5">
        {!meal && kitchens.length > 1 && (
          <label className="flex items-center gap-3">
            <span className="shrink-0 text-sm text-muted-foreground">Adding to</span>
            <select
              aria-label="Kitchen"
              value={kitchen.id}
              onChange={(e) => {
                const next = kitchens.find((k) => k.id === e.target.value)
                if (next) switchKitchen(next)
              }}
              className="pl-input font-semibold"
            >
              {orderKitchens(kitchens, null).map((k) => (
                <option key={k.id} value={k.id}>
                  {k.emoji} {k.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="grid grid-cols-2 gap-2">
          <select
            aria-label="Day"
            value={mealDate}
            onChange={(e) => setMealDate(e.target.value)}
            className="pl-input text-sm"
          >
            {days.map((day) => (
              <option key={day} value={day}>
                {formatDay(day, { weekday: 'short', day: 'numeric', month: 'short' })}
              </option>
            ))}
          </select>
          <select
            aria-label="Meal"
            value={mealSlot}
            onChange={(e) => setMealSlot(e.target.value as MealSlot)}
            className="pl-input text-sm"
          >
            {slots.map((s) => (
              <option key={s} value={s}>
                {SLOT_LABEL[s]}
              </option>
            ))}
          </select>
        </div>

        {(candidates.length > 0 || isLeftovers) && (
          <div className="space-y-2.5 rounded-[16px] border border-[#3f9d6a]/35 bg-[#3f9d6a]/12 p-3.5">
            <div className="flex items-center gap-3">
              <Recycle size={20} className="shrink-0 text-[#7fdca7]" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[#9be6bb]">
                  Leftovers from an earlier meal
                </p>
                <p className="text-xs text-[#7fbf9a]">Skips buying groceries twice</p>
              </div>
              <Switch
                label="Leftovers from an earlier meal"
                checked={isLeftovers}
                onChange={toggleLeftovers}
              />
            </div>
            {isLeftovers && (
              <select
                aria-label="Leftovers of"
                value={leftoverOf ?? ''}
                onChange={(e) => {
                  const source = candidates.find((m) => m.id === e.target.value)
                  if (source) pickSource(source)
                }}
                className="pl-input text-sm"
              >
                {candidates.map((m) => (
                  <option key={m.id} value={m.id}>
                    {mealLabel(m)} · {m.title}
                  </option>
                ))}
                {leftoverOf && !candidates.some((m) => m.id === leftoverOf) && (
                  <option value={leftoverOf}>An earlier meal</option>
                )}
              </select>
            )}
          </div>
        )}

        <div>
          <FieldLabel htmlFor="meal-title">Main dish</FieldLabel>
          <input
            id="meal-title"
            className="pl-input"
            placeholder="e.g. Rajma chawal"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            autoFocus={!meal && !fromIdea}
          />
        </div>

        <div>
          <FieldLabel>Sides</FieldLabel>
          <EditableList
            items={sides}
            onChange={setSides}
            itemLabel={(i) => `Side ${i + 1}`}
            placeholder="e.g. Naan"
            addLabel="Add side"
          />
        </div>

        <div>
          <FieldLabel aside={`${servings} serving${servings === 1 ? '' : 's'}`}>
            {solo ? 'Guests' : "Who's eating"}
          </FieldLabel>
          <div className="flex items-start gap-4">
            {!solo &&
              memberIds.map((id) => {
                const eating = attendees.includes(id)
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={eating}
                    aria-label={`${nameOf(id)} is eating`}
                    onClick={() =>
                      setAttendees(eating ? attendees.filter((a) => a !== id) : [...attendees, id])
                    }
                    className="flex w-11 flex-col items-center gap-1"
                  >
                    <Avatar
                      userId={id}
                      size={40}
                      className={cn(
                        'transition-opacity',
                        eating
                          ? 'ring-2 ring-white ring-offset-2 ring-offset-[#2a171b]'
                          : 'opacity-40',
                      )}
                    />
                    <span
                      className={cn(
                        'text-xs',
                        eating ? 'text-foreground' : 'text-muted-foreground',
                      )}
                    >
                      {nameOf(id)}
                    </span>
                  </button>
                )
              })}
            {solo && (
              <span className="flex w-11 flex-col items-center gap-1">
                <Avatar userId={me} size={40} />
                <span className="text-xs">You</span>
              </span>
            )}
            <div className="ml-auto flex flex-col items-center gap-1">
              <div className="flex items-center gap-2.5">
                <StepButton label="Fewer guests" onClick={() => setGuests(Math.max(0, guests - 1))}>
                  <Minus size={15} />
                </StepButton>
                <span className="w-4 text-center font-semibold tabular-nums" aria-live="polite">
                  {guests}
                </span>
                <StepButton label="More guests" onClick={() => setGuests(guests + 1)}>
                  <Plus size={15} />
                </StepButton>
              </div>
              <span className="text-xs text-muted-foreground">guests</span>
            </div>
          </div>
        </div>

        <div>
          <FieldLabel>Who's cooking</FieldLabel>
          <div className="flex flex-wrap gap-2">
            {cookOptions.map((option) => {
              const selected =
                option.value === chefType && (option.value !== 'MEMBER' || option.user === chefUser)
              return (
                <Chip
                  key={`${option.value}-${option.user ?? ''}`}
                  selected={selected}
                  onClick={() => {
                    setChefType(option.value)
                    if (option.user) setChefUser(option.user)
                  }}
                  className={option.user ? 'pl-1.5' : undefined}
                >
                  {option.user && <Avatar userId={option.user} size={24} />}
                  {option.label}
                </Chip>
              )
            })}
          </div>
        </div>

        {!noPrep && (
          <div>
            <FieldLabel aside="Day before">Pre-prep</FieldLabel>
            <EditableList
              items={tasks.map((t) => t.title)}
              onChange={(titles) =>
                setTasks(titles.map((t, i) => ({ id: tasks[i]?.id, title: t })))
              }
              itemLabel={(i) => `Prep task ${i + 1}`}
              placeholder="e.g. Soak rajma overnight"
              addLabel="Add task"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              {solo
                ? 'On your checklist the evening before.'
                : chefType === 'TOGETHER'
                  ? "On everyone eating's checklist the evening before. Ticks sync."
                  : `On ${chefUser === me ? 'your' : `${nameOf(chefUser)}'s`} checklist the evening before.`}
            </p>
          </div>
        )}

        <div>
          <FieldLabel htmlFor="meal-recipe">Recipe link</FieldLabel>
          <input
            id="meal-recipe"
            type="url"
            inputMode="url"
            className="pl-input"
            placeholder="Optional"
            value={recipeUrl}
            onChange={(e) => setRecipeUrl(e.target.value)}
          />
        </div>

        <ErrorLine error={save.error ?? leftovers.error ?? remove.error} />
      </form>
    </Sheet>
  )
}

/** Rows of text inputs with a remove button each and an "+ Add" link underneath. */
function EditableList({
  items,
  onChange,
  itemLabel,
  placeholder,
  addLabel,
}: {
  items: string[]
  onChange: (items: string[]) => void
  itemLabel: (index: number) => string
  placeholder: string
  addLabel: string
}) {
  return (
    <div className="space-y-2">
      {items.map((value, index) => (
        <div key={index} className="flex gap-2">
          <input
            aria-label={itemLabel(index)}
            className="pl-input"
            placeholder={placeholder}
            value={value}
            autoFocus={index === items.length - 1 && value === ''}
            onChange={(e) => onChange(items.map((v, i) => (i === index ? e.target.value : v)))}
          />
          <button
            type="button"
            aria-label={`Remove ${value || itemLabel(index).toLowerCase()}`}
            onClick={() => onChange(items.filter((_, i) => i !== index))}
            className="pl-sunken flex size-[2.875rem] shrink-0 items-center justify-center rounded-[12px] text-muted-foreground hover:text-foreground"
          >
            <Trash2 size={16} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...items, ''])}
        className="text-sm font-semibold text-primary"
      >
        + {addLabel}
      </button>
    </div>
  )
}

function StepButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex size-8 items-center justify-center rounded-full bg-white/[0.08] hover:bg-white/[0.12]"
    >
      {children}
    </button>
  )
}
