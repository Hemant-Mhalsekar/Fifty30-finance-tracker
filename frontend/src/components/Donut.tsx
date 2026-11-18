import type { CSSProperties, ReactNode } from 'react'

export type DonutSlice = { key: string; value: number; color: string }

type Props = {
  slices: DonutSlice[]
  size?: number
  thickness?: number
  // Text in the middle (e.g. "Spent ₹24,500").
  children?: ReactNode
}

// Small gap between slices, in px along the ring, so neighbours stay apart without a border.
const GAP = 2

/**
 * A ring chart drawn with stroke-dasharray. Decorative: the legend next to it carries every value
 * as text, so the SVG is hidden from screen readers.
 */
export default function Donut({ slices, size = 140, thickness = 18, children }: Props) {
  const radius = (size - thickness) / 2
  const circumference = 2 * Math.PI * radius
  const total = slices.reduce((sum, s) => sum + s.value, 0)
  let offset = 0
  return (
    <div className="donut" style={{ '--size': `${size}px` } as CSSProperties}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" focusable="false">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--track)" strokeWidth={thickness} />
        {total > 0 &&
          slices.map((s) => {
            const length = (s.value / total) * circumference
            const visible = Math.max(0, length - (slices.length > 1 ? GAP : 0))
            const circle = (
              <circle
                key={s.key}
                className="slice"
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={s.color}
                strokeWidth={thickness}
                strokeDasharray={`${visible} ${circumference - visible}`}
                strokeDashoffset={-offset}
              />
            )
            offset += length
            return circle
          })}
      </svg>
      {children && <div className="center">{children}</div>}
    </div>
  )
}
