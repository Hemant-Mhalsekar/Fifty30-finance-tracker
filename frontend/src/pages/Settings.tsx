import { useEffect, useState, type FormEvent } from 'react'
import { changeCurrentSalary, changePayDay, getCurrentCycle, requestAccountDeletion, type Cycle, type Me } from '../api'
import PasswordInput from '../components/PasswordInput'
import { formatDate } from '../dates'
import { formatPaise, paiseToInput, parseRupeesToPaise, splitBudget } from '../money'
import { getThemePreference, setThemePreference, type ThemePreference } from '../theme'

const MIN_SALARY_PAISE = 100
const MAX_SALARY_PAISE = 1_000_000_000
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1)

type Props = {
  me: Me
  // Reloads the user after a pay day change so the pending change shows everywhere.
  onUserChanged: () => Promise<void>
}

export default function Settings({
  me,
  onUserChanged,
  onAccountDeleted,
}: Props & {
  // Called once the deletion is scheduled; the app then signs out on this device.
  onAccountDeleted: (deleteAfter: string) => Promise<void>
}) {
  return (
    <section className="settings">
      <h1>Settings</h1>
      <div className="settings-grid">
        <SalarySettings />
        <PayDaySettings me={me} onUserChanged={onUserChanged} />
        <AppearanceSettings />
        <article className="card">
          <h2>Account</h2>
          <p>{me.email}</p>
        </article>
        <DeleteAccount onDeleted={onAccountDeleted} />
      </div>
    </section>
  )
}

function SalarySettings() {
  const [cycle, setCycle] = useState<Cycle | null>(null)
  const [salaryText, setSalaryText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    getCurrentCycle()
      .then((current) => {
        if (cancelled) return
        setCycle(current)
        setSalaryText(paiseToInput(current.salaryPaise))
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Something went wrong')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const salaryPaise = parseRupeesToPaise(salaryText)
  const valid = salaryPaise !== null && salaryPaise >= MIN_SALARY_PAISE && salaryPaise <= MAX_SALARY_PAISE
  const unchanged = cycle !== null && salaryPaise === cycle.salaryPaise
  const split = valid ? splitBudget(salaryPaise) : null

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting || !cycle) return
    if (!valid) {
      setError('Enter a salary between ₹1 and ₹1,00,00,000, with at most 2 decimals')
      setSuccess(null)
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const updated = await changeCurrentSalary(salaryPaise)
      setCycle(updated)
      setSalaryText(paiseToInput(updated.salaryPaise))
      setSuccess(`Salary is now ${formatPaise(updated.salaryPaise)} for this cycle and the ones after it.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setSuccess(null)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <article className="card">
      <h2>Salary</h2>
      {!cycle && !error && <p className="muted">Loading…</p>}
      {cycle && (
        <form onSubmit={handleSubmit} noValidate>
          <p className="muted">
            Applies to the current cycle ({formatDate(cycle.periodStart)} – {formatDate(cycle.periodEnd)}) and later
            cycles. Past cycles keep their salary.
          </p>
          <label htmlFor="settings-salary">Monthly take-home salary (₹)</label>
          <input
            id="settings-salary"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={salaryText}
            onChange={(e) => {
              setSalaryText(e.target.value)
              setSuccess(null)
            }}
          />
          {split && !unchanged && (
            <p className="hint">
              Needs {formatPaise(split.needs)} · Wants {formatPaise(split.wants)} · Savings {formatPaise(split.savings)}
            </p>
          )}
          <div className="form-actions">
            <button type="submit" disabled={submitting || unchanged}>
              {submitting ? 'Saving…' : 'Update salary'}
            </button>
          </div>
        </form>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="success" role="status">
          {success}
        </p>
      )}
    </article>
  )
}

function PayDaySettings({ me, onUserChanged }: Props) {
  const currentPayDay = me.payDay ?? 1
  const [selected, setSelected] = useState(String(me.pendingPayDay ?? currentPayDay))
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function submit(payDay: number) {
    setSubmitting(true)
    setError(null)
    try {
      await changePayDay(payDay)
      await onUserChanged()
      setSelected(String(payDay))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  const selectedDay = Number(selected)
  const nothingToSave = selectedDay === (me.pendingPayDay ?? currentPayDay)

  return (
    <article className="card">
      <h2>Pay day</h2>
      <p>
        Your salary arrives on day <strong>{currentPayDay}</strong> of the month.
      </p>
      {me.pendingPayDay !== null && me.pendingPayDayFrom !== null && (
        <div className="notice">
          <p>
            Changing to day <strong>{me.pendingPayDay}</strong>. The first cycle on the new pay day starts on{' '}
            <strong>{formatDate(me.pendingPayDayFrom)}</strong>.
          </p>
          <button type="button" className="secondary" disabled={submitting} onClick={() => submit(currentPayDay)}>
            Cancel this change
          </button>
        </div>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (!submitting && !nothingToSave) submit(selectedDay)
        }}
        noValidate
      >
        <p className="muted">
          A change waits one full cycle: your current cycle and the next one keep the current pay day, so no cycle is
          cut short without warning.
        </p>
        <label htmlFor="settings-pay-day">New pay day</label>
        <select id="settings-pay-day" value={selected} onChange={(e) => setSelected(e.target.value)}>
          {DAYS.map((day) => (
            <option key={day} value={day}>
              {day}
            </option>
          ))}
        </select>
        {selectedDay >= 29 && <p className="hint">In shorter months, the last day of the month is used.</p>}
        <div className="form-actions">
          <button type="submit" disabled={submitting || nothingToSave}>
            {submitting ? 'Saving…' : 'Schedule change'}
          </button>
        </div>
      </form>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </article>
  )
}

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

// Saved on this device only, so a phone and a laptop can differ.
function AppearanceSettings() {
  const [theme, setTheme] = useState<ThemePreference>(getThemePreference)
  return (
    <article className="card">
      <fieldset className="field">
        <legend>
          <h2>Appearance</h2>
        </legend>
        <div className="segmented">
          {THEME_OPTIONS.map((option) => (
            <label key={option.value}>
              <input
                type="radio"
                name="theme"
                value={option.value}
                checked={theme === option.value}
                onChange={() => {
                  setTheme(option.value)
                  setThemePreference(option.value)
                }}
              />
              {option.label}
            </label>
          ))}
        </div>
        <p className="hint">System follows your device. Saved on this device only.</p>
      </fieldset>
    </article>
  )
}

// Two steps: a button that opens the form, then the password. The data stays for 7 days and
// logging in again before then keeps the account.
function DeleteAccount({ onDeleted }: { onDeleted: (deleteAfter: string) => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return
    if (password === '') {
      setError('Enter your password')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const { deleteAfter } = await requestAccountDeletion(password)
      await onDeleted(deleteAfter)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setSubmitting(false)
    }
  }

  return (
    <article className="card danger-card">
      <h2>Delete account</h2>
      <p className="muted">
        Deletes your account and everything in it: expenses, categories, cycles and recurring expenses. You are signed
        out on every device at once, and the data is deleted after 7 days. Logging in before then cancels it.
      </p>
      {open ? (
        <form onSubmit={handleSubmit} noValidate className="delete-account-form">
          <label htmlFor="delete-password">Your password</label>
          <PasswordInput id="delete-password" value={password} onChange={setPassword} autoComplete="current-password" />
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <button type="submit" className="danger" disabled={submitting}>
              {submitting ? 'Deleting…' : 'Delete my account'}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={submitting}
              onClick={() => {
                setOpen(false)
                setPassword('')
                setError(null)
              }}
            >
              Keep my account
            </button>
          </div>
        </form>
      ) : (
        <div className="form-actions">
          <button type="button" className="danger-outline" onClick={() => setOpen(true)}>
            Delete account…
          </button>
        </div>
      )}
    </article>
  )
}
