import { useEffect, useState, type CSSProperties } from 'react'
import { Link } from 'react-router'
import {
  ApiError,
  getCurrentReport,
  getHistory,
  getReportForDate,
  listRecurring,
  type BudgetLine,
  type CycleHistoryItem,
  type CycleReport,
  type RecurringExpense,
} from '../api'
import BarChart, { type BarRow } from '../components/BarChart'
import CycleSpendChart from '../components/CycleSpendChart'
import DueRecurring from '../components/DueRecurring'
import HistoryChart from '../components/HistoryChart'
import { AlertIcon, ChevronLeftIcon, ChevronRightIcon } from '../components/icons'
import { addDays, formatRange, todayIst } from '../dates'
import { TYPE_COLORS, TYPE_LABELS } from '../labels'
import { formatPaise, formatPaiseShort } from '../money'

// Nudge only after a few quiet days; daily loggers should not see it.
const NUDGE_AFTER_DAYS = 3

export default function Dashboard() {
  // null = the current cycle; otherwise any date inside the cycle being viewed.
  const [viewDate, setViewDate] = useState<string | null>(null)
  const [report, setReport] = useState<CycleReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  // Bumped after a recurring expense is added, to reload the report without the loading state.
  const [reloads, setReloads] = useState(0)
  // null until loaded; a failure just hides the due list, the dashboard still works.
  const [recurring, setRecurring] = useState<RecurringExpense[] | null>(null)
  // The viewed cycle and the five before it. A failure just hides the chart.
  const [history, setHistory] = useState<CycleHistoryItem[] | null>(null)

  useEffect(() => {
    let cancelled = false
    getHistory(viewDate ?? undefined)
      .then((items) => {
        if (!cancelled) setHistory(items)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [viewDate, reloads])

  useEffect(() => {
    let cancelled = false
    listRecurring()
      .then((items) => {
        if (!cancelled) setRecurring(items)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

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
        // Asking for the cycle before the first one: keep showing the report already on screen.
        if (e instanceof ApiError && e.status === 404) {
          setNotice('There is no earlier cycle.')
          return
        }
        setError(e instanceof Error ? e.message : 'Something went wrong')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [viewDate, reloads])

  // Loading state is set here, in the event, rather than in the effect that fetches.
  function goTo(date: string) {
    // The same date would not re-run the effect, leaving the page stuck on loading.
    if (date === viewDate) return
    setLoading(true)
    setNotice(null)
    setViewDate(date)
  }

  if (error && !report) {
    return (
      <section>
        <h1>Dashboard</h1>
        <p className="error" role="alert">
          {error}
        </p>
      </section>
    )
  }

  if (!report) {
    return (
      <section>
        <h1>Dashboard</h1>
        <p className="muted">Loading…</p>
      </section>
    )
  }

  const { cycle, days, needs, wants } = report
  const isCurrent = cycle.periodEnd >= todayIst()
  const left = needs.remainingPaise + wants.remainingPaise

  return (
    <section className="dashboard" aria-busy={loading}>
      <div className="cycle-header">
        <div>
          <h1>{formatRange(cycle.periodStart, cycle.periodEnd)}</h1>
          <p className="muted">
            {isCurrent ? `Day ${days.elapsed} of ${days.total}` : 'Past cycle'} · Salary{' '}
            <span className="num">{formatPaiseShort(cycle.salaryPaise)}</span>
          </p>
        </div>
        <div className="cycle-nav">
          <button
            type="button"
            className="secondary icon"
            aria-label="Previous cycle"
            disabled={loading || notice !== null}
            onClick={() => goTo(addDays(cycle.periodStart, -1))}
          >
            <ChevronLeftIcon />
          </button>
          <button
            type="button"
            className="secondary icon"
            aria-label="Next cycle"
            disabled={loading || isCurrent}
            onClick={() => goTo(addDays(cycle.periodEnd, 1))}
          >
            <ChevronRightIcon />
          </button>
        </div>
      </div>

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

      {/* Phone: due list above the hero. Wide: side by side, hero first. */}
      <div className="dash-top">
        {isCurrent && recurring && (
          <DueRecurring
            items={recurring}
            onUpdated={(updated) => setRecurring((all) => all?.map((r) => (r.id === updated.id ? updated : r)) ?? null)}
            onExpenseAdded={() => setReloads((n) => n + 1)}
          />
        )}
        <Hero left={left} isCurrent={isCurrent} daysLeftIncludingToday={days.remaining + 1} />
      </div>

      <Warnings report={report} isCurrent={isCurrent} />

      {/* Phone: one compact card. Wide screens show the same numbers as the "Spent vs plan" chart. */}
      <BudgetSummary report={report} isCurrent={isCurrent} />

      <div className="charts">
        <div className="wide-only">
          <PlanChart report={report} isCurrent={isCurrent} />
        </div>
        <CategoryChart report={report} isCurrent={isCurrent} />
      </div>

      <div className="charts charts-history">
        <CycleSpendChart report={report} isCurrent={isCurrent} />
        {history && history.length > 0 && <HistoryChart items={history} currentStart={cycle.periodStart} />}
      </div>
    </section>
  )
}

function Hero({ left, isCurrent, daysLeftIncludingToday }: { left: number; isCurrent: boolean; daysLeftIncludingToday: number }) {
  // Whole rupees per day, rounded down so following it never overspends.
  const perDay = Math.floor(left / daysLeftIncludingToday / 100) * 100
  return (
    <article className="card hero">
      <p className="label">{isCurrent ? 'Left to spend on needs and wants' : 'Left unspent on needs and wants'}</p>
      <p className={`big ${left < 0 ? 'negative' : ''}`}>{formatPaiseShort(left)}</p>
      {left < 0 ? (
        <p className="sub negative">
          <AlertIcon /> Over your needs and wants plan by {formatPaise(-left)}
        </p>
      ) : (
        isCurrent && (
          <p className="sub">
            About <strong className="num">{formatPaiseShort(perDay)}</strong> a day for the next {daysLeftIncludingToday}{' '}
            {daysLeftIncludingToday === 1 ? 'day' : 'days'}
          </p>
        )
      )}
    </article>
  )
}

function Warnings({ report, isCurrent }: { report: CycleReport; isCurrent: boolean }) {
  const messages: string[] = []
  if (report.spendingExceedsSalary) {
    messages.push(
      `You logged ${formatPaise(report.totalLoggedPaise)} this cycle, more than your salary of ${formatPaise(report.cycle.salaryPaise)}.`,
    )
  }
  if (report.savings.deficit) {
    messages.push(`Needs and wants are ${formatPaise(-report.savings.savedPaise)} over your salary.`)
  }
  if (isCurrent) {
    if (report.daysSinceLastExpenseLogged === null) {
      messages.push('No expenses logged yet.')
    } else if (report.daysSinceLastExpenseLogged >= NUDGE_AFTER_DAYS) {
      messages.push(`Your last expense was logged ${report.daysSinceLastExpenseLogged} days ago.`)
    }
  }
  if (messages.length === 0) return null

  return (
    <ul className="warnings">
      {messages.map((m) => (
        <li key={m}>
          <AlertIcon />
          <span>
            {m}
            {m === 'No expenses logged yet.' && (
              <>
                {' '}
                <Link to="/add">Add one</Link>
              </>
            )}
          </span>
        </li>
      ))}
    </ul>
  )
}

// Phone: needs, wants and savings as three rows in one card instead of three big cards.
function BudgetSummary({ report, isCurrent }: { report: CycleReport; isCurrent: boolean }) {
  const { needs, wants, savings } = report
  return (
    <article className="card budget-card phone-only" aria-labelledby="budget-title">
      <h2 id="budget-title">This cycle</h2>
      <ul className="budget-rows">
        <BudgetRow name="Needs" color={TYPE_COLORS.NEED} line={needs} />
        <BudgetRow name="Wants" color={TYPE_COLORS.WANT} line={wants} />
        <li className={`budget-row ${savings.deficit ? 'over' : ''}`}>
          <div className="budget-line">
            <span className="budget-name">
              <span className="dot" style={{ '--c': 'var(--save)' } as CSSProperties} aria-hidden="true" />
              Savings
            </span>
            <span className="budget-amount">
              <strong className={savings.deficit ? 'negative' : ''}>{formatPaiseShort(savings.savedPaise)}</strong>
              <span className="muted"> of {formatPaiseShort(savings.plannedPaise)}</span>
            </span>
          </div>
          <Meter name="Savings" value={savings.savedPaise} max={savings.plannedPaise} color="var(--save)" />
          <p className="budget-note">
            {savings.deficit ? (
              <span className="negative">
                <AlertIcon /> Deficit of {formatPaiseShort(-savings.savedPaise)}
              </span>
            ) : (
              <span className="muted">
                {isCurrent ? 'If you stop spending now' : 'Saved this cycle'}
                {savings.investedPaise > 0 && ` · ${formatPaiseShort(savings.investedPaise)} invested`}
              </span>
            )}
          </p>
        </li>
      </ul>
    </article>
  )
}

function BudgetRow({ name, color, line }: { name: string; color: string; line: BudgetLine }) {
  return (
    <li className={`budget-row ${line.overspent ? 'over' : ''}`}>
      <div className="budget-line">
        <span className="budget-name">
          <span className="dot" style={{ '--c': color } as CSSProperties} aria-hidden="true" />
          {name}
        </span>
        <span className="budget-amount">
          <strong>{formatPaiseShort(line.spentPaise)}</strong>
          <span className="muted"> of {formatPaiseShort(line.allocatedPaise)}</span>
        </span>
      </div>
      <Meter name={name} value={line.spentPaise} max={line.allocatedPaise} color={color} />
      <p className="budget-note">
        {line.overspent ? (
          <span className="negative">
            <AlertIcon /> Over by {formatPaiseShort(-line.remainingPaise)}
          </span>
        ) : (
          <span className="muted">{formatPaiseShort(line.remainingPaise)} left</span>
        )}
      </p>
    </li>
  )
}

function Meter({ name, value, max, color }: { name: string; value: number; max: number; color: string }) {
  const used = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 100
  return (
    <div
      className="bar"
      role="progressbar"
      aria-label={`${name} used`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(used)}
    >
      <div className="bar-fill" style={{ width: `${used}%`, '--c': color } as CSSProperties} />
    </div>
  )
}

function percent(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : '–'
}

function PlanChart({ report, isCurrent }: { report: CycleReport; isCurrent: boolean }) {
  const { needs, wants, savings } = report
  // Each row is drawn as a share of its own plan, so the plan line sits at the same place on every
  // row. In rupees, a large "saved so far" would squash the needs and wants bars into slivers.
  const share = (actual: number, plan: number) => (plan > 0 ? (actual / plan) * 100 : 0)
  const spendRow = (key: string, name: string, color: string, line: BudgetLine): BarRow => ({
    key,
    name,
    color,
    value: share(line.spentPaise, line.allocatedPaise),
    plan: 100,
    valueLabel: `${formatPaiseShort(line.spentPaise)} of ${formatPaiseShort(line.allocatedPaise)}`,
    note: line.overspent ? (
      <span className="negative">
        <AlertIcon /> Over by {formatPaise(-line.remainingPaise)}
      </span>
    ) : (
      `${formatPaise(line.remainingPaise)} left`
    ),
    details: [`${percent(line.spentPaise, line.allocatedPaise)} of plan used`],
  })
  const rows: BarRow[] = [
    spendRow('needs', 'Needs', TYPE_COLORS.NEED, needs),
    spendRow('wants', 'Wants', TYPE_COLORS.WANT, wants),
    {
      key: 'savings',
      name: 'Savings',
      color: 'var(--save)',
      value: share(savings.savedPaise, savings.plannedPaise),
      plan: 100,
      valueLabel: `${formatPaiseShort(savings.savedPaise)} of ${formatPaiseShort(savings.plannedPaise)}`,
      note: savings.deficit ? (
        <span className="negative">
          <AlertIcon /> Deficit of {formatPaise(-savings.savedPaise)}
        </span>
      ) : (
        `${isCurrent ? 'If you stop spending now' : 'Saved'} · invested ${formatPaise(savings.investedPaise)}`
      ),
      details: [`${percent(savings.savedPaise, savings.plannedPaise)} of the savings plan`],
    },
  ]
  return (
    <BarChart
      title="Spent vs plan"
      subtitle="Share of each plan"
      rows={rows}
      scaleMax={150}
      legend={[{ name: 'Plan (100%)', color: 'var(--text)', marker: true }]}
      table={{
        columns: ['', 'Actual', 'Plan', 'Used'],
        rows: [
          ['Needs', formatPaise(needs.spentPaise), formatPaise(needs.allocatedPaise), percent(needs.spentPaise, needs.allocatedPaise)],
          ['Wants', formatPaise(wants.spentPaise), formatPaise(wants.allocatedPaise), percent(wants.spentPaise, wants.allocatedPaise)],
          ['Savings', formatPaise(savings.savedPaise), formatPaise(savings.plannedPaise), percent(savings.savedPaise, savings.plannedPaise)],
        ],
      }}
    />
  )
}

function CategoryChart({ report, isCurrent }: { report: CycleReport; isCurrent: boolean }) {
  const total = report.categories.reduce((sum, row) => sum + row.spentPaise, 0)
  const rows: BarRow[] = report.categories.map((row) => ({
    key: `${row.categoryId}-${row.type}`,
    name: row.name + (row.archived ? ' (archived)' : ''),
    color: TYPE_COLORS[row.type],
    value: row.spentPaise,
    valueLabel: formatPaiseShort(row.spentPaise),
    details: [
      `${TYPE_LABELS[row.type]} · ${percent(row.spentPaise, total)} of spending`,
      `${row.expenseCount} ${row.expenseCount === 1 ? 'expense' : 'expenses'}`,
    ],
  }))
  // Legend only for the types that actually appear, in a fixed order.
  const types = (['NEED', 'WANT', 'INVESTMENT'] as const).filter((t) => report.categories.some((c) => c.type === t))
  return (
    <BarChart
      title="By category"
      subtitle={total > 0 ? `${formatPaiseShort(total)} total` : undefined}
      rows={rows}
      legend={types.length > 1 ? types.map((t) => ({ name: TYPE_LABELS[t], color: TYPE_COLORS[t] })) : undefined}
      emptyText={isCurrent ? 'No expenses in this cycle yet.' : 'No expenses in this cycle.'}
      table={{
        columns: ['Category', 'Type', 'Spent', 'Share'],
        rows: report.categories.map((row) => [
          row.name,
          TYPE_LABELS[row.type],
          formatPaise(row.spentPaise),
          percent(row.spentPaise, total),
        ]),
      }}
    />
  )
}
