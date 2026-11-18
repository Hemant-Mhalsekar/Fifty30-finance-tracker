import { useState, type FormEvent } from 'react'
import { ApiError, onboard } from '../api'
import { BrandLockup } from '../components/icons'
import SplitPicker from '../components/SplitPicker'
import SplitPreview from '../components/SplitPreview'
import { parseRupeesToPaise } from '../money'
import { SPLITS, type SplitPreset } from '../splits'

const MIN_SALARY_PAISE = 100
const MAX_SALARY_PAISE = 1_000_000_000
// ₹10,00,00,00,000 (100 crore), the server's limit.
const MAX_OPENING_PAISE = 100_000_000_000

type Props = {
  // Reloads the user; the app then leaves onboarding by itself.
  onDone: () => Promise<void>
}

export default function Onboarding({ onDone }: Props) {
  const [salaryText, setSalaryText] = useState('')
  const [payDay, setPayDay] = useState('1')
  const [preset, setPreset] = useState<SplitPreset>('BALANCED')
  const [hasSavings, setHasSavings] = useState(false)
  const [savingsText, setSavingsText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const salaryPaise = parseRupeesToPaise(salaryText)
  const salaryValid = salaryPaise !== null && salaryPaise >= MIN_SALARY_PAISE && salaryPaise <= MAX_SALARY_PAISE
  const chosen = SPLITS.find((s) => s.id === preset)!
  const savingsPaise = parseRupeesToPaise(savingsText)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return
    if (!salaryValid) {
      setError('Enter a salary between ₹1 and ₹1,00,00,000, with at most 2 decimals')
      return
    }
    if (hasSavings && (savingsPaise === null || savingsPaise < 0 || savingsPaise > MAX_OPENING_PAISE)) {
      setError('Enter your current savings in rupees, with at most 2 decimals, or choose No')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      await onboard(salaryPaise, Number(payDay), preset, hasSavings ? savingsPaise : null)
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
            Each pay cycle runs from one pay day to the next and is split into needs, wants, and savings including
            investments. You can change the split later in Settings.
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

          <SplitPicker value={preset} onChange={setPreset} />
          {salaryValid && <SplitPreview amountPaise={salaryPaise} pct={chosen} />}

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

          <fieldset className="field">
            <legend>Do you already have savings?</legend>
            <div className="segmented">
              <label>
                <input type="radio" name="has-savings" checked={!hasSavings} onChange={() => setHasSavings(false)} />
                No
              </label>
              <label>
                <input type="radio" name="has-savings" checked={hasSavings} onChange={() => setHasSavings(true)} />
                Yes
              </label>
            </div>
            <p className="hint">
              Optional. Your total savings will start from it; it never changes your monthly budget.
            </p>
          </fieldset>

          {hasSavings && (
            <div className="field">
              <label htmlFor="opening-balance">Current savings</label>
              <div className="amount-field">
                <span aria-hidden="true">₹</span>
                <input
                  id="opening-balance"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="1,00,000"
                  value={savingsText}
                  onChange={(e) => setSavingsText(e.target.value)}
                />
              </div>
            </div>
          )}

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
