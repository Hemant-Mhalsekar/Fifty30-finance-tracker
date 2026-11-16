import { useState, type FormEvent } from 'react'
import { resetPassword } from '../api'
import PasswordInput from '../components/PasswordInput'

type Props = {
  // Back to the login form (after success, or to request a new link).
  onDone: () => void
}

// Read once, then removed from the address bar so the token does not linger in browser history.
function takeTokenFromUrl(): string {
  const token = new URLSearchParams(window.location.search).get('token') ?? ''
  if (token) window.history.replaceState(null, '', '/reset-password')
  return token
}

export default function ResetPassword({ onDone }: Props) {
  const [token] = useState(takeTokenFromUrl)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return
    if (password.length < 8) {
      setError('Use at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('The two passwords do not match.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await resetPassword(token, password)
      setDone(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  if (!token) {
    return (
      <div className="stack">
        <h1>Reset link missing</h1>
        <p>This page needs the link from your reset email. Open the email and tap the link again, or ask for a new one.</p>
        <button type="button" className="block" onClick={onDone}>
          Back to log in
        </button>
      </div>
    )
  }

  if (done) {
    return (
      <div className="stack">
        <h1>Password changed</h1>
        <p role="status">Your password is updated and every device has been logged out. Log in with the new password.</p>
        <button type="button" className="block" onClick={onDone}>
          Log in
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <h1>Choose a new password</h1>

      <label htmlFor="new-password">New password</label>
      <PasswordInput
        id="new-password"
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        minLength={8}
        describedBy="new-password-hint"
      />
      <p id="new-password-hint" className="hint">
        At least 8 characters.
      </p>

      <label htmlFor="confirm-password">Repeat new password</label>
      <PasswordInput id="confirm-password" value={confirm} onChange={setConfirm} autoComplete="new-password" />

      {error && (
        <p className="error" role="alert">
          {error}
          {error.includes('expired') && (
            <>
              {' '}
              <button type="button" className="link" onClick={onDone}>
                Request a new link
              </button>
            </>
          )}
        </p>
      )}

      <button type="submit" className="block" disabled={submitting}>
        {submitting ? 'Saving…' : 'Save new password'}
      </button>
    </form>
  )
}
