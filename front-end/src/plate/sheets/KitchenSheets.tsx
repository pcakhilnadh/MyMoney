import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Copy, LayoutGrid, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import * as api from '../api'
import { usePlate } from '../context'
import { addDays, todayKey, weekStart } from '../dates'
import { useGroceries, useKitchens, useMeals, usePlateMutation } from '../hooks'
import { KITCHEN_EMOJI, KITCHEN_TYPE_LABEL, leftToBuy, SLOT_LABEL, SLOT_ORDER } from '../logic'
import type { Kitchen, KitchenType, MealSlot } from '../types'
import { AvatarStack, Chip, EmojiPicker, ErrorLine, FieldLabel, Sheet } from '../ui'

const SHARED_TYPES: Exclude<KitchenType, 'personal'>[] = [
  'couple',
  'family',
  'flatmates',
  'friends',
]

/** Kitchen icon tile used in lists: emoji on a tinted square. */
export function KitchenTile({ kitchen, size = 44 }: { kitchen: Kitchen; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="pl-sunken flex shrink-0 items-center justify-center rounded-[12px]"
      style={{ width: size, height: size, fontSize: size * 0.48 }}
    >
      {kitchen.emoji}
    </span>
  )
}

// ─── Switcher ────────────────────────────────────────────────────────────────────────────

export function SwitcherSheet({ mode }: { mode: 'plan' | 'cart' }) {
  const { selection, select, close, open } = usePlate()
  const navigate = useNavigate()
  const kitchens = useKitchens().data ?? []
  const week = weekStart(todayKey())
  const meals = useMeals(week, addDays(week, 6)).data ?? []
  const items = leftToBuy(useGroceries().data ?? [])
  const seen = usePlateMutation(api.markKitchenSeen)
  const [query, setQuery] = useState('')

  const count = (id: string | null) =>
    mode === 'plan'
      ? meals.filter((m) => id === null || m.group_id === id).length
      : items.filter((i) => id === null || i.group_id === id).length
  const countLabel = (n: number) =>
    mode === 'plan' ? `${n} meal${n === 1 ? '' : 's'} this week` : `${n} to buy`
  // After "All kitchens": My Kitchen, then shared kitchens A to Z.
  const shown = [...kitchens]
    .sort(
      (a, b) =>
        Number(b.is_personal) - Number(a.is_personal) ||
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
    )
    .filter((k) => k.name.toLowerCase().includes(query.trim().toLowerCase()))

  function choose(next: string) {
    select(next)
    if (next !== 'all') seen.mutate(next)
    close()
  }

  return (
    <Sheet title="Switch kitchen" onClose={close}>
      {kitchens.length > 4 && (
        <div className="relative">
          <Search
            size={16}
            aria-hidden="true"
            className="absolute top-1/2 left-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <input
            aria-label="Search kitchens"
            placeholder="Search kitchens"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-input pl-10"
          />
        </div>
      )}
      <ul className="space-y-1">
        {!query && (
          <SwitcherRow
            active={selection === 'all'}
            onChoose={() => choose('all')}
            icon={
              <span className="pl-sunken flex size-11 shrink-0 items-center justify-center rounded-[12px]">
                <LayoutGrid size={19} />
              </span>
            }
            title="All kitchens"
            subtitle={`${kitchens.length} kitchens · ${countLabel(count(null))}`}
          />
        )}
        {shown.map((k) => (
          <SwitcherRow
            key={k.id}
            active={selection === k.id}
            onChoose={() => choose(k.id)}
            icon={<KitchenTile kitchen={k} />}
            title={k.name}
            subtitle={`${k.is_personal ? 'Private' : `${k.members.length} cooks`} · ${countLabel(count(k.id))}`}
            trailing={
              !k.is_personal && (
                <AvatarStack userIds={k.members.map((m) => m.user_id)} size={20} max={3} />
              )
            }
          />
        ))}
        {shown.length === 0 && (
          <li className="py-6 text-center text-sm text-muted-foreground">No kitchen matches.</li>
        )}
      </ul>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          className="pl-btn pl-btn-secondary h-11 text-sm"
          onClick={() => open({ kind: 'newKitchen' })}
        >
          + New kitchen
        </button>
        <button
          type="button"
          className="pl-btn pl-btn-secondary h-11 text-sm"
          onClick={() => {
            close()
            navigate('/plate/kitchens')
          }}
        >
          Manage kitchens
        </button>
      </div>
    </Sheet>
  )
}

function SwitcherRow({
  active,
  onChoose,
  icon,
  title,
  subtitle,
  trailing,
}: {
  active: boolean
  onChoose: () => void
  icon: React.ReactNode
  title: string
  subtitle: string
  trailing?: React.ReactNode
}) {
  return (
    <li
      className={cn(
        'flex items-center gap-2 rounded-[16px] py-2 pr-1 pl-2',
        active ? 'bg-white/[0.08]' : 'hover:bg-white/[0.04]',
      )}
    >
      <button
        type="button"
        aria-current={active || undefined}
        onClick={onChoose}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        {icon}
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-semibold">{title}</span>
          <span className="block truncate text-[13px] text-muted-foreground">{subtitle}</span>
        </span>
      </button>
      {trailing}
      {active && <Check size={17} className="shrink-0 text-primary" aria-label="Selected" />}
    </li>
  )
}

// ─── New kitchen ─────────────────────────────────────────────────────────────────────────

export function NewKitchenSheet() {
  const { close, select, open } = usePlate()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState(KITCHEN_EMOJI[0])
  const [type, setType] = useState<Exclude<KitchenType, 'personal'>>('couple')
  const [slots, setSlots] = useState<MealSlot[]>(['B', 'L', 'D'])
  const create = usePlateMutation(api.createKitchen)

  return (
    <Sheet
      title="New kitchen"
      onClose={close}
      footer={
        <button
          type="submit"
          form="new-kitchen"
          className="pl-btn pl-btn-primary w-full"
          disabled={!name.trim() || slots.length === 0 || create.isPending}
        >
          Create kitchen
        </button>
      }
    >
      <form
        id="new-kitchen"
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault()
          create.mutate(
            { name, emoji, group_type: type, meal_slots: slots },
            {
              onSuccess: (kitchen) => {
                select(kitchen.id)
                navigate('/plate/plan')
                open({ kind: 'invite', kitchenId: kitchen.id })
              },
            },
          )
        }}
      >
        <p className="text-sm text-muted-foreground">
          A shared kitchen has its own week, cart, cravings and people.
        </p>
        <div>
          <FieldLabel htmlFor="kitchen-name">Name</FieldLabel>
          <input
            id="kitchen-name"
            className="pl-input"
            placeholder="e.g. Home, Flat 4B"
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            required
          />
        </div>
        <div>
          <FieldLabel>Icon</FieldLabel>
          <EmojiPicker value={emoji} onChange={setEmoji} choices={KITCHEN_EMOJI} />
        </div>
        <TypePicker value={type} onChange={setType} />
        <SlotPicker value={slots} onChange={setSlots} />
        <ErrorLine error={create.error} />
      </form>
    </Sheet>
  )
}

export function TypePicker({
  value,
  onChange,
}: {
  value: Exclude<KitchenType, 'personal'>
  onChange: (type: Exclude<KitchenType, 'personal'>) => void
}) {
  return (
    <div>
      <FieldLabel>Who's it for</FieldLabel>
      <div className="flex flex-wrap gap-2">
        {SHARED_TYPES.map((t) => (
          <Chip key={t} selected={value === t} onClick={() => onChange(t)}>
            {KITCHEN_TYPE_LABEL[t]}
          </Chip>
        ))}
      </div>
    </div>
  )
}

export function SlotPicker({
  value,
  onChange,
}: {
  value: MealSlot[]
  onChange: (slots: MealSlot[]) => void
}) {
  return (
    <div>
      <FieldLabel>Meals you plan</FieldLabel>
      <div className="flex flex-wrap gap-2">
        {SLOT_ORDER.map((slot) => {
          const on = value.includes(slot)
          return (
            <Chip
              key={slot}
              selected={on}
              onClick={() =>
                onChange(
                  on
                    ? value.filter((s) => s !== slot)
                    : SLOT_ORDER.filter((s) => s === slot || value.includes(s)),
                )
              }
            >
              {SLOT_LABEL[slot]}
            </Chip>
          )
        })}
      </div>
    </div>
  )
}

// ─── Join with code ──────────────────────────────────────────────────────────────────────

export function JoinSheet() {
  const { close, select } = usePlate()
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const join = usePlateMutation(api.joinWithCode)

  return (
    <Sheet title="Join with a code" onClose={close}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          join.mutate(code, {
            onSuccess: (kitchen) => {
              select(kitchen.id)
              close()
              navigate('/plate/plan')
            },
          })
        }}
      >
        <p className="text-sm text-muted-foreground">
          Ask someone in the kitchen for its 6-character code. Capital letters matter.
        </p>
        <input
          aria-label="Invite code"
          placeholder="e.g. aB3x9Q"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\s/g, ''))}
          className="pl-input h-14 text-center font-mono text-lg font-bold tracking-[0.2em]"
          autoFocus
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          autoComplete="off"
          maxLength={16}
        />
        <ErrorLine error={join.error} />
        <button
          type="submit"
          className="pl-btn pl-btn-primary w-full"
          disabled={code.length < 6 || join.isPending}
        >
          Join kitchen
        </button>
      </form>
    </Sheet>
  )
}

// ─── Invite ──────────────────────────────────────────────────────────────────────────────

export function InviteSheet({ kitchenId }: { kitchenId: string }) {
  const { close } = usePlate()
  const kitchen = useKitchens().data?.find((k) => k.id === kitchenId)
  if (!kitchen) return null
  return (
    <Sheet eyebrow={`${kitchen.emoji} ${kitchen.name}`} title="Invite people" onClose={close}>
      <InvitePanel kitchen={kitchen} onDone={close} />
    </Sheet>
  )
}

/** Invite by email, or share the kitchen's code. Shared by the sheet and kitchen settings. */
export function InvitePanel({ kitchen, onDone }: { kitchen: Kitchen; onDone?: () => void }) {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const invite = usePlateMutation((address: string) => api.inviteByEmail(kitchen.id, [address]))
  const makeCode = usePlateMutation(() => api.getInviteCode(kitchen.id))
  const valid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())

  return (
    <div className="space-y-5">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          invite.mutate(email.trim(), {
            onSuccess: () => {
              setEmail('')
              onDone?.()
            },
          })
        }}
      >
        <FieldLabel htmlFor={`invite-email-${kitchen.id}`}>Invite by email</FieldLabel>
        <div className="flex gap-2">
          <input
            id={`invite-email-${kitchen.id}`}
            type="email"
            inputMode="email"
            autoComplete="off"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="pl-input min-w-0 flex-1"
          />
          <button
            type="submit"
            className="pl-btn pl-btn-primary shrink-0 px-4"
            disabled={!valid || invite.isPending}
          >
            Invite
          </button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          They'll see it under Kitchens when they sign in with this email.
        </p>
      </form>
      <div>
        <FieldLabel>Or share a code</FieldLabel>
        {code ? (
          <div className="pl-sunken flex items-center gap-2 rounded-[16px] py-2 pr-2 pl-4">
            <span
              data-testid="invite-code"
              className="flex-1 font-mono text-lg font-bold tracking-[0.2em]"
            >
              {code}
            </span>
            <button
              type="button"
              className="pl-btn pl-btn-secondary h-9 px-3 text-sm"
              onClick={() => {
                void navigator.clipboard?.writeText(code).then(
                  () => setCopied(true),
                  () => setCopied(false),
                )
              }}
            >
              {copied ? <Check size={15} /> : <Copy size={15} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="pl-btn pl-btn-secondary w-full"
            disabled={makeCode.isPending}
            onClick={() => makeCode.mutate(undefined, { onSuccess: setCode })}
          >
            Show invite code
          </button>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          Anyone with the code can join. Letters are case-sensitive.
        </p>
      </div>
      <ErrorLine error={invite.error ?? makeCode.error} />
    </div>
  )
}
