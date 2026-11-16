import { useState, type CSSProperties, type ReactNode } from 'react'

export type BarRow = {
  key: string
  name: string
  color: string
  value: number
  // Where the plan sits on the same scale; draws a thin marker line.
  plan?: number
  // Always-visible label on the right of the name (the value is never colour-only).
  valueLabel: string
  // Optional line under the bar, e.g. "Over by ₹5,000".
  note?: ReactNode
  // Extra lines for the hover/focus tooltip.
  details?: string[]
}

type Props = {
  title: string
  subtitle?: string
  rows: BarRow[]
  legend?: { name: string; color: string; marker?: boolean }[]
  // Columns and cells for the "Show as table" view, which carries every value without the chart.
  table: { columns: string[]; rows: string[][] }
  emptyText?: string
  // Fixed scale maximum; longer bars are clipped at the end (their exact value is in the label).
  scaleMax?: number
}

// Horizontal bars in plain HTML: they wrap long names, reflow on narrow screens and need no
// chart library. Every value is printed as text, so the colour is never the only signal.
export default function BarChart({ title, subtitle, rows, legend, table, emptyText, scaleMax }: Props) {
  const [active, setActive] = useState<string | null>(null)
  const max = scaleMax ?? Math.max(1, ...rows.map((r) => Math.max(r.value, r.plan ?? 0)))

  return (
    <article className="card chart">
      <div className="chart-head">
        <h2>{title}</h2>
        {subtitle && <span className="muted">{subtitle}</span>}
      </div>

      {rows.length === 0 ? (
        <p className="muted">{emptyText ?? 'Nothing to show yet.'}</p>
      ) : (
        <>
          {legend && legend.length > 0 && (
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
          )}

          <ul className="hbars">
            {rows.map((row) => (
              <li
                key={row.key}
                className="hbar"
                tabIndex={0}
                aria-label={[row.name, row.valueLabel, ...(row.details ?? [])].join(', ')}
                onPointerEnter={() => setActive(row.key)}
                onPointerLeave={() => setActive((k) => (k === row.key ? null : k))}
                onFocus={() => setActive(row.key)}
                onBlur={() => setActive((k) => (k === row.key ? null : k))}
              >
                <div className="hbar-label" aria-hidden="true">
                  <span className="hbar-name">
                    <span className="dot" style={{ '--c': row.color } as CSSProperties} />
                    {row.name}
                  </span>
                  <span className="value">{row.valueLabel}</span>
                </div>
                <div className="hbar-track" aria-hidden="true">
                  <div
                    className="hbar-fill"
                    style={{ width: `${Math.min(100, (Math.max(0, row.value) / max) * 100)}%`, '--c': row.color } as CSSProperties}
                  />
                  {row.plan !== undefined && (
                    <div className="hbar-plan" style={{ left: `calc(${(row.plan / max) * 100}% - 1px)` }} />
                  )}
                </div>
                {row.note && <div className="hbar-note">{row.note}</div>}
                {active === row.key && row.details && row.details.length > 0 && (
                  <div className="chart-tooltip" role="presentation">
                    <strong>{row.valueLabel}</strong>
                    {row.name}
                    {row.details.map((line) => (
                      <div key={line}>{line}</div>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>

          <details className="table-view">
            <summary>Show as table</summary>
            <table className="data-table">
              <thead>
                <tr>
                  {table.columns.map((column, i) => (
                    <th key={column} scope="col" className={i > 0 ? 'num' : undefined}>
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((cells) => (
                  <tr key={cells.join('|')}>
                    {cells.map((cell, i) => (
                      <td key={i} className={i > 0 ? 'num' : undefined}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </article>
  )
}
