import { useState, type CSSProperties } from 'react'
import type { CycleHistoryItem } from '../api'
import { niceScale } from '../chartData'
import { formatRange } from '../dates'
import { formatPaiseCompact, formatPaiseShort } from '../money'
import { useWidth } from '../hooks/useWidth'
import ChartTable from './ChartTable'

const DAY_MONTH = new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short' })
const shortDate = (iso: string) => DAY_MONTH.format(new Date(`${iso}T00:00:00Z`))

const LEFT = 48
const RIGHT = 8
const TOP = 22
const PLOT_H = 170
const AXIS_H = 24
const HEIGHT = TOP + PLOT_H + AXIS_H

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
  const [ref, width] = useWidth<HTMLDivElement>()
  const [active, setActive] = useState<number | null>(null)

  const plotW = Math.max(0, width - LEFT - RIGHT)
  const slot = items.length > 0 ? plotW / items.length : 0
  const colW = Math.min(56, slot * 0.62)
  const top = (item: CycleHistoryItem) => Math.max(item.cycle.salaryPaise, item.needsSpentPaise + item.wantsSpentPaise)
  const { max: yMax, step } = niceScale(Math.max(1, ...items.map(top)))
  const y = (v: number) => TOP + PLOT_H - (v / yMax) * PLOT_H
  const h = (v: number) => (Math.max(0, v) / yMax) * PLOT_H
  const ticks = Array.from({ length: Math.round(yMax / step) + 1 }, (_, k) => k * step)
  const cx = (i: number) => LEFT + slot * i + slot / 2

  const point = active !== null ? items[active] : null
  const savedText = (item: CycleHistoryItem) =>
    item.savedPaise < 0 ? `Deficit ${formatPaiseShort(-item.savedPaise)}` : `Saved ${formatPaiseShort(item.savedPaise)}`

  return (
    <article className="card chart">
      <div className="chart-head">
        <h2>Past cycles</h2>
        <span className="muted">{items.length === 1 ? 'This cycle' : `Last ${items.length} cycles`}</span>
      </div>
      <ul className="legend" aria-label="Legend">
        <li>
          <span className="dot" style={{ '--c': 'var(--need)' } as CSSProperties} aria-hidden="true" />
          Needs
        </li>
        <li>
          <span className="dot" style={{ '--c': 'var(--want)' } as CSSProperties} aria-hidden="true" />
          Wants
        </li>
        <li>
          <span className="dot" style={{ '--c': 'var(--save)' } as CSSProperties} aria-hidden="true" />
          Saved
        </li>
        <li>
          <span className="legend-marker" aria-hidden="true" />
          Needs + wants plan
        </li>
      </ul>

      <div className="svg-chart" ref={ref}>
        {width > 0 && (
          <svg width={width} height={HEIGHT} aria-hidden="true">
            {ticks.map((t) => (
              <g key={t}>
                <line className="grid" x1={LEFT} x2={LEFT + plotW} y1={y(t)} y2={y(t)} />
                <text className="axis" x={LEFT - 6} y={y(t)} textAnchor="end" dominantBaseline="middle">
                  {formatPaiseCompact(t)}
                </text>
              </g>
            ))}
            {items.map((item, i) => {
              const left = cx(i) - colW / 2
              const needs = item.needsSpentPaise
              const wants = item.wantsSpentPaise
              const saved = Math.max(0, item.savedPaise)
              const plan = item.cycle.needsPaise + item.cycle.wantsPaise
              const isActive = active === i
              return (
                <g key={item.cycle.periodStart} className={isActive ? 'column active' : 'column'}>
                  <rect x={left} width={colW} y={y(needs)} height={h(needs)} fill="var(--need)" />
                  <rect x={left} width={colW} y={y(needs + wants)} height={h(wants)} fill="var(--want)" />
                  <rect x={left} width={colW} y={y(needs + wants + saved)} height={h(saved)} fill="var(--save)" />
                  <line className="plan" x1={left - 4} x2={left + colW + 4} y1={y(plan)} y2={y(plan)} />
                  <text
                    className={item.savedPaise < 0 ? 'value negative' : 'value'}
                    x={cx(i)}
                    y={y(top(item)) - 6}
                    textAnchor="middle"
                  >
                    {formatPaiseCompact(item.savedPaise)}
                  </text>
                  <text
                    className={item.cycle.periodStart === currentStart ? 'axis strong' : 'axis'}
                    x={cx(i)}
                    y={HEIGHT - 6}
                    textAnchor="middle"
                  >
                    {shortDate(item.cycle.periodStart)}
                  </text>
                </g>
              )
            })}
          </svg>
        )}

        {/* Hover and keyboard targets over each column; the SVG itself is decorative. */}
        <ol className="column-targets" style={{ left: LEFT, width: plotW, top: TOP, height: PLOT_H }}>
          {items.map((item, i) => (
            <li key={item.cycle.periodStart}>
              <button
                type="button"
                className="column-target"
                aria-label={`${formatRange(item.cycle.periodStart, item.cycle.periodEnd)}: needs ${formatPaiseShort(item.needsSpentPaise)}, wants ${formatPaiseShort(item.wantsSpentPaise)}, ${savedText(item).toLowerCase()} of salary ${formatPaiseShort(item.cycle.salaryPaise)}`}
                onPointerEnter={() => setActive(i)}
                onPointerLeave={() => setActive((k) => (k === i ? null : k))}
                onFocus={() => setActive(i)}
                onBlur={() => setActive((k) => (k === i ? null : k))}
              />
            </li>
          ))}
        </ol>

        {point && active !== null && (
          <div
            className="chart-tooltip svg-tooltip"
            role="presentation"
            style={{ left: Math.max(0, Math.min(width - 200, cx(active) - 100)) }}
          >
            <strong>{formatRange(point.cycle.periodStart, point.cycle.periodEnd)}</strong>
            <div>Salary {formatPaiseShort(point.cycle.salaryPaise)}</div>
            <div>Needs {formatPaiseShort(point.needsSpentPaise)}</div>
            <div>Wants {formatPaiseShort(point.wantsSpentPaise)}</div>
            <div>{savedText(point)}</div>
            {point.investedPaise > 0 && <div>Invested {formatPaiseShort(point.investedPaise)}</div>}
          </div>
        )}
      </div>

      <ChartTable
        columns={['Cycle', 'Salary', 'Needs', 'Wants', 'Saved', 'Invested']}
        rows={items.map((item) => [
          formatRange(item.cycle.periodStart, item.cycle.periodEnd),
          formatPaiseShort(item.cycle.salaryPaise),
          formatPaiseShort(item.needsSpentPaise),
          formatPaiseShort(item.wantsSpentPaise),
          formatPaiseShort(item.savedPaise),
          formatPaiseShort(item.investedPaise),
        ])}
      />
    </article>
  )
}
