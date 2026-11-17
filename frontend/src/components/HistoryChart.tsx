import type { CycleHistoryItem } from '../api'
import { formatRange } from '../dates'
import { formatPaiseCompact, formatPaiseShort } from '../money'
import ColumnChart from './ColumnChart'

const DAY_MONTH = new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short' })
const shortDate = (iso: string) => DAY_MONTH.format(new Date(`${iso}T00:00:00Z`))

type Props = {
  items: CycleHistoryItem[]
  // The cycle being viewed on the dashboard, drawn with a bold label.
  currentStart: string
}

/**
 * One column per cycle: needs, wants and what was left (saved) stacked up to that cycle's salary.
 * A rule across each column marks the needs + wants plan (80% of the salary), so a column whose
 * wants reach above it overspent. A deficit shows as needs + wants taller than the salary.
 */
export default function HistoryChart({ items, currentStart }: Props) {
  const savedText = (item: CycleHistoryItem) =>
    item.savedPaise < 0 ? `Deficit ${formatPaiseShort(-item.savedPaise)}` : `Saved ${formatPaiseShort(item.savedPaise)}`

  return (
    <ColumnChart
      title="Past cycles"
      subtitle={items.length === 1 ? 'This cycle' : `Last ${items.length} cycles`}
      legend={[
        { name: 'Needs', color: 'var(--need)' },
        { name: 'Wants', color: 'var(--want)' },
        { name: 'Saved', color: 'var(--save)' },
        { name: 'Needs + wants plan', color: 'var(--text)', marker: true },
      ]}
      columns={items.map((item) => ({
        key: item.cycle.periodStart,
        label: shortDate(item.cycle.periodStart),
        strong: item.cycle.periodStart === currentStart,
        segments: [
          { key: 'needs', value: item.needsSpentPaise, color: 'var(--need)' },
          { key: 'wants', value: item.wantsSpentPaise, color: 'var(--want)' },
          { key: 'saved', value: Math.max(0, item.savedPaise), color: 'var(--save)' },
        ],
        plan: item.cycle.needsPaise + item.cycle.wantsPaise,
        topLabel: formatPaiseCompact(item.savedPaise),
        topNegative: item.savedPaise < 0,
        ariaLabel: `${formatRange(item.cycle.periodStart, item.cycle.periodEnd)}: needs ${formatPaiseShort(item.needsSpentPaise)}, wants ${formatPaiseShort(item.wantsSpentPaise)}, ${savedText(item).toLowerCase()} of salary ${formatPaiseShort(item.cycle.salaryPaise)}`,
        tooltip: {
          title: formatRange(item.cycle.periodStart, item.cycle.periodEnd),
          lines: [
            `Salary ${formatPaiseShort(item.cycle.salaryPaise)}`,
            `Needs ${formatPaiseShort(item.needsSpentPaise)}`,
            `Wants ${formatPaiseShort(item.wantsSpentPaise)}`,
            savedText(item),
            ...(item.investedPaise > 0 ? [`Invested ${formatPaiseShort(item.investedPaise)}`] : []),
          ],
        },
      }))}
      table={{
        columns: ['Cycle', 'Salary', 'Needs', 'Wants', 'Saved', 'Invested'],
        rows: items.map((item) => [
          formatRange(item.cycle.periodStart, item.cycle.periodEnd),
          formatPaiseShort(item.cycle.salaryPaise),
          formatPaiseShort(item.needsSpentPaise),
          formatPaiseShort(item.wantsSpentPaise),
          formatPaiseShort(item.savedPaise),
          formatPaiseShort(item.investedPaise),
        ]),
      }}
    />
  )
}
