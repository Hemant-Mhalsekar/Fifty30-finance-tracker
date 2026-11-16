// Small inline icons (no icon library). Decorative: the visible label next to each
// icon is the accessible name, so every icon is aria-hidden.
type IconProps = { className?: string }

const common = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
}

export function HomeIcon({ className }: IconProps) {
  return (
    <svg {...common} className={className}>
      <path d="M4 20V10l8-6 8 6v10" />
      <path d="M10 20v-6h4v6" />
    </svg>
  )
}

export function PlusIcon({ className }: IconProps) {
  return (
    <svg {...common} className={className}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

export function ListIcon({ className }: IconProps) {
  return (
    <svg {...common} className={className}>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="M4 6h.01M4 12h.01M4 18h.01" />
    </svg>
  )
}

export function MoreIcon({ className }: IconProps) {
  return (
    <svg {...common} className={className}>
      <path d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth={3} />
    </svg>
  )
}

export function ChevronLeftIcon({ className }: IconProps) {
  return (
    <svg {...common} className={className} width={20} height={20}>
      <path d="M15 18l-6-6 6-6" />
    </svg>
  )
}

export function ChevronRightIcon({ className }: IconProps) {
  return (
    <svg {...common} className={className} width={20} height={20}>
      <path d="M9 18l6-6-6-6" />
    </svg>
  )
}

export function AlertIcon({ className }: IconProps) {
  return (
    <svg {...common} className={className} width={18} height={18}>
      <path d="M12 9v4M12 17h.01" />
      <path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
    </svg>
  )
}

/** The Fifty30 mark: three bars in the 50/30/20 proportions. */
export function BrandMark({ className = 'brand-mark' }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="8" fill="var(--brand)" />
      <rect x="6" y="9" width="20" height="4" rx="2" fill="var(--brand-text)" />
      <rect x="6" y="15" width="12" height="4" rx="2" fill="var(--brand-text)" opacity=".85" />
      <rect x="6" y="21" width="8" height="4" rx="2" fill="var(--brand-text)" opacity=".7" />
    </svg>
  )
}
