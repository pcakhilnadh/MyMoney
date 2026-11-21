import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import * as api from './api'
import { usePlate } from './context'
import { useMe, useMyShopping, usePeople, usePlateMutation } from './hooks'
import type { Kitchen } from './types'
import { Avatar, ErrorLine } from './ui'

/** Re-renders every half minute so "Live · 6 min" keeps counting. */
function useNow() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])
  return now
}

function since(iso: string | undefined, now: number): string {
  if (!iso) return 'just now'
  const minutes = Math.floor((now - Date.parse(iso)) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)} h`
}

/** Green dot with a soft pulse; the pulse is dropped for reduced motion. */
export function LiveDot({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cn('relative flex size-2.5 shrink-0', className)}>
      <span className="absolute inset-0 rounded-full bg-[#4cc38a] opacity-60 motion-safe:animate-ping" />
      <span className="relative size-2.5 rounded-full bg-[#4cc38a]" />
    </span>
  )
}

function listNames(names: string[]): string {
  if (names.length <= 2) return names.join(' and ')
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`
}

/**
 * Cart presence: "Go live" so the others know you're at the store, the live bar while you
 * shop, and everyone else who's shopping. Only shared kitchens have presence.
 */
export function ShoppingPresence({
  kitchens,
  toBuyByKitchen,
  inBasketByKitchen,
}: {
  /** The kitchens in view: the selected one, or all of them. */
  kitchens: Kitchen[]
  toBuyByKitchen: Record<string, number>
  /** Ticked items not cleared yet. */
  inBasketByKitchen: Record<string, number>
}) {
  const me = useMe()
  const now = useNow()
  const { nameOf } = usePeople()
  const toggle = usePlateMutation(({ ids, on }: { ids: string[]; on: boolean }) =>
    api.setShopping(ids, on),
  )
  const shared = kitchens.filter((k) => !k.is_personal)
  if (shared.length === 0) return null

  const myLive = shared.filter((k) => k.shopping_now.includes(me))
  // Going live covers the shared kitchens that still have something to buy; with nothing
  // to buy there's no reason to go to the store, so the prompt stays hidden.
  const targets = shared.filter((k) => (toBuyByKitchen[k.id] ?? 0) > 0)
  /** Everyone else in these kitchens, as "Maya" or "Maya, Rohan and 2 more". */
  const audience = (list: Kitchen[]) => {
    const ids = [
      ...new Set(list.flatMap((k) => k.members.map((m) => m.user_id)).filter((u) => u !== me)),
    ]
    return { names: listNames(ids.map(nameOf)), count: ids.length }
  }
  const others = shared.flatMap((k) =>
    k.shopping_now
      .filter((user) => user !== me)
      .map((user) => ({ user, kitchen: k, since: k.shopping_since[user] })),
  )
  const leftInLive = myLive.reduce((sum, k) => sum + (toBuyByKitchen[k.id] ?? 0), 0)
  const inBasket = myLive.reduce((sum, k) => sum + (inBasketByKitchen[k.id] ?? 0), 0)
  // Only offer "Done" once something was ticked and nothing is left.
  const allTicked = leftInLive === 0 && inBasket > 0
  const startedAt = myLive
    .map((k) => k.shopping_since[me])
    .filter((value): value is string => !!value)
    .sort()[0]
  const where = (list: Kitchen[]) =>
    shared.length > 1 || kitchens.length > 1 ? ` · ${list.map((k) => k.name).join(', ')}` : ''

  return (
    <div className="space-y-2">
      {myLive.length > 0 ? (
        <section
          aria-label="You're shopping"
          className="rounded-[16px] border border-[#3f9d6a]/45 bg-[#3f9d6a]/15 p-3.5"
        >
          <div className="flex items-center gap-3">
            <LiveDot />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-sm font-semibold text-[#c6f0d8]">
                <span className="rounded-[4px] bg-[#4cc38a] px-1.5 py-px text-[10px] font-bold tracking-wider text-[#0d2a1b]">
                  LIVE
                </span>
                You're shopping · {since(startedAt, now)}
              </p>
              {allTicked && (
                <p className="mt-0.5 truncate text-xs text-[#8fcfaa]">
                  Everything's ticked. Done shopping?
                </p>
              )}
            </div>
            <button
              type="button"
              disabled={toggle.isPending}
              onClick={() => toggle.mutate({ ids: myLive.map((k) => k.id), on: false })}
              className={cn(
                'pl-btn h-9 shrink-0 px-3.5 text-sm',
                allTicked ? 'pl-btn-success' : 'pl-btn-secondary',
              )}
            >
              {toggle.isPending ? (
                <>
                  <Loader2 size={14} className="animate-spin" aria-hidden="true" /> Stopping…
                </>
              ) : allTicked ? (
                'Done'
              ) : (
                'Stop'
              )}
            </button>
          </div>
        </section>
      ) : targets.length === 0 ? null : (
        <section aria-label="Go live" className="pl-card flex items-center gap-3 p-3">
          <span
            aria-hidden="true"
            className="pl-sunken flex size-10 shrink-0 items-center justify-center rounded-[12px] text-lg"
          >
            🛒
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Going to the store?</p>
            <p className="text-xs text-muted-foreground">
              Go live so {audience(targets).names}{' '}
              {audience(targets).count === 1 ? 'knows' : 'know'} you're shopping{where(targets)}
            </p>
          </div>
          <button
            type="button"
            disabled={toggle.isPending}
            onClick={() => toggle.mutate({ ids: targets.map((k) => k.id), on: true })}
            className="pl-btn pl-btn-success h-9 shrink-0 gap-1.5 px-3.5 text-sm"
          >
            {toggle.isPending ? (
              <>
                <Loader2 size={14} className="animate-spin" aria-hidden="true" /> Going live…
              </>
            ) : (
              <>
                <span aria-hidden="true" className="size-1.5 rounded-full bg-white" />
                Go live
              </>
            )}
          </button>
        </section>
      )}

      {others.map(({ user, kitchen, since: started }) => (
        <p
          key={`${kitchen.id}-${user}`}
          role="status"
          className="flex items-center gap-2.5 rounded-[12px] border border-[#3f9d6a]/30 bg-[#3f9d6a]/10 px-3.5 py-2.5 text-sm text-[#9be6bb]"
        >
          <LiveDot />
          <Avatar userId={user} size={22} />
          <span className="min-w-0 flex-1 truncate">
            <b className="font-semibold">{nameOf(user)}</b> is shopping now
            {kitchens.length > 1 && ` · ${kitchen.name}`}
          </span>
          <span className="shrink-0 text-xs text-[#7fbf9a]">{since(started, now)}</span>
        </p>
      ))}
      <ErrorLine error={toggle.error} />
    </div>
  )
}

/**
 * While I'm live, a small pill floats above the bottom bar on every other MyPlate screen, so
 * it's obvious that others can see I'm shopping and easy to stop.
 */
export function LiveShoppingPill() {
  const { pathname } = useLocation()
  const { select } = usePlate()
  const live = useMyShopping()
  const stop = usePlateMutation((ids: string[]) => api.setShopping(ids, false))
  if (live.length === 0 || pathname.startsWith('/plate/cart')) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-20 mx-auto flex max-w-md justify-center px-4">
      <div
        role="status"
        className="pointer-events-auto flex items-center gap-2 rounded-full border border-[#3f9d6a]/50 bg-[#173a28] py-1.5 pr-1.5 pl-3 text-sm shadow-lg shadow-black/40"
      >
        <LiveDot />
        <Link
          to="/plate/cart"
          onClick={() => live.length === 1 && select(live[0].id)}
          className="font-semibold text-[#c6f0d8]"
        >
          You're shopping
          <span className="font-normal text-[#8fcfaa]">
            {' '}
            · {live.length === 1 ? live[0].name : `${live.length} kitchens`}
          </span>
        </Link>
        <button
          type="button"
          disabled={stop.isPending}
          onClick={() => stop.mutate(live.map((k) => k.id))}
          className="flex h-7 items-center gap-1 rounded-full bg-white/10 px-2.5 text-xs font-semibold text-white hover:bg-white/15 disabled:opacity-80"
        >
          {stop.isPending ? (
            <>
              <Loader2 size={12} className="animate-spin" aria-hidden="true" /> Stopping…
            </>
          ) : (
            'Stop'
          )}
        </button>
      </div>
    </div>
  )
}
