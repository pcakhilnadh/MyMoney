export type SyncState = 'pending' | 'syncing' | 'synced' | 'failed' | 'conflict'
export type RecordStatus = 'active' | 'archived' | 'deleted'
export type ExpenseContext = 'personal' | 'family' | 'group'
export type TransactionType = 'expense' | 'income' | 'refund' | 'transfer'
export type CategoryType = Exclude<TransactionType, 'refund'>
export type SplitMethod = 'equal' | 'exact_amount' | 'percentage' | 'shares'
export type AccountType =
  | 'bank'
  | 'credit_card'
  | 'deposit'
  | 'wallet'
  | 'loan'
  | 'liability'
  | 'asset'
  | 'other'
  | 'cash'
  | 'upi'
  | 'debit_card'
  | 'loan_payable'
  | 'money_lent'

/** Fields every locally stored, syncable record carries. */
export interface Syncable {
  id: string // client-generated uuid, also the idempotency key
  version: number
  sync_state: SyncState
  status: RecordStatus
  created_at: string
  updated_at: string
}

export interface Account extends Syncable {
  name: string
  account_type: AccountType
  currency: string
  opening_balance: number
  /** Credit cards only, in minor units. */
  credit_limit: number | null
  /** Credit cards and loans: day of the month (1-31) the payment is due. */
  payment_due_day?: number | null
  is_default: boolean
}

/** Record that a card/loan due amount was paid. Kept for tracking only. */
export interface DuePayment extends Syncable {
  account_id: string
  amount_minor: number
  /** Portion of the payment that was interest (loans). */
  interest_minor: number
  due_date: string // YYYY-MM-DD
  paid_on: string // YYYY-MM-DD
}

export interface Category extends Syncable {
  name: string
  icon: string
  color: string | null
  transaction_type: CategoryType
  is_system: boolean
  is_hidden: boolean
}

export interface Merchant extends Syncable {
  name: string
  normalized_name: string
}

export interface Transaction extends Syncable {
  account_id: string | null
  transfer_to_account_id: string | null
  category_id: string | null
  group_id: string | null
  context: ExpenseContext
  transaction_type: TransactionType
  title: string
  long_description: string | null
  merchant: string | null
  amount_minor: number
  currency: string
  transaction_date: string
  notes: string | null
  is_shared: boolean
  split_method: SplitMethod | null
}

export interface Budget extends Syncable {
  group_id: string | null
  category_id: string | null
  name: string
  amount_minor: number
  currency: string
  period: 'weekly' | 'monthly' | 'yearly' | 'custom'
  period_start: string
  period_end: string | null
  alert_threshold_percent: number
  is_active: boolean
}

export interface GroupCache {
  id: string
  name: string
  description: string | null
  group_type: string
  currency: string
  created_by: string
  membership_status: 'active' | 'invited'
}
