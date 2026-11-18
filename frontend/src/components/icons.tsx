// Small inline icons (no icon library), 24px line icons drawn for Fifty30. Decorative: the
// visible label next to each icon is the accessible name, so every icon is aria-hidden.
import type { ReactNode } from 'react'
import type { BudgetType } from '../api'

type IconProps = { className?: string; size?: number }

function Icon({ className, size = 20, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {children}
    </svg>
  )
}

// ---- navigation ----

export const OverviewIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
    <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
    <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
    <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
  </Icon>
)

export const HomeIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" />
  </Icon>
)

export const ReceiptIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 3.5h12v17l-2.5-1.5-2 1.5-1.5-1.5-1.5 1.5-2-1.5L6 20.5z" />
    <path d="M9 8h6M9 11.5h6M9 15h3.5" />
  </Icon>
)

export const WalletIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" />
    <path d="M20.5 10h-4a2 2 0 0 0 0 4h4" />
    <path d="M16.5 12h.01" />
  </Icon>
)

export const RepeatIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
    <path d="M3.5 9.5h17M8 3v4M16 3v4" />
    <path d="M9.5 15.5a2.75 2.75 0 0 0 5 1.2M14.5 13.5a2.75 2.75 0 0 0-5-1.2" />
  </Icon>
)

export const ChartIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 20V12M10 20V5M15 20v-9M20 20v-5" />
  </Icon>
)

export const TagIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1 1 0 0 1 0 1.4l-7.3 7.3a1 1 0 0 1-1.4 0z" />
    <path d="M8 8h.01" />
  </Icon>
)

export const GearIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </Icon>
)

export const MoreIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="5.5" cy="12" r="1.2" fill="currentColor" />
    <circle cx="12" cy="12" r="1.2" fill="currentColor" />
    <circle cx="18.5" cy="12" r="1.2" fill="currentColor" />
  </Icon>
)

// ---- actions ----

export const PlusIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
)

export const SearchIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-4.2-4.2" />
  </Icon>
)

export const CalendarIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
    <path d="M3.5 9.5h17M8 3v4M16 3v4" />
  </Icon>
)

export const DownloadIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14" />
  </Icon>
)

export const PencilIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 20h4L19 9a2.1 2.1 0 0 0-4-4L4 16z" />
    <path d="m13.5 6.5 4 4" />
  </Icon>
)

export const TrashIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4.5 7h15M10 11v6M14 11v6M6.5 7l1 12a1.5 1.5 0 0 0 1.5 1.5h6a1.5 1.5 0 0 0 1.5-1.5l1-12M9.5 7V4.5h5V7" />
  </Icon>
)

export const ArrowLeftIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </Icon>
)

export const ChevronLeftIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m15 18-6-6 6-6" />
  </Icon>
)

export const ChevronRightIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m9 18 6-6-6-6" />
  </Icon>
)

export const CloudOffIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 3l18 18" />
    <path d="M8.5 6.2A6 6 0 0 1 17.6 10h.4a4 4 0 0 1 2.4 7.2M17 19H7a5 5 0 0 1-1.6-9.7" />
  </Icon>
)

export const LogoutIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M14 4.5h4a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5h-4M10 16.5 5.5 12 10 7.5M5.5 12H15" />
  </Icon>
)

export const AlertIcon = (p: IconProps) => (
  <Icon size={18} {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5v5M12 16h.01" />
  </Icon>
)

export const DownloadAppIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
    <path d="M12 7v7M9 11l3 3 3-3M10.5 18.5h3" />
  </Icon>
)

export const PiggyIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 11.5a6 5 0 0 1 6-5h2.5a6 5 0 0 1 5.4 3H20v4h-1.6a6 5 0 0 1-2.4 2.3V19h-2.5v-2h-4v2H7v-3a5 5 0 0 1-2-4.5z" />
    <path d="M9.5 6.7V5a1.5 1.5 0 0 1 2.7-.9M15.5 11h.01" />
  </Icon>
)

// ---- categories ----

const CartIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6.5 7.5h11l-1 11a1.5 1.5 0 0 1-1.5 1.5h-6A1.5 1.5 0 0 1 7.5 18.5z" />
    <path d="M9.5 10V6.5a2.5 2.5 0 0 1 5 0V10" />
  </Icon>
)

const CarIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 16.5V12l2-5h10l2 5v4.5M4 12h16" />
    <rect x="4" y="12" width="16" height="5" rx="1.5" />
    <path d="M6.5 17v2M17.5 17v2M7.5 14.5h.01M16.5 14.5h.01" />
  </Icon>
)

const BoltIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M13 3 5.5 13.5H12L11 21l7.5-10.5H12z" />
  </Icon>
)

const HeartIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z" />
    <path d="M9 12h1.5l1-2 1.5 4 1-2H15" />
  </Icon>
)

const BankIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 9 12 4l8.5 5zM5.5 9v8M9.5 9v8M14.5 9v8M18.5 9v8M3.5 20h17" />
  </Icon>
)

const UtensilsIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 3v7a2 2 0 0 0 4 0V3M8 10v11M16.5 21V3c-2 1-3 3.5-3 6.5V13h3" />
  </Icon>
)

export const BagIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 8h14l-1 12H6z" />
    <path d="M9 10.5V7a3 3 0 0 1 6 0v3.5" />
  </Icon>
)

const FilmIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
    <path d="m10 9.5 5 2.5-5 2.5z" />
  </Icon>
)

const TrendIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m3.5 17 6-6 4 4 7-7.5M15 7.5h5.5V13" />
  </Icon>
)

const BookIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4.5 5.5A1.5 1.5 0 0 1 6 4h13.5v14H6a1.5 1.5 0 0 0-1.5 1.5zM4.5 19.5A1.5 1.5 0 0 0 6 21h13.5" />
  </Icon>
)

const CoffeeIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4.5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM15.5 10.5H17a2.5 2.5 0 0 1 0 5h-1.6M8 3.5v2.5M11.5 3.5v2.5" />
  </Icon>
)

// Matched by words in the category name, so renamed or custom categories still get a sensible icon.
const ICON_RULES: [RegExp, (p: IconProps) => ReactNode][] = [
  [/rent|house|home|housing/, HomeIcon],
  [/grocer|market|food/, CartIcon],
  [/transport|travel|fuel|petrol|metro|\bbus\b|\bcab\b|uber|\bauto\b|\bcar\b/, CarIcon],
  [/utilit|bill|electric|internet|phone|broadband|wifi/, BoltIcon],
  [/health|medic|doctor|pharma|gym|fitness/, HeartIcon],
  [/emi|loan|debt|credit/, BankIcon],
  [/coffee|cafe/, CoffeeIcon],
  [/dining|restaurant|eat|lunch|dinner|zomato|swiggy/, UtensilsIcon],
  [/shop|cloth|fashion/, BagIcon],
  [/entertain|movie|film|game/, FilmIcon],
  [/subscri|netflix|prime|music|stream/, RepeatIcon],
  [/invest|sip|mutual|stock|saving|fund/, TrendIcon],
  [/course|learn|book|educat|study/, BookIcon],
]

const TYPE_FALLBACK: Record<BudgetType, (p: IconProps) => ReactNode> = {
  NEED: TagIcon,
  WANT: BagIcon,
  INVESTMENT: TrendIcon,
}

/** Picks an icon from the category's name, falling back to one for its type. */
export function CategoryIcon({ name, type, ...p }: IconProps & { name: string; type: BudgetType | null }) {
  const key = name.toLowerCase()
  const Match = ICON_RULES.find(([pattern]) => pattern.test(key))?.[1] ?? (type ? TYPE_FALLBACK[type] : MoreIcon)
  return <Match {...p} />
}

/** The Fifty30 mark: three bars in the 50/30/20 proportions on a round badge. */
export function BrandMark({ className = 'brand-mark' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" focusable="false">
      <circle cx="16" cy="16" r="16" fill="var(--brand)" />
      <rect x="8" y="10" width="16" height="3" rx="1.5" fill="var(--brand-text)" />
      <rect x="8" y="14.5" width="9.6" height="3" rx="1.5" fill="var(--brand-text)" opacity=".85" />
      <rect x="8" y="19" width="6.4" height="3" rx="1.5" fill="var(--brand-text)" opacity=".7" />
    </svg>
  )
}

/** Logo and name, for screens without the app shell (login, onboarding, errors). */
export function BrandLockup() {
  return (
    <span className="brand">
      <BrandMark />
      <span className="brand-name">
        <strong>Fifty30</strong>
        <small>50 / 30 / 20</small>
      </span>
    </span>
  )
}
