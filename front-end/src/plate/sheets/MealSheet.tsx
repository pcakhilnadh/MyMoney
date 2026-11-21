import { useState, type ReactNode } from 'react'
import {
  CalendarDays,
  ChefHat,
  Check,
  Link2,
  ListChecks,
  Minus,
  Plus,
  Recycle,
  ShoppingCart,
  Trash2,
  Users,
  UtensilsCrossed,
  X,
} from 'lucide-react'
import { useDialog } from '@/components/DialogProvider'
import { cn } from '@/lib/utils'
import * as api from '../api'
import { usePlate, type PlateSheet } from '../context'
import { toast } from '../toast'
import { addDays, formatDay, todayKey, weekStart } from '../dates'
import {
  useGroceries,
  useIdeas,
  useKitchens,
  useMe,
  useMeals,
  usePeople,
  usePlateMutation,
} from '../hooks'
import {
  AISLE_ICON,
  guessAisle,
  mealLabel,
  orderKitchens,
  SLOT_LABEL,
  SLOT_ORDER,
  sortIdeas,
} from '../logic'
import type { ChefType, Idea, Kitchen, Meal, MealDraft, MealSlot } from '../types'
import { Avatar, Chip, ErrorLine, PlateSelect, RoundCheck, Sheet } from '../ui'

type Props = Extract<PlateSheet, { kind: 'meal' }>

export function MealSheet(props: Props) {
  const { close } = usePlate()
  const kitchens = useKitchens().data
  if (!kitchens) return null
  return <MealForm {...props} kitchens={kitchens} onClose={close} />
}

const rank = (meal: Pick<Meal, 'meal_date' | 'meal_slot'>) =>
  `${meal.meal_date}|${SLOT_ORDER.indexOf(meal.meal_slot)}`

type PlannedMeal = MealDraft & { id?: string; from_idea_id?: string | null }

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/**
 * Plan or edit a meal in one go: when, the dish, who, pre-prep and what to buy. One Save
 * stores the meal, its prep and its cart items together. Leftovers are picked from the
 * kitchen's recent meals instead of being cooked.
 */
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
  // My id can still be loading on first render; until a cook is picked, it's me.
  const cook = chefUser || me
  const [attendees, setAttendees] = useState<string[]>(meal?.attendees ?? memberIds)
  const [guests, setGuests] = useState(meal?.guest_count ?? 0)
  const [recipeUrl, setRecipeUrl] = useState(meal?.recipe_url ?? fromIdea?.recipe_url ?? '')
  const [tasks, setTasks] = useState<{ id?: string; title: string }[]>(
    meal?.prep_tasks.map((t) => ({ id: t.id, title: t.title })) ?? [],
  )
  const [toBuy, setToBuy] = useState<string[]>([])
  // The craving this meal is planned from (picked here, or "Plan it" on Cravings).
  const [craving, setCraving] = useState<Idea | null>(
    fromIdea && fromIdea.id !== 'import' ? fromIdea : null,
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
  // This kitchen's cravings, most wanted first, to pick the dish from.
  const cravings = sortIdeas(
    (useIdeas().data ?? []).filter((idea) => idea.group_id === kitchen.id),
    kitchens,
  ).slice(0, 8)
  const inCart = (useGroceries().data ?? []).filter((item) => meal && item.meal_plan_id === meal.id)

  const save = usePlateMutation(({ draft, items }: { draft: PlannedMeal; items: string[] }) =>
    api.saveMealWithCart(draft, items),
  )
  const remove = usePlateMutation(api.deleteMeal)

  const solo = kitchen.is_personal
  const isLeftovers = leftoverOf !== null
  const cooking = !isLeftovers && chefType !== 'TAKEOUT' && chefType !== 'EATING_OUT'
  const slots = SLOT_ORDER.filter((s) => kitchen.meal_slots.includes(s) || s === mealSlot)
  const days = Array.from({ length: 14 }, (_, i) => addDays(weekStart(mealDate), i))
  const servings = (solo ? 1 : attendees.length) + guests
  const prepCount = cooking ? tasks.filter((t) => t.title.trim()).length : 0
  const buyCount = cooking ? toBuy.filter((t) => t.trim()).length : 0

  function switchKitchen(next: Kitchen) {
    setGroupId(next.id)
    setAttendees(next.members.map((m) => m.user_id))
    setLeftoverOf(null)
    if (next.is_personal && chefType === 'TOGETHER') setChefType('MEMBER')
    if (!next.is_personal && chefType === 'EATING_OUT') setChefType('MEMBER')
    if (!next.members.some((m) => m.user_id === chefUser)) setChefUser(me)
    if (!next.meal_slots.includes(mealSlot)) setMealSlot(next.meal_slots[0] ?? 'D')
  }

  function chooseLeftovers(on: boolean) {
    if (!on) {
      setLeftoverOf(null)
      return
    }
    const source = candidates[0]
    if (source) pickSource(source)
  }

  function pickSource(source: Meal) {
    setLeftoverOf(source.id)
    setTitle(`${source.title.replace(/ [(]leftovers[)]$/, '')} (leftovers)`)
    setSides(source.sides)
  }

  function pickCraving(idea: Idea) {
    setTitle(idea.title)
    if (idea.recipe_url) setRecipeUrl(idea.recipe_url)
    setCraving(idea)
    toast(`${idea.title} added from your cravings`, '😋')
  }

  function draft(): PlannedMeal {
    return {
      id: meal?.id,
      group_id: kitchen.id,
      meal_date: mealDate,
      meal_slot: mealSlot,
      title,
      sides,
      leftover_of: leftoverOf,
      chef_type: chefType,
      chef_user_id: chefType === 'MEMBER' ? cook : null,
      attendees: solo ? [me] : attendees,
      guest_count: guests,
      recipe_url: recipeUrl || null,
      // Only while the dish is still that craving; renaming it keeps the craving.
      from_idea_id: craving && title.trim() === craving.title ? craving.id : null,
      prep_tasks: cooking ? tasks.filter((t) => t.title.trim()) : [],
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const planned = draft()
    save.mutate(
      { draft: planned, items: cooking ? toBuy : [] },
      {
        onSuccess: () => {
          if (planned.from_idea_id) toast(`${title.trim()} planned · off your cravings`, '✅')
          onClose()
        },
      },
    )
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
  const others = attendees.filter((id) => id !== me)
  const people = solo
    ? ['You']
    : [...(attendees.includes(me) ? ['You'] : []), ...others.map((id) => nameOf(id))]
  const eatingLine =
    people.length === 0 && guests === 0
      ? 'Nobody yet: pick who’s eating'
      : [
          people.length ? people.join(', ').replace(/, ([^,]*)$/, ' and $1') : '',
          guests ? plural(guests, 'guest') : '',
        ]
          .filter(Boolean)
          .join(' + ')
  const summary = [
    isLeftovers ? 'leftovers' : 'the meal',
    prepCount > 0 && plural(prepCount, 'prep step'),
    buyCount > 0 && `${buyCount} to buy`,
  ].filter(Boolean)

  return (
    <Sheet
      eyebrow={`${kitchen.emoji} ${kitchen.name}`}
      title={meal ? 'Edit meal' : 'Plan a meal'}
      onClose={onClose}
      footer={
        <div className="space-y-2">
          <p className="text-center text-xs text-muted-foreground" aria-live="polite">
            Saves {summary.join(' · ')}
          </p>
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
            <button
              type="submit"
              form="meal-form"
              disabled={save.isPending || !title.trim()}
              className="pl-btn pl-btn-primary flex-1 rounded-full"
            >
              {meal ? 'Save changes' : 'Save meal'}
            </button>
          </div>
        </div>
      }
    >
      <form id="meal-form" onSubmit={submit} className="space-y-4">
        <Card icon={<CalendarDays size={16} />} title="When">
          {!meal && kitchens.length > 1 && (
            <PlateSelect
              label="Kitchen"
              value={kitchen.id}
              onChange={(id) => {
                const next = kitchens.find((k) => k.id === id)
                if (next) switchKitchen(next)
              }}
              options={orderKitchens(kitchens, null).map((k) => ({
                value: k.id,
                label: `${k.emoji} ${k.name}`,
              }))}
            />
          )}
          <PlateSelect
            label="Day"
            value={mealDate}
            onChange={setMealDate}
            options={days.map((day) => ({
              value: day,
              label: formatDay(day, { weekday: 'long', day: 'numeric', month: 'short' }),
            }))}
          />
          <div
            role="radiogroup"
            aria-label="Meal"
            className="pl-well grid gap-1 p-1"
            style={{ gridTemplateColumns: `repeat(${slots.length}, minmax(0, 1fr))` }}
          >
            {slots.map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={s === mealSlot}
                onClick={() => setMealSlot(s)}
                className={cn(
                  'h-9 rounded-[10px] text-[13px] font-semibold transition-colors',
                  s === mealSlot
                    ? 'bg-primary text-white shadow-[0_6px_14px_-8px_var(--primary)]'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {SLOT_LABEL[s]}
              </button>
            ))}
          </div>
        </Card>

        {(candidates.length > 0 || isLeftovers) && (
          <Card icon={<Recycle size={16} />} title="Leftovers" tone="green">
            <label className="flex cursor-pointer items-center gap-3">
              <RoundCheck checked={isLeftovers} onChange={chooseLeftovers} label="Eat leftovers" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold">Eat leftovers</span>
                <span className="block text-xs text-muted-foreground">
                  From a recent meal · nothing to cook or buy
                </span>
              </span>
            </label>
            {isLeftovers && (
              <ul role="radiogroup" aria-label="Leftovers of" className="space-y-1.5">
                {candidates.map((m) => {
                  const on = m.id === leftoverOf
                  return (
                    <li key={m.id}>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => pickSource(m)}
                        className={cn(
                          'pl-well flex w-full items-center gap-3 px-3 py-2.5 text-left',
                          on && 'border-[#4cc38a]/60',
                        )}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{m.title}</span>
                          <span className="block text-xs text-muted-foreground">
                            {mealLabel(m)}
                          </span>
                        </span>
                        {on && <Check size={17} className="shrink-0 text-[#4cc38a]" />}
                      </button>
                    </li>
                  )
                })}
                {leftoverOf && !candidates.some((m) => m.id === leftoverOf) && (
                  <li className="pl-well px-3 py-2.5 text-sm text-muted-foreground">
                    From an earlier meal
                  </li>
                )}
              </ul>
            )}
          </Card>
        )}

        {!isLeftovers && (
          <Card icon={<UtensilsCrossed size={16} />} title="What’s cooking">
            <MainDish
              value={title}
              onChange={setTitle}
              cravings={cravings}
              showVotes={!solo}
              onPick={pickCraving}
              autoFocus={!meal && !fromIdea}
            />
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground">
                Side dishes <span className="font-normal">· optional</span>
              </p>
              <ItemList
                items={sides}
                onChange={setSides}
                itemLabel={(i) => `Side dish ${i + 1}`}
                placeholder="e.g. Jeera rice, salad, papad"
                addLabel="Add side dish"
              />
            </div>
            <div className="pl-well flex items-center gap-2 px-3">
              <Link2 size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />
              <input
                aria-label="Recipe link"
                type="url"
                inputMode="url"
                className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                placeholder="Recipe link (optional)"
                value={recipeUrl}
                onChange={(e) => setRecipeUrl(e.target.value)}
              />
            </div>
          </Card>
        )}

        <Card icon={<Users size={16} />} title="Who’s eating" aside={plural(servings, 'serving')}>
          <p className="text-sm font-semibold" aria-live="polite">
            {eatingLine}
          </p>
          {!solo && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {memberIds.map((id) => {
                  const eating = attendees.includes(id)
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={eating}
                      aria-label={`${nameOf(id)} is eating`}
                      onClick={() =>
                        setAttendees(
                          eating ? attendees.filter((a) => a !== id) : [...attendees, id],
                        )
                      }
                      className={cn(
                        'flex h-10 items-center gap-2 rounded-full pr-3 pl-1 text-sm font-medium transition-colors',
                        eating ? 'bg-primary/20 ring-1 ring-primary/60' : 'pl-well opacity-60',
                      )}
                    >
                      <Avatar userId={id} size={30} />
                      {id === me ? 'You' : nameOf(id)}
                      {eating ? (
                        <Check size={15} className="text-[#ff8a95]" aria-hidden="true" />
                      ) : null}
                    </button>
                  )
                })}
              </div>
              <p className="text-xs text-muted-foreground">Tap someone to include or skip them.</p>
            </div>
          )}
          <div className="pl-well flex items-center gap-3 py-2 pr-2 pl-3.5">
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">Guests</span>
              <span className="block text-xs text-muted-foreground">
                People joining who aren’t in {solo ? 'your kitchen' : kitchen.name}
              </span>
            </span>
            <div className="flex items-center gap-1">
              <StepButton label="Fewer guests" onClick={() => setGuests(Math.max(0, guests - 1))}>
                <Minus size={15} />
              </StepButton>
              <span className="w-7 text-center font-semibold tabular-nums" aria-live="polite">
                {guests}
              </span>
              <StepButton label="More guests" onClick={() => setGuests(guests + 1)}>
                <Plus size={15} />
              </StepButton>
            </div>
          </div>
        </Card>

        {!isLeftovers && (
          <Card icon={<ChefHat size={16} />} title="Who’s cooking">
            <div role="radiogroup" aria-label="Who’s cooking" className="flex flex-wrap gap-2">
              {cookOptions.map((option) => {
                const selected =
                  option.value === chefType && (option.value !== 'MEMBER' || option.user === cook)
                return (
                  <Chip
                    key={`${option.value}-${option.user ?? ''}`}
                    selected={selected}
                    role="radio"
                    aria-checked={selected}
                    aria-pressed={undefined}
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
            <p className="text-xs text-muted-foreground">
              {chefType === 'TAKEOUT'
                ? 'Ordering in: nothing to prep or buy.'
                : chefType === 'EATING_OUT'
                  ? 'Eating out: nothing to prep or buy.'
                  : chefType === 'TOGETHER'
                    ? 'Everyone eating cooks together and shares the prep.'
                    : `${cook === me ? 'You get' : `${nameOf(cook)} gets`} the prep checklist.`}
            </p>
          </Card>
        )}

        {cooking && (
          <Card icon={<ListChecks size={16} />} title="Pre-prep" aside="Evening before">
            <ItemList
              items={tasks.map((t) => t.title)}
              onChange={(titles) =>
                setTasks(titles.map((t, i) => ({ id: tasks[i]?.id, title: t })))
              }
              itemLabel={(i) => `Prep step ${i + 1}`}
              placeholder="e.g. Soak rajma overnight"
              addLabel="Add prep step"
            />
            <p className="text-xs text-muted-foreground">
              {solo
                ? 'On your checklist the evening before.'
                : chefType === 'TOGETHER'
                  ? 'On everyone eating’s checklist. Ticks sync.'
                  : `On ${cook === me ? 'your' : `${nameOf(cook)}’s`} checklist the evening before.`}
            </p>
          </Card>
        )}

        {cooking && (
          <Card icon={<ShoppingCart size={16} />} title="To buy" aside="Goes to the cart">
            {inCart.length > 0 && (
              <ul aria-label="Already in the cart" className="space-y-1">
                {inCart.map((item) => (
                  <li
                    key={item.id}
                    className={cn(
                      'flex items-center gap-2 px-1 text-sm',
                      item.checked_at && 'text-muted-foreground line-through',
                    )}
                  >
                    <span aria-hidden="true">{AISLE_ICON[item.aisle]}</span>
                    <span className="min-w-0 flex-1 truncate">{item.name}</span>
                    <span className="text-xs text-muted-foreground">In cart</span>
                  </li>
                ))}
              </ul>
            )}
            <ItemList
              items={toBuy}
              onChange={setToBuy}
              itemLabel={(i) => `Item to buy ${i + 1}`}
              placeholder="e.g. Paneer 400g"
              addLabel="Add item to buy"
              trailing={(value) =>
                value.trim() ? (
                  <span className="pl-chip shrink-0" title={guessAisle(value)}>
                    {AISLE_ICON[guessAisle(value)]}
                  </span>
                ) : null
              }
            />
          </Card>
        )}

        <ErrorLine error={save.error ?? remove.error} />
      </form>
    </Sheet>
  )
}

/**
 * The main dish, with cravings one tap away: a small 😋 count opens them under the field, and
 * typing a dish that's a craving offers it. Nothing shows when the kitchen has no cravings.
 */
function MainDish({
  value,
  onChange,
  cravings,
  showVotes,
  onPick,
  autoFocus,
}: {
  value: string
  onChange: (value: string) => void
  cravings: Idea[]
  showVotes: boolean
  onPick: (idea: Idea) => void
  autoFocus: boolean
}) {
  const [open, setOpen] = useState(false)
  const typed = value.trim().toLowerCase()
  const chosen = cravings.find((idea) => idea.title.toLowerCase() === typed)
  const suggestion =
    !open && !chosen && typed.length >= 2
      ? cravings.find((idea) => idea.title.toLowerCase().includes(typed))
      : undefined
  const pick = (idea: Idea) => {
    onPick(idea)
    setOpen(false)
  }

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold text-muted-foreground">Main dish</p>
      <div className="pl-well flex items-center gap-2 pr-2">
        <input
          aria-label="Main dish"
          className="h-14 min-w-0 flex-1 bg-transparent px-4 text-lg font-semibold outline-none placeholder:font-normal placeholder:text-muted-foreground"
          placeholder="e.g. Rajma chawal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          autoFocus={autoFocus}
        />
        {cravings.length > 0 && (
          <button
            type="button"
            aria-label={`Pick from cravings (${cravings.length})`}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            className={cn(
              'flex h-8 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-bold tabular-nums transition-colors',
              chosen
                ? 'bg-[#f5c542] text-[#2a1a05]'
                : 'bg-[#f5c542]/12 text-[#f6d77a] ring-1 ring-[#f5c542]/30 hover:bg-[#f5c542]/20',
            )}
          >
            <span aria-hidden="true">😋</span>
            {chosen ? <Check size={13} strokeWidth={3} /> : cravings.length}
          </button>
        )}
      </div>

      {open && (
        <ul
          aria-label="Your cravings"
          className="pl-well animate-in divide-y divide-white/[0.05] duration-150 fade-in-0 slide-in-from-top-1"
        >
          {cravings.map((idea) => (
            <li key={idea.id}>
              <button
                type="button"
                onClick={() => pick(idea)}
                className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left hover:bg-white/[0.03]"
              >
                <span aria-hidden="true">😋</span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{idea.title}</span>
                {idea.recipe_url && (
                  <Link2
                    size={13}
                    className="shrink-0 text-muted-foreground"
                    aria-label="Has a recipe"
                  />
                )}
                {showVotes && idea.votes.length > 0 && (
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {idea.votes.length} vote{idea.votes.length === 1 ? '' : 's'}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {suggestion && (
        <button
          type="button"
          onClick={() => pick(suggestion)}
          className="flex w-full items-center gap-2 px-1 text-left text-xs text-[#f6d77a] animate-in fade-in-0"
        >
          <span aria-hidden="true">😋</span>
          <span className="min-w-0 flex-1 truncate">
            <b className="font-semibold">{suggestion.title}</b> is on your cravings
          </span>
          <span className="shrink-0 font-semibold">Use</span>
        </button>
      )}
    </div>
  )
}

/** A raised section with a small icon heading. */
function Card({
  icon,
  title,
  aside,
  tone,
  children,
}: {
  icon: ReactNode
  title: string
  aside?: string
  tone?: 'green'
  children: ReactNode
}) {
  return (
    <section aria-label={title} className="pl-raised space-y-3 p-4">
      <h3 className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className={cn(
            'flex size-7 items-center justify-center rounded-[9px]',
            tone === 'green' ? 'bg-[#3f9d6a]/20 text-[#7fdca7]' : 'bg-primary/15 text-[#ff8a95]',
          )}
        >
          {icon}
        </span>
        <span className="text-[13px] font-bold tracking-[0.06em] uppercase">{title}</span>
        {aside && (
          <span className="ml-auto text-xs font-medium text-muted-foreground">{aside}</span>
        )}
      </h3>
      {children}
    </section>
  )
}

/** Rows in a well, each removable, with an add button. Enter on a row adds the next. */
function ItemList({
  items,
  onChange,
  itemLabel,
  placeholder,
  addLabel,
  trailing,
}: {
  items: string[]
  onChange: (items: string[]) => void
  itemLabel: (index: number) => string
  placeholder: string
  addLabel: string
  trailing?: (value: string) => ReactNode
}) {
  return (
    <div className="space-y-2">
      {items.length > 0 && (
        <ul className="pl-well divide-y divide-white/[0.05]">
          {items.map((value, index) => (
            <li key={index} className="flex items-center gap-2 pr-1.5 pl-3">
              <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-primary/70" />
              <input
                aria-label={itemLabel(index)}
                className="h-11 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
                placeholder={placeholder}
                value={value}
                autoFocus={index === items.length - 1 && value === ''}
                onChange={(e) => onChange(items.map((v, i) => (i === index ? e.target.value : v)))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    if (value.trim()) onChange([...items, ''])
                  }
                }}
              />
              {trailing?.(value)}
              <button
                type="button"
                aria-label={`Remove ${value || itemLabel(index).toLowerCase()}`}
                onClick={() => onChange(items.filter((_, i) => i !== index))}
                className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-white/5 hover:text-foreground"
              >
                <X size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={() => onChange([...items, ''])}
        className="flex h-10 w-full items-center justify-center gap-1.5 rounded-[12px] border border-dashed border-white/15 text-sm font-semibold text-[#ff8a95] hover:bg-white/[0.03]"
      >
        <Plus size={15} /> {addLabel}
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
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex size-8 items-center justify-center rounded-[9px] bg-white/[0.08] hover:bg-white/[0.12]"
    >
      {children}
    </button>
  )
}
