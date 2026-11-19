export type Plan = 'free' | 'pro'
export type AppRole = 'member' | 'owner'

export interface Me {
  id: string
  email: string
  preferred_currency: string
  plan: Plan
  role: AppRole
}

export const PLAN_LABEL: Record<Plan, string> = { free: 'Free', pro: 'Pro' }

export const ROLE_LABEL: Record<AppRole, string> = { member: 'Member', owner: 'Owner' }
