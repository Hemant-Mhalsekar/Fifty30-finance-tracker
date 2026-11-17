import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { BrandMark, HomeIcon, ListIcon, MoreIcon, PlusIcon } from './components/icons'

type Props = {
  email: string
  onLogout: () => void
  loggingOut: boolean
}

// Desktop: top bar with every page. Phone: a bottom tab bar in thumb reach, with Add in the
// middle; Categories, Settings and Log out live under More.
export default function AppShell({ email, onLogout, loggingOut }: Props) {
  const { pathname } = useLocation()
  // Reports, Recurring, Categories and Settings are reached through More on a phone, so More stays highlighted there.
  const inMoreSection = ['/more', '/reports', '/recurring', '/categories', '/settings'].some((path) => pathname.startsWith(path))

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
