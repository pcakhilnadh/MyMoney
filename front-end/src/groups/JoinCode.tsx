import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button, Input } from '@/components/kit'
import { db } from '@/db/db'
import { useSync } from '@/sync/SyncProvider'
import { useAction } from './hooks'
import type { Group } from './types'

/** Admins: the group's join code (6 case-sensitive letters and digits, no expiry). */
export function GroupJoinCode({ groupId }: { groupId: string }) {
  const [code, setCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const show = useAction<undefined, { code: string }>(`/money/groups/${groupId}/invite-code`, [])

  return (
    <div className="surface space-y-2 rounded-card p-4">
      {code ? (
        <div className="flex items-center gap-2">
          <span
            data-testid="group-join-code"
            className="flex-1 font-mono text-lg font-bold tracking-[0.2em]"
          >
            {code}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              void navigator.clipboard?.writeText(code).then(
                () => setCopied(true),
                () => setCopied(false),
              )
            }
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
      ) : (
        <Button
          variant="outline"
          className="w-full"
          disabled={show.isPending}
          onClick={() => show.mutate(undefined, { onSuccess: (r) => setCode(r.code) })}
        >
          Show join code
        </Button>
      )}
      <p className="text-xs text-muted-foreground">
        Anyone with the code can join. Letters are case-sensitive.
      </p>
      {show.error && <p className="text-sm text-destructive">{show.error.message}</p>}
    </div>
  )
}

/** Join a group with the code someone shared. */
export function JoinGroupWithCode() {
  const navigate = useNavigate()
  const sync = useSync()
  const [code, setCode] = useState('')
  const join = useAction<{ code: string }, Group>('/money/groups/join-with-code', [])

  return (
    <form
      className="surface space-y-2 rounded-card p-4"
      onSubmit={(e) => {
        e.preventDefault()
        join.mutate(
          { code },
          {
            onSuccess: async (group) => {
              await db.groups.put({ ...group, membership_status: 'active' })
              void sync.syncNow('money')
              navigate(`/money/groups/${group.id}`)
            },
          },
        )
      }}
    >
      <div className="flex gap-2">
        <Input
          aria-label="Group code"
          placeholder="Have a code? e.g. aB3x9Q"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\s/g, ''))}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          autoComplete="off"
          maxLength={16}
          className="font-mono"
        />
        <Button type="submit" disabled={code.length < 6 || join.isPending}>
          Join
        </Button>
      </div>
      {join.error && <p className="text-sm text-destructive">{join.error.message}</p>}
    </form>
  )
}
