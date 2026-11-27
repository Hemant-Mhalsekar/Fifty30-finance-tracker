import { Link } from 'react-router'
import type { BudgetType } from '../api'
import { changePct } from '../reports'
import { formatPaiseShort } from '../money'
import { CategoryIcon } from './icons'

export type CategoryBar = {
  key: string
  name: string
  type: BudgetType
  amountPaise: number
  // What it is compared with (last cycle, the cycle before); null when there is nothing to compare.
  comparePaise: number | null
  // Opens the expenses behind the number.
  href?: string
}

/**
 * Categories as labelled horizontal bars, biggest first: readable on a phone where a column chart
 * of several cycles is not. Each bar is scaled to the biggest category, and the share of the total
 * and the change are printed, so nothing depends on reading the bar length or its colour.
 */
export default function CategoryBars({
  title,
  rows,
  compareLabel,
  compareAs = 'change',
  totalPaise,
}: {
  title: string
  rows: CategoryBar[]
  // How the comparison reads after the change, e.g. "vs Oct".
  compareLabel: string
  // 'amount' prints the other figure plainly ("Oct ₹15,000"): right when this one is a cycle still
  // under way, where a percentage against a whole cycle would always look like a drop.
  compareAs?: 'change' | 'amount'
  // The whole when only the top rows are shown, so their shares stay true.
  totalPaise?: number
}) {
  const total = totalPaise ?? rows.reduce((t, r) => t + r.amountPaise, 0)
  const max = Math.max(1, ...rows.map((r) => r.amountPaise))
  return (
    <ul className="category-bars" aria-label={title}>
      {rows.map((r) => {
        const share = total > 0 ? Math.round((r.amountPaise * 100) / total) : 0
        const change = r.comparePaise === null ? null : changePct(r.amountPaise, r.comparePaise)
        const body = (
          <>
            <span className={`bar-icon t-${r.type.toLowerCase()}`} aria-hidden="true">
              <CategoryIcon name={r.name} type={r.type} size={18} />
            </span>
            <span className="bar-main">
              <span className="bar-top">
                <span className="bar-name">{r.name}</span>
                <strong className="num">{formatPaiseShort(r.amountPaise)}</strong>
              </span>
              <span className="bar-track" aria-hidden="true">
                <span
                  className={`bar-fill ${r.type.toLowerCase()}`}
                  style={{ width: `${Math.max(2, (r.amountPaise * 100) / max)}%` }}
                />
              </span>
              <span className="bar-meta">
                <span>{share}% of the total</span>
                {r.comparePaise !== null && compareAs === 'amount' && (
                  <span>
                    {r.comparePaise === 0
                      ? `none ${compareLabel.replace(/^vs /, 'in ')}`
                      : `${compareLabel.replace(/^vs /, '')} ${formatPaiseShort(r.comparePaise)}`}
                  </span>
                )}
                {r.comparePaise !== null && compareAs === 'change' && (
                  <span className={change === null ? '' : change > 0 ? 'up' : change < 0 ? 'down' : ''}>
                    {change === null
                      ? `none ${compareLabel.replace(/^vs /, 'in ')}`
                      : change === 0
                        ? `same as ${compareLabel.replace(/^vs /, '')}`
                        : `${change > 0 ? '▲' : '▼'} ${Math.abs(change)}% ${compareLabel} (${formatPaiseShort(r.comparePaise)})`}
                  </span>
                )}
              </span>
            </span>
          </>
        )
        return <li key={r.key}>{r.href ? <Link to={r.href}>{body}</Link> : <div>{body}</div>}</li>
      })}
    </ul>
  )
}
