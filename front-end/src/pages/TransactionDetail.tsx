import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import type { ReactNode } from 'react'
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  CornerUpLeft,
  Pencil,
  Trash2,
} from 'lucide-react'
import {
  AutocompleteInput,
  Button,
  Card,
  CurrencyInput,
  Input,
  PageHeader,
  Select,
} from '@/components/kit'
import { db } from '@/db/db'
import { merchantsRepo, transactionsRepo } from '@/db/repos'
import type { TransactionType } from '@/db/types'
import { canHaveDirectTransactions } from '@/lib/accounts'
import { formatMinor } from '@/lib/money'
import {
  categoryTypeForTransaction,
  transferCategoryAccountError,
} from '@/lib/transaction-categories'
import { useCurrency } from '@/money/CurrencyContext'

const NO_ACCOUNT = '__no_account__'

const TYPE_STYLE = {
  expense: {
    label: 'Expense',
    Icon: ArrowUpRight,
    color: 'text-destructive',
    surface: 'bg-destructive/10',
    prefix: '−',
  },
  income: {
    label: 'Income',
    Icon: ArrowDownLeft,
    color: 'text-positive',
    surface: 'bg-positive/10',
    prefix: '+',
  },
  refund: {
    label: 'Refund',
    Icon: CornerUpLeft,
    color: 'text-positive',
    surface: 'bg-positive/10',
    prefix: '+',
  },
  transfer: {
    label: 'Transfer',
    Icon: ArrowLeftRight,
    color: 'text-primary',
    surface: 'bg-primary/10',
    prefix: '',
  },
} as const
const TRANSACTION_TYPE_OPTIONS: { value: TransactionType; label: string }[] = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
  { value: 'refund', label: 'Refund' },
  { value: 'transfer', label: 'Transfer' },
]

export default function TransactionDetail() {
  const { currency } = useCurrency()
  const { transactionId = '' } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editAmount, setEditAmount] = useState(0)
  const [editDate, setEditDate] = useState('')
  const [editType, setEditType] = useState<TransactionType>('expense')
  const [editCategoryId, setEditCategoryId] = useState('')
  const [editMerchant, setEditMerchant] = useState('')
  const [editLongDescription, setEditLongDescription] = useState('')
  const [editAccountId, setEditAccountId] = useState('')
  const [editTransferToAccountId, setEditTransferToAccountId] = useState('')
  const [editError, setEditError] = useState<string | null>(null)
  const origin =
    typeof location.state === 'object' &&
    location.state !== null &&
    'from' in location.state &&
    typeof location.state.from === 'string'
      ? location.state.from
      : '/money/transactions'
  const returnTo =
    origin.startsWith('/money/accounts/') || origin.startsWith('/money/budgets/categories/')
      ? origin
      : '/money/transactions'
  const returnLabel =
    returnTo === '/money/transactions'
      ? '← Transactions'
      : returnTo.startsWith('/money/budgets/categories/')
        ? '← Category'
        : '← Account'
  const transaction = useLiveQuery(() => transactionsRepo.get(transactionId), [transactionId])
  const categories = useLiveQuery(() => db.categories.toArray(), [])
  const accounts = useLiveQuery(() => db.accounts.toArray(), [])
  const merchants = useLiveQuery(() => merchantsRepo.list(), []) ?? []

  if (transaction === undefined)
    return (
      <div className="space-y-4">
        <Link to={returnTo} className="text-sm text-primary">
          {returnLabel}
        </Link>
        <p className="text-muted-foreground">Loading transaction…</p>
      </div>
    )

  if (!transaction)
    return (
      <div className="space-y-4">
        <Link to={returnTo} className="text-sm text-primary">
          {returnLabel}
        </Link>
        <p className="text-muted-foreground">Transaction not found.</p>
      </div>
    )

  const selectedTransaction = transaction
  const kind = TYPE_STYLE[selectedTransaction.transaction_type]
  const displayType = editing ? editType : selectedTransaction.transaction_type
  const displayKind = TYPE_STYLE[displayType]
  const { Icon } = displayKind
  const categoryName = categories?.find(
    (category) => category.id === selectedTransaction.category_id,
  )?.name
  const accountName = accounts?.find(
    (account) => account.id === selectedTransaction.account_id,
  )?.name
  const destinationName = accounts?.find(
    (account) => account.id === selectedTransaction.transfer_to_account_id,
  )?.name
  const accountOptionsFor = (currentId: string | null, type: TransactionType) =>
    accounts
      ?.filter(
        (account) =>
          (account.status === 'active' || account.id === currentId) &&
          (type === 'transfer' ||
            canHaveDirectTransactions(account.account_type) ||
            account.id === currentId),
      )
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
      .map((account) => ({
        value: account.id,
        label: account.status === 'active' ? account.name : `${account.name} (inactive)`,
      })) ?? []
  const accountOptions = accountOptionsFor(selectedTransaction.account_id, displayType)
  const destinationAccountOptions = accountOptionsFor(
    selectedTransaction.transfer_to_account_id,
    displayType,
  )
  const editCategories =
    categories?.filter(
      (category) =>
        category.transaction_type === categoryTypeForTransaction(editType) &&
        ((category.status === 'active' && !category.is_hidden) || category.id === editCategoryId),
    ) ?? []
  const dateValue = selectedTransaction.transaction_date.slice(0, 10)
  const date = new Date(`${dateValue}T12:00:00`)
  const dateLabel = Number.isNaN(date.getTime())
    ? dateValue
    : date.toLocaleDateString('en-IN', { dateStyle: 'long' })

  function startEditing() {
    setEditAmount(selectedTransaction.amount_minor)
    setEditDate(dateValue)
    setEditType(selectedTransaction.transaction_type)
    setEditCategoryId(selectedTransaction.category_id ?? '')
    setEditMerchant(selectedTransaction.merchant ?? '')
    setEditLongDescription(selectedTransaction.long_description ?? '')
    setEditAccountId(selectedTransaction.account_id ?? '')
    setEditTransferToAccountId(selectedTransaction.transfer_to_account_id ?? '')
    setEditError(null)
    setEditing(true)
  }

  function changeEditType(value: string) {
    const nextType = TRANSACTION_TYPE_OPTIONS.find((option) => option.value === value)?.value
    if (!nextType) return

    const currentCategory = categories?.find((category) => category.id === editCategoryId)
    if (
      !currentCategory ||
      currentCategory.transaction_type !== categoryTypeForTransaction(nextType)
    ) {
      setEditCategoryId('')
    }

    if (editType === 'transfer' && nextType !== 'transfer') {
      if (!editAccountId) setEditAccountId(editTransferToAccountId)
      setEditTransferToAccountId('')
    } else if (editType !== 'transfer' && nextType === 'transfer') {
      setEditTransferToAccountId('')
    }

    setEditType(nextType)
    setEditError(null)
  }

  async function saveTransaction() {
    if (editAmount <= 0) {
      setEditError('Amount must be greater than zero.')
      return
    }

    const parsedDate = new Date(`${editDate}T12:00:00`)
    if (!editDate || Number.isNaN(parsedDate.getTime())) {
      setEditError('Choose a valid transaction date.')
      return
    }

    const selectedCategory = categories?.find((item) => item.id === editCategoryId)
    if (
      editCategoryId &&
      (!selectedCategory ||
        selectedCategory.transaction_type !== categoryTypeForTransaction(editType))
    ) {
      setEditError('Choose a category that matches the transaction type.')
      return
    }
    const accountIsAvailable = (id: string, currentId: string | null, type: TransactionType) => {
      const account = accounts?.find((item) => item.id === id)
      return (
        !id ||
        (!!account &&
          (account.status === 'active' || account.id === currentId) &&
          (type === 'transfer' ||
            canHaveDirectTransactions(account.account_type) ||
            account.id === currentId))
      )
    }

    if (editType !== 'transfer') {
      if (
        !editAccountId ||
        !accountIsAvailable(editAccountId, selectedTransaction.account_id, editType)
      ) {
        setEditError('Select an available account.')
        return
      }
    } else {
      if (
        !accountIsAvailable(editAccountId, selectedTransaction.account_id, editType) ||
        !accountIsAvailable(
          editTransferToAccountId,
          selectedTransaction.transfer_to_account_id,
          editType,
        )
      ) {
        setEditError('Select available accounts.')
        return
      }
      if (!selectedCategory) {
        setEditError('Choose a category for this transfer.')
        return
      }
      const categoryError = transferCategoryAccountError(
        selectedCategory.name,
        !!editAccountId,
        !!editTransferToAccountId,
      )
      if (categoryError) {
        setEditError(categoryError)
        return
      }
      if (editAccountId && editAccountId === editTransferToAccountId) {
        setEditError('A transfer must use different accounts.')
        return
      }
    }

    setSaving(true)
    setEditError(null)
    try {
      const merchant = editMerchant.trim()
      if (merchant) await merchantsRepo.ensure(merchant)
      await transactionsRepo.update(selectedTransaction.id, {
        amount_minor: editAmount,
        transaction_date: parsedDate.toISOString(),
        transaction_type: editType,
        category_id: editCategoryId || null,
        account_id: editAccountId || null,
        transfer_to_account_id: editType === 'transfer' ? editTransferToAccountId || null : null,
        merchant: merchant || null,
        long_description: editLongDescription.trim() || null,
      })
      setEditing(false)
    } catch (error) {
      setEditError(error instanceof Error ? error.message : 'Unable to update transaction.')
    } finally {
      setSaving(false)
    }
  }

  async function deleteTransaction() {
    if (!window.confirm(`Delete "${selectedTransaction.title}"?`)) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await transactionsRepo.remove(selectedTransaction.id)
      navigate(returnTo, { replace: true })
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Unable to delete transaction.')
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-4">
      <Link to={returnTo} className="text-sm text-primary">
        {returnLabel}
      </Link>
      <PageHeader title={selectedTransaction.title} subtitle={displayKind.label} />
      <Card className="space-y-5">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className={`flex size-12 shrink-0 items-center justify-center rounded-full ${displayKind.surface} ${displayKind.color}`}
          >
            <Icon size={23} strokeWidth={2.2} />
          </span>
          {editing ? (
            <div className="min-w-0 flex-1">
              <CurrencyInput label="Amount" value={editAmount} onChange={setEditAmount} />
            </div>
          ) : (
            <div className={`money text-2xl font-bold ${displayKind.color}`}>
              {displayKind.prefix}
              {formatMinor(selectedTransaction.amount_minor, currency)}
            </div>
          )}
        </div>
        <dl className="divide-y divide-border/60">
          {editing ? (
            <EditRow label="Date">
              <Input
                aria-label="Date"
                type="date"
                value={editDate}
                onChange={(event) => setEditDate(event.target.value)}
              />
            </EditRow>
          ) : (
            <DetailRow label="Date" value={dateLabel} />
          )}
          {editing ? (
            <EditRow label="Type">
              <Select
                aria-label="Type"
                value={editType}
                onValueChange={changeEditType}
                options={TRANSACTION_TYPE_OPTIONS}
              />
            </EditRow>
          ) : (
            <DetailRow label="Type" value={kind.label} />
          )}
          {editing ? (
            <EditRow label="Category">
              <div role="group" aria-label="Category" className="flex flex-wrap gap-2">
                {editCategories.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    aria-pressed={category.id === editCategoryId}
                    onClick={() => setEditCategoryId(category.id)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                      category.id === editCategoryId
                        ? 'gloss border-transparent text-primary-foreground'
                        : 'border-border bg-card text-muted-foreground'
                    }`}
                  >
                    {category.name}
                  </button>
                ))}
                {editCategories.length === 0 && (
                  <span className="text-sm text-muted-foreground">No categories available</span>
                )}
              </div>
            </EditRow>
          ) : (
            <DetailRow label="Category" value={categoryName ?? 'Uncategorised'} />
          )}
          {displayType === 'transfer' ? (
            <>
              {editing ? (
                <>
                  <AccountSelectRow
                    label="From account"
                    value={editAccountId}
                    options={accountOptions}
                    optional
                    onChange={setEditAccountId}
                  />
                  <AccountSelectRow
                    label="To account"
                    value={editTransferToAccountId}
                    options={destinationAccountOptions}
                    optional
                    onChange={setEditTransferToAccountId}
                  />
                </>
              ) : (
                <>
                  {accountName && <DetailRow label="From account" value={accountName} />}
                  {destinationName && <DetailRow label="To account" value={destinationName} />}
                </>
              )}
            </>
          ) : editing ? (
            <AccountSelectRow
              label="Account"
              value={editAccountId}
              options={accountOptions}
              onChange={setEditAccountId}
            />
          ) : (
            <DetailRow label="Account" value={accountName ?? 'Account'} />
          )}
          {editing ? (
            <EditRow label="Merchant">
              <AutocompleteInput
                aria-label="Merchant"
                placeholder="Choose or enter a merchant"
                value={editMerchant}
                onChange={setEditMerchant}
                options={merchants.map((merchant) => merchant.name)}
              />
            </EditRow>
          ) : (
            selectedTransaction.merchant && (
              <DetailRow label="Merchant" value={selectedTransaction.merchant} />
            )
          )}
          {editing ? (
            <EditRow label="Long Description">
              <textarea
                aria-label="Long Description"
                rows={3}
                value={editLongDescription}
                onChange={(event) => setEditLongDescription(event.target.value)}
                className="field min-h-20 w-full resize-y"
              />
            </EditRow>
          ) : (
            selectedTransaction.long_description && (
              <DetailRow label="Long Description" value={selectedTransaction.long_description} />
            )
          )}
          {selectedTransaction.notes && (
            <DetailRow label="Notes" value={selectedTransaction.notes} />
          )}
        </dl>
        {editError && (
          <p role="alert" className="text-sm text-destructive">
            {editError}
          </p>
        )}
      </Card>
      {editing ? (
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            disabled={saving}
            onClick={() => setEditing(false)}
          >
            Cancel
          </Button>
          <Button
            className="flex-1"
            disabled={saving || !accounts || !categories}
            onClick={() => void saveTransaction()}
          >
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      ) : selectedTransaction.context === 'personal' ? (
        <Button variant="outline" className="w-full" onClick={startEditing}>
          <Pencil size={16} />
          Edit transaction
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">
          Group transactions can’t be edited here yet.
        </p>
      )}
      <Button
        variant="destructive"
        className="w-full"
        disabled={deleting || saving || editing}
        onClick={() => void deleteTransaction()}
      >
        <Trash2 size={16} />
        {deleting ? 'Deleting…' : 'Delete transaction'}
      </Button>
      {deleteError && (
        <p role="alert" className="text-sm text-destructive">
          {deleteError}
        </p>
      )}
    </div>
  )
}

function EditRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 text-sm">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1">{children}</dd>
    </div>
  )
}

function AccountSelectRow({
  label,
  value,
  options,
  onChange,
  optional = false,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
  optional?: boolean
}) {
  const selectOptions = optional
    ? [{ value: NO_ACCOUNT, label: 'No account' }, ...options]
    : options

  return (
    <div className="flex items-start justify-between gap-4 py-3 text-sm">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1">
        <Select
          aria-label={label}
          value={value || (optional ? NO_ACCOUNT : '')}
          onValueChange={(next) => onChange(next === NO_ACCOUNT ? '' : next)}
          placeholder="Select an account…"
          options={selectOptions}
        />
      </dd>
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 text-sm">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right font-medium">{value}</dd>
    </div>
  )
}
