import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, Heart, Settings, ThumbsUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import * as api from './api'
import { usePlate } from './context'
import { useKitchens, useMe, usePeople, usePlateMutation } from './hooks'
import { KITCHEN_TYPE_LABEL, orderKitchens, sidesText } from './logic'
import type { Kitchen, Meal, Reaction } from './types'
import { Avatar, AvatarStack, KitchenChip, KitchenDot } from './ui'

/** "Plan [● 🏡 Home ★ ▾]": the page title with the kitchen dropdown. Stays one line. */
export function KitchenTitle({
  title,
  mode,
  trailing,
}: {
  title: string
  mode: 'plan' | 'cart'
  trailing?: ReactNode
}) {
  const { selection, open } = usePlate()
  const kitchens = useKitchens().data ?? []
  const kitchen = kitchens.find((k) => k.id === selection)

  return (
    <header className="flex items-center gap-2.5">
      <h1 className="text-[28px] leading-tight font-bold">{title}</h1>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-label={`Kitchen: ${kitchen?.name ?? 'All kitchens'}. Switch kitchen`}
        onClick={() => open({ kind: 'switcher', mode })}
        className="pl-sunken flex h-9 min-w-0 items-center gap-1.5 rounded-full pr-2.5 pl-3 text-sm font-semibold"
      >
        {kitchen ? (
          <>
            <KitchenDot color={kitchen.color} />
            <span aria-hidden="true">{kitchen.emoji}</span>
          </>
        ) : (
          <span aria-hidden="true" className="flex gap-0.5">
            {orderKitchens(kitchens, null)
              .slice(0, 3)
              .map((k) => (
                <KitchenDot key={k.id} color={k.color} className="size-1.5" />
              ))}
          </span>
        )}
        <span className="truncate">{kitchen?.name ?? 'All kitchens'}</span>
        <ChevronDown size={15} aria-hidden="true" className="shrink-0 text-muted-foreground" />
      </button>
      {trailing && <div className="ml-auto shrink-0">{trailing}</div>}
    </header>
  )
}

/** Under the title: type · cooks · count, avatars and settings. In All: a colour legend. */
/** `count` is left empty when there's nothing to count, and then isn't shown. */
export function ContextLine({ count }: { count: string }) {
  const { selection } = usePlate()
  const kitchens = useKitchens().data ?? []
  const kitchen = kitchens.find((k) => k.id === selection)

  if (!kitchen) {
    return (
      <div className="flex min-h-7 flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
        {orderKitchens(kitchens, null).map((k) => (
          <span key={k.id} className="inline-flex items-center gap-1.5">
            <KitchenDot color={k.color} />
            {k.name}
          </span>
        ))}
        {count && <span className="ml-auto text-foreground/80">{count}</span>}
      </div>
    )
  }

  return (
    <div className="flex min-h-7 items-center gap-2 text-[13px] text-muted-foreground">
      <span className="min-w-0 flex-1 truncate">
        {KITCHEN_TYPE_LABEL[kitchen.group_type]} ·{' '}
        {kitchen.is_personal ? 'private' : `${kitchen.members.length} cooks`}
        {count && ` · ${count}`}
      </span>
      {!kitchen.is_personal && <AvatarStack userIds={kitchen.members.map((m) => m.user_id)} />}
      <Link
        to={`/plate/kitchens/${kitchen.id}`}
        aria-label={`${kitchen.name} settings`}
        className="flex size-8 items-center justify-center rounded-[10px] hover:bg-white/5 hover:text-foreground"
      >
        <Settings size={17} />
      </Link>
    </div>
  )
}

export function SectionLabel({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 className="pl-label">{children}</h2>
      {action}
    </div>
  )
}

/** "🧑‍🍳 Me", "🍲 Together", "🛍️ Takeout", or the cook's avatar and name. */
export function CookChip({ meal }: { meal: Meal }) {
  const me = useMe()
  const { nameOf } = usePeople()
  if (meal.chef_type === 'TOGETHER') return <span className="pl-chip">🍲 Together</span>
  if (meal.chef_type === 'TAKEOUT') return <span className="pl-chip">🛍️ Takeout</span>
  if (meal.chef_type === 'EATING_OUT') return <span className="pl-chip">🍽️ Eating out</span>
  const chef = meal.chef_user_id ?? me
  if (chef === me) return <span className="pl-chip">🧑‍🍳 Me</span>
  return (
    <span className="pl-chip">
      <Avatar userId={chef} size={16} />
      {nameOf(chef)}
    </span>
  )
}

export function EatingLine({ meal }: { meal: Meal }) {
  const eating = meal.attendees.length + meal.guest_count
  return (
    <span className="flex items-center gap-2 text-[13px] text-muted-foreground">
      <AvatarStack userIds={meal.attendees} size={20} max={4} />
      {eating} eating{meal.guest_count > 0 && ` · ${meal.guest_count} guests`}
    </span>
  )
}

function Reactions({ meal }: { meal: Meal }) {
  const me = useMe()
  const react = usePlateMutation(({ reaction }: { reaction: Reaction | null }) =>
    api.setReaction(meal.id, reaction),
  )
  const mine = meal.reactions[me] ?? null
  const count = (value: Reaction) => Object.values(meal.reactions).filter((r) => r === value).length
  const options = [
    { value: 'heart' as const, Icon: Heart, label: 'Love it', on: 'fill-[#ff6b8a] text-[#ff6b8a]' },
    {
      value: 'up' as const,
      Icon: ThumbsUp,
      label: 'Sounds good',
      on: 'fill-[#f5c542] text-[#f5c542]',
    },
  ]
  return (
    <span className="flex gap-1.5">
      {options.map(({ value, Icon, label, on }) => {
        const active = mine === value
        const n = count(value)
        return (
          <button
            key={value}
            type="button"
            aria-pressed={active}
            aria-label={`${label}${n ? ` (${n})` : ''}`}
            onClick={(event) => {
              event.stopPropagation()
              react.mutate({ reaction: active ? null : value })
            }}
            className={cn(
              'flex h-8 min-w-10 items-center justify-center gap-1 rounded-[10px] border px-2 text-xs font-semibold',
              active ? 'border-white/20 bg-white/10' : 'border-white/10 text-muted-foreground',
            )}
          >
            <Icon size={14} className={cn(active && on)} />
            {n > 0 && n}
          </button>
        )
      })}
    </span>
  )
}

/** A planned meal: kitchen-coloured edge, cook, sides, who's eating and reactions. */
export function MealCard({
  meal,
  kitchen,
  showKitchen,
}: {
  meal: Meal
  kitchen?: Kitchen
  showKitchen?: boolean
}) {
  const { open } = usePlate()
  const shared = kitchen && !kitchen.is_personal
  const sides = sidesText(meal)
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => open({ kind: 'meal', meal })}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          open({ kind: 'meal', meal })
        }
      }}
      aria-label={`${meal.title}. Edit meal`}
      className="pl-card relative cursor-pointer overflow-hidden py-3 pr-3 pl-4 text-left transition-colors hover:bg-white/[0.07]"
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ background: kitchen?.color ?? 'var(--primary)' }}
      />
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          {meal.leftover_of && (
            <span className="rounded-[6px] bg-[#3f9d6a]/25 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-[#7fdca7] uppercase">
              Leftovers
            </span>
          )}
          {showKitchen && kitchen && <KitchenChip kitchen={kitchen} />}
        </span>
        <CookChip meal={meal} />
      </div>
      <p className="mt-1.5 text-[16px] leading-snug font-semibold">{meal.title}</p>
      {sides && <p className="mt-0.5 text-[13px] text-muted-foreground">{sides}</p>}
      {shared && (
        <div className="mt-2.5 flex items-center justify-between gap-2">
          <EatingLine meal={meal} />
          <Reactions meal={meal} />
        </div>
      )}
    </div>
  )
}
