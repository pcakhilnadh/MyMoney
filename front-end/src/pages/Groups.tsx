import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Plus } from 'lucide-react'
import { Button, Card, Input, ListItem, PageHeader, SectionTitle } from '@/components/kit'
import { useAction, useGroups, useInvitations } from '@/groups/hooks'
import type { Group } from '@/groups/types'

const TYPES = ['family', 'trip', 'roommates', 'friends', 'other']

export default function Groups() {
  const groups = useGroups()
  const invites = useInvitations()
  const [showForm, setShowForm] = useState(false)
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
          <button
            type="button"
            aria-label="Add group"
            onClick={() => setShowForm(true)}
            className="gloss flex size-10 items-center justify-center rounded-full text-primary-foreground"
          >
            <Plus size={21} />
          </button>
        )}
      </div>
      {!showForm && (
        <>
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
        </>
      )}
      {showForm && (
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
              create.mutate(
                { name: name.trim(), group_type: type },
                {
                  onSuccess: () => {
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
