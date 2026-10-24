import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Eye, EyeOff } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  Button,
  CurrencyInput,
  Input,
  AccountCard,
  AddIconButton,
  PageHeader,
  Select,
} from '@/components/kit'
import { accountsRepo, transactionsRepo } from '@/db/repos'
import type { AccountType } from '@/db/types'
import { summarizeAccount } from '@/lib/accounts'
import { formatMinor } from '@/lib/money'
import { useCurrency } from '@/money/CurrencyContext'

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

export default function SettingsAccounts() {
  const { currency } = useCurrency()
  const accounts = useLiveQuery(() => accountsRepo.list(), []) ?? []
  const txs = useLiveQuery(() => transactionsRepo.list(), []) ?? []
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState<AccountType>('bank')
  const [opening, setOpening] = useState(0)
  const [limit, setLimit] = useState(0)
  const [dueDay, setDueDay] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [categoryTotalsVisible, setCategoryTotalsVisible] = useState<Record<string, boolean>>({})
  
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
      currency,
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

  const activeGroups = ACCOUNT_GROUPS.filter((group) =>
    accounts.some((account) => group.types.includes(account.account_type)),
  )

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
            <ArrowLeft size={16} />
            Back
          </button>
        ) : (
          <PageHeader title="Payment Accounts" />
        )}
        {!showForm && (
          <AddIconButton
            label="Add payment account"
            onClick={() => {
              resetForm()
              setShowForm(true)
            }}
          />
        )}
      </div>

      {showForm ? (
        <div className="space-y-4">
          <div>
            <label className="label mb-2 block">Account Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., ICICI Bank"
            />
          </div>

          <div>
            <label className="label mb-2 block">Account Type</label>
            <Select
              aria-label="Account type"
              value={type}
              onValueChange={(value) => setType(value as AccountType)}
              options={TYPES.map((accountType) => ({
                value: accountType,
                label: TYPE_LABELS[accountType],
              }))}
            />
          </div>

          <CurrencyInput value={opening} onChange={setOpening} label="Opening Balance" />

          {isCard && (
            <CurrencyInput value={limit} onChange={setLimit} label="Credit Limit (Optional)" />
          )}

          {hasDueDay && (
            <div>
              <label className="label mb-2 block">Payment Due Day (Optional)</label>
              <Input
                type="number"
                value={dueDay}
                onChange={(e) => setDueDay(e.target.value)}
                placeholder="1-31"
                min="1"
                max="31"
              />
            </div>
          )}

          {isCard && (
            <p className="text-sm text-muted-foreground">
              For credit cards. Record spending in individual transactions; the app calculates your
              available credit based on your limit and outstanding balance.
            </p>
          )}
          {isLiability && !isCard && (
            <p className="text-sm text-muted-foreground">
              For money you owe (loans, lines of credit). Record loan disbursals as transfers from
              your bank or cash account to this account; record repayments by transferring back.
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
          {accounts.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No payment accounts yet. Tap + to add one.
            </p>
          )}
          {activeGroups.map((group) => {
            const groupAccounts = accounts.filter((account) =>
              group.types.includes(account.account_type),
            )
            const groupTotal = groupAccounts.reduce((sum, account) => {
              const summary = summarizeAccount(account, txs)
              return sum + summary.balance
            }, 0)
            const isVisible = categoryTotalsVisible[group.label] === true

            return (
              <section key={group.label} className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <h2 className="label">{group.label}</h2>
                  <button
                    type="button"
                    onClick={() =>
                      setCategoryTotalsVisible((prev) => ({
                        ...prev,
                        [group.label]: prev[group.label] !== true,
                      }))
                    }
                    className="flex items-center gap-1.5 text-xs font-medium text-blue-400 hover:text-blue-300 transition"
                  >
                    {isVisible ? (
                      <>
                        <Eye size={14} />
                        {formatMinor(groupTotal, currency)}
                      </>
                    ) : (
                      <>
                        <EyeOff size={14} />
                        ●●●●●
                      </>
                    )}
                  </button>
                </div>
                <div className="space-y-2">
                  {groupAccounts.map((account) => {
                    const summary = summarizeAccount(account, txs)
                    const card = account.account_type === 'credit_card'

                    return (
                      <Link
                        key={account.id}
                        to={`/money/accounts/${account.id}`}
                        className="block"
                      >
                        <AccountCard
                          account={account}
                          balance={summary.balance}
                          available={card ? summary.available : undefined}
                          isDefault={account.is_default}
                          variant="list"
                        />
                      </Link>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </>
      )}
    </div>
  )
}
