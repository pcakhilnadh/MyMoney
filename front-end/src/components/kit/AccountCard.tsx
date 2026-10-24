import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import type { Account } from '@/db/types'
import { formatMinor } from '@/lib/money'
import { MetalCard, MetalBadge } from './MetalCard'

export interface AccountCardProps {
  account: Account
  balance: number
  available?: number | null
  isDefault?: boolean
  variant?: 'list' | 'compact'
}

export function AccountCard({
  account,
  balance,
  available,
  isDefault = false,
  variant = 'list',
}: AccountCardProps) {
  const [balanceVisible, setBalanceVisible] = useState(false)
  const isCredit = account.account_type === 'credit_card'
  const isLoan = account.account_type === 'loan'
  const isLiability = isCredit || isLoan || account.account_type === 'liability' || account.account_type === 'loan_payable'
  const isAsset = account.account_type === 'asset' || account.account_type === 'money_lent'

  const balanceLabel = isLiability ? 'Amount Owed' : isAsset ? 'Owed to You' : 'Balance'
  const balanceDisplay = balanceVisible ? formatMinor(balance) : '●●●●●'

  const toggleVisibility = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setBalanceVisible(!balanceVisible)
  }

  if (variant === 'compact') {
    return (
      <MetalCard className="p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <MetalBadge label={account.name} variant="premium" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-semibold text-foreground">{account.name}</div>
              <div className="truncate text-[10px] text-muted-foreground">{account.account_type.replace(/_/g, ' ').toUpperCase()}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={toggleVisibility}
            className="flex shrink-0 items-center gap-1.5"
          >
            <div className="money text-sm font-bold text-blue-200">{balanceDisplay}</div>
            {balanceVisible ? <Eye size={14} className="text-blue-400" /> : <EyeOff size={14} className="text-muted-foreground" />}
          </button>
        </div>
      </MetalCard>
    )
  }

  return (
    <MetalCard className="p-4">
      <div className="space-y-3">
        {/* Header with name and badge */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <MetalBadge label={account.name} variant="premium" />
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-sm font-semibold text-foreground">{account.name}</h3>
              <p className="truncate text-xs text-muted-foreground">
                {account.account_type.replace(/_/g, ' ').toUpperCase()}
                {isDefault && ' · Default'}
              </p>
            </div>
          </div>
        </div>

        {/* Balance with eye toggle - minimal and compact */}
        <div className="flex items-end justify-between gap-2">
          <div className="flex-1">
            <div className="text-[8px] font-medium tracking-widest text-blue-400/70 uppercase">{balanceLabel}</div>
            <div className="money text-xl font-bold text-blue-100 mt-1">{balanceDisplay}</div>
          </div>
          <button
            type="button"
            onClick={toggleVisibility}
            className="flex shrink-0 items-center justify-center h-8 w-8 rounded-lg border border-blue-400/20 bg-blue-500/5 text-blue-400 hover:border-blue-400/40 hover:bg-blue-500/10 transition"
            title={balanceVisible ? 'Hide balance' : 'Show balance'}
          >
            {balanceVisible ? <Eye size={14} /> : <EyeOff size={14} />}
          </button>
        </div>

        {/* Secondary info section */}
        {(isCredit || account.payment_due_day != null) && (
          <div className="space-y-2 pt-2 border-t border-white/5">
            {isCredit && available != null && available !== undefined && (
              <div className="flex items-center justify-between px-1">
                <span className="text-xs text-muted-foreground">Available</span>
                <span className="money text-xs font-medium text-blue-300">
                  {balanceVisible ? formatMinor(available) : '●●●'}
                </span>
              </div>
            )}
            {account.payment_due_day != null && (
              <div className="flex items-center justify-between px-1">
                <span className="text-xs text-muted-foreground">Due Day</span>
                <span className="text-xs font-medium text-foreground">{account.payment_due_day}</span>
              </div>
            )}
          </div>
        )}

        {/* Credit limit info */}
        {isCredit && account.credit_limit != null && (
          <div className="flex items-center justify-between px-1 pt-1 border-t border-white/5">
            <span className="text-xs text-muted-foreground">Credit Limit</span>
            <span className="money text-xs font-medium text-foreground">{formatMinor(account.credit_limit)}</span>
          </div>
        )}
      </div>
    </MetalCard>
  )
}
