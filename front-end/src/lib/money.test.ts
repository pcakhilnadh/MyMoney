import { describe, expect, it } from 'vitest'
import { formatCompactMinor, formatMinor } from './money'

describe('currency formatting', () => {
  it.each([
    [12345, '₹123.45'],
    [123456, '₹1.23K'],
    [12345678, '₹1.23L'],
    [1234567890, '₹1.23Cr'],
  ])('formats %i paise as %s', (amount, expected) => {
    expect(formatCompactMinor(amount)).toBe(expected)
  })

  it('uses standard compact denominations outside INR', () => {
    expect(formatCompactMinor(123456, 'USD')).toBe('$1.23K')
    expect(formatCompactMinor(1234567890, 'USD')).toBe('$12.35M')
  })

  it('formats full amounts with the selected currency', () => {
    expect(formatMinor(123456, 'USD')).toBe('$1,234.56')
    expect(formatMinor(123456, 'EUR')).toBe('€1,234.56')
  })
})
