import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  CornerUpLeft,
  Pencil,
  Trash2,
} from 'lucide-react'
import { Button, Card, CurrencyInput, PageHeader, Select } from '@/components/kit'
import { db } from '@/db/db'
import { transactionsRepo } from '@/db/repos'
import { formatMinor } from '@/lib/money'
import { transferCategoryAccountError } from '@/lib/transaction-categories'
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
  const { Icon } = kind
  const categoryName = categories?.find(
    (category) => category.id === selectedTransaction.category_id,
  )?.name
  const accountName = accounts?.find(
    (account) => account.id === selectedTransaction.account_id,
  )?.name
  const destinationName = accounts?.find(
    (account) => account.id === selectedTransaction.transfer_to_account_id,
  )?.name
  const transferCategoryName = categories?.find(
    (category) => category.id === selectedTransaction.category_id,
  )?.name
  const accountOptionsFor = (currentId: string | null) =>
    accounts
      ?.filter((account) => account.status === 'active' || account.id === currentId)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
      .map((account) => ({
        value: account.id,
        label: account.status === 'active' ? account.name : `${account.name} (inactive)`,
      })) ?? []
  const accountOptions = accountOptionsFor(selectedTransaction.account_id)
  const destinationAccountOptions = accountOptionsFor(selectedTransaction.transfer_to_account_id)
  const date = new Date(selectedTransaction.transaction_date)
  const dateLabel = Number.isNaN(date.getTime())
    ? selectedTransaction.transaction_date
    : date.toLocaleString('en-IN', { dateStyle: 'long', timeStyle: 'short' })

  function startEditing() {
    setEditAmount(selectedTransaction.amount_minor)
    setEditAccountId(selectedTransaction.account_id ?? '')
    setEditTransferToAccountId(selectedTransaction.transfer_to_account_id ?? '')
    setEditError(null)
    setEditing(true)
  }

  async function saveTransaction() {
    if (editAmount <= 0) {
      setEditError('Amount must be greater than zero.')
      return
    }

    const accountIsAvailable = (id: string, currentId: string | null) => {
      const account = accounts?.find((item) => item.id === id)
      return !id || (!!account && (account.status === 'active' || account.id === currentId))
    }
    if (
      selectedTransaction.transaction_type !== 'transfer' &&
      (!editAccountId || !accountIsAvailable(editAccountId, selectedTransaction.account_id))
    ) {
      setEditError('Select an available account.')
      return
    }

    if (selectedTransaction.transaction_type === 'transfer') {
      const accountsChanged =
        editAccountId !== (selectedTransaction.account_id ?? '') ||
        editTransferToAccountId !== (selectedTransaction.transfer_to_account_id ?? '')
      if (accountsChanged && !transferCategoryName) {
        setEditError('The transfer category is unavailable, so its accounts cannot be changed.')
        return
      }
      if (
        !accountIsAvailable(editAccountId, selectedTransaction.account_id) ||
        !accountIsAvailable(editTransferToAccountId, selectedTransaction.transfer_to_account_id)
      ) {
        setEditError('Select available accounts.')
        return
      }
      if (accountsChanged && transferCategoryName) {
        const categoryError = transferCategoryAccountError(
          transferCategoryName,
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
    }

    setSaving(true)
    setEditError(null)
    try {
      if (selectedTransaction.transaction_type === 'transfer') {
        await transactionsRepo.update(selectedTransaction.id, {
          amount_minor: editAmount,
          account_id: editAccountId || null,
          transfer_to_account_id: editTransferToAccountId || null,
        })
      } else {
        await transactionsRepo.update(selectedTransaction.id, {
          amount_minor: editAmount,
          account_id: editAccountId,
        })
      }
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
      <PageHeader title={selectedTransaction.title} subtitle={kind.label} />
      <Card className="space-y-5">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className={`flex size-12 shrink-0 items-center justify-center rounded-full ${kind.surface} ${kind.color}`}
          >
            <Icon size={23} strokeWidth={2.2} />
          </span>
          {editing ? (
            <div className="min-w-0 flex-1">
              <CurrencyInput label="Amount" value={editAmount} onChange={setEditAmount} />
            </div>
          ) : (
            <div className={`money text-2xl font-bold ${kind.color}`}>
              {kind.prefix}
              {formatMinor(selectedTransaction.amount_minor, currency)}
            </div>
          )}
        </div>
        <dl className="divide-y divide-border/60">
          <DetailRow label="Date" value={dateLabel} />
          <DetailRow label="Type" value={kind.label} />
          <DetailRow label="Category" value={categoryName ?? 'Uncategorised'} />
          {selectedTransaction.transaction_type === 'transfer' ? (
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
          {selectedTransaction.merchant && (
            <DetailRow label="Merchant" value={selectedTransaction.merchant} />
          )}
          <DetailRow
            label="Context"
            value={selectedTransaction.context === 'personal' ? 'Personal' : 'Group'}
          />
          {selectedTransaction.long_description && (
            <DetailRow label="Description" value={selectedTransaction.long_description} />
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
            disabled={
              saving ||
              !accounts ||
              (selectedTransaction.transaction_type === 'transfer' && !categories)
            }
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
