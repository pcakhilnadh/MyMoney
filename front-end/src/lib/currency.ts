export const CURRENCIES = [
  { code: 'INR', name: 'Indian Rupee' },
  { code: 'USD', name: 'US Dollar' },
  { code: 'EUR', name: 'Euro' },
  { code: 'GBP', name: 'British Pound' },
  { code: 'AED', name: 'UAE Dirham' },
  { code: 'CAD', name: 'Canadian Dollar' },
  { code: 'AUD', name: 'Australian Dollar' },
  { code: 'SGD', name: 'Singapore Dollar' },
  { code: 'CHF', name: 'Swiss Franc' },
] as const

export type CurrencyCode = (typeof CURRENCIES)[number]['code']

const currencyCodes = new Set<string>(CURRENCIES.map(({ code }) => code))

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === 'string' && currencyCodes.has(value)
}

export function currencySymbol(currency: CurrencyCode): string {
  const locale = currency === 'INR' ? 'en-IN' : 'en-US'
  return (
    new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
    })
      .formatToParts(0)
      .find((part) => part.type === 'currency')?.value ?? currency
  )
}
