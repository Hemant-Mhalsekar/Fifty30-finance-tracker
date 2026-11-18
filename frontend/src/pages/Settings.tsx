import { useEffect, useState, type FormEvent } from 'react'
import {
  changeBonus,
  changeCurrentSalary,
  changeName,
  changeOpeningBalance,
  changeSplit,
  changePayDay,
  getCurrentCycle,
  requestAccountDeletion,
  type Cycle,
  type Me,
} from '../api'
import PasswordInput from '../components/PasswordInput'
import { formatDate } from '../dates'
import SplitPicker from '../components/SplitPicker'
import SplitPreview from '../components/SplitPreview'
import { formatPaise, paiseToInput, parseRupeesToPaise } from '../money'
import { incomeOf, presetOf, SPLITS, splitLabel, type SplitPreset } from '../splits'
import { getThemePreference, setThemePreference, type ThemePreference } from '../theme'

const MIN_SALARY_PAISE = 100
const MAX_SALARY_PAISE = 1_000_000_000
// ₹10,00,00,00,000 (100 crore), the server's limit.
const MAX_OPENING_PAISE = 100_000_000_000
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
  // The current cycle, shared by the salary, split and bonus cards so each sees the others' changes.
  const [cycle, setCycle] = useState<Cycle | null>(null)
  const [cycleError, setCycleError] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    getCurrentCycle()
      .then((current) => {
        if (!cancelled) setCycle(current)
      })
      .catch((e: unknown) => {
        if (!cancelled) setCycleError(e instanceof Error ? e.message : 'Something went wrong')
      })
    return () => {
      cancelled = true
    }
  }, [])

  // "Add a bonus" on the dashboard links to #bonus-title; the card only exists once the cycle loads.
  useEffect(() => {
    if (cycle && window.location.hash) {
      document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ block: 'start' })
    }
  }, [cycle])

  return (
    <section className="settings">
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p className="sub">Your salary, split, bonus, savings, pay day, name and how the app looks</p>
        </div>
      </div>
      <div className="settings-grid">
        <NameSettings me={me} onUserChanged={onUserChanged} />
        {cycleError && (
          <p className="error" role="alert">
            {cycleError}
          </p>
        )}
        {cycle && (
          <>
            <SalarySettings cycle={cycle} onCycle={setCycle} />
            <SplitSettings cycle={cycle} onCycle={setCycle} />
            <BonusSettings cycle={cycle} onCycle={setCycle} />
          </>
        )}
        <OpeningBalanceSettings me={me} onUserChanged={onUserChanged} />
        <PayDaySettings me={me} onUserChanged={onUserChanged} />
        <AppearanceSettings />
        <DeleteAccount onDeleted={onAccountDeleted} />
      </div>
    </section>
  )
}

// The name in the dashboard greeting, and the account's email. Blank removes the name.
function NameSettings({ me, onUserChanged }: Props) {
  const [name, setName] = useState(me.name ?? '')
  const [showName, setShowName] = useState(me.showName)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const unchanged = name.trim() === (me.name ?? '') && showName === me.showName

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving || unchanged) return
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      await changeName(name, showName)
      await onUserChanged()
      setSaved(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  return (
    <article className="card" aria-labelledby="profile-title">
      <h2 id="profile-title">Profile</h2>
      <p className="muted">Signed in as {me.email}</p>
      <form onSubmit={save} noValidate>
        <label htmlFor="profile-name">Your name</label>
        <input
          id="profile-name"
          type="text"
          maxLength={50}
          autoComplete="given-name"
          placeholder="Shown in the greeting"
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setSaved(false)
          }}
        />
        <label className="switch-row">
          <input
            type="checkbox"
            role="switch"
            checked={showName}
            onChange={(e) => {
              setShowName(e.target.checked)
              setSaved(false)
            }}
          />
          <span className="track" aria-hidden="true" />
          <span className="text">
            Show my name in the greeting
            <small className="hint">Off greets you with just “Good evening”. Your name stays saved.</small>
          </span>
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {saved && (
          <p className="success" role="status">
            Saved.
          </p>
        )}
        <div className="form-actions">
          <button type="submit" disabled={saving || unchanged}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </article>
  )
}

type CycleProps = { cycle: Cycle; onCycle: (cycle: Cycle) => void }

function SalarySettings({ cycle, onCycle }: CycleProps) {
  const [salaryText, setSalaryText] = useState(paiseToInput(cycle.salaryPaise))
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const salaryPaise = parseRupeesToPaise(salaryText)
  const valid = salaryPaise !== null && salaryPaise >= MIN_SALARY_PAISE && salaryPaise <= MAX_SALARY_PAISE
  const unchanged = salaryPaise === cycle.salaryPaise

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return
    if (!valid) {
      setError('Enter a salary between ₹1 and ₹1,00,00,000, with at most 2 decimals')
      setSuccess(null)
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const updated = await changeCurrentSalary(salaryPaise)
      onCycle(updated)
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
        {valid && !unchanged && (
          <SplitPreview
            amountPaise={salaryPaise + cycle.bonusPaise}
            pct={{ needs: cycle.needsPct, wants: cycle.wantsPct, savings: cycle.savingsPct }}
          />
        )}
        <div className="form-actions">
          <button type="submit" disabled={submitting || unchanged}>
            {submitting ? 'Saving…' : 'Update salary'}
          </button>
        </div>
      </form>
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

// One of the four presets, from the current cycle onward (like a salary change).
function SplitSettings({ cycle, onCycle }: CycleProps) {
  const current = presetOf(cycle)
  const [preset, setPreset] = useState<SplitPreset>(current?.id ?? 'BALANCED')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const chosen = SPLITS.find((s) => s.id === preset)!
  const unchanged = current?.id === preset

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting || unchanged) return
    setSubmitting(true)
    setError(null)
    try {
      const updated = await changeSplit(preset)
      onCycle(updated)
      setSuccess(`${chosen.name} (${splitLabel(chosen)}) now applies to this cycle and the ones after it.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setSuccess(null)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <article className="card" aria-labelledby="split-title">
      <h2 id="split-title">Budget split</h2>
      <form onSubmit={handleSubmit} noValidate>
        <p className="muted">Applies to the current cycle and later ones. Past cycles keep their split.</p>
        <SplitPicker
          value={preset}
          legend="Split"
          onChange={(next) => {
            setPreset(next)
            setSuccess(null)
          }}
        />
        {!unchanged && <SplitPreview amountPaise={incomeOf(cycle)} pct={chosen} />}
        <div className="form-actions">
          <button type="submit" disabled={submitting || unchanged}>
            {submitting ? 'Saving…' : 'Use this split'}
          </button>
        </div>
      </form>
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

// Extra money for the current cycle only, split like the salary.
function BonusSettings({ cycle, onCycle }: CycleProps) {
  const [bonusText, setBonusText] = useState(cycle.bonusPaise > 0 ? paiseToInput(cycle.bonusPaise) : '')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const bonusPaise = bonusText.trim() === '' ? 0 : parseRupeesToPaise(bonusText)
  const valid = bonusPaise !== null && bonusPaise >= 0 && bonusPaise <= MAX_SALARY_PAISE
  const unchanged = bonusPaise === cycle.bonusPaise

  async function save(amount: number) {
    setSubmitting(true)
    setError(null)
    try {
      const updated = await changeBonus(amount)
      onCycle(updated)
      setBonusText(updated.bonusPaise > 0 ? paiseToInput(updated.bonusPaise) : '')
      setSuccess(
        updated.bonusPaise > 0
          ? `Bonus of ${formatPaise(updated.bonusPaise)} added to this cycle, split like your salary.`
          : 'Bonus removed from this cycle.',
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setSuccess(null)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <article className="card" aria-labelledby="bonus-title">
      <h2 id="bonus-title">Bonus this cycle</h2>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (submitting || unchanged) return
          if (!valid) {
            setError('Enter a bonus between ₹0 and ₹1,00,00,000, with at most 2 decimals')
            setSuccess(null)
            return
          }
          void save(bonusPaise)
        }}
        noValidate
      >
        <p className="muted">
          Extra money for {formatDate(cycle.periodStart)} – {formatDate(cycle.periodEnd)} only. It is split like your
          salary and does not carry over to the next cycle.
        </p>
        <label htmlFor="settings-bonus">Bonus amount (₹)</label>
        <input
          id="settings-bonus"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0"
          value={bonusText}
          onChange={(e) => {
            setBonusText(e.target.value)
            setSuccess(null)
          }}
        />
        {valid && !unchanged && bonusPaise > 0 && (
          <SplitPreview
            amountPaise={bonusPaise}
            pct={{ needs: cycle.needsPct, wants: cycle.wantsPct, savings: cycle.savingsPct }}
          />
        )}
        <div className="form-actions">
          <button type="submit" disabled={submitting || unchanged}>
            {submitting ? 'Saving…' : cycle.bonusPaise > 0 ? 'Update bonus' : 'Add bonus'}
          </button>
          {cycle.bonusPaise > 0 && (
            <button type="button" className="secondary" disabled={submitting} onClick={() => void save(0)}>
              Remove bonus
            </button>
          )}
        </div>
      </form>
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

// Savings the user had before; only the starting point of total savings.
function OpeningBalanceSettings({ me, onUserChanged }: Props) {
  const [text, setText] = useState(me.openingBalancePaise !== null ? paiseToInput(me.openingBalancePaise) : '')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const amount = parseRupeesToPaise(text)
  const valid = amount !== null && amount >= 0 && amount <= MAX_OPENING_PAISE
  const unchanged = amount === me.openingBalancePaise

  async function save(value: number | null) {
    setSubmitting(true)
    setError(null)
    try {
      await changeOpeningBalance(value)
      await onUserChanged()
      if (value === null) setText('')
      setSuccess(value === null ? 'Opening balance removed.' : 'Opening balance saved.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setSuccess(null)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <article className="card" aria-labelledby="opening-title">
      <h2 id="opening-title">Opening balance</h2>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (submitting || unchanged) return
          if (!valid) {
            setError('Enter your savings in rupees, with at most 2 decimals')
            setSuccess(null)
            return
          }
          void save(amount)
        }}
        noValidate
      >
        <p className="muted">
          Savings you had before using Fifty30. Your total savings in Reports starts from it; it never changes your
          monthly budget.
        </p>
        <label htmlFor="settings-opening">Savings you started with (₹)</label>
        <input
          id="settings-opening"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="Not set"
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setSuccess(null)
          }}
        />
        <div className="form-actions">
          <button type="submit" disabled={submitting || unchanged || text.trim() === ''}>
            {submitting ? 'Saving…' : 'Save'}
          </button>
          {me.openingBalancePaise !== null && (
            <button type="button" className="secondary" disabled={submitting} onClick={() => void save(null)}>
              Remove
            </button>
          )}
        </div>
      </form>
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
