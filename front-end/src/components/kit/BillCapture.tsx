import { useEffect, useRef, useState } from 'react'
import { Camera, ImagePlus, RefreshCw, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

type Stage = 'closed' | 'camera' | 'preview'
type Captured = { blob: Blob; url: string }

const ANALYSIS_TIMEOUT_MS = 100_000
const cameraSupported = () => typeof navigator.mediaDevices?.getUserMedia === 'function'

function Modal({
  open,
  label,
  onClose,
  busy = false,
  children,
}: {
  open: boolean
  label: string
  onClose: () => void
  busy?: boolean
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    else if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-label={label}
      onCancel={(event) => {
        if (busy) event.preventDefault()
      }}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      className="m-auto max-h-[calc(100dvh-1rem)] w-[min(92vw,26rem)] overflow-hidden bg-transparent p-0 text-foreground backdrop:bg-black/75 backdrop:backdrop-blur-sm"
    >
      {open && <div className="surface rounded-card p-3 shadow-2xl">{children}</div>}
    </dialog>
  )
}

function CameraView({
  onCapture,
  onCancel,
}: {
  onCapture: (blobs: Blob[]) => void
  onCancel: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const cameraAppRef = useRef<HTMLInputElement>(null)
  const [ready, setReady] = useState(false)
  const [mirrored, setMirrored] = useState(true)
  const [error, setError] = useState<string | null>(() =>
    cameraSupported() ? null : 'Camera access is not available on this device or connection.',
  )

  useEffect(() => {
    if (!cameraSupported()) return
    let cancelled = false
    let stream: MediaStream | null = null
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      .then((next) => {
        if (cancelled) {
          next.getTracks().forEach((track) => track.stop())
          return
        }
        stream = next
        const video = videoRef.current
        if (video) {
          video.srcObject = next
          void video.play().catch(() => {
            if (!cancelled) setError('Unable to start the camera preview. Try another option.')
          })
        }
      })
      .catch(() => {
        if (!cancelled) setError('We could not open the camera. Check the browser permission.')
      })
    return () => {
      cancelled = true
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  function snap() {
    const video = videoRef.current
    if (!video || !video.videoWidth || !video.videoHeight || !video.clientWidth || !video.clientHeight)
      return
    const scale = Math.max(
      video.clientWidth / video.videoWidth,
      video.clientHeight / video.videoHeight,
    )
    const width = video.clientWidth / scale
    const height = video.clientHeight / scale
    const x = (video.videoWidth - width) / 2
    const y = (video.videoHeight - height) / 2
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(width)
    canvas.height = Math.round(height)
    const context = canvas.getContext('2d')
    if (!context) {
      setError('Unable to capture the photo. Try uploading an image instead.')
      return
    }
    if (mirrored) {
      context.translate(canvas.width, 0)
      context.scale(-1, 1)
    }
    context.drawImage(video, x, y, width, height, 0, 0, canvas.width, canvas.height)
    canvas.toBlob(
      (blob) => {
        if (blob) onCapture([blob])
        else setError('Unable to capture the photo. Try uploading an image instead.')
      },
      'image/jpeg',
      0.92,
    )
  }

  const fileInput = (
    ref: React.RefObject<HTMLInputElement | null>,
    capture: boolean,
    id: string,
  ) => (
    <input
      ref={ref}
      type="file"
      accept="image/jpeg,image/png,image/webp"
      multiple={!capture}
      capture={capture ? 'environment' : undefined}
      aria-label={id}
      className="sr-only"
      tabIndex={-1}
      onChange={(event) => {
        const files = Array.from(event.target.files ?? [])
        event.target.value = ''
        if (files.length) onCapture(files)
      }}
    />
  )

  return (
    <div className="flex h-[min(40rem,calc(100dvh-3rem))] flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Scan a bill</h2>
        <button
          type="button"
          aria-label="Close camera"
          onClick={onCancel}
          className="flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-primary/10 hover:text-foreground"
        >
          <X aria-hidden="true" size={18} />
        </button>
      </div>
      {error ? (
        <div className="space-y-3 rounded-2xl bg-secondary/60 p-4 text-sm">
          <p className="text-muted-foreground">{error}</p>
          <Button className="w-full" onClick={() => cameraAppRef.current?.click()}>
            <Camera aria-hidden="true" /> Take a photo
          </Button>
        </div>
      ) : (
        <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl bg-black">
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            aria-label="Camera preview"
            onLoadedMetadata={() => setReady(true)}
            className={`size-full object-cover ${mirrored ? '-scale-x-100' : ''}`}
          />
          {!ready && (
            <p className="absolute inset-0 flex items-center justify-center text-sm text-white/70">
              Starting camera…
            </p>
          )}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-6 rounded-xl border-2 border-dashed border-white/40"
          />
        </div>
      )}
      {!error && (
        <div className="flex h-10 shrink-0 items-center justify-end text-xs">
          <button
            type="button"
            aria-pressed={mirrored}
            onClick={() => setMirrored((current) => !current)}
            className="shrink-0 rounded-lg px-2 py-1 text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Mirror preview {mirrored ? 'on' : 'off'}
          </button>
        </div>
      )}
      <div className="flex items-center justify-between gap-3">
        <Button variant="outline" size="sm" onClick={() => galleryRef.current?.click()}>
          <ImagePlus aria-hidden="true" /> Upload
        </Button>
        {!error && (
          <button
            type="button"
            aria-label="Capture photo"
            disabled={!ready}
            onClick={snap}
            className="gloss flex size-16 items-center justify-center rounded-full ring-4 ring-primary/30 transition active:scale-95 disabled:opacity-40"
          >
            <span className="size-12 rounded-full border-2 border-white/80" />
          </button>
        )}
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      {fileInput(galleryRef, false, 'Upload a bill photo')}
      {fileInput(cameraAppRef, true, 'Take a bill photo')}
    </div>
  )
}

export function BillCapture({ onAnalyse }: { onAnalyse: (images: Blob[], signal: AbortSignal) => Promise<void> }) {
  const [stage, setStage] = useState<Stage>('closed')
  const [images, setImages] = useState<Captured[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [remainingMs, setRemainingMs] = useState(ANALYSIS_TIMEOUT_MS)
  const controllerRef = useRef<AbortController | null>(null)
  const analysisButtonRef = useRef<HTMLDivElement>(null)
  const [outline, setOutline] = useState({ width: 0, height: 0, radius: 0 })

  useEffect(() => {
    return () => images.forEach((image) => URL.revokeObjectURL(image.url))
  }, [images])

  useEffect(() => () => {
    const controller = controllerRef.current
    controllerRef.current = null
    controller?.abort()
  }, [])

  useEffect(() => {
    if (!busy) return
    const wrapper = analysisButtonRef.current
    const button = wrapper?.querySelector('button')
    if (!wrapper || !button) return
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

  async function analyse() {
    const controller = new AbortController()
    controllerRef.current = controller
    const deadline = Date.now() + ANALYSIS_TIMEOUT_MS
    setRemainingMs(ANALYSIS_TIMEOUT_MS)
    setBusy(true)
    setError(null)
    const interval = window.setInterval(() => {
      setRemainingMs(Math.max(0, deadline - Date.now()))
    }, 250)
    let timeout = 0
    try {
      await Promise.race([
        onAnalyse(images.map((image) => image.blob), controller.signal),
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true })
          timeout = window.setTimeout(() => {
            controller.abort(new Error('Analysis timed out. The server may still be processing; please wait before retrying.'))
          }, ANALYSIS_TIMEOUT_MS)
        }),
      ])
      if (controllerRef.current === controller) {
        setStage('closed')
        setImages([])
      }
    } catch (reason) {
      if (controllerRef.current === controller) {
        setError(reason instanceof Error ? reason.message : 'Unable to analyse the bill.')
      }
    } finally {
      window.clearTimeout(timeout)
      window.clearInterval(interval)
      if (controllerRef.current === controller) {
        controllerRef.current = null
        setBusy(false)
      }
    }
  }

  function close() {
    if (busy) return
    setStage('closed')
    setImages([])
    setError(null)
  }

  function selectImages(blobs: Blob[]) {
    if (blobs.length > 3 || blobs.some((blob) => !['image/jpeg', 'image/png', 'image/webp'].includes(blob.type))) {
      setError('Choose up to 3 JPEG, PNG or WebP images.')
      return
    }
    if (blobs.reduce((sum, blob) => sum + blob.size, 0) > 3 * 1024 * 1024) {
      setError('Images must total at most 3 MB.')
      return
    }
    setError(null)
    setImages(blobs.map((blob) => ({ blob, url: URL.createObjectURL(blob) })))
    setStage('preview')
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setStage('camera')}
        aria-label="Scan a bill"
        title="Scan a bill"
        className="surface flex size-11 shrink-0 items-center justify-center rounded-xl text-primary transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-95 motion-reduce:transition-none"
      >
        <Camera aria-hidden="true" size={20} />
      </button>
      <Modal
        open={stage !== 'closed'}
        label={stage === 'preview' ? 'Review bill photo' : 'Scan a bill'}
        onClose={close}
        busy={busy}
      >
        {stage === 'camera' && (
          <CameraView
            onCancel={close}
            onCapture={selectImages}
          />
        )}
        {stage === 'camera' && error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {stage === 'preview' && images.length > 0 && (
          <div className="flex h-[min(40rem,calc(100dvh-3rem))] flex-col gap-2">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Review your bill</h2>
              <button
                type="button"
                aria-label="Close preview"
                onClick={close}
                disabled={busy}
                className="flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-primary/10 hover:text-foreground"
              >
                <X aria-hidden="true" size={18} />
              </button>
            </div>
            <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl bg-black">
              <div className="flex size-full gap-1 overflow-auto">
                {images.map((image, index) => (
                  <img
                    key={image.url}
                    src={image.url}
                    alt={index === 0 ? 'Captured bill' : `Bill photo ${index + 1}`}
                    className="min-w-0 flex-1 object-contain"
                  />
                ))}
              </div>
              {busy && <div aria-hidden="true" className="bill-scan-overlay" />}
            </div>
            <p className="flex h-10 shrink-0 items-center justify-center text-center text-xs text-muted-foreground">
              {busy
                ? `Analysing your bill · ${Math.ceil(remainingMs / 1000)}s`
                : 'Images are sent to the AI provider and stored in the audit log. Verify the results before saving.'}
            </p>
            {busy && <span role="status" className="sr-only">AI analysis in progress. The timer shows the time limit, not analysis progress.</span>}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <div className="flex min-h-16 items-center gap-3">
              <Button variant="outline" className="flex-1" disabled={busy} onClick={() => setStage('camera')}>
                <RefreshCw aria-hidden="true" /> Retake
              </Button>
              <div ref={analysisButtonRef} className="relative min-w-0 flex-1">
                <Button className="w-full" disabled={busy} onClick={() => void analyse()}>
                  <Sparkles aria-hidden="true" /> {busy ? 'Analysing…' : 'Analyse with AI'}
                </Button>
                {busy && outline.width > 0 && (
                  <svg aria-hidden="true" className="pointer-events-none absolute inset-0 size-full">
                    <rect
                      x="1.5" y="1.5" width={outline.width - 3} height={outline.height - 3}
                      rx={Math.max(0, outline.radius - 1.5)}
                      fill="none" stroke="#ffab70" strokeWidth="3" pathLength="100"
                      strokeDasharray="100" strokeDashoffset={100 * (1 - remainingMs / ANALYSIS_TIMEOUT_MS)}
                    />
                  </svg>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
