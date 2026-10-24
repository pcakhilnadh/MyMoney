import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react'
import { Button, Card, CurrencyInput, Input, MetalActionButton, PageHeader } from '@/components/kit'
import { TransactionList } from '@/components/TransactionList'
import { accountsRepo, duePaymentsRepo, transactionsRepo } from '@/db/repos'
import type { AccountType } from '@/db/types'
import { interestPaid, summarizeAccount } from '@/lib/accounts'
import { formatMinor } from '@/lib/money'
import { useCurrency } from '@/money/CurrencyContext'

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
  const { currency } = useCurrency()
  const { accountId = '' } = useParams()
  const navigate = useNavigate()
  const account = useLiveQuery(() => accountsRepo.get(accountId), [accountId])
  const transactions =
    useLiveQuery(() => transactionsRepo.listByDate(), [])?.filter(
      (transaction) =>
        transaction.account_id === accountId || transaction.transfer_to_account_id === accountId,
    ) ?? []
  const allTransactions = useLiveQuery(() => transactionsRepo.list(), []) ?? []
  const payments = useLiveQuery(() => duePaymentsRepo.list(), []) ?? []
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState<AccountType>('bank')
  const [opening, setOpening] = useState(0)
  const [limit, setLimit] = useState(0)
  const [dueDay, setDueDay] = useState('')
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
        <Link to="/money/settings/accounts" className="text-sm text-primary">
          ← Payment Account
        </Link>
        <p className="text-muted-foreground">Loading account…</p>
      </div>
    )

  if (!account)
    return (
      <div className="space-y-4">
        <Link to="/money/settings/accounts" className="text-sm text-primary">
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

  function startEditing() {
    if (!account) return
    let canonicalType = account.account_type
    switch (account.account_type) {
      case 'cash':
        canonicalType = 'bank'
        break
      case 'upi':
      case 'debit_card':
        canonicalType = 'wallet'
        break
      case 'loan_payable':
        canonicalType = 'loan'
        break
      case 'money_lent':
        canonicalType = 'asset'
        break
    }
    setName(account.name)
    setType(canonicalType)
    setOpening(account.opening_balance)
    setLimit(account.credit_limit ?? 0)
    setDueDay(account.payment_due_day == null ? '' : String(account.payment_due_day))
    setEditing(true)
  }

  async function saveAccount() {
    if (!account || !name.trim()) return
    const isCreditCard = type === 'credit_card'
    const hasDueDay = isCreditCard || type === 'loan'
    const day = Number(dueDay)
    await accountsRepo.update(account.id, {
      name: name.trim(),
      account_type: type,
      currency,
      opening_balance: opening,
      credit_limit: isCreditCard && limit > 0 ? limit : null,
      payment_due_day:
        hasDueDay && Number.isInteger(day) && day >= 1 && day <= 31 ? day : null,
      is_default: account.is_default,
    })
    setEditing(false)
  }

  async function deleteAccount() {
    if (!account) return
    if (!window.confirm(`Delete "${account.name}"? Its transactions will remain in your history.`))
      return
    if (account.is_default) {
      const replacement = (await accountsRepo.list()).find((item) => item.id !== account.id)
      if (replacement) await accountsRepo.update(replacement.id, { is_default: true })
    }
    await accountsRepo.remove(account.id)
    navigate('/money/settings/accounts', { replace: true })
  }

  return (
    <div className="space-y-4">
      <Link to="/money/settings/accounts" className="text-sm text-primary">
        ← Payment Account
      </Link>
      <div className="flex items-start justify-between gap-3">
        <PageHeader
          title={account.name}
          subtitle={ACCOUNT_TYPE_LABELS[account.account_type] ?? 'Other'}
        />
        <div className="flex shrink-0 items-center gap-1.5">
          <MetalActionButton label={`Edit ${account.name}`} onClick={startEditing}>
            <Pencil size={15} />
          </MetalActionButton>
          <MetalActionButton
            label={`Delete ${account.name}`}
            onClick={() => void deleteAccount()}
            destructive
          >
            <Trash2 size={15} />
          </MetalActionButton>
        </div>
      </div>
      {editing && (
        <Card className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Edit account</h2>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="flex items-center gap-1 text-sm text-muted-foreground"
            >
              <ArrowLeft size={16} />
              Cancel
            </button>
          </div>
          <label className="block space-y-1.5">
            <span className="label">Account name</span>
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="block space-y-1.5">
            <span className="label">Account type</span>
            <select
              value={type}
              onChange={(event) => setType(event.target.value as AccountType)}
              className="field w-full"
            >
              {[
                ['bank', 'Bank'],
                ['credit_card', 'Credit Card'],
                ['deposit', 'Deposit'],
                ['wallet', 'Wallet'],
                ['loan', 'Loan'],
                ['liability', 'Liability (Money You Owe)'],
                ['asset', 'Asset (Money Owed to You)'],
                ['other', 'Other'],
              ].map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <CurrencyInput value={opening} onChange={setOpening} label="Opening balance" />
          {type === 'credit_card' && (
            <CurrencyInput value={limit} onChange={setLimit} label="Credit limit (optional)" />
          )}
          {(type === 'credit_card' || type === 'loan') && (
            <label className="block space-y-1.5">
              <span className="label">Payment due day (optional)</span>
              <Input
                type="number"
                value={dueDay}
                onChange={(event) => setDueDay(event.target.value)}
                min="1"
                max="31"
                placeholder="1-31"
              />
            </label>
          )}
          <Button className="w-full" disabled={!name.trim()} onClick={() => void saveAccount()}>
            Save Account
          </Button>
        </Card>
      )}
      <Card className="space-y-4">
        <div className="text-center">
          <div className="text-sm text-muted-foreground">{balanceLabel}</div>
          <div className="money text-3xl font-bold">{formatMinor(balance, currency)}</div>
          {account.account_type === 'credit_card' && account.credit_limit != null && (
            <div className="mt-1 text-sm text-muted-foreground">
              {formatMinor(account.credit_limit - balance, currency)} available of{' '}
              {formatMinor(account.credit_limit, currency)}
            </div>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-xs text-muted-foreground">Debit</div>
            <div className="money text-sm font-semibold text-destructive">
              {formatMinor(totals.debit, currency)}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Credit</div>
            <div className="money text-sm font-semibold text-positive">
              {formatMinor(totals.credit, currency)}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Transfer</div>
            <div className="money text-sm font-semibold text-primary">
              {formatMinor(totals.transfer, currency)}
            </div>
          </div>
        </div>
      </Card>
      {(account.account_type === 'loan' || account.account_type === 'loan_payable') && (
        <Card className="text-center">
          <div className="text-sm text-muted-foreground">Interest paid</div>
          <div className="money text-xl font-bold">
            {formatMinor(interestPaid(account.id, payments), currency)}
          </div>
        </Card>
      )}
      {account.payment_due_day != null && (
        <p className="px-1 text-sm text-muted-foreground">
          Payment due on day {account.payment_due_day} of each month
        </p>
      )}
      {payments.some((p) => p.account_id === accountId) && (
        <>
          <h2 className="label px-1">Payments made</h2>
          <Card className="space-y-2">
            {payments
              .filter((p) => p.account_id === accountId)
              .sort((a, b) => b.paid_on.localeCompare(a.paid_on))
              .map((p) => (
                <div key={p.id} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {p.paid_on} (due {p.due_date})
                  </span>
                  <span className="money font-medium">
                    {formatMinor(p.amount_minor, currency)}
                    {p.interest_minor > 0 &&
                      ` · ${formatMinor(p.interest_minor, currency)} interest`}
                  </span>
                </div>
              ))}
          </Card>
        </>
      )}
      <h2 className="label px-1">Transactions</h2>
      {transactions.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No transactions for this account yet.
        </p>
      )}
      {transactions.length > 0 && <TransactionList transactions={transactions} />}
    </div>
  )
}
