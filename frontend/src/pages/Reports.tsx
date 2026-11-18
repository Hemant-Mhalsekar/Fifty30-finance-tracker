import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { getAllCycles, getWeekly, type CycleHistoryItem, type WeeklyData } from '../api'
import ColumnChart from '../components/ColumnChart'
import { formatDate, formatRange, todayIst } from '../dates'
import { formatPaiseCompact, formatPaiseShort } from '../money'
import { savingsSummary, weekRows, yearRows } from '../reports'
import { incomeOf } from '../splits'

type View = 'weekly' | 'yearly' | 'savings'
const VIEWS: { value: View; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'savings', label: 'Savings' },
]
const WEEKS = 8
// Module-level so the loader passed to useLoad never changes between renders.
const loadWeekly = () => getWeekly(WEEKS)

const DAY_MONTH = new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short' })
const shortDate = (iso: string) => DAY_MONTH.format(new Date(`${iso}T00:00:00Z`))

export default function Reports({ openingBalancePaise }: { openingBalancePaise: number | null }) {
  // The view lives in the address, so a reload or a shared link keeps it.
  const [params, setParams] = useSearchParams()
  const fromAddress = params.get('view')
  // Local state answers the tap at once; the address update can land a moment later.
  const [view, setView] = useState<View>(VIEWS.some((v) => v.value === fromAddress) ? (fromAddress as View) : 'weekly')

  return (
    <section className="reports">
      <div className="page-head">
        <div>
          <h1>Reports</h1>
          <p className="sub">Weekly and yearly spending, and what you have saved over time</p>
        </div>
      </div>
      <fieldset className="field report-switch">
        <legend className="visually-hidden">Report</legend>
        <div className="segmented">
          {VIEWS.map((v) => (
            <label key={v.value}>
              <input
                type="radio"
                name="report-view"
                value={v.value}
                checked={view === v.value}
                onChange={() => {
                  setView(v.value)
                  setParams({ view: v.value }, { replace: true })
                }}
              />
              {v.label}
            </label>
          ))}
        </div>
      </fieldset>
      {view === 'weekly' ? <WeeklyReport /> : <CycleReports view={view} openingPaise={openingBalancePaise ?? 0} />}
    </section>
  )
}

function useLoad<T>(load: () => Promise<T>): { data: T | null; error: string | null } {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    load()
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Something went wrong')
      })
    return () => {
      cancelled = true
    }
  }, [load])
  return { data, error }
}

function Status({ error }: { error: string | null }) {
  return error ? (
    <p className="error" role="alert">
      {error}
    </p>
  ) : (
    <p className="muted">Loading…</p>
  )
}

function Tile({ label, value, note, negative }: { label: string; value: string; note?: string; negative?: boolean }) {
  return (
    <div className="card stat-tile">
      <p className="label">{label}</p>
      <p className={negative ? 'big negative' : 'big'}>{value}</p>
      {note && <p className="muted">{note}</p>}
    </div>
  )
}

function WeeklyReport() {
  const { data, error } = useLoad<WeeklyData>(loadWeekly)
  if (!data) return <Status error={error} />

  const rows = weekRows(data)
  const thisWeek = rows.find((r) => r.current)
  // Weeks before the first cycle have no plan and would drag the average down with zeros.
  const past = rows.filter((r) => !r.current && r.planPaise > 0)
  const average = past.length > 0 ? past.reduce((t, r) => t + r.needsPaise + r.wantsPaise, 0) / past.length : null
  const spent = (r: (typeof rows)[number]) => r.needsPaise + r.wantsPaise

  return (
    <>
      <div className="stat-tiles">
        {thisWeek && (
          <Tile
            label="This week so far"
            value={formatPaiseShort(spent(thisWeek))}
            note={`Plan for the week ${formatPaiseShort(thisWeek.planPaise)}`}
            negative={spent(thisWeek) > thisWeek.planPaise && thisWeek.planPaise > 0}
          />
        )}
        {average !== null && (
          <Tile
            label={past.length === 1 ? 'Last week' : `Average of the last ${past.length} weeks`}
            value={formatPaiseShort(Math.round(average / 100) * 100)}
            note="Needs and wants"
          />
        )}
      </div>
      <ColumnChart
        title="Spending by week"
        subtitle="Monday to Sunday"
        legend={[
          { name: 'Needs', color: 'var(--need)' },
          { name: 'Wants', color: 'var(--want)' },
          { name: 'Weekly plan', color: 'var(--text)', marker: true },
        ]}
        columns={rows.map((r) => ({
          key: r.start,
          label: shortDate(r.start),
          strong: r.current,
          segments: [
            { key: 'needs', value: r.needsPaise, color: 'var(--need)' },
            { key: 'wants', value: r.wantsPaise, color: 'var(--want)' },
          ],
          plan: r.planPaise > 0 ? r.planPaise : undefined,
          topLabel: formatPaiseCompact(spent(r)),
          topNegative: r.planPaise > 0 && spent(r) > r.planPaise,
          ariaLabel: `Week of ${formatDate(r.start)}${r.current ? ' (this week so far)' : ''}: needs ${formatPaiseShort(r.needsPaise)}, wants ${formatPaiseShort(r.wantsPaise)}, plan ${formatPaiseShort(r.planPaise)}`,
          tooltip: {
            title: `${formatRange(r.start, r.end)}${r.current ? ' (so far)' : ''}`,
            lines: [
              `Needs ${formatPaiseShort(r.needsPaise)}`,
              `Wants ${formatPaiseShort(r.wantsPaise)}`,
              `Plan ${formatPaiseShort(r.planPaise)}`,
              ...(r.investedPaise > 0 ? [`Invested ${formatPaiseShort(r.investedPaise)}`] : []),
            ],
          },
        }))}
        table={{
          columns: ['Week', 'Needs', 'Wants', 'Plan', 'Invested'],
          rows: rows.map((r) => [
            formatRange(r.start, r.end),
            formatPaiseShort(r.needsPaise),
            formatPaiseShort(r.wantsPaise),
            formatPaiseShort(r.planPaise),
            formatPaiseShort(r.investedPaise),
          ]),
        }}
      >
        <p className="hint chart-note">
          The plan is your needs and wants budget spread evenly over each day of the cycle. Investments are savings, so
          they are not counted as spending.
        </p>
      </ColumnChart>
    </>
  )
}

function CycleReports({ view, openingPaise }: { view: 'yearly' | 'savings'; openingPaise: number }) {
  const { data, error } = useLoad<CycleHistoryItem[]>(getAllCycles)
  if (!data) return <Status error={error} />
  return view === 'yearly' ? <YearlyReport items={data} /> : <SavingsReport items={data} openingPaise={openingPaise} />
}

function YearlyReport({ items }: { items: CycleHistoryItem[] }) {
  const rows = yearRows(items)
  const thisYear = Number(todayIst().slice(0, 4))
  return (
    <>
      <div className="stat-tiles">
        {rows
          .filter((r) => r.year === thisYear)
          .map((r) => (
            <Tile
              key={r.year}
              label={`${r.year} so far`}
              value={formatPaiseShort(r.savedPaise)}
              note={`Saved from ${formatPaiseShort(r.incomePaise)} over ${r.cycles} ${r.cycles === 1 ? 'cycle' : 'cycles'}`}
              negative={r.savedPaise < 0}
            />
          ))}
      </div>
      <ColumnChart
        title="By year"
        subtitle="Cycles count in the year they start"
        legend={[
          { name: 'Needs', color: 'var(--need)' },
          { name: 'Wants', color: 'var(--want)' },
          { name: 'Saved', color: 'var(--save)' },
        ]}
        columns={rows.map((r) => ({
          key: String(r.year),
          label: String(r.year),
          strong: r.year === thisYear,
          segments: [
            { key: 'needs', value: r.needsPaise, color: 'var(--need)' },
            { key: 'wants', value: r.wantsPaise, color: 'var(--want)' },
            { key: 'saved', value: Math.max(0, r.savedPaise), color: 'var(--save)' },
          ],
          topLabel: formatPaiseCompact(r.savedPaise),
          topNegative: r.savedPaise < 0,
          ariaLabel: `${r.year}: income ${formatPaiseShort(r.incomePaise)}, needs ${formatPaiseShort(r.needsPaise)}, wants ${formatPaiseShort(r.wantsPaise)}, saved ${formatPaiseShort(r.savedPaise)}`,
          tooltip: {
            title: `${r.year} · ${r.cycles} ${r.cycles === 1 ? 'cycle' : 'cycles'}`,
            lines: [
              `Income ${formatPaiseShort(r.incomePaise)}`,
              `Needs ${formatPaiseShort(r.needsPaise)}`,
              `Wants ${formatPaiseShort(r.wantsPaise)}`,
              `Saved ${formatPaiseShort(r.savedPaise)}`,
              ...(r.investedPaise > 0 ? [`Invested ${formatPaiseShort(r.investedPaise)}`] : []),
            ],
          },
        }))}
        table={{
          columns: ['Year', 'Cycles', 'Income', 'Needs', 'Wants', 'Saved', 'Invested'],
          rows: rows.map((r) => [
            String(r.year),
            String(r.cycles),
            formatPaiseShort(r.incomePaise),
            formatPaiseShort(r.needsPaise),
            formatPaiseShort(r.wantsPaise),
            formatPaiseShort(r.savedPaise),
            formatPaiseShort(r.investedPaise),
          ]),
        }}
      />
    </>
  )
}

function SavingsReport({ items, openingPaise }: { items: CycleHistoryItem[]; openingPaise: number }) {
  const summary = savingsSummary(items, todayIst(), openingPaise)
  const { rows, current } = summary
  const average = rows.length > 0 ? summary.totalSavedPaise / rows.length : null

  return (
    <>
      <div className="stat-tiles">
        {openingPaise > 0 && (
          <Tile
            label="Total savings"
            value={formatPaiseShort(summary.totalWithOpeningPaise)}
            note={`Your opening balance of ${formatPaiseShort(openingPaise)} plus what finished cycles saved`}
            negative={summary.totalWithOpeningPaise < 0}
          />
        )}
        <Tile
          label="Saved in finished cycles"
          value={formatPaiseShort(summary.totalSavedPaise)}
          note={
            rows.length === 0
              ? 'Shows up once a cycle with expenses has ended'
              : `Over ${rows.length} ${rows.length === 1 ? 'cycle' : 'cycles'}`
          }
          negative={summary.totalSavedPaise < 0}
        />
        {average !== null && (
          <Tile
            label="Average per cycle"
            value={formatPaiseShort(Math.round(average / 100) * 100)}
            negative={average < 0}
          />
        )}
        <Tile label="Of which invested" value={formatPaiseShort(summary.totalInvestedPaise)} />
        {current && (
          <Tile
            label="This cycle so far"
            value={formatPaiseShort(current.savedPaise)}
            note="If you stop spending now; not in the total yet"
            negative={current.savedPaise < 0}
          />
        )}
      </div>
      <ColumnChart
        title="Saved per cycle"
        subtitle={
          rows.length > 0
            ? `Running total ${formatPaiseShort(summary.totalWithOpeningPaise)}${openingPaise > 0 ? ' with your opening balance' : ''}`
            : undefined
        }
        emptyText="No finished cycles with expenses yet. Your first one appears here after the current cycle ends."
        legend={[
          { name: 'Saved', color: 'var(--save)' },
          { name: 'Deficit', color: 'var(--danger)' },
        ]}
        columns={rows.map(({ item, runningPaise }) => ({
          key: item.cycle.periodStart,
          label: shortDate(item.cycle.periodStart),
          segments: [
            {
              key: 'saved',
              value: item.savedPaise,
              color: item.savedPaise < 0 ? 'var(--danger)' : 'var(--save)',
            },
          ],
          topLabel: formatPaiseCompact(item.savedPaise),
          topNegative: item.savedPaise < 0,
          ariaLabel: `${formatRange(item.cycle.periodStart, item.cycle.periodEnd)}: ${item.savedPaise < 0 ? 'deficit' : 'saved'} ${formatPaiseShort(Math.abs(item.savedPaise))}, running total ${formatPaiseShort(runningPaise)}`,
          tooltip: {
            title: formatRange(item.cycle.periodStart, item.cycle.periodEnd),
            lines: [
              `${item.savedPaise < 0 ? 'Deficit' : 'Saved'} ${formatPaiseShort(Math.abs(item.savedPaise))}`,
              `Running total ${formatPaiseShort(runningPaise)}`,
              ...(item.investedPaise > 0 ? [`Invested ${formatPaiseShort(item.investedPaise)}`] : []),
            ],
          },
        }))}
        table={{
          columns: ['Cycle', 'Income', 'Saved', 'Invested', 'Running total'],
          rows: rows.map(({ item, runningPaise }) => [
            formatRange(item.cycle.periodStart, item.cycle.periodEnd),
            formatPaiseShort(incomeOf(item.cycle)),
            formatPaiseShort(item.savedPaise),
            formatPaiseShort(item.investedPaise),
            formatPaiseShort(runningPaise),
          ]),
        }}
      >
        {summary.skipped > 0 && (
          <p className="hint chart-note">
            {summary.skipped} finished {summary.skipped === 1 ? 'cycle has' : 'cycles have'} no expenses logged, so{' '}
            {summary.skipped === 1 ? 'it is' : 'they are'} left out instead of counting the whole salary as saved.
          </p>
        )}
      </ColumnChart>
    </>
  )
}
