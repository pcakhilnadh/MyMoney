import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Plus } from 'lucide-react'
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { cn } from '@/lib/utils'
import { currencySymbol } from '@/lib/currency'
import { formatMinor, normalizeMoneyInput, toMinor } from '@/lib/money'
import { useCurrency } from '@/money/CurrencyContext'

export { Button } from '@/components/ui/button'
export { MetalActionButton, MetalBadge, MetalCard } from './MetalCard'
export { AccountCard } from './AccountCard'

export function AddIconButton({
  label,
  onClick,
}: {
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="gloss flex size-10 shrink-0 items-center justify-center rounded-full text-primary-foreground transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <Plus size={21} />
    </button>
  )
}

export function Card({
  children,
  className = '',
  hero = false,
}: {
  children: ReactNode
  className?: string
  hero?: boolean
}) {
  return (
    <div className={cn('rounded-card p-5', hero ? 'hero' : 'surface', className)}>{children}</div>
  )
}

export function Input({ className = '', ...p }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn('field', className)} {...p} />
}

export function Select({ className = '', ...p }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn('field appearance-none', className)} {...p} />
}

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="mb-1">
      <h1 className="text-[28px] leading-tight font-bold">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
    </header>
  )
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="label px-1">{children}</h2>
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: T[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="surface flex rounded-2xl p-1">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          className={cn(
            'flex-1 rounded-xl py-2 text-sm font-medium transition-colors',
            o === value ? 'gloss text-primary-foreground' : 'text-muted-foreground',
          )}
        >
          {o}
        </button>
      ))}
    </div>
  )
}

/** Controlled amount input. `value` is stored in minor currency units. */
export function CurrencyInput({
  value,
  onChange,
  label = 'Amount',
}: {
  value: number
  onChange: (minor: number) => void
  label?: string
}) {
  const { currency } = useCurrency()
  const formatValue = (minor: number) => (minor ? (minor / 100).toFixed(2) : '')
  const [rawValue, setRawValue] = useState(() => formatValue(value))
  const lastReportedValue = useRef(value)

  useEffect(() => {
    if (value !== lastReportedValue.current) setRawValue(formatValue(value))
    lastReportedValue.current = value
  }, [value])

  return (
    <label className="block space-y-1.5">
      <span className="label">{label}</span>
      <div className="field flex items-center gap-2 !py-3">
        <span className="text-2xl font-semibold text-muted-foreground">
          {currencySymbol(currency)}
        </span>
        <input
          inputMode="decimal"
          className="money w-full bg-transparent text-3xl font-bold outline-none placeholder:text-[#3d3d4a]"
          value={rawValue}
          placeholder="0"
          onChange={(e) => {
            const next = normalizeMoneyInput(e.target.value)
            const minor = toMinor(next)
            setRawValue(next)
            lastReportedValue.current = minor
            onChange(minor)
          }}
        />
      </div>
    </label>
  )
}

export function CategorySelector({
  value,
  onChange,
  options = [],
  label = 'Category',
}: {
  value: string | null
  onChange: (v: string) => void
  options?: readonly string[]
  label?: string
}) {
  const sortedOptions = [...options].sort((a, b) => a.localeCompare(b))

  return (
    <div role="group" aria-label={label} className="space-y-1.5">
      <span className="label">{label}</span>
      <div className="flex flex-wrap gap-2">
        {sortedOptions.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            className={cn(
              'rounded-full border px-4 py-2 text-sm font-medium transition-colors',
              c === value
                ? 'gloss border-transparent text-primary-foreground'
                : 'border-border bg-card text-muted-foreground',
            )}
          >
            {c}
          </button>
        ))}
      </div>
    </div>
  )
}

export function DatePicker({
  value,
  onChange,
  label = 'Date',
}: {
  value: string
  onChange: (isoDate: string) => void
  label?: string
}) {
  return (
    <label className="block space-y-1.5">
      <span className="label">{label}</span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="field"
      />
    </label>
  )
}

export function ListItem({
  icon,
  title,
  subtitle,
  trailing,
}: {
  icon?: ReactNode
  title: string
  subtitle?: string
  trailing?: ReactNode
}) {
  return (
    <div className="surface flex items-center gap-3 rounded-2xl px-4 py-3.5">
      {icon && (
        <div className="flex size-10 items-center justify-center rounded-xl bg-secondary text-primary">
          {icon}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{title}</div>
        {subtitle && <div className="truncate text-sm text-muted-foreground">{subtitle}</div>}
      </div>
      {trailing && <div className="money font-semibold">{trailing}</div>}
    </div>
  )
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="py-10 text-center text-sm text-muted-foreground">{children}</p>
}

export type ChartPoint = { name: string; value: number }
const PALETTE = ['#7c6cff', '#4ae3b5', '#ffb86b', '#ff6b7a', '#5cc8ff', '#c58bff']
const TIP = {
  contentStyle: {
    background: '#1a1a23',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 12,
    color: '#f4f4f8',
    fontSize: 12,
  },
  cursor: { fill: 'rgba(255,255,255,0.04)' },
}

export function BarChartCard({ title, data }: { title: string; data: ChartPoint[] }) {
  const { currency } = useCurrency()
  return (
    <Card>
      <div className="label mb-3">{title}</div>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={data}>
          <defs>
            <linearGradient id="bar" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" />
              <stop offset="100%" stopColor="color-mix(in srgb, var(--primary) 65%, #0a0a0f)" />
            </linearGradient>
          </defs>
          <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={11} stroke="#8e8ea0" />
          <Tooltip
            {...TIP}
            formatter={(value) => formatMinor(Math.round(Number(value) * 100), currency)}
          />
          <Bar dataKey="value" fill="url(#bar)" radius={[8, 8, 3, 3]} />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  )
}

export function DonutChartCard({ title, data }: { title: string; data: ChartPoint[] }) {
  const { currency } = useCurrency()
  return (
    <Card>
      <div className="label mb-3">{title}</div>
      <div className="flex items-center gap-4">
        <ResponsiveContainer width="50%" height={150}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              innerRadius={42}
              outerRadius={68}
              paddingAngle={3}
              stroke="none"
            >
              {data.map((_, i) => (
                <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
              ))}
            </Pie>
            <Tooltip
              {...TIP}
              formatter={(value) => formatMinor(Math.round(Number(value) * 100), currency)}
            />
          </PieChart>
        </ResponsiveContainer>
        <ul className="min-w-0 flex-1 space-y-1.5 text-sm">
          {data.slice(0, 6).map((d, i) => (
            <li key={d.name} className="flex items-center gap-2">
              <span
                className="size-2.5 rounded-full"
                style={{ background: PALETTE[i % PALETTE.length] }}
              />
              <span className="truncate text-muted-foreground">{d.name}</span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  )
}
