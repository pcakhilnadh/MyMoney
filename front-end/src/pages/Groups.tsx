import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Card, Input, ListItem, PageHeader, SectionTitle } from '@/components/kit'
import { useAction, useGroups, useInvitations } from '@/groups/hooks'
import type { Group } from '@/groups/types'

const TYPES = ['family', 'trip', 'roommates', 'friends', 'other']

export default function Groups() {
  const groups = useGroups()
  const invites = useInvitations()
  const [name, setName] = useState('')
  const [type, setType] = useState('friends')
  const create = useAction<{ name: string; group_type: string }, Group>('/groups', [['groups']])
  const join = useAction<{ id: string }>(
    (b) => `/groups/${b.id}/join`,
    [['groups'], ['invitations']],
  )

  if (groups.error)
    return (
      <Card>
        <p className="font-semibold">Groups need an internet connection.</p>
        <p className="text-sm text-muted-foreground">{groups.error.message}</p>
        <Button className="mt-3" onClick={() => groups.refetch()}>
          Retry
        </Button>
      </Card>
    )

  return (
    <div className="space-y-4">
      <PageHeader title="Groups" />
      {invites.data?.map((g) => (
        <Card key={g.id} className="flex items-center justify-between">
          <div>
            <div className="font-semibold">{g.name}</div>
            <div className="text-sm text-muted-foreground">You have been invited</div>
          </div>
          <Button size="sm" onClick={() => join.mutate({ id: g.id })}>
            Join
          </Button>
        </Card>
      ))}
      {groups.isLoading && <p className="text-muted-foreground">Loading…</p>}
      {groups.data?.length === 0 && (
        <p className="py-4 text-center text-muted-foreground">No groups yet</p>
      )}
      {groups.data?.map((g) => (
        <Link key={g.id} to={`/groups/${g.id}`} className="block">
          <ListItem title={g.name} subtitle={g.group_type} />
        </Link>
      ))}
      <div className="surface space-y-3 rounded-card p-5">
        <SectionTitle>Create New Group</SectionTitle>
        <Input placeholder="Group name" value={name} onChange={(e) => setName(e.target.value)} />
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="field appearance-none"
        >
          {TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <Button
          className="w-full"
          disabled={!name.trim() || create.isPending}
          onClick={() =>
            create.mutate({ name: name.trim(), group_type: type }, { onSuccess: () => setName('') })
          }
        >
          Create Group
        </Button>
      </div>
    </div>
  )
}
