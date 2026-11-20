/** Dates are handled as local `YYYY-MM-DD` keys, the same shape as `meal_plans.meal_date`. */

export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`
}

export function parseDateKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day, 12)
}

export function addDays(key: string, days: number): string {
  const date = parseDateKey(key)
  date.setDate(date.getDate() + days)
  return dateKey(date)
}

export const todayKey = () => dateKey(new Date())

/** Monday of the week that contains `key`. */
export function weekStart(key: string): string {
  const day = parseDateKey(key).getDay()
  return addDays(key, -((day + 6) % 7))
}

export function weekDays(start: string): string[] {
  return Array.from({ length: 7 }, (_, index) => addDays(start, index))
}

export function formatDay(key: string, options: Intl.DateTimeFormatOptions): string {
  return parseDateKey(key).toLocaleDateString('en-IN', options)
}

export function formatWeekRange(start: string): string {
  const end = addDays(start, 6)
  const sameMonth = start.slice(0, 7) === end.slice(0, 7)
  const from = formatDay(start, sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'short' })
  return `${from} – ${formatDay(end, { day: 'numeric', month: 'short' })}`
}

/** `20:30` → `8:30 PM`. */
export function formatTime(value: string): string {
  const [hours, minutes] = value.split(':').map(Number)
  const suffix = hours >= 12 ? 'PM' : 'AM'
  const hour = hours % 12 || 12
  return `${hour}:${String(minutes).padStart(2, '0')} ${suffix}`
}

/** "Nov 16 – 22", or "Nov 30 – Dec 6" across months. */
export function formatWeekTitle(start: string): string {
  const end = addDays(start, 6)
  const month = (key: string) => parseDateKey(key).toLocaleDateString('en-US', { month: 'short' })
  const day = (key: string) => parseDateKey(key).getDate()
  return start.slice(0, 7) === end.slice(0, 7)
    ? `${month(start)} ${day(start)} – ${day(end)}`
    : `${month(start)} ${day(start)} – ${month(end)} ${day(end)}`
}
