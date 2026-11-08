import { useEffect, useId, useRef, useState } from 'react'
import { Check, ChevronDown, Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type Row = { kind: 'option'; name: string } | { kind: 'create'; name: string }

/**
 * Searchable category dropdown. Starts empty, filters as you type, and (when `onCreate` is given)
 * offers to add the typed name as a new category so nobody is stuck with an empty list.
 */
export function CategoryCombobox({
  value,
  onChange,
  options,
  onCreate,
  placeholder = 'Search or choose a category',
  invalid = false,
  onBlur,
  'aria-label': ariaLabel = 'Category',
}: {
  value: string | null
  onChange: (value: string | null) => void
  options: readonly string[]
  onCreate?: (name: string) => Promise<string>
  placeholder?: string
  invalid?: boolean
  onBlur?: (unmatchedText: boolean) => void
  'aria-label'?: string
}) {
  const listId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const activeRef = useRef<HTMLDivElement>(null)
  // `query` is null while the user is not editing; the input then shows the selected value.
  const [query, setQuery] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const text = (query ?? '').trim().replace(/\s+/g, ' ')
  const needle = text.toLowerCase()
  const sorted = [...new Set(options)].sort((a, b) => a.localeCompare(b))
  const filtered = sorted.filter((name) => name.toLowerCase().includes(needle))
  const exactMatch = needle ? sorted.find((name) => name.toLowerCase() === needle) : undefined
  const canCreate = !!onCreate && !!text && !exactMatch
  const rows: Row[] = [
    ...filtered.map((name): Row => ({ kind: 'option', name })),
    ...(canCreate ? [{ kind: 'create', name: text } as Row] : []),
  ]

  useEffect(() => {
    activeRef.current?.scrollIntoView?.({ block: 'nearest' })
  }, [activeIndex])

  function reset() {
    setQuery(null)
    setOpen(false)
    setActiveIndex(-1)
    setCreateError(null)
  }

  function choose(name: string) {
    onChange(name)
    reset()
  }

  async function create(name: string) {
    if (!onCreate || creating) return
    setCreating(true)
    setCreateError(null)
    try {
      const selectedName = await onCreate(name)
      choose(selectedName)
    } catch (error) {
      console.error('Unable to add category', error)
      setCreateError('Could not add that category. Please try again.')
    } finally {
      setCreating(false)
    }
  }

  function pick(row: Row) {
    if (row.kind === 'create') void create(row.name)
    else choose(row.name)
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setOpen(true)
      if (rows.length === 0) return
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActiveIndex((current) =>
        current < 0
          ? step > 0
            ? 0
            : rows.length - 1
          : (current + step + rows.length) % rows.length,
      )
    } else if (event.key === 'Enter' && open) {
      event.preventDefault()
      // Enter takes the highlighted row, or the best match for what was typed.
      const index = activeIndex >= 0 ? activeIndex : needle ? 0 : -1
      if (index >= 0 && rows[index]) pick(rows[index])
    } else if (event.key === 'Escape' && open) {
      event.preventDefault()
      event.stopPropagation()
      reset()
    }
  }

  function handleBlur(event: React.FocusEvent<HTMLDivElement>) {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) {
      return
    }
    // Typing a full name and tabbing away still selects it.
    if (exactMatch && exactMatch !== value) onChange(exactMatch)
    const unmatchedText = !!text && !exactMatch
    reset()
    onBlur?.(unmatchedText)
  }

  return (
    <div className="relative" onBlur={handleBlur}>
      <div className="relative">
        <input
          ref={inputRef}
          role="combobox"
          aria-label={ariaLabel}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-activedescendant={open && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
          aria-invalid={invalid || undefined}
          autoComplete="off"
          enterKeyHint="done"
          placeholder={placeholder}
          value={query ?? value ?? ''}
          onChange={(event) => {
            setQuery(event.target.value)
            setActiveIndex(-1)
            setCreateError(null)
            setOpen(true)
          }}
          onFocus={(event) => {
            event.currentTarget.select()
          }}
          onClick={() => {
            if (open) reset()
            else setOpen(true)
          }}
          onKeyDown={handleKeyDown}
          className="field pr-12"
        />
        {value && query === null ? (
          <button
            type="button"
            aria-label="Clear selection"
            className="absolute top-1/2 right-2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground"
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => {
              event.preventDefault()
              onChange(null)
              inputRef.current?.focus()
              setOpen(true)
            }}
          >
            <X aria-hidden="true" size={16} />
          </button>
        ) : (
          <button
            type="button"
            tabIndex={-1}
            aria-label="Show categories"
            aria-expanded={open}
            className="absolute top-1/2 right-2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground"
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => {
              event.preventDefault()
              setOpen((current) => !current)
              inputRef.current?.focus()
            }}
          >
            <ChevronDown
              aria-hidden="true"
              size={18}
              className={cn(
                'transition-transform motion-reduce:transition-none',
                open && 'rotate-180',
              )}
            />
          </button>
        )}
      </div>
      {open && (
        <div
          id={listId}
          role="listbox"
          aria-label={`${ariaLabel} suggestions`}
          className="surface field-menu absolute top-full z-50 mt-1.5 max-h-60 w-full overflow-y-auto rounded-2xl p-1.5 text-popover-foreground"
        >
          {rows.map((row, index) => {
            const active = activeIndex === index
            return (
              <div
                key={`${row.kind}:${row.name}`}
                id={`${listId}-${index}`}
                ref={active ? activeRef : undefined}
                role="option"
                aria-selected={row.kind === 'option' && row.name === value}
                aria-label={row.kind === 'create' ? `Add category ${row.name}` : undefined}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-foreground',
                  active ? 'bg-primary/15' : 'hover:bg-primary/10',
                  row.kind === 'create' && 'text-primary',
                )}
                onMouseDown={(event) => event.preventDefault()}
                onMouseMove={() => setActiveIndex(index)}
                onClick={(event) => {
                  // Stops the surrounding <label> from re-clicking the input and reopening the menu.
                  event.preventDefault()
                  pick(row)
                }}
              >
                {row.kind === 'create' ? (
                  <>
                    <Plus aria-hidden="true" size={16} />
                    <span className="truncate">
                      {creating ? 'Adding…' : `Add “${row.name}” as a new category`}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="truncate">{row.name}</span>
                    {row.name === value && (
                      <Check aria-hidden="true" className="ml-auto text-primary" size={16} />
                    )}
                  </>
                )}
              </div>
            )
          })}
          {rows.length === 0 && (
            <p className="px-3 py-2 text-sm text-muted-foreground">
              {sorted.length === 0
                ? onCreate
                  ? 'No categories yet. Type a name to add your first one.'
                  : 'No categories available.'
                : 'No matching category.'}
            </p>
          )}
          {createError && (
            <p role="alert" className="px-3 py-2 text-sm text-destructive">
              {createError}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
