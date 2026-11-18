import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Info } from 'lucide-react'

interface ConfirmOptions {
  title: string
  message?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** `destructive` colours the confirm button red; use it for deletes and irreversible changes. */
  tone?: 'default' | 'destructive'
}

interface NoticeOptions {
  title: string
  message?: ReactNode
  buttonLabel?: string
}

interface DialogApi {
  /** Resolves true when the user confirms, false when they cancel or dismiss. */
  confirm: (options: ConfirmOptions) => Promise<boolean>
  /** Shows a message with a single button; resolves once it is dismissed. */
  notify: (options: NoticeOptions) => Promise<void>
}

type ActiveDialog =
  | { kind: 'confirm'; options: ConfirmOptions; resolve: (value: boolean) => void }
  | { kind: 'notice'; options: NoticeOptions; resolve: () => void }

const DialogContext = createContext<DialogApi | null>(null)

export function useDialog(): DialogApi {
  const api = useContext(DialogContext)
  if (!api) throw new Error('useDialog must be used inside <DialogProvider>')
  return api
}

const raised =
  'bg-gradient-to-br from-[#2a3260] to-[#1a2147] shadow-[3px_3px_8px_rgba(0,0,0,0.5),-1px_-1px_4px_rgba(148,176,255,0.1),inset_0_1px_0_rgba(255,255,255,0.1)]'
const pressed =
  'transition-[transform,box-shadow,filter] duration-150 active:scale-95 active:shadow-[inset_2px_2px_5px_rgba(0,0,0,0.55)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none'

export function DialogProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<ActiveDialog | null>(null)
  const activeRef = useRef<ActiveDialog | null>(null)

  const show = useCallback((next: ActiveDialog) => {
    // A new dialog replaces any open one, which counts as dismissed.
    const previous = activeRef.current
    if (previous?.kind === 'confirm') previous.resolve(false)
    if (previous?.kind === 'notice') previous.resolve()
    activeRef.current = next
    setActive(next)
  }, [])

  const api = useMemo<DialogApi>(
    () => ({
      confirm: (options) =>
        new Promise<boolean>((resolve) => show({ kind: 'confirm', options, resolve })),
      notify: (options) =>
        new Promise<void>((resolve) => show({ kind: 'notice', options, resolve })),
    }),
    [show],
  )

  function close(result: boolean) {
    if (!active) return
    if (active.kind === 'confirm') active.resolve(result)
    else active.resolve()
    activeRef.current = null
    setActive(null)
  }

  return (
    <DialogContext.Provider value={api}>
      {children}
      {active &&
        createPortal(
          <DialogView key={active.options.title} active={active} onClose={close} />,
          document.body,
        )}
    </DialogContext.Provider>
  )
}

function DialogView({
  active,
  onClose,
}: {
  active: ActiveDialog
  onClose: (result: boolean) => void
}) {
  const titleId = useId()
  const messageId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const { options } = active
  const isConfirm = active.kind === 'confirm'
  const destructive = isConfirm && active.options.tone === 'destructive'

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    // Focus the safe choice first so Enter never confirms a destructive action by accident.
    const buttons = panelRef.current?.querySelectorAll<HTMLButtonElement>('button')
    ;(isConfirm ? buttons?.[0] : buttons?.[buttons.length - 1])?.focus()
    return () => previouslyFocused?.focus?.()
  }, [isConfirm])

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose(false)
    } else if (event.key === 'Tab') {
      const buttons = Array.from(
        panelRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [],
      )
      if (buttons.length === 0) return
      const first = buttons[0]
      const last = buttons[buttons.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
  }

  const Icon = destructive ? AlertTriangle : Info
  const message = options.message

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
      onKeyDown={onKeyDown}
    >
      <div
        aria-hidden="true"
        onClick={() => onClose(false)}
        className="dialog-backdrop absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={message ? messageId : undefined}
        className="dialog-panel relative w-full max-w-sm space-y-4 rounded-[24px] border border-white/10 bg-gradient-to-br from-[#1a1f3a] via-[#0f1628] to-[#0a0e1a] p-5 shadow-[inset_0_1px_0_rgba(75,139,255,0.15),0_24px_48px_-12px_rgba(0,0,0,0.85)]"
      >
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className={`flex size-10 shrink-0 items-center justify-center rounded-2xl shadow-[inset_1px_1px_4px_rgba(0,0,0,0.55),inset_-1px_-1px_2px_rgba(255,255,255,0.05)] ${
              destructive ? 'bg-[#2a1218] text-[#ff8b94]' : 'bg-[#0a0e1a] text-[#94b0ff]'
            }`}
          >
            <Icon size={18} />
          </span>
          <div className="min-w-0 space-y-1">
            <h2 id={titleId} className="text-base font-semibold">
              {options.title}
            </h2>
            {message && (
              <p id={messageId} className="text-sm text-muted-foreground">
                {message}
              </p>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          {isConfirm && (
            <button
              type="button"
              onClick={() => onClose(false)}
              className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold ${raised} ${pressed}`}
            >
              {active.options.cancelLabel ?? 'Cancel'}
            </button>
          )}
          <button
            type="button"
            onClick={() => onClose(true)}
            className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold ${pressed} ${
              destructive
                ? 'bg-gradient-to-br from-[#e5545f] to-[#b3303b] text-white shadow-[3px_3px_8px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.2)] hover:brightness-110'
                : `${raised} text-white`
            }`}
          >
            {active.kind === 'confirm'
              ? (active.options.confirmLabel ?? 'Confirm')
              : (active.options.buttonLabel ?? 'OK')}
          </button>
        </div>
      </div>
    </div>
  )
}
