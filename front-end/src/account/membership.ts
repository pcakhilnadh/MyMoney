export type Plan = 'free' | 'pro'
/** Ranked owner > admin > member. */
export type AppRole = 'member' | 'admin' | 'owner'
/** App areas a role can be entitled to. `plate` is MyPlate (meal planning). */
export type Feature = 'money' | 'food' | 'plate'

export interface Me {
  id: string
  email: string
  preferred_currency: string
  plan: Plan
  role: AppRole
  entitlements: Feature[]
}

export const PLAN_LABEL: Record<Plan, string> = { free: 'Free', pro: 'Pro' }

export const ROLE_LABEL: Record<AppRole, string> = {
  member: 'Member',
  admin: 'Admin',
  owner: 'Owner',
}

export const FEATURE_LABEL: Record<Feature, string> = {
  money: 'My Money',
  food: 'MyFood',
  plate: 'MyPlate',
}
