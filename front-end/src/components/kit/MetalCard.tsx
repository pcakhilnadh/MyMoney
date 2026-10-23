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
      className={`relative overflow-hidden rounded-[24px] border border-white/10 bg-gradient-to-br from-[#292b33] via-[#1a1b22] to-[#131419] shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_16px_36px_-24px_rgba(0,0,0,0.9)] ${className}`}
    >
      <div className="pointer-events-none absolute -right-12 -top-12 size-36 rounded-full bg-white/5 blur-2xl" />
      <div className="relative">{children}</div>
    </article>
  )
}

export function MetalBadge({ label }: { label: string }) {
  return (
    <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-white/20 bg-gradient-to-br from-[#f1f2f5] via-[#aeb2bd] to-[#737784] text-lg font-bold text-[#202127] shadow-[inset_0_1px_1px_rgba(255,255,255,0.8),0_4px_12px_rgba(0,0,0,0.25)]">
      {label.charAt(0).toUpperCase()}
    </div>
  )
}

export function MetalActionButton({
  label,
  onClick,
  children,
  destructive = false,
}: {
  label: string
  onClick: () => void
  children: ReactNode
  destructive?: boolean
}) {
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
