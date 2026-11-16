import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router'
import { getMe, logout, onLoggedOut, refreshSession, waitForServer, type Me } from './api'
import AppShell from './AppShell'
import { BrandMark } from './components/icons'
import AuthForm from './AuthForm'
import AddExpense from './pages/AddExpense'
import Categories from './pages/Categories'
import Dashboard from './pages/Dashboard'
import Expenses from './pages/Expenses'
import More from './pages/More'
import Onboarding from './pages/Onboarding'
import ResetPassword from './pages/ResetPassword'
import Settings from './pages/Settings'

type Phase = 'waking' | 'serverError' | 'form' | 'ready'

export default function App() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [phase, setPhase] = useState<Phase>('waking')
  const [me, setMe] = useState<Me | null>(null)
  const [loggingOut, setLoggingOut] = useState(false)
  // Incrementing this restarts the startup sequence (used by the Retry button).
  const [attempt, setAttempt] = useState(0)

  // Startup: wait for the server, then try to restore the session once.
  useEffect(() => {
    const controller = new AbortController()

    async function start() {
      const serverUp = await waitForServer(controller.signal)
      if (controller.signal.aborted) return
      if (!serverUp) {
        setPhase('serverError')
        return
      }

      if (await refreshSession()) {
        try {
          const user = await getMe()
          if (controller.signal.aborted) return
          setMe(user)
          setPhase('ready')
          return
        } catch {
          // Fall through to the login form.
        }
      }
      if (!controller.signal.aborted) setPhase('form')
    }

    start()

    // Cleanup: stops the ping polling and its timers.
    return () => controller.abort()
  }, [attempt])

  // Return to the form if a session refresh ever fails.
  useEffect(
    () =>
      onLoggedOut(() => {
        setMe(null)
        setPhase('form')
      }),
    [],
  )

  function retry() {
    setPhase('waking')
    setAttempt((n) => n + 1)
  }

  async function loadUser() {
    setMe(await getMe())
    setPhase('ready')
  }

  async function finishReset() {
    if (me) {
      await logout()
      setMe(null)
    }
    setPhase('form')
    navigate('/', { replace: true })
  }

  async function handleLogout() {
    setLoggingOut(true)
    await logout()
    setLoggingOut(false)
    setMe(null)
    setPhase('form')
  }

  // The reset link works whether or not someone is logged in on this device. The reset logs out
  // every session on the server, so it always ends on the login form.
  if (pathname === '/reset-password' && (phase === 'form' || phase === 'ready')) {
    return (
      <main className="welcome">
        <div className="brand">
          <BrandMark />
          Fifty30
        </div>
        <div className="card">
          <ResetPassword onDone={finishReset} />
        </div>
      </main>
    )
  }

  if (phase !== 'ready' || !me) {
    return (
      <main className="welcome">
        <div className="brand">
          <BrandMark />
          Fifty30
        </div>
        <p className="tagline">Split every pay cycle 50/30/20 into needs, wants and savings, and see where your salary goes.</p>

        {phase === 'waking' && (
          <div className="card stack" role="status">
            <p>
              <strong>Waking up the server…</strong>
            </p>
            <p className="muted">On the free hosting plan this can take up to 3 minutes. The page continues by itself.</p>
          </div>
        )}

        {phase === 'serverError' && (
          <div className="card stack">
            <p className="error" role="alert">
              Could not reach the server. Check your connection and try again.
            </p>
            <button onClick={retry}>Try again</button>
          </div>
        )}

        {phase === 'form' && (
          <div className="card">
            <AuthForm onAuthenticated={loadUser} />
          </div>
        )}
      </main>
    )
  }

  // Until onboarding is done, every URL shows the onboarding screen.
  if (me.payDay === null) {
    return (
      <Routes>
        <Route path="/onboarding" element={<Onboarding onDone={loadUser} />} />
        <Route path="*" element={<Navigate to="/onboarding" replace />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route element={<AppShell email={me.email} onLogout={handleLogout} loggingOut={loggingOut} />}>
        <Route index element={<Dashboard />} />
        <Route path="add" element={<AddExpense />} />
        <Route path="expenses" element={<Expenses />} />
        <Route path="more" element={<More email={me.email} onLogout={handleLogout} loggingOut={loggingOut} />} />
        <Route path="categories" element={<Categories />} />
        <Route path="settings" element={<Settings me={me} onUserChanged={loadUser} />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
