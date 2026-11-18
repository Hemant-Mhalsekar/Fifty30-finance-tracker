import type { CSSProperties } from 'react'

type Props = {
  // Accessible name, e.g. "Needs used".
  label: string
  value: number
  max: number
  // CSS colours for the fill and (optionally) a tinted track.
  color: string
  track?: string
}

/** A thin progress bar, capped at 100%. Overspending is shown in text next to it, never only by colour. */
export default function Meter({ label, value, max, color, track }: Props) {
  const used = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : value > 0 ? 100 : 0
  return (
    <div
      className={track ? 'meter tinted' : 'meter'}
      style={track ? ({ '--t': track } as CSSProperties) : undefined}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(used)}
    >
      <div className="meter-fill" style={{ width: `${used}%`, '--c': color } as CSSProperties} />
    </div>
  )
}
