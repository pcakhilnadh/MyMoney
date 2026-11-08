import { useEffect, useId, useRef, useState } from 'react'
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react'
import { RequiredMark } from '@/components/kit'

const dateString = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

function parseDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return value ? new Date(year, month - 1, day) : new Date()
}

export function TransactionDatePicker({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [month, setMonth] = useState(() => {
    const date = parseDate(value)
    return new Date(date.getFullYear(), date.getMonth(), 1)
  })
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const descriptionId = useId()

  useEffect(() => {
    if (!open) return
    function outside(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
        trigger.current?.focus()
      }
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  const firstDay = month.getDay()
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const selected = parseDate(value)

  function choose(date: Date) {
    onChange(dateString(date))
    setOpen(false)
    trigger.current?.focus()
  }

  return (
    <div ref={root} className="relative space-y-1.5">
      <span className="label">
        Date
        <RequiredMark />
      </span>
      <button
        ref={trigger}
        type="button"
        aria-label="Date"
        aria-describedby={descriptionId}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          if (!open) setMonth(new Date(selected.getFullYear(), selected.getMonth(), 1))
          setOpen(!open)
        }}
        className="field flex items-center gap-2 text-left"
      >
        <CalendarDays aria-hidden="true" size={18} className="text-muted-foreground" />
        <span id={descriptionId} className="flex-1">
          {value
            ? selected.toLocaleDateString(undefined, {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })
            : 'Select a date'}
          <span className="sr-only">, required</span>
        </span>
        <ChevronDown aria-hidden="true" size={18} className={open ? 'rotate-180' : ''} />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Choose date"
          className="surface field-menu absolute top-full z-50 mt-1.5 w-full max-w-80 rounded-2xl p-3"
        >
          <div className="flex items-center justify-between">
            <button
              type="button"
              aria-label="Previous year"
              onClick={() => setMonth(new Date(month.getFullYear() - 1, month.getMonth(), 1))}
              className="flex size-9 items-center justify-center rounded-xl hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary"
            >
              <ChevronsLeft size={18} />
            </button>
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
              className="flex size-10 items-center justify-center rounded-xl hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="text-sm font-semibold" aria-live="polite">
              {month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
            </span>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
              className="flex size-10 items-center justify-center rounded-xl hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary"
            >
              <ChevronRight size={18} />
            </button>
            <button
              type="button"
              aria-label="Next year"
              onClick={() => setMonth(new Date(month.getFullYear() + 1, month.getMonth(), 1))}
              className="flex size-9 items-center justify-center rounded-xl hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary"
            >
              <ChevronsRight size={18} />
            </button>
          </div>
          <div className="grid grid-cols-7 text-center">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => (
              <span key={day} className="py-2 text-xs text-muted-foreground">
                {day}
              </span>
            ))}
            {Array.from({ length: firstDay }, (_, index) => (
              <span key={`empty-${index}`} />
            ))}
            {Array.from({ length: days }, (_, index) => {
              const date = new Date(month.getFullYear(), month.getMonth(), index + 1)
              const isSelected = dateString(date) === value
              return (
                <button
                  key={index}
                  type="button"
                  aria-label={date.toLocaleDateString(undefined, {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                  aria-pressed={isSelected}
                  onClick={() => choose(date)}
                  className={`h-9 rounded-xl text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${isSelected ? 'gloss text-primary-foreground' : 'hover:bg-primary/10'}`}
                >
                  {index + 1}
                </button>
              )
            })}
          </div>
          <button
            type="button"
            onClick={() => choose(new Date())}
            className="mt-1 w-full rounded-xl py-2 text-sm font-medium text-primary hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary"
          >
            Today
          </button>
        </div>
      )}
    </div>
  )
}
