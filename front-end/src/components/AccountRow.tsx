import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { MetalBadge } from '@/components/kit'
import type { Account } from '@/db/types'
import { formatMinor } from '@/lib/money'
import { useCurrency } from '@/money/CurrencyContext'

const MASK = '●●●●●'

const ordinal = (day: number) => {
  const mod = day % 100
  if (mod >= 11 && mod <= 13) return `${day}th`
  return `${day}${['th', 'st', 'nd', 'rd'][day % 10] ?? 'th'}`
}

/**
 * One account as a compact list row (about 58px): badge, name and a one-line summary,
 * balance on the right. Credit cards get a thin utilisation bar.
 */
export function AccountRow({
  account,
  balance,
  available,
  isDefault,
  visible,
}: {
  account: Account
  balance: number
  available?: number | null
  isDefault: boolean
  /** Whether amounts are revealed; the group header controls this. */
  visible: boolean
}) {
  const { currency } = useCurrency()
  const isCredit = account.account_type === 'credit_card'
  const isLiability =
    isCredit ||
    account.account_type === 'loan' ||
    account.account_type === 'liability' ||
    account.account_type === 'loan_payable'
  const inactive = account.status !== 'active'
  const used = isCredit && account.credit_limit ? balance / account.credit_limit : null

  const details = [
    account.account_type.replace(/_/g, ' '),
    isDefault ? 'Default' : null,
    inactive ? 'Inactive' : null,
    account.payment_due_day != null ? `Due ${ordinal(account.payment_due_day)}` : null,
  ].filter(Boolean)
  const showCreditPanel = isCredit && (available != null || account.credit_limit != null)
  const usedPercent = used === null ? null : Math.round(Math.max(used, 0) * 100)
  const tone =
    used === null ? '#94b0ff' : used > 0.8 ? '#ff8f3a' : used > 0.5 ? '#f5ae4b' : '#94b0ff'

  return (
    <Link
      to={`/money/accounts/${account.id}`}
      aria-label={`${account.name}, ${isLiability ? 'owed' : 'balance'} ${visible ? formatMinor(balance, currency) : 'hidden'}`}
      className={`block transition-colors hover:bg-white/5 active:bg-white/10 focus-visible:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${
        inactive ? 'opacity-60' : ''
      }`}
    >
      <div className="flex items-center gap-3 px-3 py-2.5">
        <MetalBadge label={account.name} variant="premium" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold">{account.name}</h3>
          <p className="truncate text-[11px] text-muted-foreground capitalize">
            {details.join(' · ')}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p
            className={`money text-sm font-bold ${isLiability ? 'text-[#f5ae4b]' : 'text-blue-100'}`}
          >
            {visible ? formatMinor(balance, currency) : MASK}
          </p>
          {isLiability && <p className="text-[9px] text-muted-foreground">owed</p>}
        </div>
        <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-white/25" />
      </div>
      {showCreditPanel && (
        <div className="mx-3 mb-3 rounded-xl bg-[#0a0e1a]/70 px-3 py-2.5 shadow-[inset_1px_1px_4px_rgba(0,0,0,0.55),inset_-1px_-1px_2px_rgba(255,255,255,0.04)]">
          <dl className="grid grid-cols-2 gap-3">
            {available != null && (
              <div className="min-w-0">
                <dt className="text-[10px] font-medium tracking-[0.12em] text-muted-foreground uppercase">
                  Available
                </dt>
                <dd className="money mt-0.5 text-[13px] font-semibold whitespace-nowrap text-blue-200">
                  {visible ? formatMinor(available, currency) : MASK}
                </dd>
              </div>
            )}
            {account.credit_limit != null && (
              <div className="col-start-2 min-w-0 text-right">
                <dt className="text-[10px] font-medium tracking-[0.12em] text-muted-foreground uppercase">
                  Credit Limit
                </dt>
                <dd className="money mt-0.5 text-[13px] font-semibold whitespace-nowrap text-white/85">
                  {formatMinor(account.credit_limit, currency)}
                </dd>
              </div>
            )}
          </dl>
          {used !== null && (
            <div className="mt-2 flex items-center gap-2">
              <div
                role="progressbar"
                aria-label={`${account.name} credit used`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={visible ? Math.min(usedPercent ?? 0, 100) : undefined}
                className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10"
              >
                <div
                  className="h-full rounded-full transition-[width] duration-500"
                  style={{
                    width: visible ? `${Math.min(Math.max(used, 0), 1) * 100}%` : '0%',
                    backgroundImage: `linear-gradient(90deg, ${tone}99, ${tone})`,
                  }}
                />
              </div>
              <span
                className="shrink-0 text-[11px] font-semibold"
                style={{ color: visible ? tone : undefined }}
              >
                {visible ? `${usedPercent}% used` : '●● used'}
              </span>
            </div>
          )}
        </div>
      )}
    </Link>
  )
}
