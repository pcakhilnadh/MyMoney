import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePeople } from './hooks'
import type { Kitchen, UserId } from './types'

/** Bottom sheet. Portalled to <body>, so it re-applies the MyPlate theme itself. */
export function Sheet({
  eyebrow,
  title,
  onClose,
  children,
  footer,
  bare = false,
}: {
  eyebrow?: ReactNode
  title: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  /** No visible header: the title is kept for screen readers only. */
  bare?: boolean
}) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.focus()
    return () => {
      document.body.style.overflow = overflow
      previouslyFocused?.focus?.()
    }
  }, [])

  return createPortal(
    <div
      data-app="plate"
      style={{ background: 'none' }}
      className="fixed inset-0 z-50 flex items-end justify-center"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          onClose()
        }
      }}
    >
      <div
        aria-hidden="true"
        onClick={onClose}
        className="dialog-backdrop absolute inset-0 bg-black/55"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="pl-sheet dialog-backdrop relative flex max-h-[90vh] w-full max-w-md flex-col rounded-t-3xl outline-none"
      >
        <div aria-hidden="true" className="mx-auto mt-2.5 h-1 w-9 rounded-full bg-white/20" />
        {bare ? (
          <h2 id={titleId} className="sr-only">
            {title}
          </h2>
        ) : (
          <header className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
            <div className="min-w-0">
              {eyebrow && <p className="pl-label mb-0.5">{eyebrow}</p>}
              <h2 id={titleId} className="truncate text-lg leading-tight font-bold">
                {title}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="pl-sunken flex size-9 shrink-0 items-center justify-center rounded-[12px] text-muted-foreground hover:text-foreground"
            >
              <X size={17} />
            </button>
          </header>
        )}
        <div
          className={cn(
            // Scrolls by touch or wheel; no scrollbar is drawn down the side.
            'min-h-0 flex-1 [scrollbar-width:none] space-y-5 overflow-y-auto px-5 pb-5 [&::-webkit-scrollbar]:hidden',
            bare && 'space-y-3 pt-4',
          )}
        >
          {children}
        </div>
        {footer && (
          <div className="border-t border-white/[0.06] px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

export function KitchenDot({ color, className }: { color: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('inline-block size-2 shrink-0 rounded-full', className)}
      style={{ background: color }}
    />
  )
}

/** "🏡 Home" on a dark pill. */
export function KitchenChip({ kitchen, dot = false }: { kitchen: Kitchen; dot?: boolean }) {
  return (
    <span className="pl-chip min-w-0">
      {dot && <KitchenDot color={kitchen.color} />}
      <span aria-hidden="true">{kitchen.emoji}</span>
      <span className="truncate">{kitchen.name}</span>
    </span>
  )
}

export function Avatar({
  userId,
  size = 28,
  className,
}: {
  userId: UserId
  size?: number
  className?: string
}) {
  const { personOf } = usePeople()
  const person = personOf(userId)
  return (
    <span
      title={person.name}
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-white',
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.42),
        background: person.color ?? '#6b4a50',
      }}
    >
      {person.avatar ? (
        <img
          src={person.avatar}
          alt=""
          referrerPolicy="no-referrer"
          className="size-full object-cover"
        />
      ) : (
        <span aria-hidden="true">{person.name.trim()[0]?.toUpperCase()}</span>
      )}
      <span className="sr-only">{person.name}</span>
    </span>
  )
}

/** Overlapping avatars, outlined in the surface colour so they read as separate people. */
export function AvatarStack({
  userIds,
  size = 22,
  max = 4,
}: {
  userIds: UserId[]
  size?: number
  max?: number
}) {
  return (
    <span className="flex items-center">
      {userIds.slice(0, max).map((id, index) => (
        <Avatar
          key={id}
          userId={id}
          size={size}
          className={cn('ring-2 ring-[#3a1d23]', index > 0 && '-ml-1.5')}
        />
      ))}
      {userIds.length > max && (
        <span className="ml-1.5 text-xs font-medium text-muted-foreground">
          +{userIds.length - max}
        </span>
      )}
    </span>
  )
}

/** Square checkbox for prep tasks. */
export function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'flex size-[22px] shrink-0 items-center justify-center rounded-[6px] border-[1.5px] transition-colors',
        checked ? 'border-[#3f9d6a] bg-[#3f9d6a] text-white' : 'border-white/30 bg-black/10',
      )}
    >
      {checked && <Check size={14} strokeWidth={3} />}
    </button>
  )
}

/** Round checkbox for cart items. */
export function RoundCheck({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'flex size-[22px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors',
        checked ? 'border-[#3f9d6a] bg-[#3f9d6a] text-white' : 'border-white/30',
      )}
    >
      {checked && <Check size={13} strokeWidth={3} />}
    </button>
  )
}

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-[26px] w-[46px] shrink-0 rounded-full transition-colors',
        checked ? 'bg-[#3f9d6a]' : 'bg-white/15',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'absolute top-[3px] left-[3px] size-5 rounded-full bg-white shadow-sm transition-transform',
          checked && 'translate-x-5',
        )}
      />
    </button>
  )
}

/** Selectable pill (who's cooking, slots, kitchen types). Selected is filled red. */
export function Chip({
  selected,
  onClick,
  children,
  className,
  ...rest
}: {
  selected: boolean
  onClick: () => void
  children: ReactNode
  className?: string
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'children'>) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition-colors',
        selected
          ? 'bg-primary text-white'
          : 'bg-white/[0.07] text-foreground/85 hover:bg-white/[0.1]',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

/** Two or three views of the same list ("All meals | My cooking"). */
export function Tabs<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string }[]
  label: string
}) {
  return (
    <div role="tablist" aria-label={label} className="pl-sunken inline-flex rounded-[12px] p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={option.value === value}
          onClick={() => onChange(option.value)}
          className={cn(
            'h-8 rounded-[10px] px-3 text-[13px] font-semibold transition-colors',
            option.value === value
              ? 'bg-white/[0.12] text-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function FieldLabel({
  children,
  aside,
  htmlFor,
}: {
  children: ReactNode
  aside?: ReactNode
  htmlFor?: string
}) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <label htmlFor={htmlFor} className="text-sm font-semibold">
        {children}
      </label>
      {aside && <span className="text-xs text-muted-foreground">{aside}</span>}
    </div>
  )
}

export function ErrorLine({ error }: { error: unknown }) {
  if (!error) return null
  return (
    <p role="alert" className="text-sm text-destructive">
      {error instanceof Error ? error.message : 'Something went wrong.'}
    </p>
  )
}

export function EmojiPicker({
  value,
  onChange,
  choices,
}: {
  value: string
  onChange: (emoji: string) => void
  choices: string[]
}) {
  return (
    <div role="group" aria-label="Icon" className="flex flex-wrap gap-2">
      {choices.map((emoji) => (
        <button
          key={emoji}
          type="button"
          aria-pressed={value === emoji}
          aria-label={emoji}
          onClick={() => onChange(emoji)}
          className={cn(
            'flex size-10 items-center justify-center rounded-[12px] text-lg transition-colors',
            value === emoji ? 'bg-primary/25 ring-1 ring-primary' : 'pl-sunken',
          )}
        >
          {emoji}
        </button>
      ))}
    </div>
  )
}
