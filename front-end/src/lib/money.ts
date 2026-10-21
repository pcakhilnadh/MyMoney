const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })

/** Format an amount in minor units (paise) as INR. */
export const formatMinor = (minor: number) => inr.format(minor / 100)

export const CATEGORIES = [
  'Food',
  'Travel',
  'Shopping',
  'Home',
  'Bills',
  'Transport',
  'Health',
  'Entertainment',
  'Other',
] as const

/** Parse a user-entered rupee string into minor units; NaN-safe (returns 0). */
export function toMinor(input: string): number {
  const n = Number(input.replace(/[^0-9.]/g, ''))
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}
