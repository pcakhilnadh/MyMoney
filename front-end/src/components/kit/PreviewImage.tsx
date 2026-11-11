import { useEffect, useRef, useState } from 'react'
import { ImagePlus, RefreshCw, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

export type ImageReview = {
  dialogLabel: string
  title: string
  firstImageLabel: string
  imageLabel: (index: number) => string
  notice: string
  progressLabel: string
  errorMessage: string
  actionLabel: string
  onAnalyse: (images: Blob[], signal: AbortSignal) => Promise<void>
}

export function PreviewImage({
  images,
  review,
  busy,
  error,
  remainingMs,
  timeoutMs,
  onClose,
  onRetake,
  onAnalyse,
}: {
  images: { url: string }[]
  review: ImageReview
  busy: boolean
  error: string | null
  remainingMs: number
  timeoutMs: number
  onClose: () => void
  onRetake: () => void
  onAnalyse: () => void
}) {
  const analysisButtonRef = useRef<HTMLDivElement>(null)
  const [outline, setOutline] = useState({ width: 0, height: 0, radius: 0 })

  useEffect(() => {
    if (!busy) return
    const button = analysisButtonRef.current?.querySelector('button')
    if (!button) return
    const updateOutline = () => {
      const { width, height } = button.getBoundingClientRect()
      const radius = parseFloat(getComputedStyle(button).borderTopLeftRadius)
      setOutline({ width, height, radius: Math.min(radius, width / 2, height / 2) })
    }
    updateOutline()
    const observer = new ResizeObserver(updateOutline)
    observer.observe(button)
    return () => observer.disconnect()
  }, [busy])

  return (
    <div className="flex h-[min(40rem,calc(100dvh-3.5rem))] min-h-0 flex-col gap-2">
      <div className="flex shrink-0 items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary">
          <ImagePlus aria-hidden="true" size={19} />
        </span>
        <h2 className="min-w-0 flex-1 text-base font-semibold">{review.title}</h2>
        <button
          type="button"
          aria-label="Close preview"
          onClick={onClose}
          disabled={busy}
          className="flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-primary/10 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <X aria-hidden="true" size={18} />
        </button>
      </div>
      <div className="relative min-h-12 flex-1 overflow-hidden rounded-2xl bg-secondary/30">
        <div className="flex size-full items-center gap-1 overflow-auto">
          {images.map((image, index) => (
            <div key={image.url} className="flex h-full min-w-0 flex-1 items-center justify-center">
              <img
                src={image.url}
                alt={index === 0 ? review.firstImageLabel : review.imageLabel(index + 1)}
                className="block h-auto max-h-full w-auto max-w-full rounded-xl object-contain"
              />
            </div>
          ))}
        </div>
        {busy && <div aria-hidden="true" className="bill-scan-overlay" />}
      </div>
      <p className="shrink-0 px-1 text-center text-xs leading-4 text-muted-foreground">
        {busy ? `${review.progressLabel} · ${Math.ceil(remainingMs / 1000)}s` : review.notice}
      </p>
      {busy && <span role="status" className="sr-only">AI analysis in progress. The timer shows the time limit, not analysis progress.</span>}
      {error && <p role="alert" className="shrink-0 text-sm text-destructive">{error}</p>}
      <div className="grid shrink-0 grid-cols-1 gap-2 min-[380px]:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
        <Button variant="outline" className="min-w-0 px-2" disabled={busy} onClick={onRetake}>
          <RefreshCw aria-hidden="true" /> Retake
        </Button>
        <div ref={analysisButtonRef} className="relative min-w-0 flex-1">
          <Button className="w-full min-w-0 px-2" disabled={busy} onClick={onAnalyse}>
            <Sparkles aria-hidden="true" /> {busy ? 'Analysing…' : review.actionLabel}
          </Button>
          {busy && outline.width > 0 && (
            <svg aria-hidden="true" className="pointer-events-none absolute inset-0 size-full">
              <rect
                x="1.5" y="1.5" width={outline.width - 3} height={outline.height - 3}
                rx={Math.max(0, outline.radius - 1.5)}
                fill="none" stroke="#ffab70" strokeWidth="3" pathLength="100"
                strokeDasharray="100" strokeDashoffset={100 * (1 - remainingMs / timeoutMs)}
              />
            </svg>
          )}
        </div>
      </div>
    </div>
  )
}
