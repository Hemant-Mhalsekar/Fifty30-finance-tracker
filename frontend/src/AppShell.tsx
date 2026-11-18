import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { BrandMark, HomeIcon, ListIcon, MoreIcon, PlusIcon } from './components/icons'
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

// Desktop: top bar with every page. Phone: a bottom tab bar in thumb reach, with Add in the
// middle; Categories, Settings and Log out live under More.
export default function AppShell({ email, onLogout, loggingOut, offline, pending, flash, onDismissFlash }: Props) {
  const { pathname } = useLocation()
  // Reports, Recurring, Categories and Settings are reached through More on a phone, so More stays highlighted there.
  const inMoreSection = ['/more', '/reports', '/recurring', '/categories', '/settings'].some((path) =>
    pathname.startsWith(path),
  )

  return (
    <div className="shell">
      <header className="topbar">
        <Link to="/" className="brand" aria-label="Fifty30 home">
          <BrandMark />
          <span className="brand-text">Fifty30</span>
        </Link>
        <nav className="topnav" aria-label="Main">
          <NavLink to="/" end>
            Dashboard
          </NavLink>
          <NavLink to="/add">Add expense</NavLink>
          <NavLink to="/expenses">Expenses</NavLink>
          <NavLink to="/reports">Reports</NavLink>
          <NavLink to="/recurring">Recurring</NavLink>
          <NavLink to="/categories">Categories</NavLink>
          <NavLink to="/settings">Settings</NavLink>
        </nav>
        <div className="account">
          <span className="muted" title={email}>
            {email}
          </span>
          <button type="button" className="secondary" onClick={onLogout} disabled={loggingOut}>
            Log out
          </button>
        </div>
      </header>

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
        <Outlet />
      </main>

      <nav className="tabbar" aria-label="Main">
        <NavLink to="/" end>
          <HomeIcon />
          Dashboard
        </NavLink>
        <NavLink to="/add" className="tab-add">
          <span className="tab-add-circle">
            <PlusIcon />
          </span>
          Add
        </NavLink>
        <NavLink to="/expenses">
          <ListIcon />
          Expenses
        </NavLink>
        <NavLink to="/more" className={inMoreSection ? 'active' : ''}>
          <MoreIcon />
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
      {parts.join(' ')}
      {refused > 0 && (
        <>
          {' '}
          <Link to="/add">Review</Link>
        </>
      )}
    </p>
  )
}
