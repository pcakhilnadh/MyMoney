import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Cookie, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePlate } from '@/plate/context'
import { CountBadge } from '@/plate/NavBadge'
import { ContextLine, KitchenTitle, MealCard, SectionLabel } from '@/plate/components'
import { addDays, formatDay, formatWeekTitle, todayKey, weekDays, weekStart } from '@/plate/dates'
import { useIdeas, useKitchens, useMeals } from '@/plate/hooks'
import { byDateThenSlot, inSelection, SLOT_LABEL, SLOT_ORDER } from '@/plate/logic'
import type { MealSlot } from '@/plate/types'

export default function PlatePlan() {
  const { selection, open } = usePlate()
  const today = todayKey()
  // Today's week view can open Plan on a chosen day.
  const opened = (useLocation().state as { day?: string } | null)?.day
  const [day, setDay] = useState(opened ?? today)
  const start = weekStart(day)
  const kitchens = useKitchens().data
  const meals = useMeals(start, addDays(start, 6)).data
  const ideas = inSelection(useIdeas().data ?? [], selection)

  const kitchen = kitchens?.find((k) => k.id === selection)
  const inKitchen = inSelection(meals ?? [], selection).sort(byDateThenSlot)
  const shown = inKitchen
  const slotSet = new Set<MealSlot>(
    (kitchen ? [kitchen] : (kitchens ?? [])).flatMap((k) => k.meal_slots),
  )
  const slots = SLOT_ORDER.filter((slot) => slotSet.has(slot))
  const kitchenOf = (id: string) => kitchens?.find((k) => k.id === id)
  const dayMeals = shown.filter((m) => m.meal_date === day)

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <KitchenTitle
          title="Plan"
          mode="plan"
          trailing={
            <Link
              to="/plate/cravings"
              aria-label={ideas.length ? `Cravings, ${ideas.length}` : 'Cravings'}
              className="pl-raised relative flex size-10 items-center justify-center rounded-full"
            >
              <Cookie size={18} aria-hidden="true" className="text-[#ff8a95]" />
              <CountBadge count={ideas.length} label={`${ideas.length} cravings`} />
            </Link>
          }
        />
        <ContextLine
          count={
            inKitchen.length
              ? `${inKitchen.length} meal${inKitchen.length === 1 ? '' : 's'} this week`
              : ''
          }
        />
      </div>

      <div className="pl-card flex items-center justify-between p-1">
        <WeekButton label="Previous week" onClick={() => setDay(addDays(day, -7))}>
          <ChevronLeft size={18} />
        </WeekButton>
        <button
          type="button"
          onClick={() => setDay(today)}
          className="text-[15px] font-semibold"
          aria-label={`Week of ${formatWeekTitle(start)}. Go to today`}
        >
          {formatWeekTitle(start)}
        </button>
        <WeekButton label="Next week" onClick={() => setDay(addDays(day, 7))}>
          <ChevronRight size={18} />
        </WeekButton>
      </div>

      <div role="tablist" aria-label="Day" className="grid grid-cols-7 gap-1.5">
        {weekDays(start).map((d) => {
          const selected = d === day
          const planned = new Set(shown.filter((m) => m.meal_date === d).map((m) => m.meal_slot))
          return (
            <button
              key={d}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-label={formatDay(d, { weekday: 'long', day: 'numeric', month: 'long' })}
              onClick={() => setDay(d)}
              className={cn(
                'flex flex-col items-center gap-1 rounded-[12px] py-2 transition-colors',
                selected ? 'bg-primary text-white' : 'pl-card hover:bg-white/[0.08]',
              )}
            >
              <span className={cn('text-[11px] font-medium', !selected && 'text-muted-foreground')}>
                {formatDay(d, { weekday: 'short' })}
              </span>
              <span className="text-[17px] leading-none font-bold tabular-nums">
                {formatDay(d, { day: 'numeric' })}
              </span>
              <span aria-hidden="true" className="flex h-1.5 gap-0.5">
                {slots.map((slot) => (
                  <span
                    key={slot}
                    className={cn(
                      'size-1 rounded-full',
                      planned.has(slot)
                        ? selected
                          ? 'bg-white'
                          : 'bg-[#ff6b78]'
                        : selected
                          ? 'bg-white/35'
                          : 'bg-white/20',
                    )}
                  />
                ))}
              </span>
            </button>
          )
        })}
      </div>

      {!kitchens || !meals ? (
        <p className="text-sm text-muted-foreground">Loading the week…</p>
      ) : (
        <div className="space-y-5">
          {slots.map((slot) => {
            const inSlot = dayMeals.filter((m) => m.meal_slot === slot)
            const canAdd = !kitchen || inSlot.length === 0
            const add = () => open({ kind: 'meal', kitchenId: kitchen?.id, date: day, slot })
            return (
              <section key={slot} aria-label={SLOT_LABEL[slot]} className="space-y-2">
                <SectionLabel
                  action={
                    canAdd && (
                      <button
                        type="button"
                        onClick={add}
                        aria-label={`Add ${SLOT_LABEL[slot].toLowerCase()}`}
                        className="text-[13px] font-semibold text-[#ff6b78]"
                      >
                        + Add
                      </button>
                    )
                  }
                >
                  {SLOT_LABEL[slot]}
                </SectionLabel>
                {inSlot.length === 0 ? (
                  <button
                    type="button"
                    onClick={add}
                    className="flex h-16 w-full items-center gap-2 rounded-[16px] border border-dashed border-white/15 px-4 text-[15px] text-muted-foreground hover:border-white/30 hover:text-foreground"
                  >
                    <Plus size={17} aria-hidden="true" /> Add a dish
                  </button>
                ) : (
                  inSlot.map((meal) => (
                    <MealCard
                      key={meal.id}
                      meal={meal}
                      kitchen={kitchenOf(meal.group_id)}
                      showKitchen={!kitchen}
                    />
                  ))
                )}
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}

function WeekButton({
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
      className="flex size-10 items-center justify-center rounded-[12px] text-muted-foreground hover:bg-white/5 hover:text-foreground"
    >
      {children}
    </button>
  )
}
