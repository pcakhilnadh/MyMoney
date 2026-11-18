type Option<T extends string> = T | { value: T; label: string }

/**
 * The app's segmented control: a neumorphic inset track with a raised thumb that slides to
 * the active option. Options are plain strings, or `{ value, label }` when they differ.
 * `mode="tabs"` exposes tab semantics (switching views); the default exposes toggle buttons
 * (choosing a value in a form).
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  mode = 'buttons',
}: {
  options: Option<T>[]
  value: T
  onChange: (value: T) => void
  label?: string
  mode?: 'buttons' | 'tabs'
}) {
  const items = options.map((option) =>
    typeof option === 'string' ? { value: option, label: option } : option,
  )
  const index = Math.max(
    items.findIndex((item) => item.value === value),
    0,
  )
  const tabs = mode === 'tabs'

  return (
    <div
      role={tabs ? 'tablist' : 'group'}
      aria-label={label}
      className="relative flex rounded-2xl bg-[#0a0e1a] p-1 shadow-[inset_2px_2px_6px_rgba(0,0,0,0.65),inset_-1px_-1px_3px_rgba(255,255,255,0.05)]"
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-1 left-1 rounded-xl bg-gradient-to-br from-[#2a3260] to-[#1a2147] shadow-[3px_3px_8px_rgba(0,0,0,0.55),-1px_-1px_4px_rgba(148,176,255,0.12),inset_0_1px_0_rgba(255,255,255,0.12)] transition-transform duration-300 ease-[cubic-bezier(0.34,1.4,0.64,1)] motion-reduce:transition-none"
        style={{
          width: `calc((100% - 8px) / ${items.length})`,
          transform: `translateX(${index * 100}%)`,
        }}
      />
      {items.map((item) => {
        const selected = item.value === value
        return (
          <button
            key={item.value}
            type="button"
            role={tabs ? 'tab' : undefined}
            aria-selected={tabs ? selected : undefined}
            aria-pressed={tabs ? undefined : selected}
            onClick={() => onChange(item.value)}
            className={`relative z-10 min-w-0 flex-1 truncate rounded-xl px-2 py-2 text-sm font-semibold transition-[color,transform] duration-200 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none ${
              selected ? 'text-white' : 'text-white/50 hover:text-white/75'
            }`}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
