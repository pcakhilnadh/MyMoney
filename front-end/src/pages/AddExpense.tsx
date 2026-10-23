import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  Button,
  CategorySelector,
  CurrencyInput,
  DatePicker,
  Input,
  PageHeader,
  SegmentedControl,
} from '@/components/kit'
import { db } from '@/db/db'
import { transactionsRepo } from '@/db/repos'
import { useAction, useGroups, useMe, useMembers } from '@/groups/hooks'
import { memberLabel } from '@/groups/types'
import { toMinor } from '@/lib/money'

const CONTEXTS = ['Personal', 'Family', 'Group'] as const
const METHODS = {
  Equal: 'equal',
  'By Amount': 'exact_amount',
  'By %': 'percentage',
  Shares: 'shares',
} as const
const today = () => new Date().toISOString().slice(0, 10)

function GroupFields({
  context,
  groupId,
  setGroupId,
  accountSelected,
  amount,
  onSubmit,
  busy,
  error,
}: {
  context: 'family' | 'group'
  groupId: string
  setGroupId: (id: string) => void
  accountSelected: boolean
  amount: number
  onSubmit: (
    method: string,
    splits: { user_id: string; value: number | null; paid_minor: number }[],
  ) => void
  busy: boolean
  error: string | null
}) {
  const groups = useGroups().data ?? []
  const options = context === 'family' ? groups.filter((g) => g.group_type === 'family') : groups
  const members = (useMembers(groupId).data ?? []).filter((m) => m.status === 'active' && m.user_id)
  const me = useMe().data
  const [method, setMethod] = useState<keyof typeof METHODS>('Equal')
  const [included, setIncluded] = useState<Record<string, boolean>>({})
  const [values, setValues] = useState<Record<string, string>>({})
  const [payer, setPayer] = useState('')

  const chosen = members.filter((m) => included[m.user_id as string] ?? true)
  const payerId = payer || me?.id || ''

  function submit() {
    onSubmit(
      METHODS[method],
      chosen.map((m) => {
        const uid = m.user_id as string
        const raw = values[uid] ?? ''
        const value =
          method === 'Equal' ? null : method === 'By Amount' ? toMinor(raw) : Number(raw) || 0
        return { user_id: uid, value, paid_minor: uid === payerId ? amount : 0 }
      }),
    )
  }

  return (
    <div className="space-y-3">
      <select
        aria-label="Group"
        value={groupId}
        onChange={(e) => setGroupId(e.target.value)}
        className="field appearance-none"
      >
        <option value="">Select {context === 'family' ? 'family space' : 'group'}…</option>
        {options.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>
      {groupId && (
        <>
          <SegmentedControl
            options={Object.keys(METHODS) as (keyof typeof METHODS)[]}
            value={method}
            onChange={setMethod}
          />
          <label className="block space-y-1.5 label">
            Paid by
            <select
              value={payerId}
              onChange={(e) => setPayer(e.target.value)}
              className="field mt-1 appearance-none normal-case"
            >
              {members.map((m) => (
                <option key={m.id} value={m.user_id as string}>
                  {m.user_id === me?.id ? 'You' : memberLabel(m)}
                </option>
              ))}
            </select>
          </label>
          <div className="space-y-2">
            {members.map((m) => {
              const uid = m.user_id as string
              return (
                <div
                  key={m.id}
                  className="flex items-center gap-3 rounded-card bg-card p-3 shadow-sm"
                >
                  <input
                    type="checkbox"
                    aria-label={`Include ${memberLabel(m)}`}
                    checked={included[uid] ?? true}
                    onChange={(e) => setIncluded({ ...included, [uid]: e.target.checked })}
                  />
                  <span className="flex-1">{uid === me?.id ? 'You' : memberLabel(m)}</span>
                  {method !== 'Equal' && (
                    <input
                      inputMode="decimal"
                      aria-label={`Value for ${memberLabel(m)}`}
                      placeholder={method === 'By Amount' ? '₹' : method === 'By %' ? '%' : 'units'}
                      value={values[uid] ?? ''}
                      onChange={(e) => setValues({ ...values, [uid]: e.target.value })}
                      className="w-20 rounded-lg border px-2 py-1 text-right"
                    />
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button
        className="h-12 w-full rounded-card"
        disabled={!groupId || !accountSelected || amount <= 0 || chosen.length === 0 || busy}
        onClick={submit}
      >
        Save and Split
      </Button>
    </div>
  )
}

export default function AddExpense() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const presetGroup = params.get('groupId') ?? ''
  const categories = useLiveQuery(() => db.categories.toArray(), [])
  const accounts = useLiveQuery(() => db.accounts.toArray(), [])
  const [context, setContext] = useState<(typeof CONTEXTS)[number]>(
    presetGroup ? 'Group' : 'Personal',
  )
  const [amount, setAmount] = useState(0)
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const [date, setDate] = useState(today())
  const [accountId, setAccountId] = useState('')
  const [groupId, setGroupId] = useState(presetGroup)
  const post = useAction<object>('/transactions', [['gtx'], ['balances']])

  const activeAccounts = accounts?.filter((account) => account.status === 'active') ?? []
  const valid = amount > 0 && description.trim().length > 0
  const accountSelected = activeAccounts.some((account) => account.id === accountId)

  async function savePersonal() {
    if (!accountSelected || !valid) return
    const cat = categories?.find((c) => c.name === category)
    await transactionsRepo.create({
      account_id: accountId,
      category_id: cat?.id ?? null,
      group_id: null,
      context: 'personal',
      transaction_type: 'expense',
      description: description.trim(),
      merchant: null,
      amount_minor: amount,
      currency: 'INR',
      transaction_date: new Date(date + 'T12:00:00').toISOString(),
      notes: null,
      is_shared: false,
      split_method: null,
    })
    nav('/transactions')
  }

  function saveShared(method: string, splits: object[]) {
    post.mutate(
      {
        client_id: crypto.randomUUID(),
        context: context.toLowerCase(),
        group_id: groupId,
        account_id: accountId,
        description: description.trim(),
        amount_minor: amount,
        transaction_date: new Date(date + 'T12:00:00').toISOString(),
        split_method: method,
        splits,
      },
      { onSuccess: () => nav(`/groups/${groupId}`) },
    )
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Add Expense" />
      <SegmentedControl options={[...CONTEXTS]} value={context} onChange={setContext} />
      <CurrencyInput value={amount} onChange={setAmount} />
      <Input
        placeholder="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      {context === 'Personal' && <CategorySelector value={category} onChange={setCategory} />}
      <DatePicker value={date} onChange={setDate} />
      <label className="block">
        <span className="label">Paid from</span>
        {activeAccounts.length > 0 ? (
          <select
            aria-label="Paid from"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="field mt-1 appearance-none normal-case"
          >
            <option value="">Select an account…</option>
            {activeAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            Add an account before creating a transaction.{' '}
            <Link to="/settings/accounts" className="text-primary underline">
              Add account
            </Link>
          </p>
        )}
      </label>
      {context === 'Personal' ? (
        <>
          <Button
            className="h-12 w-full rounded-card"
            disabled={!valid || !accountSelected}
            onClick={savePersonal}
          >
            Save Expense
          </Button>
        </>
      ) : (
        <GroupFields
          key={context}
          context={context.toLowerCase() as 'family' | 'group'}
          groupId={groupId}
          setGroupId={setGroupId}
          accountSelected={accountSelected}
          amount={valid ? amount : 0}
          onSubmit={saveShared}
          busy={post.isPending}
          error={post.error?.message ?? null}
        />
      )}
    </div>
  )
}
