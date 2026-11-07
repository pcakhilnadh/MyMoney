import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { formatMonth } from '@/lib/months'

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70'
// Tight prev/next arrows that sit on the glossy hero panel.
const ARROW_BUTTON = `flex h-8 w-6 shrink-0 items-center justify-center rounded-md text-white/70 transition-colors hover:bg-white/15 hover:text-white ${FOCUS} disabled:pointer-events-none disabled:opacity-30`
// Larger year arrows used on the dark picker popover.
const YEAR_BUTTON =
  'flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-30'

/** Compact month header (title + calendar picker + prev/next) meant to live inside a card. */
export function MonthSwitcher({
  value,
  max,
  onChange,
  prev,
  next,
  trailing,
}: {
  value: string
  max: string
  onChange: (month: string) => void
  prev: string
  next: string
  trailing?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [year, setYear] = useState(() => Number(value.slice(0, 4)))
  const rootRef = useRef<HTMLDivElement>(null)
  const maxYear = Number(max.slice(0, 4))

  useEffect(() => {
    if (!open) return
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsidePress)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePress)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  function toggle() {
    if (!open) setYear(Number(value.slice(0, 4)))
    setOpen((current) => !current)
  }

  function choose(month: string) {
    onChange(month)
    setOpen(false)
  }

  return (
    <div ref={rootRef} className="relative">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label="Choose month"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={toggle}
          className={`-ml-1 flex min-h-8 min-w-0 items-center gap-1.5 rounded-md px-1 text-base font-bold whitespace-nowrap text-white transition-colors hover:bg-white/10 ${FOCUS}`}
        >
          {formatMonth(value)}
          <CalendarDays aria-hidden="true" size={16} className="text-white/80" />
          <ChevronDown
            aria-hidden="true"
            size={14}
            className={`-ml-0.5 text-white/70 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </button>
        <div className="flex items-center gap-2">
          <div className="flex items-center">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => onChange(prev)}
              className={ARROW_BUTTON}
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              aria-label="Next month"
              disabled={value >= max}
              onClick={() => onChange(next)}
              className={ARROW_BUTTON}
            >
              <ChevronRight size={18} />
            </button>
          </div>
          {trailing}
        </div>
      </div>

      {open && (
        <div
          role="dialog"
          aria-label="Choose month"
          className="surface absolute inset-x-0 top-full z-20 mt-2 space-y-3 rounded-lg p-3 shadow-2xl"
        >
          <div className="flex items-center justify-between">
            <button
              type="button"
              aria-label="Previous year"
              onClick={() => setYear((current) => current - 1)}
              className={YEAR_BUTTON}
            >
              <ChevronLeft size={18} />
            </button>
            <span className="text-sm font-semibold">{year}</span>
            <button
              type="button"
              aria-label="Next year"
              disabled={year >= maxYear}
              onClick={() => setYear((current) => current + 1)}
              className={YEAR_BUTTON}
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {Array.from({ length: 12 }, (_, index) => {
              const month = `${year}-${String(index + 1).padStart(2, '0')}`
              const selected = month === value
              return (
                <button
                  key={month}
                  type="button"
                  aria-label={formatMonth(month)}
                  aria-pressed={selected}
                  disabled={month > max}
                  onClick={() => choose(month)}
                  className={`rounded-md py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-30 ${
                    selected ? 'gloss text-primary-foreground' : 'text-foreground hover:bg-muted/60'
                  }`}
                >
                  {formatMonth(month, 'short')}
                </button>
              )
            })}
          </div>
          {value !== max && (
            <button
              type="button"
              onClick={() => choose(max)}
              className="w-full rounded-md py-2 text-sm font-medium text-primary transition-colors hover:bg-muted/60"
            >
              Jump to this month
            </button>
          )}
        </div>
      )}
    </div>
  )
}
