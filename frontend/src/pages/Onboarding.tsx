import { useState, type CSSProperties, type FormEvent } from 'react'
import { ApiError, onboard } from '../api'
import { BrandLockup } from '../components/icons'
import { formatPaise, parseRupeesToPaise, splitBudget } from '../money'

const MIN_SALARY_PAISE = 100
const MAX_SALARY_PAISE = 1_000_000_000

type Props = {
  // Reloads the user; the app then leaves onboarding by itself.
  onDone: () => Promise<void>
}

export default function Onboarding({ onDone }: Props) {
  const [salaryText, setSalaryText] = useState('')
  const [payDay, setPayDay] = useState('1')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const salaryPaise = parseRupeesToPaise(salaryText)
  const salaryValid = salaryPaise !== null && salaryPaise >= MIN_SALARY_PAISE && salaryPaise <= MAX_SALARY_PAISE
  const split = salaryValid ? splitBudget(salaryPaise) : null

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return
    if (!salaryValid) {
      setError('Enter a salary between ₹1 and ₹1,00,00,000, with at most 2 decimals')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      await onboard(salaryPaise, Number(payDay))
      await onDone()
    } catch (e) {
      // 409 means setup was already completed (for example in another tab): just move on.
      if (e instanceof ApiError && e.status === 409) {
        await onDone().catch(() => setError('Something went wrong'))
        return
      }
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setSubmitting(false)
    }
  }

  return (
    <main className="welcome">
      <BrandLockup />
      <div className="card">
        <form onSubmit={handleSubmit} noValidate>
          <h1>Set up your budget</h1>
          <p className="muted">
            Each pay cycle runs from one pay day to the next and is split 50/30/20: needs, wants, and savings including
            investments.
          </p>


          <div className="field">
            <label htmlFor="salary">Monthly take-home salary</label>
            <div className="amount-field">
              <span aria-hidden="true">₹</span>
              <input
                id="salary"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="50,000"
                required
                value={salaryText}
                onChange={(e) => setSalaryText(e.target.value)}
              />
            </div>
          </div>

          {split && (
            <dl className="split-preview" aria-live="polite">
              <div style={{ '--t': 'var(--need-soft)', '--tc': 'var(--need-text)' } as CSSProperties}>
                <dt>Needs 50%</dt>
                <dd>{formatPaise(split.needs)}</dd>
              </div>
              <div style={{ '--t': 'var(--want-soft)', '--tc': 'var(--want-text)' } as CSSProperties}>
                <dt>Wants 30%</dt>
                <dd>{formatPaise(split.wants)}</dd>
              </div>
              <div style={{ '--t': 'var(--save-soft)', '--tc': 'var(--save-text)' } as CSSProperties}>
                <dt>Savings 20%</dt>
                <dd>{formatPaise(split.savings)}</dd>
              </div>
            </dl>
          )}

          <div className="field">
            <label htmlFor="pay-day">Pay day (the day of the month your salary arrives)</label>
            <select id="pay-day" value={payDay} onChange={(e) => setPayDay(e.target.value)}>
              {Array.from({ length: 31 }, (_, i) => String(i + 1)).map((day) => (
                <option key={day} value={day}>
                  {day}
                </option>
              ))}
            </select>
            {Number(payDay) >= 29 && <p className="hint">In shorter months, the last day of the month is used.</p>}
          </div>

          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="block" disabled={submitting}>
            {submitting ? 'Saving…' : 'Start tracking'}
          </button>
        </form>
      </div>
    </main>
  )
}
