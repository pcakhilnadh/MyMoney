import type { MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { useBack } from './useBack'

type Props = {
  /** Visible label. Defaults to the name of the screen "back" goes to. */
  label?: string
  className?: string
} & (
  | {
      /** Where to go when there's nowhere to go back to in this tab. */
      fallback: string
      onClick?: never
    }
  | {
      /** A step back inside the screen (closing a form), instead of a change of screen. */
      onClick: () => void
      fallback?: never
    }
)

/** The app's one back button: a small raised NeoPOP-style key in the current app's colours. */
export function BackButton(props: Props) {
  const className = ['back-button', props.className].filter(Boolean).join(' ')
  if (props.onClick)
    return (
      <button
        type="button"
        onClick={props.onClick}
        aria-label={props.label ?? 'Back'}
        className={className}
      >
        <Face label={props.label ?? 'Back'} />
      </button>
    )
  return <BackLink fallback={props.fallback} label={props.label} className={className} />
}

function BackLink({
  fallback,
  label,
  className,
}: {
  fallback: string
  label?: string
  className: string
}) {
  const back = useBack(fallback)
  const name = label ?? back.label
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    // Let new-tab clicks through; a plain click goes back the way you came.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
    event.preventDefault()
    back.go()
  }
  return (
    <Link
      to={back.to}
      onClick={onClick}
      className={className}
      data-no-return=""
      aria-label={name === 'Back' ? 'Back' : `Back to ${name}`}
    >
      <Face label={name} />
    </Link>
  )
}

function Face({ label }: { label: string }) {
  return (
    <>
      <span className="back-button__key" aria-hidden="true">
        <ChevronLeft size={15} strokeWidth={2.75} />
      </span>
      <span aria-hidden="true" className="truncate">
        {label}
      </span>
    </>
  )
}
