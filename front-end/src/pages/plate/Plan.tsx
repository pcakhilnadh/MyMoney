import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, CopyPlus, Lightbulb, Plus } from 'lucide-react'
import { useDialog } from '@/components/DialogProvider'
import { cn } from '@/lib/utils'
import * as api from '@/plate/api'
import { usePlate } from '@/plate/context'
import { ContextLine, KitchenTitle, MealCard, SectionLabel } from '@/plate/components'
import { addDays, formatDay, formatWeekTitle, todayKey, weekDays, weekStart } from '@/plate/dates'
import { useIdeas, useKitchens, useMe, useMeals, usePlateMutation } from '@/plate/hooks'
import { byDateThenSlot, cooksIt, inSelection, SLOT_LABEL, SLOT_ORDER } from '@/plate/logic'
import type { MealSlot } from '@/plate/types'
import { ErrorLine, Tabs } from '@/plate/ui'

type View = 'all' | 'mine'

export default function PlatePlan() {
  const me = useMe()
  const dialog = useDialog()
  const { selection, open } = usePlate()
  const today = todayKey()
  const [day, setDay] = useState(today)
  const [view, setView] = useState<View>('all')
  const start = weekStart(day)
  const kitchens = useKitchens().data
  const meals = useMeals(start, addDays(start, 6)).data
  const ideas = inSelection(useIdeas().data ?? [], selection)
  const copyLastWeek = usePlateMutation(api.copyWeek)

  const kitchen = kitchens?.find((k) => k.id === selection)
  const inKitchen = inSelection(meals ?? [], selection).sort(byDateThenSlot)
  const shown = view === 'mine' ? inKitchen.filter((m) => cooksIt(m, me)) : inKitchen
  const slotSet = new Set<MealSlot>(
    (kitchen ? [kitchen] : (kitchens ?? [])).flatMap((k) => k.meal_slots),
  )
  const slots = SLOT_ORDER.filter((slot) => slotSet.has(slot))
  const kitchenOf = (id: string) => kitchens?.find((k) => k.id === id)
  const dayMeals = shown.filter((m) => m.meal_date === day)

  async function onCopyLastWeek() {
    if (!kitchen) return
    const ok = await dialog.confirm({
      title: 'Copy last week?',
      message: `Last week's meals in ${kitchen.name} fill this week's empty slots. Nothing already planned changes.`,
      confirmLabel: 'Copy',
    })
    if (!ok) return
    const { copied } = await copyLastWeek.mutateAsync({
      from_group_id: kitchen.id,
      to_group_id: kitchen.id,
      from_week: addDays(start, -7),
      to_week: start,
    })
    await dialog.notify({
      title: copied ? `Copied ${copied} meal${copied === 1 ? '' : 's'}` : 'Nothing to copy',
      message: copied ? undefined : 'Last week had nothing to fill this week’s empty slots with.',
    })
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <KitchenTitle
          title="Plan"
          mode="plan"
          trailing={
            <Link
              to="/plate/ideas"
              aria-label={`Ideas (${ideas.length})`}
              className="pl-sunken flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold"
            >
              <Lightbulb size={16} aria-hidden="true" />
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] text-white tabular-nums">
                {ideas.length}
              </span>
            </Link>
          }
        />
        <ContextLine
          count={`${inKitchen.length} meal${inKitchen.length === 1 ? '' : 's'} this week`}
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

      <div className="flex items-center justify-between gap-2">
        <Tabs<View>
          label="Show"
          value={view}
          onChange={setView}
          options={[
            { value: 'all', label: 'All meals' },
            { value: 'mine', label: 'My cooking' },
          ]}
        />
        {kitchen && (
          <button
            type="button"
            onClick={() => void onCopyLastWeek()}
            disabled={copyLastWeek.isPending}
            className="flex items-center gap-1.5 text-[13px] font-semibold text-[#ff6b78]"
          >
            <CopyPlus size={15} aria-hidden="true" /> Copy last week
          </button>
        )}
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
      <ErrorLine error={copyLastWeek.error} />

      {!kitchens || !meals ? (
        <p className="text-sm text-muted-foreground">Loading the week…</p>
      ) : view === 'mine' && dayMeals.length === 0 ? (
        <p className="pl-card p-4 text-sm text-muted-foreground">
          Nothing for you to cook on {formatDay(day, { weekday: 'long' })}.
        </p>
      ) : (
        <div className="space-y-5">
          {slots.map((slot) => {
            const inSlot = dayMeals.filter((m) => m.meal_slot === slot)
            if (view === 'mine' && inSlot.length === 0) return null
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
