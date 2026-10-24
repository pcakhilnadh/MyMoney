import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  Button,
  Card,
  CurrencyInput,
  Input,
  ListItem,
  PageHeader,
  SectionTitle,
  SegmentedControl,
} from '@/components/kit'
import { db } from '@/db/db'
import { useAction, useBalances, useGroupTxs, useGroups, useMe, useMembers } from '@/groups/hooks'
import { memberLabel, type Member } from '@/groups/types'
import { formatMinor } from '@/lib/money'
import { useSync } from '@/sync/SyncProvider'

const TABS = ['Expenses', 'Balances', 'Members'] as const

export default function GroupDetail() {
  const navigate = useNavigate()
  const { groupId = '' } = useParams()
  const [tab, setTab] = useState<(typeof TABS)[number]>('Expenses')
  const groups = useGroups()
  const group = groups?.find((g) => g.id === groupId)
  const sync = useSync()
  const members = useMembers(groupId)
  const txs = useGroupTxs(groupId)
  const balances = useBalances(groupId)
  const me = useMe().data

  const byUser = new Map<string, Member>(
    (members.data ?? []).filter((m) => m.user_id).map((m) => [m.user_id as string, m]),
  )
  const label = (uid: string) => (uid === me?.id ? 'You' : memberLabel(byUser.get(uid)))
  const myNet = me ? (balances.data?.net[me.id] ?? 0) : 0
  const myRole = members.data?.find((m) => m.user_id === me?.id)?.role
  const removeGroup = useAction<{ id: string }>(
    (b) => `/money/groups/${b.id}`,
    [],
    'DELETE',
  )
  const leaveGroup = useAction<{ id: string }>(
    (b) => `/money/groups/${b.id}/members/me`,
    [['members', groupId], ['balances', groupId], ['gtx', groupId]],
    'DELETE',
  )

  const [email, setEmail] = useState('')
  const invite = useAction<{ email: string }>(
    `/money/groups/${groupId}/members`,
    [['members', groupId]],
  )
  const [settleTo, setSettleTo] = useState('')
  const [amount, setAmount] = useState(0)
  const settle = useAction<{ receiver_user_id: string; amount_minor: number; group_id: string }>(
    '/money/settlements',
    [['balances', groupId]],
  )

  return (
    <div className="space-y-4">
      <Link to="/money/groups" className="text-sm text-primary">
        ← Groups
      </Link>
      <PageHeader title={group?.name ?? 'Group'} />
      {myRole === 'owner' && (
        <Button
          variant="outline"
          className="w-full text-destructive"
          disabled={removeGroup.isPending}
          onClick={() => {
            if (window.confirm(`Delete "${group?.name}"? This removes it for all members.`))
              removeGroup.mutate(
                { id: groupId },
                {
                  onSuccess: async () => {
                    await db.groups.delete(groupId)
                    await sync.syncNow()
                    navigate('/money/groups')
                  },
                },
              )
          }}
        >
          Delete Group
        </Button>
      )}
      {removeGroup.error && <p className="text-sm text-destructive">{removeGroup.error.message}</p>}
      <Card className="grid grid-cols-2 gap-2 text-center">
        <div>
          <div className="text-sm text-muted-foreground">Total expenses</div>
          <div className="text-xl font-bold">
            {formatMinor((txs.data ?? []).reduce((n, t) => n + t.amount_minor, 0))}
          </div>
        </div>
        <div>
          <div className="text-sm text-muted-foreground">
            {myNet < 0 ? 'You owe' : 'You are owed'}
          </div>
          <div className={`text-xl font-bold ${myNet < 0 ? 'text-destructive' : ''}`}>
            {formatMinor(Math.abs(myNet))}
          </div>
        </div>
      </Card>
      <Link to={`/money/expenses/new?groupId=${groupId}`}>
        <Button className="w-full">Add Expense</Button>
      </Link>
      <SegmentedControl options={[...TABS]} value={tab} onChange={setTab} />

      {tab === 'Expenses' && (
        <div className="space-y-2">
          {txs.data?.length === 0 && (
            <p className="py-4 text-center text-muted-foreground">No expenses yet</p>
          )}
          {txs.data?.map((t) => (
            <ListItem
              key={t.id}
              title={t.title}
              subtitle={`Paid by ${label(t.splits.find((s) => s.paid_minor > 0)?.user_id ?? t.owner_user_id)} · ${t.transaction_date.slice(0, 10)}`}
              trailing={formatMinor(t.amount_minor)}
            />
          ))}
        </div>
      )}

      {tab === 'Balances' && (
        <div className="space-y-3">
          {balances.data?.transfers.length === 0 && (
            <p className="py-4 text-center text-muted-foreground">All settled up</p>
          )}
          {balances.data?.transfers.map((t, i) => (
            <ListItem
              key={i}
              title={`${label(t.from)} ${t.from === me?.id ? 'owe' : 'owes'} ${label(t.to)}`}
              trailing={formatMinor(t.amount_minor)}
            />
          ))}
          <div className="surface space-y-3 rounded-card p-5">
            <SectionTitle>Record a payment</SectionTitle>
            <select
              aria-label="Pay to"
              value={settleTo}
              onChange={(e) => setSettleTo(e.target.value)}
              className="field appearance-none"
            >
              <option value="">Paid to…</option>
              {[...byUser]
                .filter(([id]) => id !== me?.id)
                .map(([id, m]) => (
                  <option key={id} value={id}>
                    {memberLabel(m)}
                  </option>
                ))}
            </select>
            <CurrencyInput label="Amount" value={amount} onChange={setAmount} />
            <Button
              className="w-full"
              disabled={!settleTo || amount <= 0 || settle.isPending}
              onClick={() =>
                settle.mutate(
                  { receiver_user_id: settleTo, amount_minor: amount, group_id: groupId },
                  { onSuccess: () => setAmount(0) },
                )
              }
            >
              Record Settlement
            </Button>
            {settle.error && <p className="text-sm text-destructive">{settle.error.message}</p>}
          </div>
        </div>
      )}

      {tab === 'Members' && (
        <div className="space-y-2">
          {members.data?.map((m) => (
            <ListItem
              key={m.id}
              title={memberLabel(m)}
              subtitle={`${m.email} · ${m.role}${m.status === 'inactive' ? ' · Left' : ''}`}
              trailing={
                m.status === 'invited' ? (
                  <span className="text-sm font-medium text-muted-foreground">Invited</span>
                ) : m.status === 'inactive' && (myRole === 'owner' || myRole === 'admin') ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={invite.isPending}
                    onClick={() => invite.mutate({ email: m.email })}
                  >
                    Invite again
                  </Button>
                ) : undefined
              }
            />
          ))}
          {myRole && myRole !== 'owner' && (
            <div className="space-y-2 pt-2">
              <Button
                variant="outline"
                className="w-full text-destructive"
                disabled={leaveGroup.isPending}
                onClick={() => {
                  if (window.confirm(`Leave "${group?.name}"? You will no longer see this group.`))
                    leaveGroup.mutate(
                      { id: groupId },
                      {
                        onSuccess: async () => {
                          await db.groups.delete(groupId)
                          await sync.syncNow()
                          navigate('/money/groups')
                        },
                      },
                    )
                }}
              >
                Leave Group
              </Button>
              {leaveGroup.error && (
                <p className="text-sm text-destructive">{leaveGroup.error.message}</p>
              )}
            </div>
          )}
          {(myRole === 'owner' || myRole === 'admin') && (
            <div className="surface flex gap-2 rounded-card p-4">
              <Input
                placeholder="Add by email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Button
                disabled={!email.includes('@') || invite.isPending}
                onClick={() => invite.mutate({ email }, { onSuccess: () => setEmail('') })}
              >
                Add
              </Button>
            </div>
          )}
          {invite.isSuccess && (
            <p className="text-sm text-muted-foreground">
              Invitation saved. We email them if mail is set up.
            </p>
          )}
          {invite.error && <p className="text-sm text-destructive">{invite.error.message}</p>}
        </div>
      )}
    </div>
  )
}
