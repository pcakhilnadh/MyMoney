import { describe, expect, it } from 'vitest'
import { formatCompactMinor } from './money'

describe('compact INR formatting', () => {
  it.each([
    [12345, '₹123.45'],
    [123456, '₹1.23K'],
    [12345678, '₹1.23L'],
    [1234567890, '₹1.23Cr'],
  ])('formats %i paise as %s', (amount, expected) => {
    expect(formatCompactMinor(amount)).toBe(expected)
  })
})
