import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import * as api from '@/plate/api'
import { usePlate } from '@/plate/context'
import { CookChip, EatingLine, SectionLabel } from '@/plate/components'
import { addDays, formatDay, todayKey, weekStart } from '@/plate/dates'
import { useGroceries, useKitchens, useMe, useMeals, usePlateMutation } from '@/plate/hooks'
import {
  leftToBuy,
  mealsIAmEating,
  mealsLeftThisWeek,
  prepChecklist,
  prepProgress,
  sidesText,
  SLOT_LABEL,
} from '@/plate/logic'
import { LiveDot } from '@/plate/shopping'
import type { Kitchen, Meal } from '@/plate/types'
import { Avatar, Checkbox, ErrorLine, KitchenChip, KitchenDot } from '@/plate/ui'

export default function PlateToday() {
  const me = useMe()
  const today = todayKey()
  const tomorrow = addDays(today, 1)
  const weekEnd = addDays(weekStart(today), 6)
  const kitchens = useKitchens().data
  // Today through the end of the week, plus tomorrow when today is Sunday.
  const meals = useMeals(today, weekEnd > tomorrow ? weekEnd : tomorrow).data
  const groceries = useGroceries().data
  // Anyone (me included) shopping in a shared kitchen right now.
  const shoppingNow = (kitchens ?? []).filter((k) => !k.is_personal && k.shopping_now.length)

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[13px] font-medium text-muted-foreground">
            {formatDay(today, { weekday: 'long', day: 'numeric', month: 'short' })}
          </p>
          <h1 className="text-[28px] leading-tight font-bold">Today</h1>
        </div>
      </header>

      {!kitchens || !meals || !groceries ? (
        <p className="text-sm text-muted-foreground">Loading your day…</p>
      ) : (
        <>
          <PrepChecklist
            meals={prepChecklist(meals, tomorrow, me)}
            kitchens={kitchens}
            tomorrow={tomorrow}
          />

          <div className="grid grid-cols-2 gap-3">
            <Link to="/plate/cart" className="pl-card block p-4 hover:bg-white/[0.07]">
              <p className="flex items-center justify-between gap-2">
                <span className="text-2xl font-bold tabular-nums">
                  {leftToBuy(groceries).length}
                </span>
                {shoppingNow.length > 0 && (
                  <span className="flex items-center gap-1.5 text-[11px] font-bold tracking-wider text-[#7fdca7] uppercase">
                    <LiveDot className="size-2" /> Live
                  </span>
                )}
              </p>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                to buy · {kitchens.length} kitchen{kitchens.length === 1 ? '' : 's'}
              </p>
            </Link>
            <Link to="/plate/plan" className="pl-card block p-4 hover:bg-white/[0.07]">
              <p className="text-2xl font-bold tabular-nums">
                {mealsLeftThisWeek(meals, today, weekEnd, me)}
              </p>
              <p className="mt-0.5 text-[13px] text-muted-foreground">meals left this week</p>
            </Link>
          </div>

          <OnYourPlate meals={mealsIAmEating(meals, today, me)} kitchens={kitchens} today={today} />
        </>
      )}
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

  return (
    <section aria-labelledby="prep-title" className="pl-card-accent p-4">
      <div className="flex items-center justify-between gap-2">
        <h2
          id="prep-title"
          className="text-xs font-bold tracking-[0.08em] text-[#ff6b78] uppercase"
        >
          Pre-prep checklist
        </h2>
        {progress.total > 0 && (
          <span className="rounded-full bg-black/30 px-2.5 py-0.5 text-xs font-semibold tabular-nums">
            {progress.done}/{progress.total} done
          </span>
        )}
      </div>
      <p className="mt-1 text-[13px] text-muted-foreground">
        For tomorrow, {formatDay(tomorrow, { weekday: 'short', day: 'numeric' })} · from every
        kitchen you cook in
      </p>

      {progress.total > 0 ? (
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
      ) : (
        <p className="mt-3 text-sm text-foreground/80">
          Nothing to prep for tomorrow. Add pre-prep to a meal, like soaking rajma, and it shows up
          here the evening before.
        </p>
      )}

      <ErrorLine error={tick.error} />
    </section>
  )
}

function OnYourPlate({
  meals,
  kitchens,
  today,
}: {
  meals: Meal[]
  kitchens: Kitchen[]
  today: string
}) {
  const { open } = usePlate()
  const kitchenOf = (id: string) => kitchens.find((k) => k.id === id)

  return (
    <section aria-labelledby="plate-today" className="space-y-3">
      <SectionLabel>
        <span id="plate-today">On your plate today</span>
      </SectionLabel>
      {meals.length === 0 ? (
        <div className="pl-card flex items-center justify-between gap-3 p-4">
          <p className="text-sm text-muted-foreground">Nothing planned for today yet.</p>
          <button
            type="button"
            className="pl-btn pl-btn-primary h-9 px-3.5 text-sm"
            onClick={() => open({ kind: 'meal', date: today })}
          >
            Plan a meal
          </button>
        </div>
      ) : (
        <ul className="space-y-3">
          {meals.map((meal) => {
            const kitchen = kitchenOf(meal.group_id)
            const sides = sidesText(meal)
            return (
              <li key={meal.id} className="flex gap-3">
                <span className="pl-label w-[4.5rem] shrink-0 pt-4">
                  {SLOT_LABEL[meal.meal_slot]}
                </span>
                <button
                  type="button"
                  onClick={() => open({ kind: 'meal', meal })}
                  className="pl-card min-w-0 flex-1 p-3.5 text-left hover:bg-white/[0.07]"
                >
                  <span className="flex items-center justify-between gap-2">
                    {kitchen && <KitchenChip kitchen={kitchen} />}
                    <CookChip meal={meal} />
                  </span>
                  <span className="mt-2 block text-[16px] leading-snug font-semibold">
                    {meal.title}
                  </span>
                  {sides && (
                    <span className="mt-0.5 block text-[13px] text-muted-foreground">{sides}</span>
                  )}
                  {kitchen && !kitchen.is_personal && (
                    <span className="mt-2.5 block">
                      <EatingLine meal={meal} />
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
