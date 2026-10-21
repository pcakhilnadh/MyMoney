import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Trash2 } from 'lucide-react'
import { Button, CurrencyInput, Input, ListItem, PageHeader, SectionTitle } from '@/components/kit'
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
  const isCard = type === 'credit_card'

  async function add() {
    await accountsRepo.create({
      name: name.trim(),
      account_type: type,
      currency: 'INR',
      opening_balance: opening,
      credit_limit: isCard && limit > 0 ? limit : null,
      is_default: accounts.length === 0,
    })
    setName('')
    setOpening(0)
    setLimit(0)
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Accounts" />
      {accounts.map((a) => {
        const s = summarizeAccount(a, txs)
        const card = a.account_type === 'credit_card'
        return (
          <ListItem
            key={a.id}
            title={a.name}
            subtitle={
              card
                ? `Credit card · limit ${a.credit_limit == null ? 'not set' : formatMinor(a.credit_limit)}`
                : a.account_type.replace('_', ' ') + (a.is_default ? ' · default' : '')
            }
            trailing={
              <span className="flex items-center gap-3 text-right">
                <span>
                  {card ? (
                    <>
                      <span className="block">{formatMinor(s.balance)} used</span>
                      {s.available != null && (
                        <span
                          className={`block text-xs font-normal ${s.available < 0 ? 'text-destructive' : 'text-muted-foreground'}`}
                        >
                          {formatMinor(s.available)} available
                        </span>
                      )}
                    </>
                  ) : (
                    formatMinor(s.balance)
                  )}
                </span>
                {!a.is_default && (
                  <button aria-label={`Delete ${a.name}`} onClick={() => accountsRepo.remove(a.id)}>
                    <Trash2 size={16} />
                  </button>
                )}
              </span>
            }
          />
        )
      })}
      <div className="surface space-y-3 rounded-card p-5">
        <SectionTitle>Add Account</SectionTitle>
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
        <Button className="w-full" disabled={!name.trim()} onClick={add}>
          Add Account
        </Button>
      </div>
    </div>
  )
}
