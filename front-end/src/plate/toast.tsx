import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

/*
 * Small toasts for MyPlate: a short confirmation that slides in at the top, above any sheet,
 * and goes away by itself. Call `toast('…')` from anywhere; <Toaster /> shows them.
 */

interface Toast {
  id: number
  text: string
  icon?: string
}

const SHOW_MS = 2200
let nextId = 1
const listeners = new Set<(toast: Toast) => void>()

export function toast(text: string, icon?: string) {
  const item = { id: nextId++, text, icon }
  listeners.forEach((listener) => listener(item))
}

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([])

  useEffect(() => {
    const timers = new Set<ReturnType<typeof setTimeout>>()
    const show = (item: Toast) => {
      // One at a time: a new toast replaces the one on screen.
      setItems([item])
      const timer = setTimeout(() => {
        setItems((current) => current.filter((t) => t.id !== item.id))
        timers.delete(timer)
      }, SHOW_MS)
      timers.add(timer)
    }
    listeners.add(show)
    return () => {
      listeners.delete(show)
      timers.forEach(clearTimeout)
    }
  }, [])

  return createPortal(
    <div
      data-app="plate"
      style={{ background: 'none' }}
      className="pointer-events-none fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-[70] mx-auto flex max-w-md justify-center px-4"
    >
      {items.map((item) => (
        <p
          key={item.id}
          role="status"
          className="flex animate-in items-center gap-2 rounded-full border border-white/10 bg-[#3b2026] py-2 pr-4 pl-3 text-sm font-medium text-white shadow-[0_12px_28px_-10px_rgba(0,0,0,0.8)] duration-200 fade-in-0 slide-in-from-top-2"
        >
          {item.icon && <span aria-hidden="true">{item.icon}</span>}
          {item.text}
        </p>
      ))}
    </div>,
    document.body,
  )
}
