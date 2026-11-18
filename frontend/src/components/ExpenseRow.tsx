import type { ReactNode } from 'react'
import type { BudgetType, Expense } from '../api'
import { dayLabel, loggedTime, typeClass } from '../display'
import { TYPE_LABELS } from '../labels'
import { formatPaiseShort } from '../money'
import { CategoryIcon } from './icons'

export type RowCategory = { name: string; type: BudgetType | null }

type Props = {
  expense: Expense
  category: RowCategory | undefined
  // List pages group by day already, so they leave the date out of each row.
  showDate?: boolean
  // Rendered after the amount (edit and delete buttons on the Expenses page).
  actions?: ReactNode
  // Makes the main part of the row a button (opens the editor on phones).
  onOpen?: () => void
  openLabel?: string
}

/** One expense: category icon, description, "when · category or type", type pill and amount. */
export default function ExpenseRow({ expense, category, showDate = true, actions, onOpen, openLabel }: Props) {
  const time = loggedTime(expense.createdAt, expense.expenseDate)
  const when = [showDate ? dayLabel(expense.expenseDate).replace(/^(Today|Yesterday), .*/, '$1') : null, time]
    .filter(Boolean)
    .join(', ')
  const meta = [when || null, showDate ? TYPE_LABELS[expense.type] + 's' : (category?.name ?? 'Archived category')]
    .filter(Boolean)
    .join(' • ')

  const body = (
    <>
      <span className={`badge-icon ${typeClass(expense.type)}`}>
        <CategoryIcon name={category?.name ?? ''} type={expense.type} />
      </span>
      <span className="tx-main">
        <span className="tx-title">{expense.description}</span>
        <span className="tx-meta">{meta}</span>
      </span>
    </>
  )

  return (
    <div className="tx-row">
      {onOpen ? (
        <button type="button" className="tx-open" onClick={onOpen} aria-label={openLabel}>
          {body}
        </button>
      ) : (
        body
      )}
      {!showDate && <span className={`pill ${typeClass(expense.type)}`}>{TYPE_LABELS[expense.type]}s</span>}
      <span className="tx-amount">{formatPaiseShort(expense.amountPaise)}</span>
      {actions}
    </div>
  )
}
