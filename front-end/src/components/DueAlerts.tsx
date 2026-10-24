import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { BellRing } from 'lucide-react'
import { Button, CurrencyInput } from '@/components/kit'
import { accountsRepo, duePaymentsRepo, transactionsRepo } from '@/db/repos'
import { dueAlerts, isoDate, type DueAlert } from '@/lib/accounts'
import { formatMinor } from '@/lib/money'
import { useCurrency } from '@/money/CurrencyContext'

function AlertRow({ alert }: { alert: DueAlert }) {
  const { currency } = useCurrency()
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState(alert.amount)
  const [interest, setInterest] = useState(0)
  const isLoan = alert.account.account_type !== 'credit_card'
  const when =
    alert.daysLeft === 0 ? 'today' : alert.daysLeft === 1 ? 'tomorrow' : `in ${alert.daysLeft} days`

  async function markPaid() {
    await duePaymentsRepo.create({
      account_id: alert.account.id,
      amount_minor: amount,
      interest_minor: isLoan ? Math.min(interest, amount) : 0,
      due_date: alert.dueDate,
      paid_on: isoDate(new Date()),
    })
  }

  return (
    <div className="space-y-3 rounded-2xl bg-secondary/60 p-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{alert.account.name}</div>
          <div className="text-xs text-muted-foreground">Due {when}</div>
        </div>
        <div className="money font-semibold">{formatMinor(alert.amount, currency)}</div>
      </div>
      {open ? (
        <div className="space-y-2">
          <CurrencyInput label="Amount paid" value={amount} onChange={setAmount} />
          {isLoan && (
            <CurrencyInput
              label="Of which interest (optional)"
              value={interest}
              onChange={setInterest}
            />
          )}
          <div className="flex gap-2">
            <Button className="flex-1" disabled={amount <= 0} onClick={() => void markPaid()}>
              Confirm paid
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" className="w-full" onClick={() => setOpen(true)}>
          Mark as paid
        </Button>
      )}
    </div>
  )
}

/** Credit card and loan payments due within the next week. */
export function DueAlerts() {
  const accounts = useLiveQuery(() => accountsRepo.list(), []) ?? []
  const payments = useLiveQuery(() => duePaymentsRepo.list(), []) ?? []
  const txs = useLiveQuery(() => transactionsRepo.list(), []) ?? []
  const alerts = dueAlerts(accounts, payments, txs, new Date())
  if (alerts.length === 0) return null

  return (
    <section aria-label="Payment alerts" className="surface space-y-3 rounded-2xl p-4">
      <h2 className="flex items-center gap-2 font-semibold">
        <BellRing size={18} className="text-primary" />
        Payment alerts
      </h2>
      {alerts.map((alert) => (
        <AlertRow key={`${alert.account.id}:${alert.dueDate}`} alert={alert} />
      ))}
    </section>
  )
}
