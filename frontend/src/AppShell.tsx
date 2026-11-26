import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { getCurrentCycle, type Cycle } from './api'
import { clearApiCache } from './apiCache'
import { usePullToRefresh } from './usePullToRefresh'
import { daysLeftLabel } from './display'
import { formatRange } from './dates'
import {
  BrandMark,
  ChartIcon,
  CloudOffIcon,
  GearIcon,
  HomeIcon,
  LogoutIcon,
  MoreIcon,
  OverviewIcon,
  PlusIcon,
  ReceiptIcon,
  RepeatIcon,
  TagIcon,
  WalletIcon,
} from './components/icons'
import type { PendingExpense } from './offline'

type Props = {
  email: string
  onLogout: () => void
  loggingOut: boolean
  // No connection (or opened offline and not yet confirmed with the server).
  offline: boolean
  // Expenses saved on this phone and not sent yet.
  pending: PendingExpense[]
  // A one-off message for the top of the page, with an OK button.
  flash?: string | null
  onDismissFlash?: () => void
}

const SIDE_LINKS: { to: string; label: string; icon: ReactNode; end?: boolean }[] = [
  { to: '/', label: 'Overview', icon: <OverviewIcon />, end: true },
  { to: '/expenses', label: 'Expenses', icon: <ReceiptIcon /> },
  { to: '/budgets', label: 'Budgets', icon: <WalletIcon /> },
  { to: '/recurring', label: 'Recurring', icon: <RepeatIcon /> },
  { to: '/reports', label: 'Reports', icon: <ChartIcon /> },
  { to: '/categories', label: 'Categories', icon: <TagIcon /> },
  { to: '/settings', label: 'Settings', icon: <GearIcon /> },
]

// Wide screens: a sidebar with every page, the current cycle and Add Expense. Phones and tablets:
// a floating tab bar in thumb reach with Add in the middle; the other pages live under More.
export default function AppShell({ email, onLogout, loggingOut, offline, pending, flash, onDismissFlash }: Props) {
  const { pathname } = useLocation()
  const inMoreSection = ['/more', '/budgets', '/recurring', '/categories', '/settings'].some((path) =>
    pathname.startsWith(path),
  )
  // Pull to refresh: forget the cached answers and mount the page again, so it loads fresh.
  const [refreshCount, setRefreshCount] = useState(0)
  const pull = usePullToRefresh(() => {
    clearApiCache()
    setRefreshCount((n) => n + 1)
  })
  // The sidebar's cycle card. Refreshed on each page change, so a new cycle shows up without a reload.
  const [cycle, setCycle] = useState<Cycle | null>(null)
  useEffect(() => {
    let cancelled = false
    getCurrentCycle()
      .then((c) => {
        if (!cancelled) setCycle(c)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [pathname, refreshCount])

  return (
    <div className="shell">
      <div
        className={`pull-indicator${pull.ready ? ' ready' : ''}`}
        style={{ transform: `translate(-50%, ${pull.distance - 48}px)`, opacity: pull.distance > 0 ? 1 : 0 }}
        aria-hidden="true"
      >
        {pull.ready ? 'Release to refresh' : 'Pull to refresh'}
      </div>
      <aside className="sidebar">
        <Link to="/" className="brand" aria-label="Fifty30 home">
          <BrandMark />
          <span className="brand-name">
            <strong>Fifty30</strong>
            <small>50 / 30 / 20</small>
          </span>
        </Link>
        <nav className="sidenav" aria-label="Main">
          {SIDE_LINKS.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end}>
              {l.icon}
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          {cycle && (
            <div className="cycle-card">
              <p className="label">Current pay cycle</p>
              <strong className="num">{formatRange(cycle.periodStart, cycle.periodEnd)}</strong>
              <p className="left">{daysLeftLabel(cycle.periodEnd)}</p>
            </div>
          )}
          <Link to="/add" className="button add-button">
            <PlusIcon size={18} />
            Add Expense
          </Link>
          <div className="account-row">
            <span className="email" title={email}>
              {email}
            </span>
            <button
              type="button"
              className="icon-plain"
              onClick={onLogout}
              disabled={loggingOut}
              aria-label="Log out"
              title="Log out"
            >
              <LogoutIcon size={18} />
            </button>
          </div>
        </div>
      </aside>

      <div className="main">
        <main className="page">
          {flash && (
            <div className="flash" role="status">
              <span>{flash}</span>
              <button type="button" className="secondary" onClick={onDismissFlash}>
                OK
              </button>
            </div>
          )}
          <OfflineBanner offline={offline} pending={pending} />
          {/* The key remounts the page after a pull, which loads it again from the server. */}
          <Outlet key={refreshCount} />
        </main>
      </div>

      <nav className="tabbar" aria-label="Main">
        <NavLink to="/" end>
          <HomeIcon size={22} />
          Home
        </NavLink>
        <NavLink to="/expenses">
          <ReceiptIcon size={22} />
          Expenses
        </NavLink>
        <NavLink to="/add" className="tab-add" aria-label="Add expense">
          <span className="tab-add-circle">
            <PlusIcon size={24} />
          </span>
        </NavLink>
        <NavLink to="/reports">
          <ChartIcon size={22} />
          Reports
        </NavLink>
        <NavLink to="/more" className={inMoreSection ? 'active' : ''}>
          <MoreIcon size={22} />
          More
        </NavLink>
      </nav>
    </div>
  )
}

// One line at the top of every page while offline or while expenses are waiting to be sent.
function OfflineBanner({ offline, pending }: { offline: boolean; pending: PendingExpense[] }) {
  const refused = pending.filter((p) => p.error).length
  const waiting = pending.length - refused
  if (!offline && pending.length === 0) return null

  const parts: string[] = []
  if (offline) parts.push("You're offline. You can still add expenses; they are saved on this phone.")
  if (waiting > 0) {
    parts.push(
      offline
        ? `${waiting} waiting to be sent.`
        : `Sending ${waiting} ${waiting === 1 ? 'expense' : 'expenses'} saved offline…`,
    )
  }
  if (refused > 0) parts.push(`${refused} could not be sent.`)

  return (
    <p className={offline ? 'offline-banner' : 'offline-banner sending'} role="status">
      <CloudOffIcon size={18} />
      <span>
        {parts.join(' ')}
        {refused > 0 && (
          <>
            {' '}
            <Link to="/add">Review</Link>
          </>
        )}
      </span>
    </p>
  )
}
