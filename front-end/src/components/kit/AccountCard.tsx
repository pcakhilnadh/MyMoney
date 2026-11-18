import { useState } from 'react'
import { ChevronRight, Eye, EyeOff } from 'lucide-react'
import type { Account } from '@/db/types'
import { formatMinor } from '@/lib/money'
import { useCurrency } from '@/money/CurrencyContext'
import { MetalCard, MetalBadge } from './MetalCard'

export interface AccountCardProps {
  account: Account
  balance: number
  available?: number | null
  isDefault?: boolean
  variant?: 'list' | 'compact'
  /** Controlled visibility of the amounts. Leave out to let the card manage it itself. */
  visible?: boolean
  onVisibleChange?: (visible: boolean) => void
}

const MASK = '●●●●●'
const inset =
  'bg-[#0a0e1a]/70 shadow-[inset_1px_1px_4px_rgba(0,0,0,0.55),inset_-1px_-1px_2px_rgba(255,255,255,0.04)]'

export function AccountCard({
  account,
  balance,
  available,
  isDefault = false,
  variant = 'list',
  visible,
  onVisibleChange,
}: AccountCardProps) {
  const { currency } = useCurrency()
  const [localVisible, setLocalVisible] = useState(false)
  const balanceVisible = visible ?? localVisible
  const isCredit = account.account_type === 'credit_card'
  const isLoan = account.account_type === 'loan'
  const isLiability =
    isCredit ||
    isLoan ||
    account.account_type === 'liability' ||
    account.account_type === 'loan_payable'
  const isAsset = account.account_type === 'asset' || account.account_type === 'money_lent'
  const inactive = account.status !== 'active'

  const balanceLabel = isLiability ? 'Amount Owed' : isAsset ? 'Owed to You' : 'Balance'
  const balanceDisplay = balanceVisible ? formatMinor(balance, currency) : MASK
  const typeLabel = account.account_type.replace(/_/g, ' ')

  const toggleVisibility = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const next = !balanceVisible
    setLocalVisible(next)
    onVisibleChange?.(next)
  }

  const eyeButton = (
    <button
      type="button"
      onClick={toggleVisibility}
      title={balanceVisible ? 'Hide balance' : 'Show balance'}
      className={`flex size-8 shrink-0 items-center justify-center rounded-full text-blue-300 transition-[transform,box-shadow] duration-150 hover:text-blue-200 active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${inset}`}
    >
      {balanceVisible ? <Eye size={14} /> : <EyeOff size={14} className="text-white/50" />}
    </button>
  )

  if (variant === 'compact') {
    return (
      <MetalCard className="p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <MetalBadge label={account.name} variant="premium" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-semibold text-foreground">{account.name}</div>
              <div className="truncate text-[10px] text-muted-foreground uppercase">
                {typeLabel}
              </div>
            </div>
          </div>
          <div className="money text-sm font-bold text-blue-200">{balanceDisplay}</div>
          {eyeButton}
        </div>
      </MetalCard>
    )
  }

  const hasStats = isCredit || account.payment_due_day != null
  const used = isCredit && account.credit_limit ? balance / account.credit_limit : null

  return (
    <MetalCard
      className={`p-3.5 transition-transform duration-150 active:scale-[0.99] ${inactive ? 'opacity-70' : ''}`}
    >
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <MetalBadge label={account.name} variant="premium" />
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold text-foreground">{account.name}</h3>
            <p className="truncate text-[10px] tracking-wider text-muted-foreground uppercase">
              {typeLabel}
              {isDefault && <span className="font-semibold text-blue-300"> · Default</span>}
              {inactive && <span className="font-semibold text-white/60"> · Inactive</span>}
            </p>
          </div>
          {eyeButton}
          <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-white/30" />
        </div>

        <div className={`rounded-xl px-3 py-2 ${inset}`}>
          <div className="text-[9px] font-medium tracking-[0.16em] text-blue-300/70 uppercase">
            {balanceLabel}
          </div>
          <div className="money mt-0.5 text-xl font-bold tracking-tight text-blue-100">
            {balanceDisplay}
          </div>
          {used !== null && (
            <div aria-hidden="true" className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{
                  width: `${Math.min(Math.max(used, 0), 1) * 100}%`,
                  backgroundImage:
                    used > 0.8
                      ? 'linear-gradient(90deg, #ff8f3a99, #ff8f3a)'
                      : 'linear-gradient(90deg, #94b0ff99, #94b0ff)',
                }}
              />
            </div>
          )}
        </div>

        {hasStats && (
          <div className="grid grid-flow-col auto-cols-fr gap-2 text-center">
            {isCredit && available != null && (
              <div className={`min-w-0 rounded-xl px-2 py-1.5 ${inset}`}>
                <p className="text-[9px] text-muted-foreground">Available</p>
                <p className="money truncate text-xs font-semibold text-blue-200">
                  {balanceVisible ? formatMinor(available, currency) : '●●●'}
                </p>
              </div>
            )}
            {isCredit && account.credit_limit != null && (
              <div className={`min-w-0 rounded-xl px-2 py-1.5 ${inset}`}>
                <p className="text-[9px] text-muted-foreground">Credit Limit</p>
                <p className="money truncate text-xs font-semibold">
                  {formatMinor(account.credit_limit, currency)}
                </p>
              </div>
            )}
            {account.payment_due_day != null && (
              <div className={`min-w-0 rounded-xl px-2 py-1.5 ${inset}`}>
                <p className="text-[9px] text-muted-foreground">Due Day</p>
                <p className="truncate text-xs font-semibold">{account.payment_due_day}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </MetalCard>
  )
}
