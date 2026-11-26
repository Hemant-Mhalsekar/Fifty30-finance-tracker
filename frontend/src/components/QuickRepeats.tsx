import { useState } from 'react'
import { formatPaise, formatPaiseShort } from '../money'
import type { QuickRepeat } from '../quickRepeats'
import { CategoryIcon } from './icons'

export type Logged = { message: string; undo?: () => Promise<void> }

/**
 * "Log again": the expenses logged most often, one tap each, for today. A wrong tap is one Undo
 * away, so there is no confirm step to slow the common case down.
 */
export default function QuickRepeats({
  repeats,
  onLog,
}: {
  repeats: QuickRepeat[]
  onLog: (repeat: QuickRepeat) => Promise<Logged>
}) {
  const [busy, setBusy] = useState(false)
  const [last, setLast] = useState<Logged | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (repeats.length === 0) return null

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card quick-repeats" aria-labelledby="quick-title">
      <div className="quick-head">
        <h2 id="quick-title">Log again</h2>
        <p className="muted">One tap adds it for today</p>
      </div>
      <ul className="quick-chips">
        {repeats.map((r) => (
          <li key={r.key}>
            <button
              type="button"
              className="chip quick-chip"
              disabled={busy}
              aria-label={`Log ${r.description}, ${formatPaise(r.amountPaise)} in ${r.category.name}, for today`}
              onClick={() =>
                run(async () => {
                  setLast(null)
                  setLast(await onLog(r))
                })
              }
            >
              <CategoryIcon name={r.category.name} type={r.type ?? r.category.type} size={16} />
              <span>{r.description}</span>
              <strong className="num">{formatPaiseShort(r.amountPaise)}</strong>
            </button>
          </li>
        ))}
      </ul>
      <div className="quick-status" role="status">
        {last && (
          <>
            <span>{last.message}</span>
            {last.undo && (
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await last.undo!()
                    setLast({ message: 'Removed.' })
                  })
                }
              >
                Undo
              </button>
            )}
          </>
        )}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
