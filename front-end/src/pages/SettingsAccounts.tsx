import { useState } from 'react'
import { ArrowLeft, ChevronDown, ChevronsUpDown, Eye, EyeOff, Search } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  Button,
  CurrencyInput,
  Input,
  MetalCard,
  AddIconButton,
  PageHeader,
  Select,
} from '@/components/kit'
import { AccountRow } from '@/components/AccountRow'
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
  const [isDefault, setIsDefault] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [categoryTotalsVisible, setCategoryTotalsVisible] = useState<Record<string, boolean>>({})
  // Groups the user has opened or closed; untouched groups follow the default below.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [query, setQuery] = useState('')

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
    setIsDefault(false)
    setSaveError('')
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
      payment_due_day: hasDueDay && Number.isInteger(day) && day >= 1 && day <= 31 ? day : null,
      is_default: isDefault,
    }
    try {
      if (editingId) await accountsRepo.update(editingId, values)
      else await accountsRepo.create(values)
    } catch (error) {
      console.error('Unable to save account', error)
      setSaveError('Unable to save account. Please try again.')
      return
    }
    resetForm()
    setShowForm(false)
  }

  const activeGroups = ACCOUNT_GROUPS.filter((group) =>
    accounts.some((account) => group.types.includes(account.account_type)),
  )
  const needle = query.trim().toLowerCase()
  const searching = needle.length > 0
  const visibleGroups = activeGroups
    .map((group, index) => ({
      group,
      index,
      groupAccounts: accounts.filter(
        (account) =>
          group.types.includes(account.account_type) &&
          (!searching || account.name.toLowerCase().includes(needle)),
      ),
    }))
    .filter(({ groupAccounts }) => groupAccounts.length > 0)

  // Every group starts collapsed so the page opens as a short overview.
  const isCollapsed = (label: string) => collapsed[label] ?? true

  const allOpen =
    activeGroups.length > 0 && activeGroups.every((group) => !isCollapsed(group.label))
  const showSearch = accounts.length > 6
  const showGroupToggle = activeGroups.length > 1

  function setAllCollapsed(value: boolean) {
    setCollapsed(Object.fromEntries(activeGroups.map((group) => [group.label, value])))
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
            <ArrowLeft size={16} />
            Back
          </button>
        ) : (
          <PageHeader
            title="Payment Accounts"
            subtitle={
              accounts.length > 0
                ? `${accounts.length} account${accounts.length === 1 ? '' : 's'}`
                : undefined
            }
          />
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
              For a balance you owe. Borrowing and repayment transfers affect only the account where
              you receive or pay the money.
            </p>
          )}
          {isAsset && (
            <p className="text-sm text-muted-foreground">
              For a balance someone owes you. Lending and collection transfers affect only the
              account the money leaves or returns to.
            </p>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(event) => setIsDefault(event.target.checked)}
            />
            Set as default account
          </label>
          {saveError && (
            <p role="alert" className="text-sm text-destructive">
              {saveError}
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
          {(showSearch || showGroupToggle) && (
            <div className="flex items-center gap-2">
              {showSearch && (
                <label className="field flex min-w-0 flex-1 items-center gap-2 !py-2">
                  <Search size={16} aria-hidden="true" className="shrink-0 text-muted-foreground" />
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search accounts"
                    aria-label="Search accounts"
                    className="w-full min-w-0 bg-transparent text-sm outline-none"
                  />
                </label>
              )}
              {showGroupToggle && (
                <button
                  type="button"
                  onClick={() => setAllCollapsed(allOpen)}
                  disabled={searching}
                  aria-label={allOpen ? 'Collapse all groups' : 'Expand all groups'}
                  className="ml-auto flex shrink-0 items-center gap-1.5 rounded-xl bg-gradient-to-br from-[#2a3260] to-[#1a2147] px-3 py-2 text-xs font-semibold text-white/85 shadow-[3px_3px_8px_rgba(0,0,0,0.5),-1px_-1px_4px_rgba(148,176,255,0.1),inset_0_1px_0_rgba(255,255,255,0.1)] transition-[transform,box-shadow,opacity] duration-150 hover:text-white active:scale-95 active:shadow-[inset_2px_2px_5px_rgba(0,0,0,0.55)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40"
                >
                  <ChevronsUpDown
                    size={15}
                    aria-hidden="true"
                    className={`transition-transform duration-300 ${allOpen ? 'rotate-180' : ''}`}
                  />
                  <span>{allOpen ? 'Collapse all' : 'Expand all'}</span>
                </button>
              )}
            </div>
          )}
          {searching && visibleGroups.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No accounts match “{query.trim()}”.
            </p>
          )}
          {visibleGroups.map(({ group, groupAccounts, index }) => {
            // Credit cards total what can still be spent (available credit), not what is owed.
            const isCreditGroup = group.types.includes('credit_card')
            const groupTotal = groupAccounts.reduce((sum, account) => {
              const summary = summarizeAccount(account, txs)
              return sum + (isCreditGroup ? (summary.available ?? 0) : summary.balance)
            }, 0)
            const isVisible = categoryTotalsVisible[group.label] === true
            const open = searching || !isCollapsed(group.label)
            const panelId = `accounts-${index}`

            return (
              <MetalCard key={group.label} className="p-0">
                <div className="flex items-center gap-2 px-3 py-2.5">
                  <button
                    type="button"
                    aria-expanded={open}
                    aria-controls={panelId}
                    onClick={() => setCollapsed((prev) => ({ ...prev, [group.label]: open }))}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <ChevronDown
                      size={16}
                      aria-hidden="true"
                      className={`shrink-0 text-white/50 transition-transform duration-200 ${open ? '' : '-rotate-90'}`}
                    />
                    <h2 className="truncate text-[11px] font-semibold tracking-[0.18em] text-white/70 uppercase">
                      {group.label}
                    </h2>
                    <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] leading-none font-bold text-white/70">
                      {groupAccounts.length}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setCategoryTotalsVisible((prev) => ({ ...prev, [group.label]: !isVisible }))
                    }
                    aria-pressed={isVisible}
                    aria-label={`${isVisible ? 'Hide' : 'Show'} ${group.label} total and balances`}
                    className="flex shrink-0 items-center gap-1.5 rounded-full bg-[#0a0e1a]/70 px-3 py-1.5 text-xs font-semibold text-blue-300 shadow-[inset_1px_1px_4px_rgba(0,0,0,0.55),inset_-1px_-1px_2px_rgba(255,255,255,0.04)] transition-[transform,color] duration-150 hover:text-blue-200 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    {isVisible ? <Eye size={14} /> : <EyeOff size={14} />}
                    <span className="money">
                      {isVisible ? formatMinor(groupTotal, currency) : '●●●●●'}
                    </span>
                  </button>
                </div>
                <div
                  id={panelId}
                  className={`grid transition-[grid-template-rows,visibility] duration-200 ${
                    open ? 'grid-rows-[1fr]' : 'invisible grid-rows-[0fr]'
                  }`}
                >
                  <div className="overflow-hidden">
                    <div className="divide-y divide-white/8 border-t border-white/8">
                      {groupAccounts.map((account) => {
                        const summary = summarizeAccount(account, txs)
                        return (
                          <AccountRow
                            key={account.id}
                            account={account}
                            balance={summary.balance}
                            available={
                              account.account_type === 'credit_card' ? summary.available : undefined
                            }
                            isDefault={account.is_default}
                            visible={isVisible}
                          />
                        )
                      })}
                    </div>
                  </div>
                </div>
              </MetalCard>
            )
          })}
        </>
      )}
    </div>
  )
}
