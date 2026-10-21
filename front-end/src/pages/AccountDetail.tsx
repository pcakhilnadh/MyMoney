import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Card, ListItem, PageHeader } from '@/components/kit'
import { accountsRepo, transactionsRepo } from '@/db/repos'
import { summarizeAccount } from '@/lib/accounts'
import { formatMinor } from '@/lib/money'

const KIND: Record<string, { label: string; style: string }> = {
  expense: { label: 'Debit', style: 'text-destructive' },
  income: { label: 'Credit', style: 'text-positive' },
  refund: { label: 'Credit', style: 'text-positive' },
  transfer: { label: 'Transfer', style: 'text-primary' },
}

export default function AccountDetail() {
  const { accountId = '' } = useParams()
  const account = useLiveQuery(() => accountsRepo.get(accountId), [accountId])
  const transactions =
    useLiveQuery(() => transactionsRepo.listByDate(), [])?.filter(
      (transaction) => transaction.account_id === accountId,
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
      else if (transaction.transaction_type === 'transfer')
        sum.transfer += transaction.amount_minor
      return sum
    },
    { debit: 0, credit: 0, transfer: 0 },
  )

  if (account === undefined)
    return (
      <div className="space-y-4">
        <Link to="/settings/accounts" className="text-sm text-primary">
          ← Accounts
        </Link>
        <p className="text-muted-foreground">Loading account…</p>
      </div>
    )

  if (!account)
    return (
      <div className="space-y-4">
        <Link to="/settings/accounts" className="text-sm text-primary">
          ← Accounts
        </Link>
        <p className="text-muted-foreground">Account not found.</p>
      </div>
    )

  const balance = summarizeAccount(account, allTransactions).balance

  return (
    <div className="space-y-4">
      <Link to="/settings/accounts" className="text-sm text-primary">
        ← Accounts
      </Link>
      <PageHeader title={account.name} subtitle={account.account_type.replace('_', ' ')} />
      <Card className="space-y-4">
        <div className="text-center">
          <div className="text-sm text-muted-foreground">
            {account.account_type === 'credit_card' ? 'Amount owed' : 'Current balance'}
          </div>
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
        const kind = KIND[transaction.transaction_type] ?? KIND.expense
        return (
          <ListItem
            key={transaction.id}
            title={transaction.description}
            subtitle={`${kind.label} · ${new Date(transaction.transaction_date).toLocaleDateString('en-IN')}`}
            trailing={
              <span className={kind.style}>{formatMinor(transaction.amount_minor)}</span>
            }
          />
        )
      })}
    </div>
  )
}
