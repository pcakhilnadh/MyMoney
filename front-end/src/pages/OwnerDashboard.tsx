import { useState } from 'react'
import { Search } from 'lucide-react'
import { useDialog } from '@/components/DialogProvider'
import { Card, SectionTitle } from '@/components/kit'
import { useAction, useApi } from '@/groups/hooks'
import {
  FEATURE_LABEL,
  PLAN_LABEL,
  ROLE_LABEL,
  type AppRole,
  type Feature,
  type Plan,
} from '@/account/membership'
import { BackButton } from '@/nav/BackButton'

interface AdminMember {
  id: string
  email: string
  role: AppRole
  plan: Plan
  created_at: string
  is_me: boolean
  entitlements: Feature[]
}

const ASSIGNABLE: AppRole[] = ['member', 'admin']

/** Owner-only: manage members. More owner tools can be added as further sections. */
export default function OwnerDashboard() {
  const { notify } = useDialog()
  const members = useApi<AdminMember[]>(['admin-members'], '/admin/members')
  const setRole = useAction<{ id: string; role: AppRole }, AdminMember>(
    (b) => `/admin/members/${b.id}/role`,
    [['admin-members']],
    'PUT',
  )
  const [query, setQuery] = useState('')
  const rows = (members.data ?? []).filter((m) =>
    m.email.toLowerCase().includes(query.trim().toLowerCase()),
  )
  const counts = (members.data ?? []).reduce<Record<AppRole, number>>(
    (acc, m) => ({ ...acc, [m.role]: acc[m.role] + 1 }),
    { owner: 0, admin: 0, member: 0 },
  )

  async function changeRole(member: AdminMember, role: AppRole) {
    if (role === member.role) return
    try {
      await setRole.mutateAsync({ id: member.id, role })
    } catch (error) {
      console.error('Unable to change role', error)
      await notify({
        title: 'Could not change role',
        message: `Unable to make ${member.email} ${ROLE_LABEL[role].toLowerCase()}. Please try again.`,
      })
    }
  }

  return (
    <div className="space-y-5 pb-10">
      <BackButton fallback="/personal" />
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-lg font-semibold">Owner dashboard</h1>
          <p className="text-xs text-muted-foreground">Manage members and what they can use.</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        {(['owner', 'admin', 'member'] as const).map((role) => (
          <Card key={role} className="cyber-panel !px-2 !py-3">
            <p className="text-[11px] text-muted-foreground">{ROLE_LABEL[role]}s</p>
            <p className="text-lg font-bold">{counts[role]}</p>
          </Card>
        ))}
      </div>

      <section className="space-y-2.5">
        <SectionTitle>Members</SectionTitle>
        <label className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2">
          <Search size={15} className="text-muted-foreground" aria-hidden="true" />
          <input
            type="search"
            aria-label="Search members by email"
            placeholder="Search by email"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </label>
        <Card className="cyber-panel space-y-3">
          {members.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {members.isError && (
            <p className="text-sm text-destructive">Unable to load members. Try again later.</p>
          )}
          {members.isSuccess && rows.length === 0 && (
            <p className="text-sm text-muted-foreground">No members found.</p>
          )}
          {rows.map((m) => (
            <div
              key={m.id}
              className="flex items-start justify-between gap-3 border-b border-border/60 pb-3 last:border-0 last:pb-0"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {m.email}
                  {m.is_me && <span className="ml-1.5 text-xs text-primary">(you)</span>}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {PLAN_LABEL[m.plan]} · Joined {new Date(m.created_at).toLocaleDateString()}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Access: {m.entitlements.map((f) => FEATURE_LABEL[f]).join(', ') || 'None'}
                </p>
              </div>
              {m.role === 'owner' ? (
                <span className="shrink-0 rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">
                  Owner
                </span>
              ) : (
                <select
                  aria-label={`Role for ${m.email}`}
                  value={m.role}
                  disabled={setRole.isPending}
                  onChange={(e) => void changeRole(m, e.target.value as AppRole)}
                  className="shrink-0 rounded-lg bg-white/10 px-2 py-1 text-xs font-semibold"
                >
                  {ASSIGNABLE.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </select>
              )}
            </div>
          ))}
        </Card>
      </section>
    </div>
  )
}
