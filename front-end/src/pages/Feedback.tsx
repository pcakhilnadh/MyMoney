import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Send } from 'lucide-react'
import { useAction, useApi } from '@/groups/hooks'

const MAX_LENGTH = 500

const KINDS = [
  { value: 'feedback', label: 'Feedback' },
  { value: 'testimony', label: 'Testimony' },
  { value: 'feature_request', label: 'Feature request' },
] as const

type Kind = (typeof KINDS)[number]['value']

interface FeedbackMessage {
  id: string
  first_name: string
  kind: Kind
  body: string
  created_at: string
  is_mine: boolean
}

const kindLabel = (kind: Kind) => KINDS.find((k) => k.value === kind)?.label ?? kind

export default function Feedback() {
  const feed = useApi<FeedbackMessage[]>(['feedback'], '/feedback?limit=10')
  const send = useAction<{ kind: Kind; body: string }, FeedbackMessage>('/feedback', [['feedback']])
  const [kind, setKind] = useState<Kind>('feedback')
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const messages = feed.data ?? []

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' })
  }, [messages.length])

  const trimmed = body.trim()

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!trimmed || trimmed.length > MAX_LENGTH || send.isPending) return
    setError(null)
    try {
      await send.mutateAsync({ kind, body: trimmed })
      setBody('')
    } catch (err) {
      console.error('Unable to send feedback', err)
      setError('Could not send your message. Please try again.')
    }
  }

  return (
    <div className="space-y-4 pb-60">
      <div className="flex items-center gap-3">
        <Link
          to="/personal"
          aria-label="Back to Personal"
          className="rounded-lg p-2 text-muted-foreground hover:bg-muted/50"
        >
          <ArrowLeft size={18} aria-hidden="true" />
        </Link>
        <div>
          <h1 className="text-lg font-semibold">Testimony &amp; feedback</h1>
          <p className="text-xs text-muted-foreground">
            Share feedback, a testimony or a feature idea. Showing the latest 10.
          </p>
        </div>
      </div>

      <ul className="space-y-3" aria-label="Conversation" aria-live="polite">
        {feed.isLoading && <li className="text-sm text-muted-foreground">Loading…</li>}
        {feed.isError && (
          <li className="text-sm text-destructive">Unable to load messages. Try again later.</li>
        )}
        {feed.isSuccess && messages.length === 0 && (
          <li className="text-sm text-muted-foreground">No messages yet. Be the first to write.</li>
        )}
        {messages.map((m) => (
          <li key={m.id} className={`flex ${m.is_mine ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 ${
                m.is_mine ? 'bg-primary/15' : 'bg-white/5'
              }`}
            >
              <p className="text-[11px] font-semibold text-muted-foreground">
                {m.is_mine ? 'You' : m.first_name}
                <span className="ml-1.5 rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-medium">
                  {kindLabel(m.kind)}
                </span>
              </p>
              <p className="mt-1 text-sm leading-relaxed break-words whitespace-pre-wrap">
                {m.body}
              </p>
            </div>
          </li>
        ))}
      </ul>
      <div ref={endRef} />

      <form onSubmit={(e) => void submit(e)} className="personal-fixed-action space-y-2">
        <div role="radiogroup" aria-label="Message type" className="flex flex-wrap gap-2">
          {KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              role="radio"
              aria-checked={kind === k.value}
              onClick={() => setKind(k.value)}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                kind === k.value ? 'bg-primary text-primary-foreground' : 'bg-white/10'
              }`}
            >
              {k.label}
            </button>
          ))}
        </div>
        <div className="flex items-end gap-2">
          <textarea
            aria-label="Your message"
            value={body}
            maxLength={MAX_LENGTH}
            rows={2}
            placeholder={`Write your ${kindLabel(kind).toLowerCase()}…`}
            onChange={(e) => setBody(e.target.value)}
            className="min-h-12 flex-1 resize-none rounded-xl bg-white/5 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
          <button
            type="submit"
            aria-label="Send"
            disabled={!trimmed || send.isPending}
            className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground disabled:opacity-50"
          >
            <Send size={18} aria-hidden="true" />
          </button>
        </div>
        <p className="text-right text-[11px] text-muted-foreground">
          {body.length}/{MAX_LENGTH}
        </p>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </form>
    </div>
  )
}
