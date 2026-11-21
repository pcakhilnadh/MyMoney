import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Copy, LayoutGrid, Search, Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import * as api from '../api'
import { usePlate } from '../context'
import { addDays, todayKey, weekStart } from '../dates'
import {
  useContacts,
  useGroceries,
  useKitchens,
  useMeals,
  usePeople,
  usePlateMutation,
  useSettings,
} from '../hooks'
import { KITCHEN_EMOJI, KITCHEN_TYPE_LABEL, leftToBuy, SLOT_LABEL, SLOT_ORDER } from '../logic'
import type { Kitchen, KitchenType, MealSlot } from '../types'
import { Avatar, AvatarStack, Chip, EmojiPicker, ErrorLine, FieldLabel, Sheet, Switch } from '../ui'

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
  const settings = useSettings().data
  const week = weekStart(todayKey())
  const meals = useMeals(week, addDays(week, 6)).data ?? []
  const items = leftToBuy(useGroceries().data ?? [])
  const setDefault = usePlateMutation(api.updateSettings)
  const seen = usePlateMutation(api.markKitchenSeen)
  const [query, setQuery] = useState('')

  const defaultId = settings?.default_group_id ?? null
  const count = (id: string | null) =>
    mode === 'plan'
      ? meals.filter((m) => id === null || m.group_id === id).length
      : items.filter((i) => id === null || i.group_id === id).length
  const countLabel = (n: number) =>
    mode === 'plan' ? `${n} meal${n === 1 ? '' : 's'} this week` : `${n} to buy`
  // Default first, then My Kitchen, then by name.
  const shown = [...kitchens]
    .sort(
      (a, b) =>
        Number(b.id === defaultId) - Number(a.id === defaultId) ||
        Number(b.is_personal) - Number(a.is_personal) ||
        a.name.localeCompare(b.name),
    )
    .filter((k) => k.name.toLowerCase().includes(query.trim().toLowerCase()))

  function choose(next: string) {
    select(next)
    if (next !== 'all') seen.mutate(next)
    close()
  }

  const setAsDefault = (id: string | null) => setDefault.mutate({ default_group_id: id })

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
            star={
              <DefaultStar
                on={defaultId === null}
                name="All kitchens"
                onSet={() => setAsDefault(null)}
              />
            }
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
            star={
              <DefaultStar on={defaultId === k.id} name={k.name} onSet={() => setAsDefault(k.id)} />
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
      <ErrorLine error={setDefault.error} />
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
  star,
}: {
  active: boolean
  onChoose: () => void
  icon: React.ReactNode
  title: string
  subtitle: string
  trailing?: React.ReactNode
  star: React.ReactNode
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
      {star}
    </li>
  )
}

function DefaultStar({ on, name, onSet }: { on: boolean; name: string; onSet: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? `${name} is your default` : `Make ${name} your default`}
      onClick={onSet}
      className="flex size-9 shrink-0 items-center justify-center rounded-[10px] text-muted-foreground hover:bg-white/5"
    >
      <Star size={17} className={cn(on && 'fill-[#f5c542] text-[#f5c542]')} />
    </button>
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
          A shared kitchen has its own week, cart, ideas and people.
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
          Ask someone in the kitchen for its code. You'll see its week, cart and ideas right away.
        </p>
        <input
          aria-label="Invite code"
          placeholder="e.g. OFFICE24"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          className="pl-input h-14 text-center text-lg font-bold tracking-[0.25em] uppercase"
          autoFocus
          autoCapitalize="characters"
          autoComplete="off"
        />
        <ErrorLine error={join.error} />
        <button
          type="submit"
          className="pl-btn pl-btn-primary w-full"
          disabled={code.trim().length < 4 || join.isPending}
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

/** Contacts already on the app, plus an open code. Shared by the sheet and kitchen settings. */
export function InvitePanel({ kitchen, onDone }: { kitchen: Kitchen; onDone?: () => void }) {
  const contacts = useContacts().data ?? []
  const [picked, setPicked] = useState<string[]>([])
  const [code, setCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const invite = usePlateMutation(({ ids }: { ids: string[] }) => api.inviteUsers(kitchen.id, ids))
  const makeCode = usePlateMutation(() => api.getInviteCode(kitchen.id))
  const members = new Set(kitchen.members.map((m) => m.user_id))
  const candidates = contacts.filter((c) => !members.has(c.id))

  return (
    <div className="space-y-5">
      <div>
        <FieldLabel>People on the app</FieldLabel>
        {candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {contacts.length === 0
              ? 'People you share a money group or kitchen with show up here. Until then, share the code below.'
              : 'Everyone you know is already here.'}
          </p>
        ) : (
          <ul className="pl-card divide-y divide-white/[0.06]">
            {candidates.map((person) => {
              const invited = kitchen.invited.includes(person.id)
              const on = picked.includes(person.id)
              return (
                <li key={person.id}>
                  <button
                    type="button"
                    disabled={invited}
                    aria-pressed={on}
                    onClick={() =>
                      setPicked(on ? picked.filter((p) => p !== person.id) : [...picked, person.id])
                    }
                    className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left disabled:opacity-60"
                  >
                    <Avatar userId={person.id} size={32} />
                    <span className="min-w-0 flex-1 truncate text-[15px] font-medium">
                      {person.name}
                    </span>
                    {invited ? (
                      <span className="text-xs text-muted-foreground">Invited</span>
                    ) : (
                      <span
                        aria-hidden="true"
                        className={cn(
                          'flex size-[22px] items-center justify-center rounded-full border-[1.5px]',
                          on ? 'border-primary bg-primary' : 'border-white/30',
                        )}
                      >
                        {on && <Check size={13} strokeWidth={3} />}
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        {picked.length > 0 && (
          <button
            type="button"
            className="pl-btn pl-btn-primary mt-3 w-full"
            disabled={invite.isPending}
            onClick={() =>
              invite.mutate(
                { ids: picked },
                {
                  onSuccess: () => {
                    setPicked([])
                    onDone?.()
                  },
                },
              )
            }
          >
            Send {picked.length} invite{picked.length === 1 ? '' : 's'}
          </button>
        )}
      </div>
      <div>
        <FieldLabel>Or share a code</FieldLabel>
        {code ? (
          <div className="pl-sunken flex items-center gap-2 rounded-[16px] py-2 pr-2 pl-4">
            <span className="flex-1 text-lg font-bold tracking-[0.25em] tabular-nums">{code}</span>
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
        <p className="mt-2 text-xs text-muted-foreground">Anyone with the code can join.</p>
      </div>
      <ErrorLine error={invite.error ?? makeCode.error} />
    </div>
  )
}

// ─── Plan with someone ───────────────────────────────────────────────────────────────────

/** From My Kitchen: start a shared kitchen and optionally copy this week into it. */
export function PlanWithSomeoneSheet() {
  const { close, open, select, personalId } = usePlate()
  const navigate = useNavigate()
  const { nameOf } = usePeople()
  const contacts = useContacts().data ?? []
  const week = weekStart(todayKey())
  const personalMeals = (useMeals(week, addDays(week, 6)).data ?? []).filter(
    (m) => m.group_id === personalId,
  )
  const [picked, setPicked] = useState<string[]>([])
  const [name, setName] = useState('')
  const [type, setType] = useState<Exclude<KitchenType, 'personal'>>('couple')
  const [copy, setCopy] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const suggested = picked.length ? `Me & ${picked.map(nameOf).join(' & ')}` : ''
  const finalName = name.trim() || suggested
  const start = usePlateMutation(async () => {
    if (!personalId) return null
    const kitchen = await api.createKitchen({ name: finalName, emoji: '🏡', group_type: type })
    await api.inviteUsers(kitchen.id, picked)
    if (copy)
      await api.copyWeek({
        from_group_id: personalId,
        to_group_id: kitchen.id,
        from_week: week,
        to_week: week,
      })
    return kitchen
  })

  async function onStart() {
    setBusy(true)
    setError(null)
    try {
      const kitchen = await start.mutateAsync()
      if (!kitchen) return
      select(kitchen.id)
      navigate('/plate/plan')
      // Nobody picked: hand over the invite code straight away.
      if (picked.length === 0) open({ kind: 'invite', kitchenId: kitchen.id })
      else close()
    } catch (caught) {
      setError(caught)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      title="Plan with someone"
      onClose={close}
      footer={
        <button
          type="button"
          className="pl-btn pl-btn-primary w-full"
          disabled={!finalName || busy}
          onClick={() => void onStart()}
        >
          Start shared kitchen
        </button>
      }
    >
      <p className="text-sm text-muted-foreground">
        My Kitchen stays private. This starts a shared kitchen with its own week and cart.
      </p>
      <div>
        <FieldLabel>With</FieldLabel>
        {contacts.length === 0 && (
          <p className="text-sm text-muted-foreground">
            People you share a money group with show up here. You can also send an invite code once
            the kitchen exists.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {contacts.map((person) => {
            const on = picked.includes(person.id)
            return (
              <Chip
                key={person.id}
                selected={on}
                className="pl-1.5"
                onClick={() =>
                  setPicked(on ? picked.filter((p) => p !== person.id) : [...picked, person.id])
                }
              >
                <Avatar userId={person.id} size={24} />
                {person.name}
              </Chip>
            )
          })}
        </div>
      </div>
      <div>
        <FieldLabel htmlFor="pws-name">Kitchen name</FieldLabel>
        <input
          id="pws-name"
          className="pl-input"
          placeholder={suggested || 'e.g. Home'}
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <TypePicker value={type} onChange={setType} />
      <div className="pl-card flex items-center justify-between gap-3 p-3.5">
        <div>
          <p className="text-sm font-semibold">Copy this week from My Kitchen</p>
          <p className="text-xs text-muted-foreground">
            {personalMeals.length} meals · fills empty slots only, your originals stay put
          </p>
        </div>
        <Switch checked={copy} onChange={setCopy} label="Copy this week from My Kitchen" />
      </div>
      <ErrorLine error={error} />
    </Sheet>
  )
}
