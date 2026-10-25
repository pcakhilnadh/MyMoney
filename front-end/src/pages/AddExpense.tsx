import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  Button,
  AutocompleteInput,
  CategorySelector,
  CurrencyInput,
  DatePicker,
  Input,
  PageHeader,
  SegmentedControl,
  Select,
} from '@/components/kit'
import { db } from '@/db/db'
import { merchantsRepo, transactionsRepo } from '@/db/repos'
import type { TransactionType } from '@/db/types'
import { useAction, useGroups, useMe, useMembers } from '@/groups/hooks'
import { memberLabel } from '@/groups/types'
import {
  categoryTypeForTransaction,
  transferCategoryAccountError,
} from '@/lib/transaction-categories'
import { toMinor } from '@/lib/money'
import { currencySymbol } from '@/lib/currency'
import { useCurrency } from '@/money/CurrencyContext'

const CONTEXTS = ['Personal', 'Group'] as const
const TRANSACTION_TYPES = ['Expense', 'Income', 'Transfer', 'Refund'] as const
const METHODS = {
  Equal: 'equal',
  'By Amount': 'exact_amount',
  'By %': 'percentage',
  Shares: 'shares',
} as const
const today = () => new Date().toISOString().slice(0, 10)

function GroupFields({
  groupId,
  setGroupId,
  accountSelected,
  categorySelected,
  amount,
  onSubmit,
  busy,
  error,
}: {
  groupId: string
  setGroupId: (id: string) => void
  accountSelected: boolean
  categorySelected: boolean
  amount: number
  onSubmit: (
    method: string,
    splits: { user_id: string; value: number | null; paid_minor: number }[],
  ) => void
  busy: boolean
  error: string | null
}) {
  const { currency } = useCurrency()
  const groups = useGroups() ?? []
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
      <Select
        aria-label="Group"
        value={groupId}
        onValueChange={setGroupId}
        placeholder="Select group…"
        options={groups.map((group) => ({ value: group.id, label: group.name }))}
      />
      {groupId && (
        <>
          <SegmentedControl
            options={Object.keys(METHODS) as (keyof typeof METHODS)[]}
            value={method}
            onChange={setMethod}
          />
          <label className="block space-y-1.5 label">
            Paid by
            <Select
              aria-label="Paid by"
              value={payerId}
              onValueChange={setPayer}
              className="mt-1 normal-case"
              options={members.map((member) => ({
                value: member.user_id as string,
                label: member.user_id === me?.id ? 'You' : memberLabel(member),
              }))}
            />
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
                    <Input
                      inputMode="decimal"
                      aria-label={`Value for ${memberLabel(m)}`}
                      placeholder={
                        method === 'By Amount'
                          ? currencySymbol(currency)
                          : method === 'By %'
                            ? '%'
                            : 'units'
                      }
                      value={values[uid] ?? ''}
                      onChange={(e) => setValues({ ...values, [uid]: e.target.value })}
                      className="w-20 px-3 py-2 text-right"
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
        disabled={
          !groupId ||
          !accountSelected ||
          !categorySelected ||
          amount <= 0 ||
          chosen.length === 0 ||
          busy
        }
        onClick={submit}
      >
        Save and Split
      </Button>
    </div>
  )
}

export default function AddExpense() {
  const { currency } = useCurrency()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const presetGroup = params.get('groupId') ?? ''
  const categories = useLiveQuery(() => db.categories.toArray(), [])
  const accounts = useLiveQuery(() => db.accounts.toArray(), [])
  const merchants = useLiveQuery(() => merchantsRepo.list(), []) ?? []
  const [context, setContext] = useState<(typeof CONTEXTS)[number]>(
    presetGroup ? 'Group' : 'Personal',
  )
  const [transactionType, setTransactionType] = useState<TransactionType>('expense')
  const [amount, setAmount] = useState(0)
  const [title, setTitle] = useState('')
  const [longDescription, setLongDescription] = useState('')
  const [merchant, setMerchant] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const [date, setDate] = useState(today())
  const [accountId, setAccountId] = useState('')
  const [transferToAccountId, setTransferToAccountId] = useState('')
  const [groupId, setGroupId] = useState(presetGroup)
  const post = useAction<object>('/money/transactions', [['gtx'], ['balances']])

  const activeAccounts =
    accounts
      ?.filter((account) => account.status === 'active')
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })) ?? []
  const categoryType = categoryTypeForTransaction(transactionType)
  const visibleCategories =
    categories?.filter(
      (item) =>
        item.status === 'active' && !item.is_hidden && item.transaction_type === categoryType,
    ) ?? []
  const selectedCategory = visibleCategories.find((item) => item.name === category)
  const sourceAccount = activeAccounts.find((account) => account.id === accountId)
  const destinationAccount = activeAccounts.find((account) => account.id === transferToAccountId)
  const transferCategoryError =
    transactionType === 'transfer' && selectedCategory && sourceAccount && destinationAccount
      ? transferCategoryAccountError(
          selectedCategory.name,
          sourceAccount.account_type,
          destinationAccount.account_type,
        )
      : null
  const valid = amount > 0 && title.trim().length > 0
  const accountSelected = activeAccounts.some((account) => account.id === accountId)
  const transferDestinationSelected =
    transactionType !== 'transfer' ||
    (transferToAccountId !== accountId &&
      activeAccounts.some((account) => account.id === transferToAccountId))

  async function savePersonal() {
    if (!accountSelected || !transferDestinationSelected || !valid) return
    if (transactionType === 'transfer' && (!selectedCategory || transferCategoryError)) return
    const savedMerchant =
      context === 'Personal' && transactionType === 'expense' ? merchant.trim() : ''
    if (savedMerchant) await merchantsRepo.ensure(savedMerchant)
    await transactionsRepo.create({
      account_id: accountId,
      transfer_to_account_id: transactionType === 'transfer' ? transferToAccountId : null,
      category_id: selectedCategory?.id ?? null,
      group_id: null,
      context: 'personal',
      transaction_type: transactionType,
      title: title.trim(),
      long_description: longDescription.trim() || null,
      merchant: savedMerchant || null,
      amount_minor: amount,
      currency,
      transaction_date: new Date(date + 'T12:00:00').toISOString(),
      notes: null,
      is_shared: false,
      split_method: null,
    })
    nav('/money/transactions')
  }

  function saveShared(method: string, splits: object[]) {
    if (!selectedCategory) return
    post.mutate(
      {
        client_id: crypto.randomUUID(),
        context: 'group',
        group_id: groupId,
        account_id: accountId,
        category_id: selectedCategory.id,
        transaction_type: 'expense',
        title: title.trim(),
        long_description: longDescription.trim() || null,
        merchant: null,
        amount_minor: amount,
        transaction_date: new Date(date + 'T12:00:00').toISOString(),
        split_method: method,
        splits,
      },
      { onSuccess: () => nav(`/money/groups/${groupId}`) },
    )
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Add Transaction" />
      <SegmentedControl
        options={[...TRANSACTION_TYPES]}
        value={TRANSACTION_TYPES.find((option) => option.toLowerCase() === transactionType)!}
        onChange={(value) => {
          const nextType = value.toLowerCase() as TransactionType
          setTransactionType(nextType)
          setCategory(null)
          if (nextType !== 'expense') setContext('Personal')
        }}
      />
      {transactionType === 'expense' && (
        <SegmentedControl options={[...CONTEXTS]} value={context} onChange={setContext} />
      )}
      <CurrencyInput value={amount} onChange={setAmount} />
      <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
      {context === 'Personal' && transactionType === 'expense' && (
        <label className="block space-y-1.5">
          <span className="label">Merchant (optional)</span>
          <AutocompleteInput
            aria-label="Merchant"
            placeholder="Choose or enter a merchant"
            value={merchant}
            onChange={setMerchant}
            options={merchants.map((item) => item.name)}
          />
        </label>
      )}
      <label className="block space-y-1.5">
        <span className="label">Long Description (optional)</span>
        <textarea
          aria-label="Long Description"
          rows={4}
          value={longDescription}
          onChange={(e) => setLongDescription(e.target.value)}
          className="field min-h-24 resize-y"
        />
      </label>
      <CategorySelector
        value={category}
        onChange={setCategory}
        options={visibleCategories.map((item) => item.name)}
        label={transactionType === 'refund' ? 'Expense category' : 'Category'}
      />
      {!selectedCategory && (
        <p className="text-sm text-destructive">Choose a category to save this transaction.</p>
      )}
      {transferCategoryError && <p className="text-sm text-destructive">{transferCategoryError}</p>}
      <DatePicker value={date} onChange={setDate} />
      <label className="block">
        <span className="label">
          {transactionType === 'income' || transactionType === 'refund'
            ? 'Received into'
            : transactionType === 'transfer'
              ? 'From account'
              : 'Paid from'}
        </span>
        {activeAccounts.length > 0 ? (
          <Select
            aria-label={
              transactionType === 'income' || transactionType === 'refund'
                ? 'Received into'
                : transactionType === 'transfer'
                  ? 'From account'
                  : 'Paid from'
            }
            value={accountId}
            onValueChange={setAccountId}
            className="mt-1 normal-case"
            placeholder="Select an account…"
            options={activeAccounts.map((account) => ({
              value: account.id,
              label: account.name,
            }))}
          />
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            Add an account before creating a transaction.{' '}
            <Link to="/money/settings/accounts" className="text-primary underline">
              Add account
            </Link>
          </p>
        )}
      </label>
      {transactionType === 'transfer' && (
        <label className="block">
          <span className="label">To account</span>
          <Select
            aria-label="To account"
            value={transferToAccountId}
            onValueChange={setTransferToAccountId}
            className="mt-1 normal-case"
            placeholder="Select destination account…"
            options={activeAccounts
              .filter((account) => account.id !== accountId)
              .map((account) => ({ value: account.id, label: account.name }))}
          />
        </label>
      )}
      {context === 'Personal' ? (
        <Button
          className="h-12 w-full rounded-card"
          disabled={
            !valid ||
            !accountSelected ||
            !transferDestinationSelected ||
            !selectedCategory ||
            !!transferCategoryError
          }
          onClick={savePersonal}
        >
          Save {TRANSACTION_TYPES.find((option) => option.toLowerCase() === transactionType)}
        </Button>
      ) : (
        <GroupFields
          key={context}
          groupId={groupId}
          setGroupId={setGroupId}
          accountSelected={accountSelected}
          categorySelected={!!selectedCategory}
          amount={valid ? amount : 0}
          onSubmit={saveShared}
          busy={post.isPending}
          error={post.error?.message ?? null}
        />
      )}
    </div>
  )
}
