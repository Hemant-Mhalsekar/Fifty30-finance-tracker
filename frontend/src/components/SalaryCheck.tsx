import { useId, useState, type FormEvent } from 'react'
import { changeCurrentSalary, confirmCurrentSalary, type Cycle } from '../api'
import { formatPaise, paiseToInput, parseRupeesToPaise, splitBudget } from '../money'

const MIN_SALARY_PAISE = 100
const MAX_SALARY_PAISE = 1_000_000_000

type Props = {
  cycle: Cycle
  // Called once answered; a changed salary means the report needs reloading.
  onAnswered: (salaryChanged: boolean) => void
}

// Shown at the start of a new cycle until answered: the new cycle copied the last salary, which
// is right most months but wrong after a raise or a job change.
export default function SalaryCheck({ cycle, onAnswered }: Props) {
  const id = useId()
  const [editing, setEditing] = useState(false)
  const [salaryText, setSalaryText] = useState(paiseToInput(cycle.salaryPaise))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const salaryPaise = parseRupeesToPaise(salaryText)
  const valid = salaryPaise !== null && salaryPaise >= MIN_SALARY_PAISE && salaryPaise <= MAX_SALARY_PAISE
  const split = valid
    ? splitBudget(salaryPaise + cycle.bonusPaise, { needs: cycle.needsPct, wants: cycle.wantsPct })
    : null

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setBusy(false)
    }
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    if (!valid) {
      setError('Enter a salary between ₹1 and ₹1,00,00,000, with at most 2 decimals')
      return
    }
    run(async () => {
      // The same amount is a "no", not a change.
      if (salaryPaise === cycle.salaryPaise) await confirmCurrentSalary()
      else await changeCurrentSalary(salaryPaise)
      onAnswered(salaryPaise !== cycle.salaryPaise)
    })
  }

  return (
    <article className="card salary-check" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>New cycle: did your salary change?</h2>
      <p className="muted">
        This cycle uses <strong className="num">{formatPaise(cycle.salaryPaise)}</strong>, the same as last time.
      </p>

      {editing ? (
        <form onSubmit={save} noValidate className="salary-check-form">
          <label htmlFor={`${id}-salary`}>Salary for this cycle (₹)</label>
          <input
            id={`${id}-salary`}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            autoFocus
            value={salaryText}
            onChange={(e) => setSalaryText(e.target.value)}
          />
          {split && (
            <p className="hint">
              Needs {formatPaise(split.needs)} · Wants {formatPaise(split.wants)} · Savings {formatPaise(split.savings)}
            </p>
          )}
          <div className="form-actions">
            <button type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save salary'}
            </button>
            <button type="button" className="secondary" disabled={busy} onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
          <p className="hint">Later cycles copy it. Past cycles keep theirs.</p>
        </form>
      ) : (
        <div className="form-actions">
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await confirmCurrentSalary()
                onAnswered(false)
              })
            }
          >
            No, same as before
          </button>
          <button type="button" className="secondary" disabled={busy} onClick={() => setEditing(true)}>
            Yes, it changed
          </button>
        </div>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </article>
  )
}
