import { useState, type FormEvent } from 'react'
import { login, register, requestPasswordReset } from './api'
import PasswordInput from './components/PasswordInput'

type Mode = 'login' | 'register' | 'forgot'

type Props = {
  // Called after a successful login/register. May throw; the message is shown under the form.
  onAuthenticated: () => Promise<void>
}

export default function AuthForm({ onAuthenticated }: Props) {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const isRegister = mode === 'register'

  // The email stays filled in when switching, so "Forgot password?" does not make you retype it.
  function switchTo(next: Mode) {
    setMode(next)
    setError(null)
    setSentTo(null)
    setPassword('')
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return

    setSubmitting(true)
    setError(null)
    try {
      if (mode === 'forgot') {
        await requestPasswordReset(email)
        setSentTo(email.trim())
        setSubmitting(false)
        return
      }
      await (isRegister ? register : login)(email, password)
      // On success the parent switches views and this form unmounts.
      await onAuthenticated()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setSubmitting(false)
    }
  }

  if (mode === 'forgot') {
    return (
      <form onSubmit={handleSubmit}>
        <h1>Reset your password</h1>
        {sentTo ? (
          <>
            <p role="status">
              If an account exists for <strong>{sentTo}</strong>, we have emailed a link to reset the password. It
              works once and expires in 30 minutes.
            </p>
            <p className="muted">No email after a few minutes? Check your spam folder, or try again.</p>
          </>
        ) : (
          <>
            <p className="muted">Enter the email you signed up with and we will send you a link.</p>
            <label htmlFor="auth-email">Email</label>
            <input
              id="auth-email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button type="submit" className="block" disabled={submitting}>
              {submitting ? 'Sending…' : 'Send reset link'}
            </button>
          </>
        )}
        <button type="button" className="link" onClick={() => switchTo('login')}>
          Back to log in
        </button>
      </form>
    )
  }

  return (
    <form onSubmit={handleSubmit}>
      <h1>{isRegister ? 'Create your account' : 'Log in'}</h1>

      <label htmlFor="auth-email">Email</label>
      <input
        id="auth-email"
        type="email"
        autoComplete={isRegister ? 'email' : 'username'}
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      <div className="label-row">
        <label htmlFor="auth-password">Password</label>
        {!isRegister && (
          <button type="button" className="link" onClick={() => switchTo('forgot')}>
            Forgot password?
          </button>
        )}
      </div>
      <PasswordInput
        id="auth-password"
        value={password}
        onChange={setPassword}
        autoComplete={isRegister ? 'new-password' : 'current-password'}
        minLength={isRegister ? 8 : undefined}
        describedBy={isRegister ? 'auth-password-hint' : undefined}
      />

      {isRegister && (
        <p id="auth-password-hint" className="hint">
          At least 8 characters.
        </p>
      )}

      <button type="submit" className="block" disabled={submitting}>
        {submitting ? 'Please wait…' : isRegister ? 'Create account' : 'Log in'}
      </button>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <button type="button" className="link" onClick={() => switchTo(isRegister ? 'login' : 'register')} disabled={submitting}>
        {isRegister ? 'Already have an account? Log in' : 'Need an account? Create one'}
      </button>
    </form>
  )
}
