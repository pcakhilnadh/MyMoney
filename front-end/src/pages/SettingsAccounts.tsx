import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Pencil, Trash2 } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Button, CurrencyInput, Input, PageHeader } from '@/components/kit'
import { accountsRepo, transactionsRepo } from '@/db/repos'
import type { AccountType } from '@/db/types'
import { summarizeAccount } from '@/lib/accounts'
import { formatMinor } from '@/lib/money'

const TYPES: AccountType[] = ['cash', 'bank', 'upi', 'credit_card', 'debit_card', 'wallet', 'other']

export default function SettingsAccounts() {
  const accounts = useLiveQuery(() => accountsRepo.list(), []) ?? []
  const txs = useLiveQuery(() => transactionsRepo.list(), []) ?? []
  const [name, setName] = useState('')
  const [type, setType] = useState<AccountType>('bank')
  const [opening, setOpening] = useState(0)
  const [limit, setLimit] = useState(0)
  const [editingId, setEditingId] = useState<string | null>(null)
  const isCard = type === 'credit_card'

  function resetForm() {
    setName('')
    setType('bank')
    setOpening(0)
    setLimit(0)
    setEditingId(null)
  }

  async function save() {
    const values = {
      name: name.trim(),
      account_type: type,
      currency: 'INR',
      opening_balance: opening,
      credit_limit: isCard && limit > 0 ? limit : null,
      is_default: accounts.find((account) => account.id === editingId)?.is_default ??
        accounts.length === 0,
    }
    if (editingId) await accountsRepo.update(editingId, values)
    else await accountsRepo.create(values)
    resetForm()
  }

  function edit(id: string) {
    const account = accounts.find((item) => item.id === id)
    if (!account) return
    setEditingId(id)
    setName(account.name)
    setType(account.account_type)
    setOpening(account.opening_balance)
    setLimit(account.credit_limit ?? 0)
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
      <PageHeader title="Accounts" />
      {accounts.map((account) => {
        const summary = summarizeAccount(account, txs)
        const card = account.account_type === 'credit_card'
        return (
          <div key={account.id} className="surface flex items-center gap-3 rounded-2xl px-4 py-3.5">
            <Link to={`/accounts/${account.id}`} className="min-w-0 flex-1">
              <div className="truncate font-medium">{account.name}</div>
              <div className="truncate text-sm text-muted-foreground">
                {card
                  ? `Credit card · limit ${account.credit_limit == null ? 'not set' : formatMinor(account.credit_limit)}`
                  : account.account_type.replace('_', ' ') +
                    (account.is_default ? ' · default' : '')}
              </div>
              <div className="money mt-1 text-sm font-semibold">
                {card ? `${formatMinor(summary.balance)} used` : formatMinor(summary.balance)}
                {card && summary.available != null && (
                  <span
                    className={`ml-2 font-normal ${summary.available < 0 ? 'text-destructive' : 'text-muted-foreground'}`}
                  >
                    {formatMinor(summary.available)} available
                  </span>
                )}
              </div>
            </Link>
            <button aria-label={`Edit ${account.name}`} onClick={() => edit(account.id)}>
              <Pencil size={16} />
            </button>
            <button
              aria-label={`Delete ${account.name}`}
              className="text-muted-foreground"
              onClick={() => void remove(account.id, account.name)}
            >
              <Trash2 size={16} />
            </button>
          </div>
        )
      })}
      <div className="surface space-y-3 rounded-card p-5">
        <h2 className="label px-1">{editingId ? 'Edit Account' : 'Add Account'}</h2>
        <Input placeholder="Account name" value={name} onChange={(e) => setName(e.target.value)} />
        <select
          aria-label="Account type"
          value={type}
          onChange={(e) => setType(e.target.value as AccountType)}
          className="field appearance-none"
        >
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t.replace('_', ' ')}
            </option>
          ))}
        </select>
        <CurrencyInput
          label={isCard ? 'Amount already owed (optional)' : 'Opening balance (optional)'}
          value={opening}
          onChange={setOpening}
        />
        {isCard && <CurrencyInput label="Credit limit" value={limit} onChange={setLimit} />}
        <Button className="w-full" disabled={!name.trim()} onClick={() => void save()}>
          {editingId ? 'Save Account' : 'Add Account'}
        </Button>
        {editingId && (
          <Button variant="outline" className="w-full" onClick={resetForm}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  )
}
