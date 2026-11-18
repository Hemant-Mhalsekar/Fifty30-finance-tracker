import type { CSSProperties } from 'react'
import { formatPaiseShort, splitBudget } from '../money'

type Props = {
  amountPaise: number
  pct: { needs: number; wants: number; savings: number }
}

/** "Needs 60% ₹30,000.00" etc.: what an amount becomes under a split, exactly as the server splits it. */
export default function SplitPreview({ amountPaise, pct }: Props) {
  const split = splitBudget(amountPaise, pct)
  return (
    <dl className="split-preview" aria-live="polite">
      <div style={{ '--t': 'var(--need-soft)', '--tc': 'var(--need-text)' } as CSSProperties}>
        <dt>Needs {pct.needs}%</dt>
        <dd>{formatPaiseShort(split.needs)}</dd>
      </div>
      <div style={{ '--t': 'var(--want-soft)', '--tc': 'var(--want-text)' } as CSSProperties}>
        <dt>Wants {pct.wants}%</dt>
        <dd>{formatPaiseShort(split.wants)}</dd>
      </div>
      <div style={{ '--t': 'var(--save-soft)', '--tc': 'var(--save-text)' } as CSSProperties}>
        <dt>Savings {pct.savings}%</dt>
        <dd>{formatPaiseShort(split.savings)}</dd>
      </div>
    </dl>
  )
}
