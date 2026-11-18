import { useState, type CSSProperties, type ReactNode } from 'react'
import { niceScale } from '../chartData'
import { formatPaiseCompact } from '../money'
import { useWidth } from '../hooks/useWidth'
import ChartTable from './ChartTable'

export type ColumnSegment = { key: string; value: number; color: string }

export type Column = {
  key: string
  // Under the column, e.g. "30 Oct". `strong` draws it bold (the period on screen).
  label: string
  strong?: boolean
  // Stacked bottom to top. Positive values go up from zero, negative ones down (a deficit).
  segments: ColumnSegment[]
  // Draws a rule across the column at this value, e.g. the plan.
  plan?: number
  // Above the column (below it for a negative column).
  topLabel: string
  topNegative?: boolean
  // The column's full meaning for screen readers and the tooltip.
  ariaLabel: string
  tooltip: { title: string; lines: string[] }
}

type Props = {
  title: string
  subtitle?: ReactNode
  columns: Column[]
  legend: { name: string; color: string; marker?: boolean }[]
  table: { columns: string[]; rows: string[][] }
  emptyText?: string
  children?: ReactNode
}

const LEFT = 48
const RIGHT = 8
const TOP = 22
const PLOT_H = 170
const AXIS_H = 24
const HEIGHT = TOP + PLOT_H + AXIS_H

/**
 * Stacked columns in hand-drawn SVG, sized to the card so text stays 12px. One transparent button
 * per column gives hover and keyboard focus a tooltip and an accessible name; the SVG is hidden
 * from screen readers, and "Show as table" carries every number.
 */
export default function ColumnChart({ title, subtitle, columns, legend, table, emptyText, children }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [active, setActive] = useState<number | null>(null)

  const sum = (column: Column, sign: 1 | -1) =>
    column.segments.reduce((total, s) => total + (Math.sign(s.value) === sign ? s.value : 0), 0)
  const high = Math.max(0, ...columns.map((c) => Math.max(sum(c, 1), c.plan ?? 0)))
  const low = Math.min(0, ...columns.map((c) => sum(c, -1)))
  const { step } = niceScale(Math.max(high, -low, 1))
  const yMax = Math.max(step, Math.ceil(high / step) * step)
  const yMin = -Math.ceil(-low / step) * step
  const y = (v: number) => TOP + ((yMax - v) / (yMax - yMin)) * PLOT_H
  const ticks: number[] = []
  for (let t = yMin; t <= yMax + step / 2; t += step) ticks.push(t)

  const plotW = Math.max(0, width - LEFT - RIGHT)
  const slot = columns.length > 0 ? plotW / columns.length : 0
  const colW = Math.min(56, slot * 0.62)
  const cx = (i: number) => LEFT + slot * i + slot / 2
  const point = active !== null ? columns[active] : null

  return (
    <article className="card chart">
      <div className="chart-head">
        <h2>{title}</h2>
        {subtitle && <span className="muted">{subtitle}</span>}
      </div>
      {children}
      {columns.length === 0 ? (
        <p className="muted">{emptyText ?? 'Nothing to show yet.'}</p>
      ) : (
        <>
          <ul className="legend" aria-label="Legend">
            {legend.map((item) => (
              <li key={item.name}>
                {item.marker ? (
                  <span className="legend-marker" aria-hidden="true" />
                ) : (
                  <span className="dot" style={{ '--c': item.color } as CSSProperties} aria-hidden="true" />
                )}
                {item.name}
              </li>
            ))}
          </ul>

          <div className="svg-chart" ref={ref}>
            {width > 0 && (
              <svg width={width} height={HEIGHT} aria-hidden="true">
                {ticks.map((t) => (
                  <g key={t}>
                    <line className={t === 0 ? 'grid zero' : 'grid'} x1={LEFT} x2={LEFT + plotW} y1={y(t)} y2={y(t)} />
                    <text className="axis" x={LEFT - 6} y={y(t)} textAnchor="end" dominantBaseline="middle">
                      {formatPaiseCompact(t)}
                    </text>
                  </g>
                ))}
                {columns.map((column, i) => {
                  const left = cx(i) - colW / 2
                  let up = 0
                  let down = 0
                  const top = sum(column, 1)
                  const bottom = sum(column, -1)
                  const labelY = bottom < 0 && top === 0 ? y(bottom) + 14 : y(Math.max(top, column.plan ?? 0)) - 6
                  return (
                    <g key={column.key} className={active === i ? 'column active' : 'column'}>
                      {column.segments.map((segment) => {
                        if (segment.value === 0) return null
                        const from = segment.value > 0 ? up : down
                        const to = from + segment.value
                        if (segment.value > 0) up = to
                        else down = to
                        return (
                          <rect
                            key={segment.key}
                            x={left}
                            width={colW}
                            y={y(Math.max(from, to))}
                            height={Math.abs(y(from) - y(to))}
                            fill={segment.color}
                          />
                        )
                      })}
                      {column.plan !== undefined && (
                        <line
                          className="plan"
                          x1={left - 4}
                          x2={left + colW + 4}
                          y1={y(column.plan)}
                          y2={y(column.plan)}
                        />
                      )}
                      <text
                        className={column.topNegative ? 'value negative' : 'value'}
                        x={cx(i)}
                        y={labelY}
                        textAnchor="middle"
                      >
                        {column.topLabel}
                      </text>
                      <text
                        className={column.strong ? 'axis strong' : 'axis'}
                        x={cx(i)}
                        y={HEIGHT - 6}
                        textAnchor="middle"
                      >
                        {column.label}
                      </text>
                    </g>
                  )
                })}
              </svg>
            )}

            <ol className="column-targets" style={{ left: LEFT, width: plotW, top: TOP, height: PLOT_H }}>
              {columns.map((column, i) => (
                <li key={column.key}>
                  <button
                    type="button"
                    className="column-target"
                    aria-label={column.ariaLabel}
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
                <strong>{point.tooltip.title}</strong>
                {point.tooltip.lines.map((line) => (
                  <div key={line}>{line}</div>
                ))}
              </div>
            )}
          </div>

          <ChartTable columns={table.columns} rows={table.rows} />
        </>
      )}
    </article>
  )
}
