import { Link } from 'react-router'
import type { Me } from '../api'
import InstallCard from '../components/InstallCard'
import { GearIcon, LogoutIcon, RepeatIcon, TagIcon, WalletIcon } from '../components/icons'
import { initial } from '../display'

type Props = {
  me: Me
  onLogout: () => void
  loggingOut: boolean
}

// The phone's home for everything that is not in the tab bar.
export default function More({ me, onLogout, loggingOut }: Props) {
  return (
    <section className="narrow sections">
      <div className="page-head">
        <h1>More</h1>
      </div>
      <div className="card profile-card">
        <span className="avatar" aria-hidden="true">
          {initial(me.name, me.email)}
        </span>
        <div className="who">
          <p className="expense-description">{me.name ?? 'Signed in as'}</p>
          <p className="muted">{me.email}</p>
        </div>
      </div>
      <InstallCard />
      <div className="card">
        <ul className="menu-list">
          <li>
            <Link to="/budgets">
              <span className="badge-icon">
                <WalletIcon />
              </span>
              Budgets
            </Link>
          </li>
          <li>
            <Link to="/recurring">
              <span className="badge-icon">
                <RepeatIcon />
              </span>
              Recurring expenses
            </Link>
          </li>
          <li>
            <Link to="/categories">
              <span className="badge-icon">
                <TagIcon />
              </span>
              Categories
            </Link>
          </li>
          <li>
            <Link to="/settings">
              <span className="badge-icon">
                <GearIcon />
              </span>
              Settings
            </Link>
          </li>
        </ul>
      </div>
      <div className="card">
        <ul className="menu-list">
          <li>
            <button type="button" className="logout" onClick={onLogout} disabled={loggingOut}>
              <span className="badge-icon">
                <LogoutIcon />
              </span>
              Log out
            </button>
          </li>
        </ul>
      </div>
    </section>
  )
}
