import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, ListFilter } from 'lucide-react'

/** Compact single-choice dropdown. The trigger highlights when a non-default option is active. */
export function FilterMenu<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: readonly T[]
  value: T
  onChange: (value: T) => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const active = value !== options[0]

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

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={`flex h-8 items-center gap-1.5 rounded-md border px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${
          active
            ? 'border-white/40 bg-white/25 text-white'
            : 'border-white/20 bg-white/10 text-white/85 hover:bg-white/15 hover:text-white'
        }`}
      >
        <ListFilter aria-hidden="true" size={13} />
        {value}
        <ChevronDown
          aria-hidden="true"
          size={13}
          className={`transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div
          role="menu"
          aria-label={label}
          className="surface absolute top-full right-0 z-30 mt-1.5 w-36 rounded-lg p-1 shadow-2xl"
        >
          {options.map((option) => (
            <button
              key={option}
              type="button"
              role="menuitemradio"
              aria-checked={option === value}
              onClick={() => {
                onChange(option)
                setOpen(false)
              }}
              className="flex w-full items-center justify-between rounded-md px-2.5 py-2 text-sm transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <span className={option === value ? 'font-semibold text-primary' : ''}>{option}</span>
              {option === value && <Check aria-hidden="true" size={15} className="text-primary" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
