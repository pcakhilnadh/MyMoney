import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Card, ListItem, PageHeader } from '@/components/kit'
import { db } from '@/db/db'
import { accountsRepo, transactionsRepo } from '@/db/repos'
import { summarizeAccount } from '@/lib/accounts'
import { formatMinor } from '@/lib/money'

const KIND: Record<string, { label: string; style: string }> = {
  expense: { label: 'Debit', style: 'text-destructive' },
  income: { label: 'Credit', style: 'text-positive' },
  refund: { label: 'Credit', style: 'text-positive' },
  transfer: { label: 'Transfer', style: 'text-primary' },
}

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  bank: 'Bank',
  cash: 'Bank',
  credit_card: 'Credit Card',
  debit_card: 'Credit Card',
  deposit: 'Deposit',
  wallet: 'Wallet',
  upi: 'Wallet',
  loan: 'Loan',
  loan_payable: 'Loan',
  liability: 'Liability (Money You Owe)',
  asset: 'Asset (Money Owed to You)',
  money_lent: 'Asset (Money Owed to You)',
  other: 'Other',
}

export default function AccountDetail() {
  const { accountId = '' } = useParams()
  const account = useLiveQuery(() => accountsRepo.get(accountId), [accountId])
  const categories = useLiveQuery(() => db.categories.toArray(), []) ?? []
  const transactions =
    useLiveQuery(() => transactionsRepo.listByDate(), [])?.filter(
      (transaction) =>
        transaction.account_id === accountId || transaction.transfer_to_account_id === accountId,
    ) ?? []
  const allTransactions = useLiveQuery(() => transactionsRepo.list(), []) ?? []
  const totals = transactions.reduce(
    (sum, transaction) => {
      if (transaction.transaction_type === 'expense') sum.debit += transaction.amount_minor
      else if (
        transaction.transaction_type === 'income' ||
        transaction.transaction_type === 'refund'
      )
        sum.credit += transaction.amount_minor
      else if (transaction.transaction_type === 'transfer') sum.transfer += transaction.amount_minor
      return sum
    },
    { debit: 0, credit: 0, transfer: 0 },
  )

  if (account === undefined)
    return (
      <div className="space-y-4">
        <Link to="/settings/accounts" className="text-sm text-primary">
          ← Payment Account
        </Link>
        <p className="text-muted-foreground">Loading account…</p>
      </div>
    )

  if (!account)
    return (
      <div className="space-y-4">
        <Link to="/settings/accounts" className="text-sm text-primary">
          ← Payment Account
        </Link>
        <p className="text-muted-foreground">Account not found.</p>
      </div>
    )

  const balance = summarizeAccount(account, allTransactions).balance
  const balanceLabel =
    account.account_type === 'credit_card' ||
    account.account_type === 'loan' ||
    account.account_type === 'liability' ||
    account.account_type === 'loan_payable'
      ? 'Amount owed'
      : account.account_type === 'asset' || account.account_type === 'money_lent'
        ? 'Owed to you'
        : 'Current balance'

  return (
    <div className="space-y-4">
      <Link to="/settings/accounts" className="text-sm text-primary">
        ← Payment Account
      </Link>
      <PageHeader
        title={account.name}
        subtitle={ACCOUNT_TYPE_LABELS[account.account_type] ?? 'Other'}
      />
      <Card className="space-y-4">
        <div className="text-center">
          <div className="text-sm text-muted-foreground">{balanceLabel}</div>
          <div className="money text-3xl font-bold">{formatMinor(balance)}</div>
          {account.account_type === 'credit_card' && account.credit_limit != null && (
            <div className="mt-1 text-sm text-muted-foreground">
              {formatMinor(account.credit_limit - balance)} available of{' '}
              {formatMinor(account.credit_limit)}
            </div>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-xs text-muted-foreground">Debit</div>
            <div className="money text-sm font-semibold text-destructive">
              {formatMinor(totals.debit)}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Credit</div>
            <div className="money text-sm font-semibold text-positive">
              {formatMinor(totals.credit)}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Transfer</div>
            <div className="money text-sm font-semibold text-primary">
              {formatMinor(totals.transfer)}
            </div>
          </div>
        </div>
      </Card>
      <h2 className="label px-1">Transactions</h2>
      {transactions.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No transactions for this account yet.
        </p>
      )}
      {transactions.map((transaction) => {
        const categoryName = categories.find((item) => item.id === transaction.category_id)?.name
        const kind =
          transaction.transaction_type === 'transfer'
            ? {
                ...KIND.transfer,
                label: transaction.account_id === accountId ? 'Transfer out' : 'Transfer in',
              }
            : (KIND[transaction.transaction_type] ?? KIND.expense)
        return (
          <ListItem
            key={transaction.id}
            title={transaction.title}
            subtitle={[
              kind.label,
              categoryName,
              new Date(transaction.transaction_date).toLocaleDateString('en-IN'),
            ]
              .filter(Boolean)
              .join(' · ')}
            trailing={<span className={kind.style}>{formatMinor(transaction.amount_minor)}</span>}
          />
        )
      })}
    </div>
  )
}
