import { useEffect, useState, type ReactNode } from 'react'
import {
  ApiError,
  getCurrentReport,
  getHistory,
  getReportForDate,
  type BudgetType,
  type CycleHistoryItem,
  type CycleReport,
} from '../api'
import HistoryChart from '../components/HistoryChart'
import Meter from '../components/Meter'
import { AlertIcon, ChevronLeftIcon, ChevronRightIcon } from '../components/icons'
import { addDays, formatRange, todayIst } from '../dates'
import { percentOf } from '../display'
import { formatPaiseShort } from '../money'

const COLORS: Record<BudgetType, { c: string; t: string }> = {
  NEED: { c: 'var(--need)', t: 'var(--need-soft)' },
  WANT: { c: 'var(--want)', t: 'var(--want-soft)' },
  INVESTMENT: { c: 'var(--save)', t: 'var(--save-soft)' },
}

// The split plan for one cycle, with where each bucket's money went, category by category.
export default function Budgets() {
  // null = the current cycle; otherwise any date inside the cycle being viewed.
  const [viewDate, setViewDate] = useState<string | null>(null)
  const [report, setReport] = useState<CycleReport | null>(null)
  const [history, setHistory] = useState<CycleHistoryItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(viewDate === null ? getCurrentReport() : getReportForDate(viewDate))
      .then((result) => {
        if (cancelled) return
        setReport(result)
        setError(null)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        if (e instanceof ApiError && e.status === 404) {
          setNotice('There is no earlier cycle.')
          return
        }
        setError(e instanceof Error ? e.message : 'Something went wrong')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    getHistory(viewDate ?? undefined)
      .then((items) => {
        if (!cancelled) setHistory(items)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [viewDate])

  function goTo(date: string) {
    if (date === viewDate) return
    setLoading(true)
    setNotice(null)
    setViewDate(date)
  }

  const header = (cycleSwitch: ReactNode) => (
    <div className="page-head">
      <div>
        <h1>Budget Details</h1>
        <p className="sub">How your pay cycle is split (pay day to the day before the next)</p>
      </div>
      {cycleSwitch}
    </div>
  )

  if (!report) {
    return (
      <section>
        {header(null)}
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : (
          <p className="muted">Loading…</p>
        )}
      </section>
    )
  }

  const { cycle, needs, wants, savings } = report
  const isCurrent = cycle.periodEnd >= todayIst()
  // The cycle before the one on screen, for a "last time" warning.
  const previous = history && history.length > 1 ? history[history.length - 2] : null
  const byType = (type: BudgetType) => report.categories.filter((c) => c.type === type)

  return (
    <section className="sections" aria-busy={loading}>
      {header(
        <div className="cycle-switch">
          <button
            type="button"
            aria-label="Previous cycle"
            disabled={loading || notice !== null}
            onClick={() => goTo(addDays(cycle.periodStart, -1))}
          >
            <ChevronLeftIcon />
          </button>
          <span className="range">
            <strong>{formatRange(cycle.periodStart, cycle.periodEnd)}</strong>
            <small>{isCurrent ? 'Current cycle' : 'Past cycle'}</small>
          </span>
          <button
            type="button"
            aria-label="Next cycle"
            disabled={loading || isCurrent}
            onClick={() => goTo(addDays(cycle.periodEnd, 1))}
          >
            <ChevronRightIcon />
          </button>
        </div>,
      )}

      {notice && (
        <p className="muted" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <div className="dash-grid three">
        <BucketSummary
          title={`Needs • ${cycle.needsPct}%`}
          type="NEED"
          figures={[
            ['Allocated', needs.allocatedPaise],
            ['Spent', needs.spentPaise],
            [needs.overspent ? 'Over by' : 'Left', Math.abs(needs.remainingPaise)],
          ]}
          used={percentOf(needs.spentPaise, needs.allocatedPaise)}
          usedLabel="used"
          over={needs.overspent}
          value={needs.spentPaise}
          max={needs.allocatedPaise}
        />
        <BucketSummary
          title={`Wants • ${cycle.wantsPct}%`}
          type="WANT"
          figures={[
            ['Allocated', wants.allocatedPaise],
            ['Spent', wants.spentPaise],
            [wants.overspent ? 'Over by' : 'Left', Math.abs(wants.remainingPaise)],
          ]}
          used={percentOf(wants.spentPaise, wants.allocatedPaise)}
          usedLabel="used"
          over={wants.overspent}
          value={wants.spentPaise}
          max={wants.allocatedPaise}
        />
        <BucketSummary
          title={`Savings • ${cycle.savingsPct}%`}
          type="INVESTMENT"
          figures={[
            ['Target', savings.plannedPaise],
            [savings.deficit ? 'Deficit' : isCurrent ? 'Saved so far' : 'Saved', Math.abs(savings.savedPaise)],
            savings.investedPaise > 0
              ? ['Invested', savings.investedPaise]
              : ['To save', Math.max(0, savings.plannedPaise - savings.savedPaise)],
          ]}
          used={percentOf(Math.max(0, savings.savedPaise), savings.plannedPaise)}
          usedLabel="saved"
          over={savings.deficit}
          value={Math.max(0, savings.savedPaise)}
          max={savings.plannedPaise}
        />
      </div>

      <div className="dash-grid two">
        <Breakdown
          title="Needs breakdown"
          type="NEED"
          rows={byType('NEED')}
          spent={needs.spentPaise}
          allocated={needs.allocatedPaise}
          warning={
            previous && previous.needsSpentPaise > previous.cycle.needsPaise
              ? `Previous cycle (${formatRange(previous.cycle.periodStart, previous.cycle.periodEnd)}) exceeded Needs by ${formatPaiseShort(previous.needsSpentPaise - previous.cycle.needsPaise)}.`
              : null
          }
        />
        <Breakdown
          title="Wants breakdown"
          type="WANT"
          rows={byType('WANT')}
          spent={wants.spentPaise}
          allocated={wants.allocatedPaise}
          warning={
            previous && previous.wantsSpentPaise > previous.cycle.wantsPaise
              ? `Previous cycle (${formatRange(previous.cycle.periodStart, previous.cycle.periodEnd)}) exceeded Wants by ${formatPaiseShort(previous.wantsSpentPaise - previous.cycle.wantsPaise)}.`
              : null
          }
        />
        {byType('INVESTMENT').length > 0 && (
          <Breakdown
            title="Investments"
            type="INVESTMENT"
            rows={byType('INVESTMENT')}
            spent={savings.investedPaise}
            allocated={savings.plannedPaise}
            warning={null}
          />
        )}
      </div>

      {history && history.length > 0 && <HistoryChart items={history} currentStart={cycle.periodStart} />}
    </section>
  )
}

function BucketSummary({
  title,
  type,
  figures,
  used,
  usedLabel,
  over,
  value,
  max,
}: {
  title: string
  type: BudgetType
  figures: [string, number][]
  used: number
  usedLabel: string
  over: boolean
  value: number
  max: number
}) {
  const color = COLORS[type]
  return (
    <article className="card" aria-label={title}>
      <div className="card-head">
        <h2>{title}</h2>
        <span className={`pill ${over ? 'bad' : type.toLowerCase()}`}>
          {/* Unspent money counts as saved, so early in a cycle this can pass 100%. */}
          {usedLabel === 'saved' && used >= 100 ? 'On track' : `${used}% ${usedLabel}`}
        </span>
      </div>
      <dl className="budget-figures">
        {figures.map(([label, amount], i) => {
          const last = i === figures.length - 1
          // The last figure (left / to save) carries the colour; spending over plan is red.
          const tone =
            over && (i === 1 || (last && type !== 'INVESTMENT')) ? 'negative' : last ? `t-${type.toLowerCase()}` : ''
          return (
            <div key={label}>
              <dt className="label">{label}</dt>
              <dd>
                <strong className={tone}>{formatPaiseShort(amount)}</strong>
              </dd>
            </div>
          )
        })}
      </dl>
      <Meter
        label={`${title} ${usedLabel}`}
        value={value}
        max={max}
        color={over ? 'var(--danger)' : color.c}
        track={color.t}
      />
    </article>
  )
}

function Breakdown({
  title,
  type,
  rows,
  spent,
  allocated,
  warning,
}: {
  title: string
  type: BudgetType
  rows: CycleReport['categories']
  spent: number
  allocated: number
  warning: string | null
}) {
  const color = COLORS[type]
  return (
    <article className="card" aria-label={title}>
      <div className="card-head">
        <h2>{title}</h2>
        <span className={`spent-total t-${type.toLowerCase()}`}>{formatPaiseShort(spent)} spent</span>
      </div>
      {rows.length === 0 ? (
        <p className="muted">Nothing spent here in this cycle.</p>
      ) : (
        <ul className="breakdown">
          {rows.map((row) => (
            <li key={`${row.categoryId}-${row.type}`}>
              <div className="row">
                <span className="name">
                  {row.name}
                  {row.archived ? ' (archived)' : ''}{' '}
                  <small>
                    · {row.expenseCount} {row.expenseCount === 1 ? 'expense' : 'expenses'}
                  </small>
                </span>
                <strong>{formatPaiseShort(row.spentPaise)}</strong>
              </div>
              {/* Each category as a share of the bucket's allocation, so the bars add up to the plan. */}
              <Meter
                label={`${row.name} share of ${title}`}
                value={row.spentPaise}
                max={allocated}
                color={color.c}
                track={color.t}
              />
            </li>
          ))}
        </ul>
      )}
      {warning && (
        <p className="alert-soft breakdown-warning">
          <AlertIcon />
          {warning}
        </p>
      )}
    </article>
  )
}
