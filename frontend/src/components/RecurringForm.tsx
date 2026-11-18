import { useId, useState, type FormEvent } from 'react'
import type { BudgetType, Category, RecurringInput } from '../api'
import { TYPE_LABELS } from '../labels'
import { CategoryIcon } from './icons'
import { paiseToInput, parseRupeesToPaise } from '../money'
import { ordinal } from '../recurring'

const MAX_AMOUNT_PAISE = 10_000_000_000
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1)

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
  const [day, setDay] = useState(initial?.dayOfMonth ?? 1)
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
        dayOfMonth: day,
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
        <p className="hint">You can change it each month when you confirm.</p>
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

      <div className="field">
        <label htmlFor={`${id}-day`}>Due every month on the</label>
        <select id={`${id}-day`} value={day} onChange={(e) => setDay(Number(e.target.value))}>
          {DAYS.map((d) => (
            <option key={d} value={d}>
              {ordinal(d)}
            </option>
          ))}
        </select>
        {day >= 29 && <p className="hint">In shorter months it is due on the last day.</p>}
      </div>

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
