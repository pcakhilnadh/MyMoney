import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Camera, ImagePlus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PreviewImage, type ImageReview } from './PreviewImage'

type Stage = 'closed' | 'camera' | 'preview'
type Captured = { blob: Blob; url: string }

const ANALYSIS_TIMEOUT_MS = 3 * 60 * 1000
const MAX_SOURCE_MB = Number(import.meta.env.VITE_MAX_IMAGE_UPLOAD_MB) || 5
const MAX_SOURCE_BYTES = MAX_SOURCE_MB * 1024 * 1024
const MAX_COMPRESSED_BYTES = 3 * 1024 * 1024
const MAX_IMAGE_DIMENSION = 2000
const cameraSupported = () => typeof navigator.mediaDevices?.getUserMedia === 'function'

async function compressImage(blob: Blob, targetBytes: number): Promise<Blob> {
  const bitmap = await createImageBitmap(blob)
  try {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Unable to prepare the photo for upload.')

    let scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(bitmap.width, bitmap.height))
    while (true) {
      canvas.width = Math.max(1, Math.round(bitmap.width * scale))
      canvas.height = Math.max(1, Math.round(bitmap.height * scale))
      context.fillStyle = '#fff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      for (const quality of [0.85, 0.7, 0.55, 0.4]) {
        const compressed = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (result) => {
              if (result) resolve(result)
              else reject(new Error('Unable to compress the photo.'))
            },
            'image/jpeg',
            quality,
          )
        })
        if (compressed.size <= targetBytes) return compressed
      }
      if (canvas.width === 1 && canvas.height === 1) {
        throw new Error('Unable to compress the photo enough to upload.')
      }
      scale *= 0.8
    }
  } finally {
    bitmap.close()
  }
}

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
      className="m-auto max-h-[calc(100dvh-1rem)] w-[min(calc(100vw-1rem),26rem)] overflow-y-auto bg-transparent p-0 text-foreground backdrop:bg-black/75 backdrop:backdrop-blur-sm"
    >
      {open && <div className="surface rounded-card p-3 shadow-2xl sm:p-4">{children}</div>}
    </dialog>
  )
}

function CameraView({
  onCapture,
  onCancel,
  title,
  photoDescription,
  multiple,
  selectionError,
}: {
  onCapture: (blobs: Blob[]) => void
  onCancel: () => void
  title: string
  photoDescription: string
  multiple: boolean
  selectionError: string | null
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
      multiple={!capture && multiple}
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
    <div className="flex h-[min(40rem,calc(100dvh-3.5rem))] min-h-0 flex-col gap-2">
      <div className="flex shrink-0 items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary">
          <Camera aria-hidden="true" size={19} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">Take a photo or choose from your gallery</p>
        </div>
        <button
          type="button"
          aria-label="Close camera"
          onClick={onCancel}
          className="flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-primary/10 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <X aria-hidden="true" size={18} />
        </button>
      </div>
      {error ? (
        <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-primary/15 bg-secondary/60 p-4 text-sm">
          <p className="mb-3 text-muted-foreground">{error}</p>
          <Button className="w-full" onClick={() => cameraAppRef.current?.click()}>
            <Camera aria-hidden="true" /> Take a photo
          </Button>
        </div>
      ) : (
        <div className="relative min-h-12 flex-1 overflow-hidden rounded-2xl border border-primary/25 bg-black">
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
            className="pointer-events-none absolute inset-4 rounded-xl border border-dashed border-primary/70"
          />
          {ready && (
            <p className="pointer-events-none absolute inset-x-4 bottom-5 rounded-xl bg-black/65 px-3 py-2 text-center text-xs text-white/90">
              Keep your subject within the frame
            </p>
          )}
        </div>
      )}
      {!error && (
        <div className="flex shrink-0 items-center justify-center text-xs">
          <button
            type="button"
            aria-pressed={mirrored}
            onClick={() => setMirrored((current) => !current)}
            className="shrink-0 rounded-lg px-3 py-2 text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Mirror preview {mirrored ? 'on' : 'off'}
          </button>
        </div>
      )}
      {selectionError && <p role="alert" className="shrink-0 text-sm text-destructive">{selectionError}</p>}
      <div className="flex shrink-0 items-center justify-between gap-2">
        <Button variant="outline" size="sm" className="h-10 px-3" onClick={() => galleryRef.current?.click()}>
          <ImagePlus aria-hidden="true" /> Upload
        </Button>
        {!error && (
          <button
            type="button"
            aria-label="Capture photo"
            disabled={!ready}
            onClick={snap}
            className="gloss flex size-14 shrink-0 items-center justify-center rounded-full ring-4 ring-primary/30 transition active:scale-95 disabled:opacity-40"
          >
            <span className="size-10 rounded-full border-2 border-white/80" />
          </button>
        )}
        <Button variant="ghost" size="sm" className="h-10 px-3" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      {fileInput(galleryRef, false, `Upload ${photoDescription}`)}
      {fileInput(cameraAppRef, true, `Take ${photoDescription}`)}
    </div>
  )
}

export function ImageCapture({
  title,
  photoDescription,
  trigger,
  onCapture,
  review,
  maxImages = review ? 3 : 1,
}: {
  title: string
  photoDescription: string
  trigger: (open: () => void) => ReactNode
  onCapture?: (images: Blob[]) => void
  review?: ImageReview
  maxImages?: number
}) {
  const [stage, setStage] = useState<Stage>('closed')
  const [images, setImages] = useState<Captured[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [remainingMs, setRemainingMs] = useState(ANALYSIS_TIMEOUT_MS)
  const controllerRef = useRef<AbortController | null>(null)
  const captureId = useRef(0)

  useEffect(() => {
    return () => images.forEach((image) => URL.revokeObjectURL(image.url))
  }, [images])

  useEffect(() => () => {
    captureId.current += 1
    const controller = controllerRef.current
    controllerRef.current = null
    controller?.abort()
  }, [])

  async function analyse() {
    if (!review) return
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
        review.onAnalyse(images.map((image) => image.blob), controller.signal),
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
        setError(reason instanceof Error ? reason.message : review.errorMessage)
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
    captureId.current += 1
    setStage('closed')
    setImages([])
    setError(null)
  }

  async function selectImages(blobs: Blob[]) {
    const requestId = ++captureId.current
    if (blobs.length === 0 || blobs.length > maxImages || blobs.some((blob) => !['image/jpeg', 'image/png', 'image/webp'].includes(blob.type))) {
      setError(maxImages === 1 ? 'Choose a JPEG, PNG or WebP image.' : 'Choose up to 3 JPEG, PNG or WebP images.')
      return
    }
    if (blobs.reduce((sum, blob) => sum + blob.size, 0) > MAX_SOURCE_BYTES) {
      setError(`Images must total at most ${MAX_SOURCE_MB} MB.`)
      return
    }
    try {
      const targetBytes = Math.floor(MAX_COMPRESSED_BYTES / blobs.length)
      const compressed = await Promise.all(blobs.map((blob) => compressImage(blob, targetBytes)))
      if (requestId !== captureId.current) return
      if (compressed.reduce((sum, blob) => sum + blob.size, 0) > MAX_COMPRESSED_BYTES) {
        setError('Unable to reduce these images enough. Try choosing smaller photos.')
        return
      }
      setError(null)
      if (!review) {
        setStage('closed')
        onCapture?.(compressed)
        return
      }
      setImages(compressed.map((blob) => ({ blob, url: URL.createObjectURL(blob) })))
      setStage('preview')
    } catch (reason) {
      if (requestId !== captureId.current) return
      setError(reason instanceof Error ? reason.message : 'Unable to prepare the photos for upload.')
    }
  }

  return (
    <>
      {trigger(() => setStage('camera'))}
      <Modal
        open={stage !== 'closed'}
        label={stage === 'preview' && review ? review.dialogLabel : title}
        onClose={close}
        busy={busy}
      >
        {stage === 'camera' && (
          <CameraView
            onCancel={close}
            onCapture={selectImages}
            title={title}
            photoDescription={photoDescription}
            multiple={maxImages > 1}
            selectionError={error}
          />
        )}
        {stage === 'preview' && review && images.length > 0 && (
          <PreviewImage
            images={images}
            review={review}
            busy={busy}
            error={error}
            remainingMs={remainingMs}
            timeoutMs={ANALYSIS_TIMEOUT_MS}
            onClose={close}
            onRetake={() => setStage('camera')}
            onAnalyse={() => void analyse()}
          />
        )}
      </Modal>
    </>
  )
}
