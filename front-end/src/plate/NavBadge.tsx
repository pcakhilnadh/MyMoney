import { useGroceries } from './hooks'
import { leftToBuy } from './logic'

/** A small count over a nav icon; nothing when there's nothing to count. */
export function CountBadge({ count, label }: { count: number; label: string }) {
  if (count <= 0) return null
  return (
    <span
      aria-label={label}
      className="absolute -top-1.5 -right-2.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-none font-bold text-white tabular-nums ring-2 ring-[#15151c]"
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}

/** MyPlate's badges in the shared bottom bar: Cart shows what's left to buy. */
export function PlateNavBadge({ to }: { to: string }) {
  const items = useGroceries().data
  if (to !== '/plate/cart' || !items) return null
  const n = leftToBuy(items).length
  return <CountBadge count={n} label={`${n} to buy`} />
}
