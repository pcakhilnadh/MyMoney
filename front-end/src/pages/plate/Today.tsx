import { Link, useNavigate } from 'react-router-dom'
import { ChevronRight, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import * as api from '@/plate/api'
import { usePlate } from '@/plate/context'
import { CookChip } from '@/plate/components'
import { addDays, formatDay, todayKey, weekDays, weekStart } from '@/plate/dates'
import {
  useGroceries,
  useIdeas,
  useKitchens,
  useMe,
  useMeals,
  usePeople,
  usePlateMutation,
} from '@/plate/hooks'
import {
  byDateThenSlot,
  leftToBuy,
  mealLabel,
  mealsIAmEating,
  nextEmptySlot,
  prepChecklist,
  prepProgress,
  sidesText,
  SLOT_LABEL,
  SLOT_ORDER,
  sortIdeas,
} from '@/plate/logic'
import { LiveDot } from '@/plate/shopping'
import type { Idea, Kitchen, Meal, MealSlot } from '@/plate/types'
import { Avatar, Checkbox, ErrorLine, KitchenChip, KitchenDot } from '@/plate/ui'

/** Roughly when each meal happens, and when it's over for the day (24h clock). */
const SLOT_TIME: Record<MealSlot, { label: string; until: number }> = {
  B: { label: '8 AM', until: 10.5 },
  L: { label: '1 PM', until: 15 },
  S: { label: '5 PM', until: 18.5 },
  D: { label: '8 PM', until: 24 },
}

const SLOT_EMOJI: Record<MealSlot, string> = { B: '🌅', L: '☀️', S: '🍪', D: '🌙' }

export default function PlateToday() {
  const me = useMe()
  const now = new Date()
  const hour = now.getHours() + now.getMinutes() / 60
  const today = todayKey()
  const tomorrow = addDays(today, 1)
  const start = weekStart(today)
  const weekEnd = addDays(start, 6)
  const kitchens = useKitchens().data
  // The whole week (for the week view), plus tomorrow when today is Sunday.
  const meals = useMeals(start, weekEnd > tomorrow ? weekEnd : tomorrow).data
  const groceries = useGroceries().data
  const ideas = useIdeas().data

  if (!kitchens || !meals || !groceries) {
    return (
      <div className="space-y-1">
        <h1 className="text-[28px] leading-tight font-bold">Today</h1>
        <p className="text-sm text-muted-foreground">Loading your day…</p>
      </div>
    )
  }

  // The meals I plan for: every slot any of my kitchens uses.
  const slots = SLOT_ORDER.filter((s) => kitchens.some((k) => k.meal_slots.includes(s)))
  const mine = mealsIAmEating(meals, today, me)
  const nextSlot = slots.find((s) => SLOT_TIME[s].until > hour)
  const next = nextSlot
    ? { date: today, slot: nextSlot, meal: mine.find((m) => m.meal_slot === nextSlot) }
    : {
        date: tomorrow,
        slot: slots[0] ?? 'B',
        meal: mealsIAmEating(meals, tomorrow, me).find((m) => m.meal_slot === slots[0]),
      }
  const shoppers = kitchens.flatMap((k) =>
    k.is_personal ? [] : k.shopping_now.filter((u) => u !== me).map((u) => ({ u, k })),
  )
  const topCraving = sortIdeas(ideas ?? [], kitchens)[0]

  return (
    <div className="space-y-5">
      <Hero today={today} next={next} kitchens={kitchens} />

      {shoppers.length > 0 && <ShoppingNow shoppers={shoppers} multiple={kitchens.length > 1} />}

      <PrepChecklist
        meals={prepChecklist(meals, tomorrow, me)}
        kitchens={kitchens}
        tomorrow={tomorrow}
      />

      <Timeline meals={mine} slots={slots} hour={hour} today={today} kitchens={kitchens} />

      {topCraving && (
        <CravingNudge idea={topCraving} meals={meals} kitchens={kitchens} tomorrow={tomorrow} />
      )}

      <WeekGlance meals={meals} start={start} today={today} slots={slots} me={me} />

      <QuickTiles
        toBuy={leftToBuy(groceries).length}
        live={kitchens.some((k) => !k.is_personal && k.shopping_now.length > 0)}
        cravings={ideas?.length ?? 0}
        topCraving={topCraving}
      />
    </div>
  )
}

// ─── Hero: what's next ───────────────────────────────────────────────────────────────────

function Hero({
  today,
  next,
  kitchens,
}: {
  today: string
  next: { date: string; slot: MealSlot; meal?: Meal }
  kitchens: Kitchen[]
}) {
  const { open } = usePlate()
  const kitchen = next.meal && kitchens.find((k) => k.id === next.meal!.group_id)
  const when = `${next.date === today ? '' : 'Tomorrow · '}${SLOT_LABEL[next.slot]} · ${SLOT_TIME[next.slot].label}`
  const sides = next.meal && sidesText(next.meal)

  return (
    <section aria-label="Up next" className="pl-hero p-5">
      <h1 className="flex items-center gap-2 text-[12px] font-bold tracking-[0.1em] text-white/80 uppercase">
        <span aria-hidden="true">{SLOT_EMOJI[next.slot]}</span> Up next · {when}
      </h1>
      {next.meal ? (
        <button
          type="button"
          onClick={() => open({ kind: 'meal', meal: next.meal })}
          className="mt-2 block w-full text-left"
        >
          <span className="block text-[24px] leading-snug font-bold">{next.meal.title}</span>
          {sides && <span className="block text-sm text-white/75">{sides}</span>}
          <span className="mt-3.5 flex flex-wrap items-center gap-2">
            <CookChip meal={next.meal} />
            {kitchen && kitchens.length > 1 && <KitchenChip kitchen={kitchen} />}
            <span className="pl-chip">
              🍽️ {next.meal.attendees.length + next.meal.guest_count} eating
            </span>
          </span>
        </button>
      ) : (
        <div className="mt-2 space-y-3.5">
          <p className="text-[24px] leading-snug font-bold">
            What’s for {SLOT_LABEL[next.slot].toLowerCase()}?
          </p>
          <button
            type="button"
            onClick={() => open({ kind: 'meal', date: next.date, slot: next.slot })}
            className="pl-btn h-11 rounded-full bg-white px-5 text-sm text-[#b3122a] hover:brightness-95"
          >
            <Plus size={16} /> Plan {SLOT_LABEL[next.slot].toLowerCase()}
          </button>
        </div>
      )}
    </section>
  )
}

// ─── Someone's at the store ──────────────────────────────────────────────────────────────

function ShoppingNow({
  shoppers,
  multiple,
}: {
  shoppers: { u: string; k: Kitchen }[]
  multiple: boolean
}) {
  const { nameOf } = usePeople()
  const { u, k } = shoppers[0]
  return (
    <Link
      to="/plate/cart"
      role="status"
      className="flex items-center gap-3 rounded-[16px] border border-[#3f9d6a]/40 bg-[#3f9d6a]/15 px-4 py-3"
    >
      <LiveDot />
      <Avatar userId={u} size={26} />
      <span className="min-w-0 flex-1 text-sm">
        <b className="font-semibold text-[#c6f0d8]">{nameOf(u)}</b>
        <span className="text-[#9be6bb]">
          {' '}
          is at the store{multiple ? ` · ${k.name}` : ''}
          {shoppers.length > 1 ? ` (+${shoppers.length - 1})` : ''}
        </span>
        <span className="block text-xs text-[#7fbf9a]">Need anything? Add it to the cart now.</span>
      </span>
      <ChevronRight size={18} className="shrink-0 text-[#9be6bb]" aria-hidden="true" />
    </Link>
  )
}

// ─── Today's timeline ────────────────────────────────────────────────────────────────────

function Timeline({
  meals,
  slots,
  hour,
  today,
  kitchens,
}: {
  meals: Meal[]
  slots: MealSlot[]
  hour: number
  today: string
  kitchens: Kitchen[]
}) {
  const { open } = usePlate()
  const planned = slots.filter((s) => meals.some((m) => m.meal_slot === s)).length
  return (
    <section aria-label="Today’s meals" className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <h2 className="pl-label">Today’s meals</h2>
        <span className="text-xs text-muted-foreground">
          {planned} of {slots.length} planned
        </span>
      </div>
      <ol className="relative space-y-2.5 before:absolute before:top-4 before:bottom-4 before:left-[1.05rem] before:w-px before:bg-white/10">
        {slots.map((slot) => {
          const here = meals.filter((m) => m.meal_slot === slot).sort(byDateThenSlot)
          const past = SLOT_TIME[slot].until <= hour
          // A meal time that's gone with nothing planned is just noise.
          if (past && here.length === 0) return null
          return (
            <li key={slot} className={cn('relative flex gap-3', past && 'opacity-55')}>
              <span
                aria-hidden="true"
                className={cn(
                  'relative z-[1] mt-2 flex size-[2.1rem] shrink-0 items-center justify-center rounded-full text-base',
                  here.length ? 'bg-primary/25 ring-1 ring-primary/50' : 'pl-sunken',
                )}
              >
                {SLOT_EMOJI[slot]}
              </span>
              <div className="min-w-0 flex-1 space-y-2">
                {here.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => open({ kind: 'meal', date: today, slot })}
                    className="flex w-full items-center justify-between rounded-[14px] border border-dashed border-white/15 px-3.5 py-3 text-left hover:bg-white/[0.03]"
                  >
                    <span>
                      <span className="block text-[13px] font-semibold text-muted-foreground">
                        {SLOT_LABEL[slot]} · {SLOT_TIME[slot].label}
                      </span>
                      <span className="block text-sm text-muted-foreground/80">
                        Nothing planned
                      </span>
                    </span>
                    <span className="flex items-center gap-1 text-sm font-semibold text-[#ff8a95]">
                      <Plus size={15} /> Plan
                    </span>
                  </button>
                ) : (
                  here.map((meal) => {
                    const kitchen = kitchens.find((k) => k.id === meal.group_id)
                    const sides = sidesText(meal)
                    return (
                      <button
                        key={meal.id}
                        type="button"
                        onClick={() => open({ kind: 'meal', meal })}
                        className="pl-raised relative block w-full overflow-hidden py-3 pr-3 pl-4 text-left"
                      >
                        <span
                          aria-hidden="true"
                          className="absolute inset-y-0 left-0 w-[3px]"
                          style={{ background: kitchen?.color ?? 'var(--primary)' }}
                        />
                        <span className="flex items-center justify-between gap-2">
                          <span className="text-[12px] font-semibold text-muted-foreground">
                            {SLOT_LABEL[slot]} · {SLOT_TIME[slot].label}
                          </span>
                          <CookChip meal={meal} />
                        </span>
                        <span className="mt-1 block text-[16px] leading-snug font-semibold">
                          {meal.title}
                        </span>
                        {sides && (
                          <span className="block text-[13px] text-muted-foreground">{sides}</span>
                        )}
                        {kitchen && kitchens.length > 1 && (
                          <span className="mt-2 block">
                            <KitchenChip kitchen={kitchen} />
                          </span>
                        )}
                      </button>
                    )
                  })
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

// ─── A craving worth planning ────────────────────────────────────────────────────────────

function CravingNudge({
  idea,
  meals,
  kitchens,
  tomorrow,
}: {
  idea: Idea
  meals: Meal[]
  kitchens: Kitchen[]
  tomorrow: string
}) {
  const { open } = usePlate()
  const kitchen = kitchens.find((k) => k.id === idea.group_id)
  if (!kitchen) return null
  const slot = nextEmptySlot(
    meals,
    kitchen,
    Array.from({ length: 6 }, (_, i) => addDays(tomorrow, i)),
  )
  if (!slot) return null
  const votes = kitchen.is_personal ? 0 : idea.votes.length
  return (
    <section aria-label="Craving" className="pl-raised flex items-center gap-3.5 p-4">
      <span
        aria-hidden="true"
        className="flex size-12 shrink-0 items-center justify-center rounded-[14px] bg-[#f5c542]/15 text-2xl"
      >
        😋
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold tracking-[0.1em] text-[#f5c542] uppercase">
          {votes > 1 ? `Craving · ${votes} votes` : 'Craving'}
        </p>
        <p className="truncate text-[15px] font-semibold">{idea.title}</p>
        <p className="text-xs text-muted-foreground">
          Free slot: {mealLabel({ meal_date: slot.date, meal_slot: slot.slot })}
          {kitchens.length > 1 ? ` · ${kitchen.name}` : ''}
        </p>
      </div>
      <button
        type="button"
        onClick={() =>
          open({
            kind: 'meal',
            kitchenId: kitchen.id,
            fromIdea: idea,
            date: slot.date,
            slot: slot.slot,
          })
        }
        className="pl-btn pl-btn-primary h-9 shrink-0 rounded-full px-3.5 text-sm"
      >
        Plan it
      </button>
    </section>
  )
}

// ─── The week at a glance ────────────────────────────────────────────────────────────────

function WeekGlance({
  meals,
  start,
  today,
  slots,
  me,
}: {
  meals: Meal[]
  start: string
  today: string
  slots: MealSlot[]
  me: string
}) {
  const navigate = useNavigate()
  const days = weekDays(start)
  const taken = (day: string) =>
    new Set(
      meals.filter((m) => m.meal_date === day && m.attendees.includes(me)).map((m) => m.meal_slot),
    )
  const total = days.length * slots.length
  const planned = days.reduce((sum, d) => sum + slots.filter((s) => taken(d).has(s)).length, 0)
  const pct = total ? Math.round((planned / total) * 100) : 0

  return (
    <section aria-label="Your week" className="pl-raised space-y-3.5 p-4">
      <div className="flex items-end justify-between gap-2">
        <div>
          <h2 className="text-[15px] font-bold">Your week</h2>
          <p className="text-xs text-muted-foreground">
            {planned} of {total} meals planned
          </p>
        </div>
        <span className="text-[22px] font-bold tabular-nums">{pct}%</span>
      </div>
      <div
        role="progressbar"
        aria-label="Week planned"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={planned}
        className="h-1.5 overflow-hidden rounded-full bg-black/30"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {days.map((day) => {
          const have = taken(day)
          const isToday = day === today
          const past = day < today
          return (
            <button
              key={day}
              type="button"
              onClick={() => navigate('/plate/plan', { state: { day } })}
              aria-label={`${formatDay(day, { weekday: 'long', day: 'numeric', month: 'long' })}: ${have.size} planned. Open in Plan`}
              className={cn(
                'flex flex-col items-center gap-1.5 rounded-[12px] py-2',
                isToday ? 'bg-primary/20 ring-1 ring-primary/50' : 'hover:bg-white/[0.04]',
                past && 'opacity-50',
              )}
            >
              <span className="text-[11px] font-medium text-muted-foreground">
                {formatDay(day, { weekday: 'narrow' })}
              </span>
              <span className="text-[15px] leading-none font-bold tabular-nums">
                {formatDay(day, { day: 'numeric' })}
              </span>
              <span aria-hidden="true" className="flex gap-0.5">
                {slots.map((s) => (
                  <span
                    key={s}
                    className={cn(
                      'size-1 rounded-full',
                      have.has(s) ? 'bg-[#ff6b78]' : 'bg-white/20',
                    )}
                  />
                ))}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

// ─── Quick links ─────────────────────────────────────────────────────────────────────────

function QuickTiles({
  toBuy,
  live,
  cravings,
  topCraving,
}: {
  toBuy: number
  live: boolean
  cravings: number
  topCraving?: Idea
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Link to="/plate/cart" className="pl-raised block p-4">
        <span aria-hidden="true" className="text-xl">
          🛒
        </span>
        <p className="mt-2 flex items-center gap-2">
          <span className="text-[22px] font-bold tabular-nums">{toBuy}</span>
          {live && (
            <span className="flex items-center gap-1 text-[10px] font-bold tracking-wider text-[#7fdca7] uppercase">
              <LiveDot className="size-1.5" /> Live
            </span>
          )}
        </p>
        <p className="text-[13px] text-muted-foreground">{toBuy ? 'to buy' : 'Cart is empty'}</p>
      </Link>
      <Link to="/plate/cravings" className="pl-raised block p-4">
        <span aria-hidden="true" className="text-xl">
          😋
        </span>
        <p className="mt-2 text-[22px] font-bold tabular-nums">{cravings}</p>
        <p className="truncate text-[13px] text-muted-foreground">
          {topCraving ? `Top: ${topCraving.title}` : 'No cravings yet'}
        </p>
      </Link>
    </div>
  )
}

function PrepChecklist({
  meals,
  kitchens,
  tomorrow,
}: {
  meals: Meal[]
  kitchens: Kitchen[]
  tomorrow: string
}) {
  const { open } = usePlate()
  const tick = usePlateMutation(({ id, done }: { id: string; done: boolean }) =>
    api.setPrepTaskDone(id, done),
  )
  const progress = prepProgress(meals)
  const kitchenOf = (id: string) => kitchens.find((k) => k.id === id)

  if (progress.total === 0) {
    // Nothing to do: a quiet, greyed-out line instead of a full card.
    return (
      <section
        aria-labelledby="prep-title"
        className="pl-card flex items-center justify-between gap-2 px-4 py-3 opacity-60"
      >
        <h2
          id="prep-title"
          className="text-xs font-bold tracking-[0.08em] text-muted-foreground uppercase"
        >
          Pre-prep checklist
        </h2>
        <p className="text-[13px] text-muted-foreground">Nothing to prep for tomorrow</p>
      </section>
    )
  }

  return (
    <section aria-labelledby="prep-title" className="pl-card-accent p-4">
      <div className="flex items-center justify-between gap-2">
        <h2
          id="prep-title"
          className="text-xs font-bold tracking-[0.08em] text-[#ff6b78] uppercase"
        >
          Pre-prep checklist
        </h2>
        <span className="rounded-full bg-black/30 px-2.5 py-0.5 text-xs font-semibold tabular-nums">
          {progress.done}/{progress.total} done
        </span>
      </div>
      <p className="mt-1 text-[13px] text-muted-foreground">
        Tomorrow, {formatDay(tomorrow, { weekday: 'short', day: 'numeric' })}
      </p>

      <>
        <div
          role="progressbar"
          aria-label="Prep done"
          aria-valuemin={0}
          aria-valuemax={progress.total}
          aria-valuenow={progress.done}
          className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/30"
        >
          <div
            className="h-full rounded-full bg-[#4cc38a] transition-[width] duration-300"
            style={{ width: `${(progress.done / progress.total) * 100}%` }}
          />
        </div>
        <div className="mt-4 space-y-4">
          {meals.map((meal) => {
            const kitchen = kitchenOf(meal.group_id)
            const shared = kitchen && !kitchen.is_personal
            return (
              <div key={meal.id}>
                <button
                  type="button"
                  onClick={() => open({ kind: 'meal', meal })}
                  className="flex w-full min-w-0 items-center gap-1.5 text-left text-[13px] text-muted-foreground"
                >
                  {kitchen && <KitchenDot color={kitchen.color} />}
                  <span className="min-w-0 truncate">
                    {kitchen && `${kitchen.emoji} ${kitchen.name} · `}
                    {SLOT_LABEL[meal.meal_slot]} ·{' '}
                    <b className="font-semibold text-foreground">{meal.title}</b>
                  </span>
                  <ChevronRight size={15} className="shrink-0" aria-hidden="true" />
                </button>
                <ul className="mt-1">
                  {meal.prep_tasks.map((task) => {
                    const done = !!task.done_at
                    return (
                      <li key={task.id} className="flex min-h-11 items-center gap-3">
                        <Checkbox
                          checked={done}
                          label={task.title}
                          onChange={(next) => tick.mutate({ id: task.id, done: next })}
                        />
                        <span
                          className={cn(
                            'min-w-0 flex-1 text-[15px]',
                            done && 'text-muted-foreground line-through',
                          )}
                        >
                          {task.title}
                        </span>
                        {done && shared && task.done_by && (
                          <Avatar userId={task.done_by} size={22} />
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
        </div>
      </>

      <ErrorLine error={tick.error} />
    </section>
  )
}
