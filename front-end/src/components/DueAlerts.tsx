import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
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
  const today = alert.daysLeft <= 0
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
    <article
      aria-label={`${alert.account.name} payment due`}
      className="overflow-hidden rounded-[28px] border border-white/10 bg-gradient-to-br from-[#1a1f3a] via-[#0f1628] to-[#0a0e1a] shadow-[inset_0_1px_0_rgba(75,139,255,0.15),0_14px_28px_-14px_rgba(0,0,0,0.8)]"
    >
      <div className="flex items-center gap-4 px-5 py-4">
        <div className="w-14 shrink-0 text-center leading-none">
          <div
            className={`font-extrabold text-[#f5ae4b] ${today ? 'text-xl' : 'text-4xl'}`}
            aria-hidden="true"
          >
            {today ? 'Today' : alert.daysLeft}
          </div>
          {!today && (
            <div className="mt-1.5 text-xs text-white/45" aria-hidden="true">
              {alert.daysLeft === 1 ? 'day' : 'days'}
            </div>
          )}
          <span className="sr-only">
            Due {today ? 'today' : `in ${alert.daysLeft} ${alert.daysLeft === 1 ? 'day' : 'days'}`}
          </span>
        </div>

        <span
          aria-hidden="true"
          className="h-12 shrink-0 self-center border-l-2 border-dashed border-white/15"
        />

        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-base leading-tight font-semibold">
            {alert.account.name}
          </h3>
          <p className="money mt-1 text-sm text-[#94b0ff]/80">
            {formatMinor(alert.amount, currency)} due
          </p>
        </div>

        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="shrink-0 rounded-full bg-[#7a93ff] px-5 py-3 text-sm font-bold text-[#0a0e1a] shadow-[3px_3px_8px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.35)] transition-[transform,box-shadow,filter] duration-150 hover:brightness-110 active:scale-95 active:shadow-[inset_2px_2px_5px_rgba(0,0,0,0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          >
            Mark paid
          </button>
        )}
      </div>

      {open && (
        <div className="space-y-2 border-t border-dashed border-white/15 px-5 py-4">
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
      )}
    </article>
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
    <section aria-label="Payment alerts" className="space-y-3">
      {alerts.map((alert) => (
        <AlertRow key={`${alert.account.id}:${alert.dueDate}`} alert={alert} />
      ))}
    </section>
  )
}
