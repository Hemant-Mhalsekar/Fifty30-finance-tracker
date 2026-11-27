import { useId, useState, type FormEvent } from 'react'
import type { BudgetType, Category, Frequency, RecurringInput } from '../api'
import { todayIst } from '../dates'
import { TYPE_LABELS } from '../labels'
import { CategoryIcon } from './icons'
import { paiseToInput, parseRupeesToPaise } from '../money'
import { daysInMonth, FREQUENCY_LABELS, MONTHS, ordinal, WEEKDAYS } from '../recurring'

const MAX_AMOUNT_PAISE = 10_000_000_000
const days = (count: number) => Array.from({ length: count }, (_, i) => i + 1)

// A new weekly or yearly one starts on today's weekday or date, the likeliest answer.
function todayParts() {
  const today = todayIst()
  const [, month, day] = today.split('-').map(Number)
  const sundayIsZero = new Date(`${today}T00:00:00Z`).getUTCDay()
  return { month, day, weekday: sundayIsZero === 0 ? 7 : sundayIsZero }
}

type Props = {
  // Chips in this order. In edit mode the current category is included even if archived.
  categories: Category[]
  initial?: RecurringInput
  submitLabel: string
  // Keeps the save button above the phone's tab bar while the form scrolls.
  stickyActions?: boolean
  onSubmit: (input: RecurringInput) => Promise<void>
  onCancel?: () => void
}

// Same fields as an expense, except a day of the month instead of a date.
export default function RecurringForm({
  categories,
  initial,
  submitLabel,
  stickyActions = false,
  onSubmit,
  onCancel,
}: Props) {
  const id = useId()
  const [amountText, setAmountText] = useState(initial ? paiseToInput(initial.amountPaise) : '')
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? '')
  const [type, setType] = useState<BudgetType | ''>(initial?.type ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const today = todayParts()
  const [frequency, setFrequency] = useState<Frequency>(initial?.frequency ?? 'MONTHLY')
  // Each frequency keeps its own choice, so switching back and forth loses nothing.
  const [day, setDay] = useState(initial?.frequency === 'MONTHLY' ? (initial.dayOfMonth ?? 1) : 1)
  const [weekday, setWeekday] = useState(initial?.dayOfWeek ?? today.weekday)
  const [yearMonth, setYearMonth] = useState(initial?.monthOfYear ?? today.month)
  const [yearDay, setYearDay] = useState(initial?.frequency === 'YEARLY' ? (initial.dayOfMonth ?? 1) : today.day)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const category = categories.find((c) => c.id === categoryId)
  const needsType = category !== undefined && category.type === null

  function validate(): string | null {
    const amountPaise = parseRupeesToPaise(amountText)
    if (amountPaise === null || amountPaise < 1 || amountPaise > MAX_AMOUNT_PAISE) {
      return 'Enter an amount between ₹0.01 and ₹10,00,00,000, with at most 2 decimals'
    }
    if (!category) return 'Choose a category'
    if (needsType && type === '') return 'Choose whether this is a need, want or investment'
    if (description.trim() === '') return 'Add a short description'
    return null
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return
    const problem = validate()
    if (problem) {
      setError(problem)
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await onSubmit({
        amountPaise: parseRupeesToPaise(amountText)!,
        categoryId,
        description: description.trim(),
        frequency,
        dayOfMonth: frequency === 'WEEKLY' ? null : frequency === 'YEARLY' ? yearDay : day,
        dayOfWeek: frequency === 'WEEKLY' ? weekday : null,
        monthOfYear: frequency === 'YEARLY' ? yearMonth : null,
        // The API rejects a type for categories that have their own.
        ...(needsType && type !== '' ? { type } : {}),
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="expense-form">
      <div className="field">
        <label htmlFor={`${id}-amount`}>Usual amount</label>
        <div className="amount-field">
          <span aria-hidden="true">₹</span>
          <input
            id={`${id}-amount`}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
          />
        </div>
        <p className="hint">You can change it each time you confirm.</p>
      </div>

      <fieldset className="field chips-field">
        <legend>Category</legend>
        <div className="chips">
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              className="chip"
              aria-pressed={c.id === categoryId}
              onClick={() => {
                if (c.id !== categoryId) setType('')
                setCategoryId(c.id)
              }}
            >
              <span className={c.type ? `type-${c.type.toLowerCase()}` : ''}>
                <CategoryIcon name={c.name} type={c.type} size={16} />
              </span>
              {c.name}
              {c.archived ? ' (archived)' : ''}
            </button>
          ))}
        </div>
      </fieldset>

      {needsType && (
        <fieldset className="field">
          <legend>This expense is a</legend>
          <div className="segmented">
            {(Object.keys(TYPE_LABELS) as BudgetType[]).map((t) => (
              <label key={t}>
                <input type="radio" name={`${id}-type`} value={t} checked={type === t} onChange={() => setType(t)} />
                {TYPE_LABELS[t]}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div className="field">
        <label htmlFor={`${id}-description`}>Description</label>
        <input
          id={`${id}-description`}
          type="text"
          maxLength={200}
          autoComplete="off"
          placeholder="Rent, SIP, Netflix…"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <fieldset className="field">
        <legend>Repeats</legend>
        <div className="segmented">
          {(Object.keys(FREQUENCY_LABELS) as Frequency[]).map((f) => (
            <label key={f}>
              <input
                type="radio"
                name={`${id}-frequency`}
                value={f}
                checked={frequency === f}
                onChange={() => setFrequency(f)}
              />
              {FREQUENCY_LABELS[f]}
            </label>
          ))}
        </div>
      </fieldset>

      {frequency === 'WEEKLY' && (
        <div className="field">
          <label htmlFor={`${id}-weekday`}>Due every week on</label>
          <select id={`${id}-weekday`} value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
            {WEEKDAYS.map((name, i) => (
              <option key={name} value={i + 1}>
                {name}
              </option>
            ))}
          </select>
        </div>
      )}

      {frequency === 'MONTHLY' && (
        <div className="field">
          <label htmlFor={`${id}-day`}>Due every month on the</label>
          <select id={`${id}-day`} value={day} onChange={(e) => setDay(Number(e.target.value))}>
            {days(31).map((d) => (
              <option key={d} value={d}>
                {ordinal(d)}
              </option>
            ))}
          </select>
          {day >= 29 && <p className="hint">In shorter months it is due on the last day.</p>}
        </div>
      )}

      {frequency === 'YEARLY' && (
        <fieldset className="field">
          <legend>Due every year on</legend>
          <div className="date-pair">
            <div>
              <label htmlFor={`${id}-year-day`}>Day</label>
              <select id={`${id}-year-day`} value={yearDay} onChange={(e) => setYearDay(Number(e.target.value))}>
                {days(daysInMonth(yearMonth)).map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={`${id}-year-month`}>Month</label>
              <select
                id={`${id}-year-month`}
                value={yearMonth}
                onChange={(e) => {
                  const month = Number(e.target.value)
                  setYearMonth(month)
                  // 31 March -> April becomes 30 April instead of a day the month lacks.
                  setYearDay((d) => Math.min(d, daysInMonth(month)))
                }}
              >
                {MONTHS.map((name, i) => (
                  <option key={name} value={i + 1}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {yearMonth === 2 && yearDay === 29 && <p className="hint">In other years it is due on 28 February.</p>}
        </fieldset>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <div className={`form-actions${stickyActions ? ' sticky-actions' : ''}`}>
        <button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="secondary" onClick={onCancel} disabled={submitting}>
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}
