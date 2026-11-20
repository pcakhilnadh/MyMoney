import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useDialog } from '@/components/DialogProvider'
import * as api from '@/plate/api'
import { usePlate } from '@/plate/context'
import { SectionLabel } from '@/plate/components'
import { useKitchens, useMe, usePeople, usePlateMutation, useSettings } from '@/plate/hooks'
import { KITCHEN_EMOJI, KITCHEN_TYPE_LABEL } from '@/plate/logic'
import { InvitePanel, KitchenTile, SlotPicker, TypePicker } from '@/plate/sheets/KitchenSheets'
import type { Kitchen } from '@/plate/types'
import { Avatar, EmojiPicker, ErrorLine, FieldLabel, Switch } from '@/plate/ui'

export default function PlateKitchenSettings() {
  const { kitchenId } = useParams()
  const kitchens = useKitchens().data
  if (!kitchens) return <p className="text-sm text-muted-foreground">Loading…</p>
  const kitchen = kitchens.find((k) => k.id === kitchenId)
  if (!kitchen)
    return (
      <div className="space-y-3">
        <BackLink />
        <p className="text-sm text-muted-foreground">This kitchen isn't available any more.</p>
      </div>
    )
  return <Settings key={kitchen.id} kitchen={kitchen} />
}

function BackLink() {
  return (
    <Link
      to="/plate/kitchens"
      className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft size={17} /> Kitchens
    </Link>
  )
}

function Settings({ kitchen }: { kitchen: Kitchen }) {
  const me = useMe()
  const { nameOf } = usePeople()
  const dialog = useDialog()
  const navigate = useNavigate()
  const client = useQueryClient()
  const { open, select, selection } = usePlate()
  const settings = useSettings().data
  const [name, setName] = useState(kitchen.name)
  const update = usePlateMutation((patch: Parameters<typeof api.updateKitchen>[1]) =>
    api.updateKitchen(kitchen.id, patch),
  )
  const setDefault = usePlateMutation(api.updateSettings)
  const leave = usePlateMutation(() => api.leaveKitchen(kitchen.id))
  const remove = usePlateMutation(() => api.deleteKitchen(kitchen.id))
  const isDefault = settings?.default_group_id === kitchen.id
  const isOwner = kitchen.owner_id === me

  // Opening a kitchen's page counts as catching up on it.
  useEffect(() => {
    if (!kitchen.has_new_activity) return
    void api
      .markKitchenSeen(kitchen.id)
      .then(() => client.invalidateQueries({ queryKey: ['plate', 'kitchens'] }))
  }, [kitchen.id, kitchen.has_new_activity, client])

  function afterExit() {
    if (selection === kitchen.id) select('all')
    navigate('/plate/kitchens')
  }

  async function onLeave() {
    const ok = await dialog.confirm({
      title: `Leave ${kitchen.name}?`,
      message: "You'll stop seeing its week, cart and ideas. Someone can invite you back.",
      confirmLabel: 'Leave',
      tone: 'destructive',
    })
    if (ok) leave.mutate(undefined, { onSuccess: afterExit })
  }

  async function onDelete() {
    const ok = await dialog.confirm({
      title: `Delete ${kitchen.name}?`,
      message: 'Its meals, cart and ideas are removed for everyone. This cannot be undone.',
      confirmLabel: 'Delete kitchen',
      tone: 'destructive',
    })
    if (ok) remove.mutate(undefined, { onSuccess: afterExit })
  }

  return (
    <div className="space-y-5">
      <BackLink />
      <header className="flex items-center gap-3.5">
        <KitchenTile kitchen={kitchen} size={56} />
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold">{kitchen.name}</h1>
          <p className="text-[13px] text-muted-foreground">
            {kitchen.is_personal
              ? 'Personal · private'
              : `${KITCHEN_TYPE_LABEL[kitchen.group_type]} · ${kitchen.members.length} people`}
          </p>
        </div>
      </header>

      <section className="pl-card space-y-5 p-4">
        <div>
          <FieldLabel htmlFor="kitchen-name">Name</FieldLabel>
          <input
            id="kitchen-name"
            className="pl-input"
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            onBlur={() =>
              name.trim() && name.trim() !== kitchen.name && update.mutate({ name: name.trim() })
            }
          />
        </div>
        <div>
          <FieldLabel>Icon</FieldLabel>
          <EmojiPicker
            value={kitchen.emoji}
            onChange={(emoji) => update.mutate({ emoji })}
            choices={KITCHEN_EMOJI}
          />
        </div>
        {kitchen.group_type !== 'personal' && (
          <TypePicker
            value={kitchen.group_type}
            onChange={(group_type) => update.mutate({ group_type })}
          />
        )}
        <SlotPicker
          value={kitchen.meal_slots}
          onChange={(meal_slots) => meal_slots.length > 0 && update.mutate({ meal_slots })}
        />
      </section>

      <section className="pl-card flex items-center justify-between gap-3 p-4">
        <div>
          <p className="text-sm font-semibold">Default kitchen</p>
          <p className="text-xs text-muted-foreground">Plan and Cart open here.</p>
        </div>
        <Switch
          label="Default kitchen"
          checked={isDefault}
          onChange={(on) => setDefault.mutate({ default_group_id: on ? kitchen.id : null })}
        />
      </section>

      {kitchen.is_personal ? (
        <section className="pl-card space-y-3 p-4">
          <p className="text-sm text-muted-foreground">
            My Kitchen is just for you and can't be shared or left. To plan with others, start a
            shared kitchen and copy your week into it.
          </p>
          <button
            type="button"
            className="pl-btn pl-btn-primary w-full"
            onClick={() => open({ kind: 'planWithSomeone' })}
          >
            Plan with someone
          </button>
        </section>
      ) : (
        <>
          <section className="space-y-2">
            <SectionLabel>People</SectionLabel>
            <ul className="pl-card divide-y divide-white/[0.06]">
              {kitchen.members.map((member) => (
                <li key={member.user_id} className="flex items-center gap-3 px-4 py-3">
                  <Avatar userId={member.user_id} size={32} />
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {nameOf(member.user_id)}
                  </span>
                  <span className="text-xs text-muted-foreground capitalize">{member.role}</span>
                </li>
              ))}
              {kitchen.invited.map((id) => (
                <li key={id} className="flex items-center gap-3 px-4 py-3 opacity-60">
                  <Avatar userId={id} size={32} />
                  <span className="min-w-0 flex-1 truncate font-medium">{nameOf(id)}</span>
                  <span className="text-xs text-muted-foreground">Invited</span>
                </li>
              ))}
            </ul>
          </section>
          <section className="pl-card p-4">
            <InvitePanel kitchen={kitchen} />
          </section>
          <div className="space-y-2">
            <button
              type="button"
              className="pl-btn pl-btn-danger w-full"
              onClick={() => void onLeave()}
            >
              Leave kitchen
            </button>
            {isOwner && (
              <button
                type="button"
                className="pl-btn pl-btn-danger w-full"
                onClick={() => void onDelete()}
              >
                Delete kitchen
              </button>
            )}
          </div>
        </>
      )}
      <ErrorLine error={update.error ?? setDefault.error ?? leave.error ?? remove.error} />
    </div>
  )
}
