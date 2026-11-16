import { useId, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import type { BudgetType, Category, NewExpense } from '../api'
import { addDays, todayIst } from '../dates'
import { TYPE_COLORS, TYPE_LABELS } from '../labels'
import { paiseToInput, parseRupeesToPaise } from '../money'

const MAX_AMOUNT_PAISE = 10_000_000_000
const MIN_DATE = '2000-01-01'

export type ExpenseFormInitial = {
  amountPaise: number
  categoryId: string
  type: BudgetType
  description: string
  expenseDate: string
}

type Props = {
  // Shown as tappable chips in this order (the caller puts recently used ones first).
  categories: Category[]
  initial?: ExpenseFormInitial
  submitLabel: string
  // Add mode: clear amount and description after saving, keep category and date for the next entry.
  resetAfterSubmit?: boolean
  autoFocus?: boolean
  // Keeps the submit button above the phone's tab bar while the form scrolls.
  stickyActions?: boolean
  // Resolves to a success message to show, or throws to show its message as an error.
  onSubmit: (expense: NewExpense, category: Category) => Promise<string | null>
  onCancel?: () => void
  children?: ReactNode
}

export default function ExpenseForm({
  categories,
  initial,
  submitLabel,
  resetAfterSubmit = false,
  autoFocus = false,
  stickyActions = false,
  onSubmit,
  onCancel,
  children,
}: Props) {
  const id = useId()
  const initialCategory = categories.find((c) => c.id === initial?.categoryId)

  const [amountText, setAmountText] = useState(initial ? paiseToInput(initial.amountPaise) : '')
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? '')
  // Only meaningful for categories without a type (Other), where it was chosen per expense.
  const [type, setType] = useState<BudgetType | ''>(initialCategory?.type === null ? (initial?.type ?? '') : '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [date, setDate] = useState(initial?.expenseDate ?? todayIst())

  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const amountRef = useRef<HTMLInputElement>(null)

  const category = categories.find((c) => c.id === categoryId)
  const needsType = category !== undefined && category.type === null
  const today = todayIst()
  const yesterday = addDays(today, -1)

  function validate(): string | null {
    const amountPaise = parseRupeesToPaise(amountText)
    if (amountPaise === null || amountPaise < 1 || amountPaise > MAX_AMOUNT_PAISE) {
      return 'Enter an amount between ₹0.01 and ₹10,00,00,000, with at most 2 decimals'
    }
    if (!category) return 'Choose a category'
    if (needsType && type === '') return 'Choose whether this is a need, want or investment'
    if (description.trim() === '') return 'Add a short description'
    if (date === '' || date < MIN_DATE || date > todayIst()) return 'Choose a date between 2000 and today'
    return null
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return
    const problem = validate()
    if (problem) {
      setError(problem)
      setSuccess(null)
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      const message = await onSubmit(
        {
          amountPaise: parseRupeesToPaise(amountText)!,
          categoryId,
          description: description.trim(),
          expenseDate: date,
          // The API rejects a type for categories that have their own.
          ...(needsType && type !== '' ? { type } : {}),
        },
        category!,
      )
      setSuccess(message)
      if (resetAfterSubmit) {
        setAmountText('')
        setDescription('')
        amountRef.current?.focus()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setSuccess(null)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="expense-form">
      {success && (
        <p className="toast" role="status">
          {success}
        </p>
      )}

      <div className="field">
        <label htmlFor={`${id}-amount`}>Amount</label>
        <div className="amount-field">
          <span aria-hidden="true">₹</span>
          <input
            id={`${id}-amount`}
            ref={amountRef}
            type="text"
            inputMode="decimal"
            enterKeyHint="next"
            autoComplete="off"
            autoFocus={autoFocus}
            placeholder="0"
            value={amountText}
            onChange={(e) => {
              setAmountText(e.target.value)
              setSuccess(null)
            }}
          />
        </div>
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
              <span className="dot" style={{ '--c': c.type ? TYPE_COLORS[c.type] : 'var(--muted)' } as CSSProperties} />
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
          enterKeyHint="done"
          placeholder="What was it for?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <fieldset className="field">
        <legend>Date</legend>
        <div className="chips">
          <button type="button" className="chip" aria-pressed={date === today} onClick={() => setDate(today)}>
            Today
          </button>
          <button type="button" className="chip" aria-pressed={date === yesterday} onClick={() => setDate(yesterday)}>
            Yesterday
          </button>
          <input
            aria-label="Date"
            className="date-input"
            type="date"
            min={MIN_DATE}
            max={today}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
      </fieldset>

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

      {children}
    </form>
  )
}
