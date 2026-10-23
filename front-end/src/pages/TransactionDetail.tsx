import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, CornerUpLeft, Trash2 } from 'lucide-react'
import { Button, Card, PageHeader } from '@/components/kit'
import { db } from '@/db/db'
import { transactionsRepo } from '@/db/repos'
import { formatMinor } from '@/lib/money'

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
  const { transactionId = '' } = useParams()
  const navigate = useNavigate()
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const transaction = useLiveQuery(() => transactionsRepo.get(transactionId), [transactionId])
  const categories = useLiveQuery(() => db.categories.toArray(), [])
  const accounts = useLiveQuery(() => db.accounts.toArray(), [])

  if (transaction === undefined)
    return (
      <div className="space-y-4">
        <Link to="/transactions" className="text-sm text-primary">
          ← Transactions
        </Link>
        <p className="text-muted-foreground">Loading transaction…</p>
      </div>
    )

  if (!transaction)
    return (
      <div className="space-y-4">
        <Link to="/transactions" className="text-sm text-primary">
          ← Transactions
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
  const date = new Date(selectedTransaction.transaction_date)
  const dateLabel = Number.isNaN(date.getTime())
    ? selectedTransaction.transaction_date
    : date.toLocaleString('en-IN', { dateStyle: 'long', timeStyle: 'short' })

  async function deleteTransaction() {
    if (!window.confirm(`Delete "${selectedTransaction.title}"?`)) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await transactionsRepo.remove(selectedTransaction.id)
      navigate('/transactions', { replace: true })
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Unable to delete transaction.')
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-4">
      <Link to="/transactions" className="text-sm text-primary">
        ← Transactions
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
          <div className={`money text-2xl font-bold ${kind.color}`}>
            {kind.prefix}
            {formatMinor(selectedTransaction.amount_minor)}
          </div>
        </div>
        <dl className="divide-y divide-border/60">
          <DetailRow label="Date" value={dateLabel} />
          <DetailRow label="Type" value={kind.label} />
          <DetailRow label="Category" value={categoryName ?? 'Uncategorised'} />
          <DetailRow label="Account" value={accountName ?? 'Account'} />
          {selectedTransaction.transaction_type === 'transfer' && (
            <DetailRow label="Transfer to" value={destinationName ?? 'Account'} />
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
      </Card>
      <Button
        variant="destructive"
        className="w-full"
        disabled={deleting}
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

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 text-sm">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right font-medium">{value}</dd>
    </div>
  )
}
