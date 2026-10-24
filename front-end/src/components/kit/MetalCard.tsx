import type { ReactNode } from 'react'

export function MetalCard({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <article
      className={`relative overflow-hidden rounded-[20px] border border-white/8 bg-gradient-to-br from-[#1a1f3a] via-[#0f1628] to-[#0a0e1a] backdrop-blur-sm shadow-[inset_0_1px_0_rgba(75,139,255,0.15),0_20px_40px_-16px_rgba(0,0,0,0.8)] ${className}`}
    >
      <div className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-blue-500/8 blur-3xl" />
      <div className="pointer-events-none absolute -left-20 bottom-0 size-40 rounded-full bg-purple-500/5 blur-3xl" />
      <div className="relative z-10">{children}</div>
    </article>
  )
}

export function MetalBadge({ label, variant = 'default' }: { label: string; variant?: 'default' | 'premium' }) {
  if (variant === 'premium') {
    return (
      <div className="flex size-10 shrink-0 items-center justify-center rounded-[16px] border border-blue-400/30 bg-gradient-to-br from-blue-500/20 via-blue-500/10 to-blue-600/5 text-xs font-bold text-blue-200 shadow-[inset_0_1px_0_rgba(75,139,255,0.4),0_4px_12px_rgba(75,139,255,0.15)]">
        {label.charAt(0).toUpperCase()}
      </div>
    )
  }

  return (
    <div className="flex size-10 shrink-0 items-center justify-center rounded-[16px] border border-blue-400/30 bg-gradient-to-br from-blue-500/20 via-blue-500/10 to-blue-600/5 text-xs font-bold text-blue-200 shadow-[inset_0_1px_0_rgba(75,139,255,0.4),0_4px_12px_rgba(75,139,255,0.15)]">
      {label.charAt(0).toUpperCase()}
    </div>
  )
}

export function MetalActionButton({
  label,
  onClick,
  children,
  destructive = false,
  variant = 'default',
}: {
  label: string
  onClick: () => void
  children: ReactNode
  destructive?: boolean
  variant?: 'default' | 'premium'
}) {
  if (variant === 'premium') {
    return (
      <button
        type="button"
        aria-label={label}
        title={label}
        onClick={onClick}
        className={`flex size-8 items-center justify-center rounded-lg border text-xs transition ${
          destructive
            ? 'border-red-500/20 bg-red-500/5 text-red-300 hover:border-red-500/40 hover:bg-red-500/15'
            : 'border-blue-400/20 bg-blue-500/5 text-blue-300 hover:border-blue-400/40 hover:bg-blue-500/15'
        }`}
      >
        {children}
      </button>
    )
  }

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`flex size-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-muted-foreground transition ${
        destructive
          ? 'hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive'
          : 'hover:border-white/20 hover:bg-white/10 hover:text-foreground'
      }`}
    >
      {children}
    </button>
  )
}
