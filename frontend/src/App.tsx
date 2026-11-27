import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router'
import { ApiError, getMe, logout, onLoggedOut, refreshSession, waitForServer, type Me } from './api'
import { formatDate } from './dates'
import AppShell from './AppShell'
import { BrandLockup } from './components/icons'
import AuthForm from './AuthForm'
import AddExpense from './pages/AddExpense'
import Categories from './pages/Categories'
import Budgets from './pages/Budgets'
import Dashboard from './pages/Dashboard'
import Expenses from './pages/Expenses'
import More from './pages/More'
import Onboarding from './pages/Onboarding'
import Recurring from './pages/Recurring'
import Reports from './pages/Reports'
import ResetPassword from './pages/ResetPassword'
import Settings from './pages/Settings'
import { setMonitoredUser } from './monitoring'
import { forgetUser, pendingExpenses, rememberedUser, rememberUser, removePending } from './offline'
import { useOnline, usePendingSync } from './useOffline'

type Phase = 'waking' | 'offline' | 'serverError' | 'form' | 'ready'

export default function App() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [phase, setPhase] = useState<Phase>('waking')
  const [me, setMe] = useState<Me | null>(null)
  const [loggingOut, setLoggingOut] = useState(false)
  // Incrementing this restarts the startup sequence (used by the Retry button).
  const [attempt, setAttempt] = useState(0)
  // Opened without a connection from the user remembered on this phone: no session yet, so the
  // user is confirmed with the server as soon as the connection is back.
  const [startedOffline, setStartedOffline] = useState(false)
  const online = useOnline()
  // One-off messages: above the login form after asking for deletion, and on the first page
  // after a login that cancelled one.
  const [loginNotice, setLoginNotice] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  // Opens the app for the remembered user when there is no connection, so expenses can still be
  // added (they wait on the phone). Without one, the "You're offline" screen is all there is.
  function openOffline(): boolean {
    const remembered = rememberedUser()
    if (!remembered || remembered.payDay === null) return false
    setMe(remembered)
    setStartedOffline(true)
    setPhase('ready')
    return true
  }

  // Startup: wait for the server, then try to restore the session once.
  useEffect(() => {
    const controller = new AbortController()

    async function start() {
      // Offline: say so straight away instead of polling a server we cannot reach for 3 minutes.
      if (!navigator.onLine) {
        if (!openOffline()) setPhase('offline')
        return
      }
      const server = await waitForServer(controller.signal)
      if (controller.signal.aborted) return
      if (server !== 'up') {
        if (server === 'offline' && openOffline()) return
        setPhase(server === 'offline' ? 'offline' : 'serverError')
        return
      }

      const session = await refreshSession()
      if (controller.signal.aborted) return
      if (session === 'unreachable') {
        // The server answered the ping but not the refresh: offer Try again instead of the login form.
        setPhase('serverError')
        return
      }
      if (session === 'ok') {
        try {
          const user = await getMe()
          if (controller.signal.aborted) return
          rememberUser(user)
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

  // Back online after opening offline: confirm the user with the server (the first request renews
  // the session from the cookie). If the session has ended, onLoggedOut below shows the form.
  useEffect(() => {
    if (!startedOffline || !online) return
    let cancelled = false
    getMe()
      .then((user) => {
        if (cancelled) return
        rememberUser(user)
        setMe(user)
        setStartedOffline(false)
      })
      .catch((e: unknown) => {
        // Still no network: wait for the next online event.
        if (!(e instanceof ApiError) || e.status !== 0) setStartedOffline(false)
      })
    return () => {
      cancelled = true
    }
  }, [startedOffline, online])

  // Sends expenses saved offline whenever the app is open and has a connection.
  const pending = usePendingSync(phase === 'ready' && me ? me.id : null, online && !startedOffline)

  // Error reports carry the user's id (never the email), so repeated crashes can be grouped.
  useEffect(() => setMonitoredUser(me?.id ?? null), [me])

  // Return to the form if a session refresh ever fails.
  useEffect(
    () =>
      onLoggedOut(() => {
        setMe(null)
        setPhase('form')
      }),
    [],
  )

  // Coming back online from the offline screen starts over by itself.
  useEffect(() => {
    if (phase !== 'offline') return
    const onOnline = () => retry()
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [phase])

  function retry() {
    setPhase('waking')
    setAttempt((n) => n + 1)
  }

  async function loadUser() {
    const user = await getMe()
    rememberUser(user)
    setMe(user)
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

  // The server has already ended every session; this clears the phone too, including expenses
  // still waiting to be sent, since the account they belong to is going away.
  async function handleAccountDeleted(deleteAfter: string) {
    if (me) pendingExpenses(me.id).forEach((p) => removePending(p.clientId))
    forgetUser()
    setStartedOffline(false)
    await logout()
    setMe(null)
    setLoginNotice(
      `Your account and all its data will be deleted on ${formatDate(deleteAfter.slice(0, 10))}. ` +
        'Log in before then if you change your mind.',
    )
    setPhase('form')
    navigate('/', { replace: true })
  }

  async function handleLogout() {
    setLoggingOut(true)
    // Expenses still waiting stay on the phone for this user's next sign-in.
    forgetUser()
    setStartedOffline(false)
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
        <BrandLockup />
        <div className="card">
          <ResetPassword onDone={finishReset} />
        </div>
      </main>
    )
  }

  if (phase !== 'ready' || !me) {
    return (
      <main className="welcome">
        <BrandLockup />
        <p className="tagline">
          Split every pay cycle 50/30/20 into needs, wants and savings, and see where your salary goes.
        </p>

        {phase === 'waking' && (
          <div className="card stack" role="status">
            <p>
              <strong>Waking up the server…</strong>
            </p>
            <p className="muted">
              On the free hosting plan this can take up to 3 minutes. The page continues by itself.
            </p>
          </div>
        )}

        {phase === 'offline' && (
          <div className="card stack" role="status">
            <p>
              <strong>You&apos;re offline.</strong>
            </p>
            <p className="muted">
              Fifty30 needs a connection to load your budget. It continues by itself when you are back online.
            </p>
            <button onClick={retry}>Try again</button>
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
            <AuthForm
              notice={loginNotice}
              onAuthenticated={async (restored) => {
                await loadUser()
                setLoginNotice(null)
                if (restored) setFlash('Welcome back. Your account will not be deleted.')
              }}
            />
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
      <Route
        element={
          <AppShell
            email={me.email}
            onLogout={handleLogout}
            loggingOut={loggingOut}
            offline={!online || startedOffline}
            pending={pending}
            flash={flash}
            onDismissFlash={() => setFlash(null)}
          />
        }
      >
        <Route index element={<Dashboard me={me} />} />
        <Route path="add" element={<AddExpense userId={me.id} />} />
        <Route path="expenses" element={<Expenses />} />
        <Route path="budgets" element={<Budgets />} />
        <Route path="more" element={<More me={me} onLogout={handleLogout} loggingOut={loggingOut} />} />
        <Route path="categories" element={<Categories />} />
        <Route path="reports" element={<Reports openingBalancePaise={me.openingBalancePaise} />} />
        <Route path="recurring" element={<Recurring />} />
        <Route
          path="settings"
          element={<Settings me={me} onUserChanged={loadUser} onAccountDeleted={handleAccountDeleted} />}
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
