import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import {
  AddIconButton,
  Button,
  Card,
  Input,
  ListItem,
  PageHeader,
  SectionTitle,
  Select,
} from '@/components/kit'
import { db } from '@/db/db'
import { useAction, useGroups, useInvitations } from '@/groups/hooks'
import type { Group } from '@/groups/types'
import { useSync } from '@/sync/SyncProvider'
import { useCurrency } from '@/money/CurrencyContext'

const TYPES = ['family', 'trip', 'roommates', 'friends', 'other']

export default function Groups() {
  const { currency } = useCurrency()
  const groups = useGroups()
  const invites = useInvitations()
  const sync = useSync()
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState('friends')
  const create = useAction<{ name: string; group_type: string; currency: string }, Group>(
    '/money/groups',
    [],
  )
  const join = useAction<{ id: string }>(
    (b) => `/money/groups/${b.id}/join`,
    [],
  )

  if (groups === undefined || invites === undefined)
    return <p className="text-muted-foreground">Loading groups…</p>

  if (!sync.lastSyncedAt && sync.state === 'error')
    return (
      <Card>
        <p className="font-semibold">Groups could not be synced.</p>
        <p className="text-sm text-muted-foreground">{sync.error}</p>
        <Button className="mt-3" onClick={sync.syncNow}>
          Retry
        </Button>
      </Card>
    )

  if (groups.length === 0 && invites.length === 0 && !sync.lastSyncedAt && sync.state !== 'error')
    return <p className="text-muted-foreground">Loading groups…</p>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        {showForm ? (
          <button
            type="button"
            onClick={() => {
              setName('')
              setType('friends')
              setShowForm(false)
            }}
            className="flex items-center gap-1 text-sm font-medium text-muted-foreground"
          >
            <ArrowLeft size={18} />
            Back
          </button>
        ) : (
          <PageHeader title="Groups" />
        )}
        {showForm ? (
          <span className="text-sm font-medium text-muted-foreground">New group</span>
        ) : (
          <AddIconButton
            label="Add group"
            onClick={() => setShowForm(true)}
          />
        )}
      </div>
      {!showForm && (
        <>
          {invites.map((g) => (
            <Card key={g.id} className="flex items-center justify-between">
              <div>
                <div className="font-semibold">{g.name}</div>
                <div className="text-sm text-muted-foreground">You have been invited</div>
              </div>
              <Button
                size="sm"
                onClick={() =>
                  join.mutate(
                    { id: g.id },
                    {
                      onSuccess: async () => {
                        await db.groups.update(g.id, { membership_status: 'active' })
                        await sync.syncNow()
                      },
                    },
                  )
                }
              >
                Join
              </Button>
            </Card>
          ))}
          {groups.length === 0 && (
            <p className="py-4 text-center text-muted-foreground">No groups yet</p>
          )}
          {groups.map((g) => (
            <Link key={g.id} to={`/money/groups/${g.id}`} className="block">
              <ListItem title={g.name} subtitle={g.group_type} />
            </Link>
          ))}
        </>
      )}
      {showForm && (
        <div className="surface space-y-3 rounded-card p-5">
          <SectionTitle>Create New Group</SectionTitle>
          <Input placeholder="Group name" value={name} onChange={(e) => setName(e.target.value)} />
          <Select
            aria-label="Group type"
            value={type}
            onValueChange={setType}
            options={TYPES.map((groupType) => ({ value: groupType, label: groupType }))}
          />
          <Button
            className="w-full"
            disabled={!name.trim() || create.isPending}
            onClick={() =>
              create.mutate(
                { name: name.trim(), group_type: type, currency },
                {
                  onSuccess: async (group) => {
                    await db.groups.put({ ...group, membership_status: 'active' })
                    await sync.syncNow()
                    setName('')
                    setType('friends')
                    setShowForm(false)
                  },
                },
              )
            }
          >
            Create Group
          </Button>
        </div>
      )}
    </div>
  )
}
