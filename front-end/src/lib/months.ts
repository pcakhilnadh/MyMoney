/** Months are handled as local `YYYY-MM` keys. */
export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function shiftMonth(month: string, offset: number): string {
  const [year, monthNumber] = month.split('-').map(Number)
  return monthKey(new Date(year, monthNumber - 1 + offset, 1))
}

export function formatMonth(month: string, style: 'long' | 'short' = 'long'): string {
  return new Date(`${month}-01T12:00:00`).toLocaleDateString('en-IN', {
    month: style,
    ...(style === 'long' ? { year: 'numeric' } : {}),
  })
}
