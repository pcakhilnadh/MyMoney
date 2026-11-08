import { useEffect, useRef, useState } from 'react'
import { Camera, ImagePlus, RefreshCw, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

type Stage = 'closed' | 'camera' | 'preview'
type Captured = { blob: Blob; url: string }

const cameraSupported = () => typeof navigator.mediaDevices?.getUserMedia === 'function'

function Modal({
  open,
  label,
  onClose,
  children,
}: {
  open: boolean
  label: string
  onClose: () => void
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
  onCapture: (blob: Blob) => void
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
    context.drawImage(video, x, y, width, height, 0, 0, canvas.width, canvas.height)
    canvas.toBlob(
      (blob) => {
        if (blob) onCapture(blob)
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
      accept="image/*"
      capture={capture ? 'environment' : undefined}
      aria-label={id}
      className="sr-only"
      tabIndex={-1}
      onChange={(event) => {
        const file = event.target.files?.[0]
        event.target.value = ''
        if (file) onCapture(file)
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

/**
 * Bill/receipt capture: opens the camera, shows the photo in a popup for review, and offers an
 * "Analyse with AI" action.
 *
 * TODO(ai): upload the captured image to the backend and run it through an AI module that
 * extracts title, amount, date, merchant and category, then pre-fill the form with the result.
 */
export function BillCapture({ onAnalyse }: { onAnalyse?: (image: Blob) => void }) {
  const [stage, setStage] = useState<Stage>('closed')
  const [image, setImage] = useState<Captured | null>(null)

  useEffect(() => {
    if (!image) return
    return () => URL.revokeObjectURL(image.url)
  }, [image])

  function close() {
    setStage('closed')
    setImage(null)
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
      >
        {stage === 'camera' && (
          <CameraView
            onCancel={close}
            onCapture={(blob) => {
              setImage({ blob, url: URL.createObjectURL(blob) })
              setStage('preview')
            }}
          />
        )}
        {stage === 'preview' && image && (
          <div className="flex h-[min(40rem,calc(100dvh-3rem))] flex-col gap-2">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Review your bill</h2>
              <button
                type="button"
                aria-label="Close preview"
                onClick={close}
                className="flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-primary/10 hover:text-foreground"
              >
                <X aria-hidden="true" size={18} />
              </button>
            </div>
            <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl bg-black">
              <img
                src={image.url}
                alt="Captured bill"
                className="absolute inset-0 size-full object-contain"
              />
            </div>
            <p className="flex h-10 shrink-0 items-center justify-center text-center text-xs text-muted-foreground">
              Make sure the amount and date are readable. AI analysis is coming soon.
            </p>
            <div className="flex min-h-16 items-center gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setStage('camera')}>
                <RefreshCw aria-hidden="true" /> Retake
              </Button>
              <Button
                className="flex-1"
                onClick={() => {
                  onAnalyse?.(image.blob)
                  close()
                }}
              >
                <Sparkles aria-hidden="true" /> Analyse with AI
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
