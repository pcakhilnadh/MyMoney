import { useState } from 'react'
import { Camera } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  Button,
  AutocompleteInput,
  CategoryCombobox,
  CurrencyInput,
  Field,
  Input,
  PageHeader,
  RequiredMark,
  SectionTitle,
  SegmentedControl,
  Select,
} from '@/components/kit'
import { TransactionDatePicker } from '@/components/kit/TransactionDatePicker'
import { ImageCapture } from '@/components/kit/ImageCapture'
import { db } from '@/db/db'
import { categoriesRepo, merchantsRepo, transactionsRepo } from '@/db/repos'
import type { TransactionType } from '@/db/types'
import { useAction, useGroups, useMe, useMembers } from '@/groups/hooks'
import { memberLabel } from '@/groups/types'
import { canHaveDirectTransactions } from '@/lib/accounts'
import {
  categoryTypeForTransaction,
  transferAccountRequirement,
  transferCategoryAccountError,
} from '@/lib/transaction-categories'
import { toMinor } from '@/lib/money'
import { suggestCategory } from '@/lib/category-suggestions'
import { currencySymbol } from '@/lib/currency'
import { useCurrency } from '@/money/CurrencyContext'
import { api } from '@/auth/api'
import { useAuth } from '@/auth/AuthContext'

const CONTEXTS = ['Personal', 'Group'] as const
const TRANSACTION_TYPES = ['Expense', 'Income', 'Transfer', 'Refund'] as const
const METHODS = {
  Equal: 'equal',
  'By Amount': 'exact_amount',
  'By %': 'percentage',
  Shares: 'shares',
} as const
const localDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const today = () => localDate(new Date())

function toTransactionTimestamp(date: string): string {
  const now = new Date()
  return (date === localDate(now) ? now : new Date(`${date}T12:00:00`)).toISOString()
}

function MissingHint({ missing }: { missing: string[] }) {
  return (
    <p
      aria-live="polite"
      className={
        missing.length > 0
          ? 'text-center text-sm text-muted-foreground'
          : 'text-center text-sm text-primary'
      }
    >
      {missing.length > 0 ? `Still needed: ${missing.join(', ')}` : '✓ All set — ready to save'}
    </p>
  )
}

function GroupFields({
  groupId,
  setGroupId,
  accountSelected,
  categorySelected,
  amount,
  missing,
  onSubmit,
  busy,
  error,
}: {
  groupId: string
  setGroupId: (id: string) => void
  accountSelected: boolean
  categorySelected: boolean
  amount: number
  missing: string[]
  onSubmit: (
    method: string,
    splits: { user_id: string; value: number | null; paid_minor: number }[],
  ) => void
  busy: boolean
  error: string | null
}) {
  const { currency } = useCurrency()
  const groups = useGroups()
  const members = (useMembers(groupId).data ?? []).filter((m) => m.status === 'active' && m.user_id)
  const me = useMe().data
  const [method, setMethod] = useState<keyof typeof METHODS>('Equal')
  const [included, setIncluded] = useState<Record<string, boolean>>({})
  const [values, setValues] = useState<Record<string, string>>({})
  const [payer, setPayer] = useState('')

  const chosen = members.filter((m) => included[m.user_id as string] ?? true)
  const payerId = payer || me?.id || ''
  const groupSelected = !!groups?.some((group) => group.id === groupId)

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
      {groups === undefined ? (
        <p className="text-sm text-muted-foreground">Loading groups…</p>
      ) : groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          You don't have a group yet.{' '}
          <Link to="/money/groups" className="text-primary underline">
            Add a group
          </Link>
        </p>
      ) : (
        <Field label="Group" required>
          <Select
            aria-label="Group"
            value={groupId}
            onValueChange={setGroupId}
            placeholder="Select group…"
            options={[...groups]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((group) => ({ value: group.id, label: group.name }))}
          />
        </Field>
      )}
      {groupSelected && (
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
      <MissingHint missing={groupSelected ? missing : ['Group', ...missing]} />
      <Button
        className="h-12 w-full rounded-card"
        disabled={
          !groupSelected ||
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
  const { token } = useAuth()
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
  // Whether the current category was guessed from the title or picked by the user.
  // Manual picks are never replaced by a later guess.
  const [categorySource, setCategorySource] = useState<'suggested' | 'manual' | null>(null)
  const [date, setDate] = useState(today())
  const [chosenAccountId, setAccountId] = useState('')
  const [transferToAccountId, setTransferToAccountId] = useState('')
  const [transferAccountDirection, setTransferAccountDirection] = useState<'From' | 'To'>('From')
  const [groupId, setGroupId] = useState(presetGroup)
  const post = useAction<object>('/money/transactions', [['gtx'], ['balances']])

  const activeAccounts =
    accounts
      ?.filter((account) => account.status === 'active')
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })) ?? []
  const transactionAccounts = activeAccounts.filter((account) =>
    canHaveDirectTransactions(account.account_type),
  )
  const accountId =
    chosenAccountId ||
    (transactionType !== 'transfer'
      ? transactionAccounts.find((account) => account.is_default)?.id ??
        (transactionAccounts.length === 1 ? transactionAccounts[0].id : '')
      : '')
  const categoryType = categoryTypeForTransaction(transactionType)
  const visibleCategories =
    categories?.filter(
      (item) =>
        item.status === 'active' && !item.is_hidden && item.transaction_type === categoryType,
    ) ?? []
  const selectedCategory = visibleCategories.find((item) => item.name === category)
  const transferRequirement =
    transactionType === 'transfer' && selectedCategory
      ? transferAccountRequirement(selectedCategory.name)
      : null
  const transferUsesSource =
    transferRequirement === 'both' ||
    transferRequirement === 'source' ||
    (transferRequirement === 'either' && transferAccountDirection === 'From')
  const transferUsesDestination =
    transferRequirement === 'both' ||
    transferRequirement === 'destination' ||
    (transferRequirement === 'either' && transferAccountDirection === 'To')
  const sourceAccountId =
    transactionType === 'transfer' ? (transferUsesSource ? accountId : null) : accountId
  const destinationAccountId = transferUsesDestination ? transferToAccountId : null
  const sourceAccount = activeAccounts.find((account) => account.id === sourceAccountId)
  const destinationAccount = activeAccounts.find((account) => account.id === destinationAccountId)
  const transferCategoryError =
    transactionType === 'transfer' && selectedCategory
      ? transferCategoryAccountError(selectedCategory.name, !!sourceAccount, !!destinationAccount)
      : null
  const transferAccountsValid =
    transferCategoryError === null &&
    (!sourceAccountId || !!sourceAccount) &&
    (!destinationAccountId || !!destinationAccount) &&
    (!sourceAccountId || sourceAccountId !== destinationAccountId)
  const valid = amount > 0 && title.trim().length > 0 && !!date
  const accountSelected =
    transactionType === 'transfer'
      ? !!selectedCategory && transferAccountsValid
      : transactionAccounts.some((account) => account.id === accountId)
  const missing = [
    !title.trim() && 'Title',
    amount <= 0 && 'Amount',
    !date && 'Date',
    !selectedCategory && 'Category',
    !accountSelected && 'Account',
  ].filter((item): item is string => !!item)

  async function analyseBill(images: Blob[], signal: AbortSignal) {
    const encoded = await Promise.all(images.map((image) => new Promise<{ mime_type: string; data: string }>((resolve, reject) => {
      const reader = new FileReader()
      reader.onerror = () => reject(new Error('Could not read the bill photo.'))
      reader.onload = () => {
        if (typeof reader.result !== 'string') {
          reject(new Error('Could not read the bill photo.'))
          return
        }
        resolve({ mime_type: image.type, data: reader.result.split(',')[1] })
      }
      reader.readAsDataURL(image)
    })))
    signal.throwIfAborted()
    const result = await api<{
      is_bill: boolean
      title: string | null
      total_amount: string | null
      bill_date: string | null
      merchant_name: string | null
      summary: string | null
      category: string | null
    }>('/money/ai/expense', token ?? '', {
      method: 'POST',
      body: JSON.stringify({ images: encoded, categories: visibleCategories.map((item) => item.name) }),
      signal,
    })
    signal.throwIfAborted()
    if (!result.is_bill) throw new Error('This image is not a valid bill.')
    if (result.title !== null) setTitle(result.title)
    if (result.total_amount !== null) setAmount(toMinor(result.total_amount))
    if (result.bill_date !== null) setDate(result.bill_date)
    if (result.merchant_name !== null) setMerchant(result.merchant_name)
    if (result.summary !== null) setLongDescription(result.summary)
    if (
      result.category !== null &&
      visibleCategories.some((item) => item.name === result.category)
    ) {
      setCategory(result.category)
      setCategorySource('manual')
    }
  }

  async function createCategory(name: string) {
    const existing = categories?.find(
      (item) =>
        item.status === 'active' &&
        item.transaction_type === categoryType &&
        item.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
    )
    // A hidden category with this name already exists: bring it back instead of duplicating it.
    if (existing) {
      if (existing.is_hidden) await categoriesRepo.update(existing.id, { is_hidden: false })
      return existing.name
    }
    await categoriesRepo.create({
      name,
      icon: 'tag',
      color: null,
      transaction_type: categoryType,
      is_system: false,
      is_hidden: false,
    })
    return name
  }

  async function savePersonal() {
    if (!accountSelected || !valid) return
    if (transactionType === 'transfer' && (!selectedCategory || transferCategoryError)) return
    const savedMerchant =
      context === 'Personal' && transactionType === 'expense' ? merchant.trim() : ''
    if (savedMerchant) await merchantsRepo.ensure(savedMerchant)
    await transactionsRepo.create({
      account_id: sourceAccountId,
      transfer_to_account_id: transactionType === 'transfer' ? destinationAccountId : null,
      category_id: selectedCategory?.id ?? null,
      group_id: null,
      context: 'personal',
      transaction_type: transactionType,
      title: title.trim(),
      long_description: longDescription.trim() || null,
      merchant: savedMerchant || null,
      amount_minor: amount,
      currency,
      transaction_date: toTransactionTimestamp(date),
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
        merchant: merchant.trim() || null,
        amount_minor: amount,
        transaction_date: toTransactionTimestamp(date),
        split_method: method,
        splits,
      },
      { onSuccess: () => nav(`/money/groups/${groupId}`) },
    )
  }

  /**
   * Prefill the category from the title once the user leaves the title field.
   * It only runs while the category is empty or was itself suggested, so a
   * choice the user made in the dropdown always wins.
   */
  function applyCategorySuggestion() {
    if (transactionType === 'transfer') return
    if (categorySource === 'manual') return
    if (category && categorySource !== 'suggested') return
    const suggestion = suggestCategory(title, visibleCategories.map((item) => item.name))
    if (suggestion) {
      setCategory(suggestion)
      setCategorySource('suggested')
    } else if (categorySource === 'suggested') {
      // The title no longer points anywhere: drop the stale guess.
      setCategory(null)
      setCategorySource(null)
    }
  }

  const categoryLabel = transactionType === 'refund' ? 'Expense category' : 'Category'
  const categoryField = (
    <Field
      label={categoryLabel}
      required
      hint={
        visibleCategories.length === 0
          ? 'No categories yet. Type a name to add your first one.'
          : categorySource === 'suggested' && selectedCategory
            ? 'Suggested from the title — change it if you like.'
            : undefined
      }
    >
      <CategoryCombobox
        aria-label={categoryLabel}
        value={selectedCategory?.name ?? null}
        onChange={(nextCategory) => {
          setCategory(nextCategory)
          setCategorySource('manual')
          if (transactionType === 'transfer') {
            setAccountId('')
            setTransferToAccountId('')
            setTransferAccountDirection('From')
          }
        }}
        onCreate={createCategory}
        options={visibleCategories.map((item) => item.name)}
      />
    </Field>
  )

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <PageHeader title="Add Transaction" />
        {transactionType === 'expense' && (
          <ImageCapture
            title="Scan a bill"
            photoDescription="a bill photo"
            review={{
              dialogLabel: 'Review bill photo',
              title: 'Preview the Photo',
              firstImageLabel: 'Captured bill',
              imageLabel: (index) => `Bill photo ${index}`,
              notice: 'Images are about to sent to our AI for the Magic 🪄',
              progressLabel: 'Analysing your bill',
              errorMessage: 'Unable to analyse the bill.',
              actionLabel: 'Analyse with AI',
              onAnalyse: analyseBill,
            }}
            trigger={(open) => (
              <button
                type="button"
                onClick={open}
                aria-label="Scan a bill"
                title="Scan a bill"
                className="surface flex size-11 shrink-0 items-center justify-center rounded-xl text-primary transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-95 motion-reduce:transition-none"
              >
                <Camera aria-hidden="true" size={20} />
              </button>
            )}
          />
        )}
      </div>
      <SegmentedControl
        options={[...TRANSACTION_TYPES]}
        value={TRANSACTION_TYPES.find((option) => option.toLowerCase() === transactionType)!}
        onChange={(value) => {
          const nextType = value.toLowerCase() as TransactionType
          setTransactionType(nextType)
          setCategory(nextType === 'transfer' ? 'Self Transfer' : null)
          setCategorySource(null)
          setAccountId('')
          setTransferToAccountId('')
          setTransferAccountDirection('From')
          if (nextType !== 'expense') setContext('Personal')
        }}
      />
      <p className="text-xs text-muted-foreground">
        <span aria-hidden="true" className="text-destructive">
          *
        </span>{' '}
        Required
      </p>
      <Field label="Title" required>
        <Input
          autoFocus
          aria-required="true"
          placeholder="e.g., Lunch with team"
          maxLength={120}
          enterKeyHint="next"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={applyCategorySuggestion}
        />
      </Field>
      <CurrencyInput required value={amount} onChange={setAmount} />
      <TransactionDatePicker value={date} onChange={setDate} />
      {categoryField}
      {transactionType === 'transfer' ? (
        transferRequirement ? (
          <>
            {transferRequirement === 'either' && (
              <SegmentedControl
                options={['From', 'To']}
                value={transferAccountDirection}
                onChange={(direction) => {
                  setTransferAccountDirection(direction)
                  setAccountId('')
                  setTransferToAccountId('')
                }}
              />
            )}
            {transferUsesSource && (
              <label className="block">
                <span className="label">
                  From account
                  <RequiredMark />
                </span>
                <Select
                  aria-label="From account"
                  alignItemWithTrigger={false}
                  value={accountId}
                  onValueChange={setAccountId}
                  className="mt-1 normal-case"
                  placeholder="Select an account…"
                  options={activeAccounts
                    .filter(
                      (account) =>
                        transferRequirement !== 'both' || account.id !== transferToAccountId,
                    )
                    .map((account) => ({ value: account.id, label: account.name }))}
                />
              </label>
            )}
            {transferUsesDestination && (
              <label className="block">
                <span className="label">
                  To account
                  <RequiredMark />
                </span>
                <Select
                  aria-label="To account"
                  alignItemWithTrigger={false}
                  value={transferToAccountId}
                  onValueChange={setTransferToAccountId}
                  className="mt-1 normal-case"
                  placeholder="Select an account…"
                  options={activeAccounts
                    .filter((account) => transferRequirement !== 'both' || account.id !== accountId)
                    .map((account) => ({ value: account.id, label: account.name }))}
                />
              </label>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Choose a category to select the account direction.
          </p>
        )
      ) : (
        <label className="block">
          <span className="label">
            {transactionType === 'income' || transactionType === 'refund'
              ? 'Received into'
              : 'Paid from'}
            <RequiredMark />
          </span>
          {transactionAccounts.length > 0 ? (
            <Select
              alignItemWithTrigger={false}
              aria-label={
                transactionType === 'income' || transactionType === 'refund'
                  ? 'Received into'
                  : 'Paid from'
              }
              value={accountId}
              onValueChange={setAccountId}
              className="mt-1 normal-case"
              placeholder="Select an account…"
              options={transactionAccounts.map((account) => ({
                value: account.id,
                label: account.name,
              }))}
            />
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              Add an account that supports transactions before creating a transaction.{' '}
              <Link to="/money/settings/accounts" className="text-primary underline">
                Add account
              </Link>
            </p>
          )}
        </label>
      )}
      <SectionTitle>Optional details</SectionTitle>
      {transactionType === 'expense' && (
        <Field label="Merchant" optional>
          <AutocompleteInput
            aria-label="Merchant"
            placeholder="Choose or enter a merchant"
            value={merchant}
            onChange={setMerchant}
            options={merchants.map((item) => item.name)}
          />
        </Field>
      )}
      <Field label="Long Description" optional>
        <textarea
          aria-label="Long Description"
          rows={4}
          maxLength={1000}
          placeholder="Add notes, items bought, or anything worth remembering"
          value={longDescription}
          onChange={(e) => setLongDescription(e.target.value)}
          className="field min-h-24 resize-y"
        />
      </Field>
      {transactionType === 'expense' && (
        <div className="space-y-1.5">
          <span className="label">Transaction context</span>
          <SegmentedControl
            options={[...CONTEXTS]}
            value={context}
            onChange={setContext}
            variant="neutral"
          />
        </div>
      )}
      {context === 'Personal' ? (
        <>
          <MissingHint missing={missing} />
          <Button
            className="h-12 w-full rounded-card"
            disabled={!valid || !accountSelected || !selectedCategory || !!transferCategoryError}
            onClick={savePersonal}
          >
            Save {TRANSACTION_TYPES.find((option) => option.toLowerCase() === transactionType)}
          </Button>
        </>
      ) : (
        <GroupFields
          key={context}
          groupId={groupId}
          setGroupId={setGroupId}
          accountSelected={accountSelected}
          categorySelected={!!selectedCategory}
          amount={valid ? amount : 0}
          missing={missing}
          onSubmit={saveShared}
          busy={post.isPending}
          error={post.error?.message ?? null}
        />
      )}
    </div>
  )
}
