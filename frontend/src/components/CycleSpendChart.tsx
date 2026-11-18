import { useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import type { CycleReport } from '../api'
import { cycleDays, niceScale } from '../chartData'
import { formatDate, todayIst } from '../dates'
import { formatPaiseCompact, formatPaiseShort } from '../money'
import { useWidth } from '../hooks/useWidth'
import ChartTable from './ChartTable'

const DAY_MONTH = new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short' })
const shortDate = (iso: string) => DAY_MONTH.format(new Date(`${iso}T00:00:00Z`))

// Plot geometry in CSS pixels.
const LEFT = 48
const RIGHT = 10
const TOP = 10
const MAIN_H = 170
const STRIP_GAP = 14
const STRIP_H = 40
const AXIS_H = 22
const HEIGHT = TOP + MAIN_H + STRIP_GAP + STRIP_H + AXIS_H

/**
 * Needs + wants spent so far as a running total, against an even pace through the needs + wants
 * budget (a straight line to the full budget on the last day). Above the line = spending faster
 * than the plan. Underneath, each day's needs and wants as small bars on their own scale.
 */
export default function CycleSpendChart({ report, isCurrent }: { report: CycleReport; isCurrent: boolean }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [active, setActive] = useState<number | null>(null)

  const { cycle } = report
  const budget = report.needs.allocatedPaise + report.wants.allocatedPaise
  const { days, totalDays } = cycleDays(report.daily, cycle.periodStart, cycle.periodEnd, todayIst(), budget)
  const last = days.at(-1)

  const head = (
    <div className="chart-head">
      <div>
        <h2>Spending trend</h2>
        <p className="muted">Needs + wants so far vs an even pace</p>
      </div>
      {last && <PaceStatus spent={last.runningPaise} pace={last.pacePaise} budget={budget} isCurrent={isCurrent} />}
    </div>
  )

  if (!last) {
    return (
      <article className="card chart">
        {head}
        <p className="muted">This cycle has not started yet.</p>
      </article>
    )
  }

  const plotW = Math.max(0, width - LEFT - RIGHT)
  const x = (i: number) => LEFT + (totalDays === 1 ? plotW / 2 : (i / (totalDays - 1)) * plotW)
  const { max: yMax, step } = niceScale(Math.max(budget, last.runningPaise))
  const y = (v: number) => TOP + MAIN_H - (v / yMax) * MAIN_H
  const ticks = Array.from({ length: Math.round(yMax / step) + 1 }, (_, k) => k * step)

  const stripTop = TOP + MAIN_H + STRIP_GAP
  const dayMax = Math.max(1, ...days.map((d) => d.spentPaise))
  const barW = Math.max(2, Math.min(14, (plotW / totalDays) * 0.6))
  const barH = (v: number) => (v / dayMax) * STRIP_H

  const linePoints = days.map((d, i) => `${x(i)},${y(d.runningPaise)}`).join(' ')
  const middle = Math.floor((totalDays - 1) / 2)
  const axisLabels = [0, middle, totalDays - 1].filter((v, i, all) => all.indexOf(v) === i)
  const dateAt = (i: number) => {
    const start = new Date(`${cycle.periodStart}T00:00:00Z`)
    start.setUTCDate(start.getUTCDate() + i)
    return start.toISOString().slice(0, 10)
  }

  function pick(event: PointerEvent<SVGRectElement>) {
    const box = event.currentTarget.getBoundingClientRect()
    const ratio = totalDays === 1 ? 0 : (event.clientX - box.left) / box.width
    setActive(Math.max(0, Math.min(days.length - 1, Math.round(ratio * (totalDays - 1)))))
  }

  function onKey(event: KeyboardEvent<SVGSVGElement>) {
    const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1 }
    if (event.key in moves) {
      event.preventDefault()
      setActive((i) => Math.max(0, Math.min(days.length - 1, (i ?? days.length - 1) + moves[event.key])))
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      setActive(event.key === 'Home' ? 0 : days.length - 1)
    }
  }

  const point = active !== null ? days[active] : null
  const summary =
    `Needs and wants spent so far ${formatPaiseShort(last.runningPaise)}, ` +
    `plan by ${formatDate(last.date)} ${formatPaiseShort(last.pacePaise)}, budget ${formatPaiseShort(budget)}.`

  return (
    <article className="card chart">
      {head}
      <ul className="legend" aria-label="Legend">
        <li>
          <span className="legend-line" aria-hidden="true" />
          Spent so far
        </li>
        <li>
          <span className="legend-line dashed" aria-hidden="true" />
          Even pace
        </li>
        <li>
          <span className="dot" style={{ '--c': 'var(--need)' } as CSSProperties} aria-hidden="true" />
          Needs
        </li>
        <li>
          <span className="dot" style={{ '--c': 'var(--want)' } as CSSProperties} aria-hidden="true" />
          Wants
        </li>
      </ul>

      <div className="svg-chart" ref={ref}>
        {width > 0 && (
          <svg
            width={width}
            height={HEIGHT}
            role="img"
            aria-label={`${summary} Use the left and right arrow keys to read each day.`}
            tabIndex={0}
            onKeyDown={onKey}
            onFocus={() => setActive((i) => i ?? days.length - 1)}
            onBlur={() => setActive(null)}
          >
            {ticks.map((t) => (
              <g key={t}>
                <line className="grid" x1={LEFT} x2={LEFT + plotW} y1={y(t)} y2={y(t)} />
                <text className="axis" x={LEFT - 6} y={y(t)} textAnchor="end" dominantBaseline="middle">
                  {formatPaiseCompact(t)}
                </text>
              </g>
            ))}

            <line className="pace" x1={x(0)} y1={y(budget / totalDays)} x2={x(totalDays - 1)} y2={y(budget)} />
            <polyline className="running" points={linePoints} />
            <circle className="running-end" cx={x(days.length - 1)} cy={y(last.runningPaise)} r={4} />

            <text className="axis" x={LEFT - 6} y={stripTop + STRIP_H / 2} textAnchor="end" dominantBaseline="middle">
              Daily
            </text>
            <line className="grid" x1={LEFT} x2={LEFT + plotW} y1={stripTop + STRIP_H} y2={stripTop + STRIP_H} />
            {days.map((d, i) =>
              d.spentPaise > 0 ? (
                <g key={d.date}>
                  <rect
                    x={x(i) - barW / 2}
                    width={barW}
                    y={stripTop + STRIP_H - barH(d.needsPaise)}
                    height={barH(d.needsPaise)}
                    fill="var(--need)"
                  />
                  <rect
                    x={x(i) - barW / 2}
                    width={barW}
                    y={stripTop + STRIP_H - barH(d.spentPaise)}
                    height={barH(d.wantsPaise)}
                    fill="var(--want)"
                  />
                </g>
              ) : null,
            )}

            {axisLabels.map((i, k) => (
              <text
                key={i}
                className="axis"
                x={x(i)}
                y={HEIGHT - 6}
                textAnchor={k === 0 ? 'start' : k === axisLabels.length - 1 ? 'end' : 'middle'}
              >
                {shortDate(dateAt(i))}
              </text>
            ))}

            {point && active !== null && (
              <g className="cursor">
                <line x1={x(active)} x2={x(active)} y1={TOP} y2={stripTop + STRIP_H} />
                <circle cx={x(active)} cy={y(point.runningPaise)} r={5} />
              </g>
            )}

            <rect
              className="hit"
              x={LEFT}
              y={TOP}
              width={plotW}
              height={MAIN_H + STRIP_GAP + STRIP_H}
              onPointerMove={pick}
              onPointerDown={pick}
              onPointerLeave={() => setActive(null)}
            />
          </svg>
        )}
        {point && active !== null && (
          <div
            className="chart-tooltip svg-tooltip"
            role="presentation"
            style={{ left: Math.max(0, Math.min(width - 200, x(active) - 100)) }}
          >
            <strong>{formatDate(point.date)}</strong>
            <div>Spent that day {formatPaiseShort(point.spentPaise)}</div>
            <div>So far {formatPaiseShort(point.runningPaise)}</div>
            <div>Even pace {formatPaiseShort(point.pacePaise)}</div>
            {point.investedPaise > 0 && <div>Invested {formatPaiseShort(point.investedPaise)}</div>}
          </div>
        )}
      </div>

      <ChartTable
        columns={['Date', 'Needs', 'Wants', 'So far', 'Even pace']}
        rows={days
          .filter((d, i) => d.spentPaise > 0 || i === days.length - 1)
          .map((d) => [
            formatDate(d.date),
            formatPaiseShort(d.needsPaise),
            formatPaiseShort(d.wantsPaise),
            formatPaiseShort(d.runningPaise),
            formatPaiseShort(d.pacePaise),
          ])}
      />
    </article>
  )
}

function PaceStatus({
  spent,
  pace,
  budget,
  isCurrent,
}: {
  spent: number
  pace: number
  budget: number
  isCurrent: boolean
}) {
  if (!isCurrent) {
    return (
      <span className="muted">
        {formatPaiseShort(spent)} of {formatPaiseShort(budget)}
      </span>
    )
  }
  const diff = spent - pace
  if (diff > 0) return <span className="pace-status over">{formatPaiseShort(diff)} over pace</span>
  return <span className="pace-status under">{formatPaiseShort(-diff)} under pace</span>
}
