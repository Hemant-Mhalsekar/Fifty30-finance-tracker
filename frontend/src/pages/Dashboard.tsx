import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router'
import {
  ApiError,
  getCurrentReport,
  getReportForDate,
  listCategories,
  listExpenses,
  listRecurring,
  type BudgetLine,
  type Category,
  type CycleReport,
  type Expense,
  type Me,
  type RecurringExpense,
} from '../api'
import CycleSpendChart from '../components/CycleSpendChart'
import Donut from '../components/Donut'
import ExpenseRow from '../components/ExpenseRow'
import Meter from '../components/Meter'
import SalaryCheck from '../components/SalaryCheck'
import UpcomingRecurring from '../components/UpcomingRecurring'
import { AlertIcon, BagIcon, ChevronLeftIcon, ChevronRightIcon, HomeIcon, PiggyIcon } from '../components/icons'
import { addDays, formatRange, todayIst } from '../dates'
import { donutSlices, firstName, greeting, initial, paceStatus, percentOf } from '../display'
import { formatPaise, formatPaiseCompact, formatPaiseShort } from '../money'
import { incomeOf } from '../splits'

// Nudge only after a few quiet days; daily loggers should not see it.
const NUDGE_AFTER_DAYS = 3
const RECENT_SHOWN = 4

export default function Dashboard({ me }: { me: Me }) {
  // null = the current cycle; otherwise any date inside the cycle being viewed.
  const [viewDate, setViewDate] = useState<string | null>(null)
  const [report, setReport] = useState<CycleReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  // Bumped after a recurring expense is added, to reload the report without the loading state.
  const [reloads, setReloads] = useState(0)
  // The extras below are null until loaded; a failure just hides their card.
  const [recurring, setRecurring] = useState<RecurringExpense[] | null>(null)
  const [recent, setRecent] = useState<Expense[] | null>(null)
  const [categories, setCategories] = useState<Category[] | null>(null)

  useEffect(() => {
    let cancelled = false
    listRecurring()
      .then((items) => {
        if (!cancelled) setRecurring(items)
      })
      .catch(() => {})
    listCategories(true)
      .then((items) => {
        if (!cancelled) setCategories(items)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    listExpenses({ size: RECENT_SHOWN })
      .then((page) => {
        if (!cancelled) setRecent(page.items)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [reloads])

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

  const name = me.showName ? firstName(me.name) : null
  const title = `${greeting()}${name ? `, ${name}` : ''}`

  if (!report) {
    return (
      <section className="dashboard">
        <h1>{title}</h1>
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

  const { cycle } = report
  const isCurrent = cycle.periodEnd >= todayIst()

  return (
    <section className="dashboard" aria-busy={loading}>
      <header className="dash-head">
        <div className="titles">
          <h1>{title}</h1>
          <p className="hello">Your money, under control.</p>
        </div>
        <div className="tools">
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
              <small>{isCurrent ? `Day ${report.days.elapsed} of ${report.days.total}` : 'Past cycle'}</small>
            </span>
            <button
              type="button"
              aria-label="Next cycle"
              disabled={loading || isCurrent}
              onClick={() => goTo(addDays(cycle.periodEnd, 1))}
            >
              <ChevronRightIcon />
            </button>
          </div>
        </div>
        {/* Phones: top right, next to the greeting. Wide screens: after the cycle switch. */}
        <Link to="/settings" className="avatar" aria-label="Settings" title={me.email}>
          {initial(me.name, me.email)}
        </Link>
      </header>

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

      {isCurrent && !cycle.salaryConfirmed && (
        <SalaryCheck
          cycle={cycle}
          onAnswered={(changed) => {
            // Hide the question at once; a new salary also changes every number on the page.
            setReport((r) => (r ? { ...r, cycle: { ...r.cycle, salaryConfirmed: true } } : r))
            if (changed) setReloads((n) => n + 1)
          }}
        />
      )}

      <Warnings report={report} isCurrent={isCurrent} />

      <div className="dash-grid hero-row">
        <BudgetHero report={report} isCurrent={isCurrent} />
        <LeftToSpend report={report} isCurrent={isCurrent} />
      </div>

      <h2 className="section-title phone-only">
        {cycle.needsPct}/{cycle.wantsPct}/{cycle.savingsPct} breakdown
      </h2>
      <div className="dash-grid three">
        <SpendCard
          name="Needs"
          share={`${cycle.needsPct}% • Essentials`}
          icon={<HomeIcon />}
          kind="need"
          line={report.needs}
        />
        <SpendCard
          name="Wants"
          share={`${cycle.wantsPct}% • Lifestyle`}
          icon={<BagIcon />}
          kind="want"
          line={report.wants}
        />
        <SavingsCard report={report} isCurrent={isCurrent} />
      </div>

      <div className="dash-grid two">
        <div className="wide-only">
          <SpentVsPlan report={report} />
        </div>
        <CategoryCard report={report} isCurrent={isCurrent} />
      </div>

      <CycleSpendChart report={report} isCurrent={isCurrent} />

      <div className="dash-grid two">
        <RecentCard items={recent} categories={categories} />
        {isCurrent && recurring && (
          <UpcomingRecurring
            items={recurring}
            categories={categories ?? []}
            onUpdated={(updated) => setRecurring((all) => all?.map((r) => (r.id === updated.id ? updated : r)) ?? null)}
            onExpenseAdded={() => setReloads((n) => n + 1)}
          />
        )}
      </div>
    </section>
  )
}

function Warnings({ report, isCurrent }: { report: CycleReport; isCurrent: boolean }) {
  const messages: string[] = []
  if (report.spendingExceedsSalary) {
    messages.push(
      `You logged ${formatPaise(report.totalLoggedPaise)} this cycle, more than your income of ${formatPaise(incomeOf(report.cycle))}.`,
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

// The dark card: the salary for the cycle, how much of it needs and wants have used, and what is left.
function BudgetHero({ report, isCurrent }: { report: CycleReport; isCurrent: boolean }) {
  const { cycle, needs, wants, savings } = report
  const spent = needs.spentPaise + wants.spentPaise
  const income = incomeOf(cycle)
  const used = percentOf(spent, income)
  const size = 76
  const stroke = 7
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <article className="hero-card" aria-labelledby="hero-title">
      <div className="top">
        <div>
          <p className="label" id="hero-title">
            Pay cycle budget
          </p>
          <p className="amount">{formatPaiseShort(income)}</p>
          <p className="range">
            {formatRange(cycle.periodStart, cycle.periodEnd)} • {cycle.needsPct}/{cycle.wantsPct}/{cycle.savingsPct}{' '}
            split
          </p>
          {cycle.bonusPaise > 0 ? (
            <p className="range">
              Salary {formatPaiseShort(cycle.salaryPaise)} + bonus {formatPaiseShort(cycle.bonusPaise)}
            </p>
          ) : (
            isCurrent && (
              <Link to="/settings#bonus-title" className="hero-link">
                + Add a bonus
              </Link>
            )
          )}
        </div>
        <div className="ring" role="img" aria-label={`${used}% of income used on needs and wants`}>
          <svg width={size} height={size} aria-hidden="true">
            <circle className="track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} />
            <circle
              className={`value ${used > 100 ? 'over' : ''}`}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={c}
              strokeDashoffset={c * (1 - Math.min(used, 100) / 100)}
            />
          </svg>
          <span className="ring-label" aria-hidden="true">
            <strong>{used}%</strong>
            <small>used</small>
          </span>
        </div>
      </div>
      <div className="tiles">
        <div className="tile">
          <p className="label">Spent</p>
          <strong>{formatPaiseShort(spent)}</strong>
        </div>
        <div className="tile">
          <p className="label">{savings.deficit ? 'Over income' : isCurrent ? 'Left this cycle' : 'Unspent'}</p>
          <strong className={savings.deficit ? 'bad' : 'good'}>{formatPaiseShort(Math.abs(savings.savedPaise))}</strong>
        </div>
      </div>
    </article>
  )
}

function LeftToSpend({ report, isCurrent }: { report: CycleReport; isCurrent: boolean }) {
  const { needs, wants, days } = report
  const budget = needs.allocatedPaise + wants.allocatedPaise
  const left = needs.remainingPaise + wants.remainingPaise
  const spent = needs.spentPaise + wants.spentPaise
  const status = paceStatus(report, isCurrent)
  const daysLeft = days.remaining + 1
  // Whole rupees per day, rounded down so following it never overspends.
  const perDay = left > 0 ? Math.floor(left / daysLeft / 100) * 100 : 0
  const needsShare = budget > 0 ? Math.min(100, (needs.spentPaise / budget) * 100) : 0
  const wantsShare = budget > 0 ? Math.min(100 - needsShare, (wants.spentPaise / budget) * 100) : 0
  const spentPct = percentOf(spent, budget)

  return (
    <article className="card left-card" aria-labelledby="left-title">
      <div className="card-head">
        <div>
          <h2 id="left-title">{isCurrent ? 'Left to spend' : 'Left unspent'}</h2>
          <p>Remaining needs &amp; wants</p>
        </div>
        <span className={`pill ${status.tone}`}>{status.label}</span>
      </div>
      <div className="amount-row">
        <p className={`big ${left < 0 ? 'negative' : ''}`}>{formatPaiseShort(left)}</p>
        <span className="of">of {formatPaiseShort(budget)}</span>
      </div>
      {left < 0 && (
        <p className="negative">
          <AlertIcon /> Over your needs and wants plan by {formatPaise(-left)}
        </p>
      )}
      <div
        className="meter split"
        role="img"
        aria-label={`Needs ${formatPaiseShort(needs.spentPaise)} and wants ${formatPaiseShort(wants.spentPaise)} spent of ${formatPaiseShort(budget)}`}
      >
        <div className="meter-fill" style={{ width: `${needsShare}%`, '--c': 'var(--need)' } as CSSProperties} />
        <div className="meter-fill" style={{ width: `${wantsShare}%`, '--c': 'var(--want)' } as CSSProperties} />
      </div>
      <div className="meter-legend">
        <span>{spentPct}% spent</span>
        <span>{Math.max(0, 100 - spentPct)}% left</span>
      </div>
      <div className="stat-pair">
        {isCurrent ? (
          <>
            <div>
              <p className="label">Daily allowance</p>
              <strong>{left > 0 ? formatPaiseShort(perDay) : '₹0'}</strong>
            </div>
            <div>
              <p className="label">Days remaining</p>
              <strong>
                {daysLeft} {daysLeft === 1 ? 'day' : 'days'}
              </strong>
            </div>
          </>
        ) : (
          <>
            <div>
              <p className="label">Days in cycle</p>
              <strong>{days.total}</strong>
            </div>
            <div>
              <p className="label">Expenses logged</p>
              <strong>{report.expenseCount}</strong>
            </div>
          </>
        )}
      </div>
    </article>
  )
}

const KIND_COLORS = {
  need: { c: 'var(--need)', t: 'var(--need-soft)' },
  want: { c: 'var(--want)', t: 'var(--want-soft)' },
  save: { c: 'var(--save)', t: 'var(--save-soft)' },
}

function SpendCard({
  name,
  share,
  icon,
  kind,
  line,
}: {
  name: string
  share: string
  icon: ReactNode
  kind: 'need' | 'want'
  line: BudgetLine
}) {
  const used = percentOf(line.spentPaise, line.allocatedPaise)
  return (
    <article className="card bucket-card" aria-label={name}>
      <div className="head">
        <span className={`badge-icon ${kind}`}>{icon}</span>
        <div className="titles">
          <h3>{name}</h3>
          <small>{share}</small>
        </div>
        <span className={`pill ${line.overspent ? 'bad' : kind}`}>{used}%</span>
      </div>
      <div className="amount-row">
        <strong>{formatPaiseShort(line.spentPaise)}</strong>
        <span className="of muted">of {formatPaiseShort(line.allocatedPaise)}</span>
      </div>
      <Meter
        label={`${name} used`}
        value={line.spentPaise}
        max={line.allocatedPaise}
        color={line.overspent ? 'var(--danger)' : KIND_COLORS[kind].c}
        track={KIND_COLORS[kind].t}
      />
      {line.overspent ? (
        <p className="note over">
          <AlertIcon /> Over by {formatPaiseShort(-line.remainingPaise)}
        </p>
      ) : (
        <p className="note">{formatPaiseShort(line.remainingPaise)} remaining</p>
      )}
    </article>
  )
}

// Savings is what needs and wants have not used (salary - needs - wants), measured against the plan.
function SavingsCard({ report, isCurrent }: { report: CycleReport; isCurrent: boolean }) {
  const { savings } = report
  const pct = percentOf(Math.max(0, savings.savedPaise), savings.plannedPaise)
  const short = savings.plannedPaise - savings.savedPaise
  return (
    <article className="card bucket-card" aria-label="Savings">
      <div className="head">
        <span className="badge-icon save">
          <PiggyIcon />
        </span>
        <div className="titles">
          <h3>Savings</h3>
          <small>{report.cycle.savingsPct}% • Goal</small>
        </div>
        <span className={`pill ${savings.deficit ? 'bad' : pct >= 100 ? 'good' : 'save'}`}>
          {pct >= 100 ? 'On track' : `${pct}%`}
        </span>
      </div>
      <div className="amount-row">
        <strong className={savings.deficit ? 'negative' : 'save-text'}>
          {formatPaiseShort(savings.savedPaise)} <small>{isCurrent ? 'so far' : 'saved'}</small>
        </strong>
        <span className="of muted">of {formatPaiseShort(savings.plannedPaise)}</span>
      </div>
      <Meter
        label="Savings goal reached"
        value={Math.max(0, savings.savedPaise)}
        max={savings.plannedPaise}
        color="var(--save)"
        track={KIND_COLORS.save.t}
      />
      <p className={`note ${savings.deficit ? 'over' : ''}`}>
        {savings.deficit
          ? `Deficit of ${formatPaiseShort(-savings.savedPaise)}`
          : short > 0
            ? `${formatPaiseShort(short)} short of the goal`
            : isCurrent
              ? 'If you stop spending now'
              : 'Goal reached'}
        {!savings.deficit && savings.investedPaise > 0 && ` • ${formatPaiseShort(savings.investedPaise)} invested`}
      </p>
    </article>
  )
}

// Planned vs actual columns for each bucket, scaled together. Values are always printed below.
function SpentVsPlan({ report }: { report: CycleReport }) {
  const { needs, wants, savings } = report
  const groups = [
    {
      name: 'Needs',
      plan: needs.allocatedPaise,
      actual: needs.spentPaise,
      color: 'var(--need)',
      over: needs.overspent,
    },
    {
      name: 'Wants',
      plan: wants.allocatedPaise,
      actual: wants.spentPaise,
      color: 'var(--want)',
      over: wants.overspent,
    },
    {
      name: 'Savings',
      plan: savings.plannedPaise,
      actual: Math.max(0, savings.savedPaise),
      color: 'var(--save)',
      over: false,
    },
  ]
  // Saved-so-far can be far above its plan early in a cycle; cap the drawing so needs and wants stay readable.
  const max = Math.max(1, ...groups.map((g) => Math.max(g.plan, Math.min(g.actual, g.plan * 1.5))))
  const h = (v: number) => `${Math.max(2, (Math.min(v, max) / max) * 100)}%`
  return (
    <article className="card" aria-labelledby="plan-title">
      <div className="card-head">
        <div>
          <h2 id="plan-title">Spent vs Plan</h2>
          <p>Planned vs actual this cycle</p>
        </div>
        <ul className="mini-legend" aria-hidden="true">
          <li>
            <span className="swatch" style={{ '--c': 'var(--surface-3)' } as CSSProperties} />
            Planned
          </li>
          <li>
            <span className="swatch" style={{ '--c': 'var(--text)' } as CSSProperties} />
            Actual
          </li>
        </ul>
      </div>
      <div className="plan-columns">
        {groups.map((g) => (
          <div className="plan-group" key={g.name}>
            <div className="plan-bars" aria-hidden="true">
              <span className="planned" style={{ height: h(g.plan) }} />
              <span
                className={`actual ${g.over ? 'over' : ''}`}
                style={{ height: h(g.actual), '--c': g.color } as CSSProperties}
              />
            </div>
            <span className="name">{g.name}</span>
            <span className={`vals ${g.over ? 'over' : ''}`}>
              <span className="visually-hidden">Actual </span>
              {formatPaiseCompact(g.actual)}
              <span aria-hidden="true"> / </span>
              <span className="visually-hidden"> of planned </span>
              {formatPaiseCompact(g.plan)}
            </span>
          </div>
        ))}
      </div>
    </article>
  )
}

function CategoryCard({ report, isCurrent }: { report: CycleReport; isCurrent: boolean }) {
  const slices = donutSlices(report.categories)
  const total = slices.reduce((sum, s) => sum + s.spentPaise, 0)
  const count = new Set(report.categories.filter((c) => c.type !== 'INVESTMENT').map((c) => c.categoryId)).size
  return (
    <article className="card" aria-labelledby="category-title">
      <div className="card-head">
        <div>
          <h2 id="category-title">Spending by category</h2>
          {total > 0 && (
            <p>
              {formatPaiseShort(total)} across {count} {count === 1 ? 'category' : 'categories'}
            </p>
          )}
        </div>
      </div>
      {total === 0 ? (
        <p className="empty">
          {isCurrent ? 'No expenses in this cycle yet.' : 'No expenses in this cycle.'}{' '}
          {isCurrent && <Link to="/add">Add one</Link>}
        </p>
      ) : (
        <div className="donut-layout">
          <Donut slices={slices.map((s) => ({ key: s.key, value: s.spentPaise, color: s.color }))}>
            <small>Spent</small>
            <strong>{formatPaiseCompact(total)}</strong>
          </Donut>
          <ul className="donut-legend">
            {slices.map((s) => (
              <li key={s.key}>
                <span className="dot" style={{ '--c': s.color } as CSSProperties} aria-hidden="true" />
                <span className="name">{s.name}</span>
                <span className="value">{formatPaiseShort(s.spentPaise)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  )
}

function RecentCard({ items, categories }: { items: Expense[] | null; categories: Category[] | null }) {
  if (!items) return null
  const byId = new Map((categories ?? []).map((c) => [c.id, c]))
  return (
    <article className="card" aria-labelledby="recent-title">
      <div className="card-head">
        <h2 id="recent-title">Recent transactions</h2>
        <Link to="/expenses">View all</Link>
      </div>
      {items.length === 0 ? (
        <p className="empty">
          Nothing logged yet. <Link to="/add">Add your first expense</Link>
        </p>
      ) : (
        <ul className="tx-list">
          {items.map((e) => (
            <li key={e.id}>
              <ExpenseRow expense={e} category={byId.get(e.categoryId)} />
            </li>
          ))}
        </ul>
      )}
    </article>
  )
}
