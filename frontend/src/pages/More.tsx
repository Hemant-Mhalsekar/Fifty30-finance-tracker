import { Link } from 'react-router'

type Props = {
  email: string
  onLogout: () => void
  loggingOut: boolean
}

// The phone's home for everything that is not in the tab bar.
export default function More({ email, onLogout, loggingOut }: Props) {
  return (
    <section className="narrow sections">
      <h1>More</h1>
      <div className="card">
        <ul className="menu-list">
          <li>
            <Link to="/categories">Categories</Link>
          </li>
          <li>
            <Link to="/settings">Settings</Link>
          </li>
        </ul>
      </div>
      <div className="card">
        <p className="muted">Signed in as</p>
        <p className="expense-description">{email}</p>
        <ul className="menu-list">
          <li>
            <button type="button" className="logout" onClick={onLogout} disabled={loggingOut}>
              Log out
            </button>
          </li>
        </ul>
      </div>
    </section>
  )
}
