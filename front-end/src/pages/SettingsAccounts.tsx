import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  Button,
  CurrencyInput,
  Input,
  MetalActionButton,
  MetalBadge,
  MetalCard,
  PageHeader,
} from '@/components/kit'
import { accountsRepo, transactionsRepo } from '@/db/repos'
import type { AccountType } from '@/db/types'
import { summarizeAccount } from '@/lib/accounts'
import { formatMinor } from '@/lib/money'

const TYPES: AccountType[] = [
  'bank',
  'credit_card',
  'deposit',
  'wallet',
  'loan',
  'liability',
  'asset',
  'other',
]

const TYPE_LABELS: Record<AccountType, string> = {
  bank: 'Bank',
  credit_card: 'Credit Card',
  deposit: 'Deposit',
  wallet: 'Wallet',
  loan: 'Loan',
  liability: 'Liability (Money You Owe)',
  asset: 'Asset (Money Owed to You)',
  other: 'Other',
  cash: 'Bank',
  upi: 'Wallet',
  debit_card: 'Debit Card (legacy)',
  loan_payable: 'Loan',
  money_lent: 'Asset (Money Owed to You)',
}

const ACCOUNT_GROUPS: { label: string; types: AccountType[] }[] = [
  { label: 'Bank', types: ['bank', 'cash'] },
  { label: 'Credit Card', types: ['credit_card'] },
  { label: 'Deposit', types: ['deposit'] },
  { label: 'Wallet', types: ['wallet', 'upi', 'debit_card'] },
  { label: 'Loan', types: ['loan', 'loan_payable'] },
  { label: 'Liability (Money You Owe)', types: ['liability'] },
  { label: 'Asset (Money Owed to You)', types: ['asset', 'money_lent'] },
  { label: 'Other', types: ['other'] },
]

function currentAccountType(type: AccountType): AccountType {
  switch (type) {
    case 'cash':
      return 'bank'
    case 'upi':
    case 'debit_card':
      return 'wallet'
    case 'loan_payable':
      return 'loan'
    case 'money_lent':
      return 'asset'
    default:
      return type
  }
}

export default function SettingsAccounts() {
  const accounts = useLiveQuery(() => accountsRepo.list(), []) ?? []
  const txs = useLiveQuery(() => transactionsRepo.list(), []) ?? []
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState<AccountType>('bank')
  const [opening, setOpening] = useState(0)
  const [limit, setLimit] = useState(0)
  const [dueDay, setDueDay] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const isCard = type === 'credit_card'
  const hasDueDay = isCard || type === 'loan'
  const isLiability = type === 'loan' || type === 'liability'
  const isAsset = type === 'asset'

  function resetForm() {
    setName('')
    setType('bank')
    setOpening(0)
    setLimit(0)
    setDueDay('')
    setEditingId(null)
  }

  async function save() {
    const day = Number(dueDay)
    const values = {
      name: name.trim(),
      account_type: type,
      currency: 'INR',
      opening_balance: opening,
      credit_limit: isCard && limit > 0 ? limit : null,
      payment_due_day:
        hasDueDay && Number.isInteger(day) && day >= 1 && day <= 31 ? day : null,
      is_default: accounts.find((account) => account.id === editingId)?.is_default ?? false,
    }
    if (editingId) await accountsRepo.update(editingId, values)
    else await accountsRepo.create(values)
    resetForm()
    setShowForm(false)
  }

  function edit(id: string) {
    const account = accounts.find((item) => item.id === id)
    if (!account) return
    setEditingId(id)
    setName(account.name)
    setType(currentAccountType(account.account_type))
    setOpening(account.opening_balance)
    setLimit(account.credit_limit ?? 0)
    setDueDay(account.payment_due_day ? String(account.payment_due_day) : '')
    setShowForm(true)
  }

  async function remove(id: string, accountName: string) {
    if (!window.confirm(`Delete "${accountName}"? Its transactions will remain in your history.`))
      return
    const account = accounts.find((item) => item.id === id)
    if (account?.is_default) {
      const replacement = accounts.find((item) => item.id !== id)
      if (replacement) await accountsRepo.update(replacement.id, { is_default: true })
    }
    await accountsRepo.remove(id)
    if (editingId === id) resetForm()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        {showForm ? (
          <button
            type="button"
            onClick={() => {
              resetForm()
              setShowForm(false)
            }}
            className="flex items-center gap-1 text-sm font-medium text-muted-foreground"
          >
            <ArrowLeft size={18} />
            Back
          </button>
        ) : (
          <PageHeader title="Payment Account" />
        )}
        {showForm ? (
          <span className="text-sm font-medium text-muted-foreground">
            {editingId ? 'Edit account' : 'New account'}
          </span>
        ) : (
          <button
            type="button"
            aria-label="Add payment account"
            onClick={() => setShowForm(true)}
            className="gloss flex size-10 items-center justify-center rounded-full text-primary-foreground"
          >
            <Plus size={21} />
          </button>
        )}
      </div>
      {showForm ? (
        <div className="surface space-y-3 rounded-card p-5">
          <Input
            placeholder="Account name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <select
            aria-label="Account type"
            value={type}
            onChange={(e) => setType(e.target.value as AccountType)}
            className="field appearance-none"
          >
            {TYPES.map((accountType) => (
              <option key={accountType} value={accountType}>
                {TYPE_LABELS[accountType]}
              </option>
            ))}
          </select>
          <CurrencyInput
            label={
              isCard || isLiability
                ? 'Amount already owed (optional)'
                : isAsset
                  ? 'Amount already owed to you (optional)'
                  : 'Opening balance (optional)'
            }
            value={opening}
            onChange={setOpening}
          />
          {isCard && <CurrencyInput label="Credit limit" value={limit} onChange={setLimit} />}
          {hasDueDay && (
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={31}
              aria-label="Payment due day of month"
              placeholder="Payment due day of month, e.g. 10 (optional)"
              value={dueDay}
              onChange={(e) => setDueDay(e.target.value)}
            />
          )}
          {isLiability && (
            <p className="text-sm text-muted-foreground">
              For money you owe. Record borrowing as a transfer from this account to your bank or
              deposit account; repay by transferring back.
            </p>
          )}
          {isAsset && (
            <p className="text-sm text-muted-foreground">
              For money someone owes you. Record lending as a transfer from your bank or cash
              account to this account; record repayments by transferring back.
            </p>
          )}
          <Button className="w-full" disabled={!name.trim()} onClick={() => void save()}>
            {editingId ? 'Save Account' : 'Add Account'}
          </Button>
          {editingId && (
            <Button variant="outline" className="w-full" onClick={resetForm}>
              Cancel
            </Button>
          )}
        </div>
      ) : (
        <>
          {ACCOUNT_GROUPS.filter((group) =>
            accounts.some((account) => group.types.includes(account.account_type)),
          ).map((group) => (
            <section key={group.label} className="space-y-2">
              <h2 className="label px-1">{group.label}</h2>
              {accounts
                .filter((account) => group.types.includes(account.account_type))
                .map((account) => {
                  const summary = summarizeAccount(account, txs)
                  const card = account.account_type === 'credit_card'
                  const liability =
                    card ||
                    account.account_type === 'loan' ||
                    account.account_type === 'liability' ||
                    account.account_type === 'loan_payable'
                  const receivable =
                    account.account_type === 'asset' || account.account_type === 'money_lent'
                  return (
                    <MetalCard key={account.id} className="space-y-4 p-4">
                      <header className="flex items-center justify-between gap-3">
                        <Link
                          to={`/accounts/${account.id}`}
                          className="flex min-w-0 flex-1 items-center gap-3"
                        >
                          <MetalBadge label={account.name} />
                          <div className="min-w-0">
                            <div className="truncate font-semibold">{account.name}</div>
                            <div className="truncate text-xs text-muted-foreground">
                              {card
                                ? `Credit card · limit ${account.credit_limit == null ? 'not set' : formatMinor(account.credit_limit)}`
                                : TYPE_LABELS[account.account_type] +
                                  (account.is_default ? ' · default' : '')}
                            </div>
                          </div>
                        </Link>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <MetalActionButton
                            label={`Edit ${account.name}`}
                            onClick={() => edit(account.id)}
                          >
                            <Pencil size={15} />
                          </MetalActionButton>
                          <MetalActionButton
                            label={`Delete ${account.name}`}
                            onClick={() => void remove(account.id, account.name)}
                            destructive
                          >
                            <Trash2 size={15} />
                          </MetalActionButton>
                        </div>
                      </header>
                      <Link to={`/accounts/${account.id}`} className="block">
                        <div className="money truncate text-sm leading-tight font-bold tracking-tight text-white">
                          {liability
                            ? `${formatMinor(summary.balance)} owed`
                            : receivable
                              ? `${formatMinor(summary.balance)} owed to you`
                              : formatMinor(summary.balance)}
                        </div>
                        {card && summary.available != null && (
                          <div
                            className={`mt-1 text-sm ${summary.available < 0 ? 'text-destructive' : 'text-muted-foreground'}`}
                          >
                            {formatMinor(summary.available)} available
                          </div>
                        )}
                        {account.payment_due_day != null && (
                          <div className="mt-1 text-sm text-muted-foreground">
                            Due on day {account.payment_due_day} of each month
                          </div>
                        )}
                      </Link>
                    </MetalCard>
                  )
                })}
            </section>
          ))}
          {accounts.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No payment accounts yet. Tap + to add one.
            </p>
          )}
        </>
      )}
    </div>
  )
}
