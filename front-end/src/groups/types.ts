export interface Group {
  id: string
  name: string
  description: string | null
  group_type: string
  currency: string
  created_by: string
}
export interface Member {
  id: string
  email: string
  user_id: string | null
  display_name: string | null
  role: string
  status: string
}
export interface GroupTx {
  id: string
  description: string
  amount_minor: number
  transaction_date: string
  owner_user_id: string
  is_shared: boolean
  splits: { user_id: string; share_minor: number; paid_minor: number }[]
}
export interface Balances {
  net: Record<string, number>
  transfers: { from: string; to: string; amount_minor: number }[]
}
export const memberLabel = (m?: Member) => m?.display_name || m?.email || 'Unknown'
