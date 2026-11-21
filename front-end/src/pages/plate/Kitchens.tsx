import { Link } from 'react-router-dom'
import { Bell, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import * as api from '@/plate/api'
import { usePlate } from '@/plate/context'
import { SectionLabel } from '@/plate/components'
import { addDays, formatTime, todayKey, weekStart } from '@/plate/dates'
import {
  useInvites,
  useKitchens,
  useMe,
  useMeals,
  usePeople,
  usePlateMutation,
  useSettings,
} from '@/plate/hooks'
import { KITCHEN_TYPE_LABEL, orderKitchens, shoppingLine } from '@/plate/logic'
import { LiveDot } from '@/plate/shopping'
import { KitchenTile } from '@/plate/sheets/KitchenSheets'
import type { Kitchen } from '@/plate/types'
import { AvatarStack, ErrorLine, Switch } from '@/plate/ui'

const REMINDER_TIMES = ['19:00', '19:30', '20:00', '20:30', '21:00', '21:30', '22:00']

export default function PlateKitchens() {
  const { open, select } = usePlate()
  const { nameOf } = usePeople()
  const kitchens = useKitchens().data
  const invites = useInvites().data ?? []
  const defaultId = useSettings().data?.default_group_id ?? null
  const week = weekStart(todayKey())
  const meals = useMeals(week, addDays(week, 6)).data ?? []
  const accept = usePlateMutation(api.acceptInvite)
  const decline = usePlateMutation(api.declineInvite)

  const ordered = orderKitchens(kitchens ?? [], defaultId)
  const personal = ordered.find((k) => k.is_personal)
  const shared = ordered.filter((k) => !k.is_personal)
  const mealCount = (id: string) => meals.filter((m) => m.group_id === id).length

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-[28px] leading-tight font-bold">Kitchens</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Each kitchen has its own week, cart and cravings. Plan and Cart can show one kitchen or
          all of them.
        </p>
      </header>

      {invites.map((invite) => (
        <div key={invite.id} className="pl-card-accent space-y-3 p-4">
          <p className="text-sm">
            <b>{nameOf(invite.invited_by)}</b> invited you to{' '}
            <b>
              {invite.kitchen_emoji} {invite.kitchen_name}
            </b>
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="pl-btn pl-btn-secondary h-10 flex-1 text-sm"
              onClick={() => decline.mutate(invite.id)}
            >
              Decline
            </button>
            <button
              type="button"
              className="pl-btn pl-btn-primary h-10 flex-1 text-sm"
              onClick={() => accept.mutate(invite.id, { onSuccess: (k) => select(k.id) })}
            >
              Accept
            </button>
          </div>
        </div>
      ))}
      <ErrorLine error={accept.error ?? decline.error} />

      {!kitchens ? (
        <p className="text-sm text-muted-foreground">Loading kitchens…</p>
      ) : (
        <>
          {personal && (
            <KitchenRow
              kitchen={personal}
              subtitle={`Personal · private · ${mealCount(personal.id)} meals this week`}
              isDefault={defaultId === personal.id}
              accent
            />
          )}

          <ReminderSetting />

          <section aria-label="Shared kitchens" className="space-y-2.5">
            <SectionLabel>Shared</SectionLabel>
            {shared.length === 0 ? (
              <p className="px-1 text-sm text-muted-foreground">
                Create a kitchen to plan with others, or join one with a code.
              </p>
            ) : (
              shared.map((k) => (
                <KitchenRow
                  key={k.id}
                  kitchen={k}
                  subtitle={`${KITCHEN_TYPE_LABEL[k.group_type]} · ${k.members.length} people`}
                  isDefault={defaultId === k.id}
                />
              ))
            )}
          </section>

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
              onClick={() => open({ kind: 'join' })}
            >
              Join with code
            </button>
          </div>
        </>
      )}
    </div>
  )
}

/** One reminder for all your kitchens, so it lives here and not in a single kitchen. */
function ReminderSetting() {
  const settings = useSettings().data
  const update = usePlateMutation(api.updateSettings)
  if (!settings) return null
  return (
    <section aria-label="Reminder" className="pl-card space-y-3 p-4">
      <div className="flex items-center gap-3">
        <Bell size={18} className="shrink-0 text-[#ff6b78]" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Pre-prep reminder</p>
          <p className="text-xs text-muted-foreground">
            {settings.reminder_enabled
              ? `One notification at ${formatTime(settings.reminder_time)} · only what's still open`
              : 'Reminder is off'}
          </p>
        </div>
        <Switch
          label="Prep reminder"
          checked={settings.reminder_enabled}
          onChange={(on) => update.mutate({ reminder_enabled: on })}
        />
      </div>
      {settings.reminder_enabled && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">Applies to all your kitchens.</p>
          <select
            aria-label="Reminder time"
            value={settings.reminder_time}
            onChange={(e) => update.mutate({ reminder_time: e.target.value })}
            className="pl-input h-9 w-[6.5rem] rounded-full px-3 pr-7 text-[13px] font-semibold"
            style={{ backgroundPosition: 'right 0.5rem center' }}
          >
            {REMINDER_TIMES.map((time) => (
              <option key={time} value={time}>
                {formatTime(time)}
              </option>
            ))}
          </select>
        </div>
      )}
      <ErrorLine error={update.error} />
    </section>
  )
}

function KitchenRow({
  kitchen,
  subtitle,
  isDefault,
  accent = false,
}: {
  kitchen: Kitchen
  subtitle: string
  isDefault: boolean
  accent?: boolean
}) {
  const me = useMe()
  const { nameOf } = usePeople()
  const shopping = shoppingLine(kitchen, me, nameOf)
  return (
    <Link
      to={`/plate/kitchens/${kitchen.id}`}
      className={cn(
        'flex items-center gap-3.5 p-3.5 transition-colors hover:bg-white/[0.07]',
        accent ? 'pl-card-accent' : 'pl-card',
      )}
    >
      <KitchenTile kitchen={kitchen} size={52} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-[17px] font-semibold">{kitchen.name}</span>
          {isDefault && (
            <span className="rounded-[6px] bg-[#f5c542]/15 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-[#f5c542] uppercase">
              Default
            </span>
          )}
        </span>
        <span className="block text-[13px] text-muted-foreground">
          {subtitle}
          {kitchen.has_new_activity && <span className="text-[#ff6b78]"> · new activity</span>}
        </span>
        {shopping && (
          <span className="mt-1 flex items-center gap-1.5 text-[13px] font-medium text-[#7fdca7]">
            <LiveDot className="size-2" />
            {shopping}
          </span>
        )}
        {!kitchen.is_personal && (
          <span className="mt-2 block">
            <AvatarStack userIds={kitchen.members.map((m) => m.user_id)} size={24} max={5} />
          </span>
        )}
      </span>
      <ChevronRight size={18} className="shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  )
}
