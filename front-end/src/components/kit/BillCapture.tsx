import { Camera } from 'lucide-react'
import { ImageCapture } from './ImageCapture'

export function BillCapture({ onAnalyse }: { onAnalyse: (images: Blob[], signal: AbortSignal) => Promise<void> }) {
  return (
    <ImageCapture
      title="Scan a bill"
      photoDescription="a bill photo"
      review={{
        dialogLabel: 'Review bill photo',
        title: 'Review your bill',
        firstImageLabel: 'Captured bill',
        imageLabel: (index) => `Bill photo ${index}`,
        notice: 'Images are sent to the AI provider and stored in the audit log. Verify the results before saving.',
        progressLabel: 'Analysing your bill',
        errorMessage: 'Unable to analyse the bill.',
        actionLabel: 'Analyse with AI',
        onAnalyse,
      }}
      trigger={(open) => (
        <button
          type="button"
          onClick={open}
          aria-label="Scan a bill"
          title="Scan a bill"
          className="surface flex size-11 shrink-0 items-center justify-center rounded-xl text-primary transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-95 motion-reduce:transition-none"
        >
          <Camera aria-hidden="true" size={20} />
        </button>
      )}
    />
  )
}
