import type { SVGProps } from 'react'

/** Fork, plate and spoon, drawn to match the lucide icon set (24px grid, round strokes). */
export function PlateIcon({
  size = 24,
  strokeWidth = 2,
  ...props
}: Omit<SVGProps<SVGSVGElement>, 'width' | 'height'> & { size?: number | string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {/* plate */}
      <circle cx="12" cy="12" r="5.5" />
      <circle cx="12" cy="12" r="2.5" />
      {/* fork */}
      <path d="M2 3v5M5 3v5M2 8a1.5 1.5 0 0 0 3 0M3.5 9.5V21" />
      {/* spoon */}
      <ellipse cx="20.5" cy="6.5" rx="2" ry="3.5" />
      <path d="M20.5 10V21" />
    </svg>
  )
}
