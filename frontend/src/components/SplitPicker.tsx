import { useId } from 'react'
import { SPLITS, splitLabel, type SplitPreset } from '../splits'

type Props = {
  value: SplitPreset
  onChange: (preset: SplitPreset) => void
  legend?: string
}

/** The four budget splits as cards, built from real radios so keyboards and screen readers work. */
export default function SplitPicker({ value, onChange, legend = 'Budget split' }: Props) {
  const name = useId()
  return (
    <fieldset className="field">
      <legend>{legend}</legend>
      <div className="split-picker">
        {SPLITS.map((s) => (
          <label key={s.id}>
            <input type="radio" name={name} value={s.id} checked={value === s.id} onChange={() => onChange(s.id)} />
            <span className="split-head">
              <strong>{s.name}</strong>
              <span className="split-numbers">{splitLabel(s)}</span>
            </span>
            <small>{s.description}</small>
            <span className="split-bar" aria-hidden="true">
              <span style={{ flexGrow: s.needs, background: 'var(--need)' }} />
              <span style={{ flexGrow: s.wants, background: 'var(--want)' }} />
              <span style={{ flexGrow: s.savings, background: 'var(--save)' }} />
            </span>
          </label>
        ))}
      </div>
      <p className="hint">Needs / wants / savings, as a share of each pay cycle.</p>
    </fieldset>
  )
}
