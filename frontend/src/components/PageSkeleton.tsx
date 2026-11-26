// Grey blocks in the rough shape of a page while its data loads, instead of the word "Loading…".
// Screen readers still hear "Loading…"; the blocks themselves are hidden from them.
export default function PageSkeleton({ variant = 'cards' }: { variant?: 'cards' | 'list' }) {
  return (
    <div className={`skeleton skeleton-${variant}`} role="status" aria-live="polite">
      <span className="visually-hidden">Loading…</span>
      {variant === 'cards' ? (
        <>
          <div className="skeleton-block tall" aria-hidden="true" />
          <div className="skeleton-row" aria-hidden="true">
            <div className="skeleton-block" />
            <div className="skeleton-block" />
            <div className="skeleton-block" />
          </div>
          <div className="skeleton-block tall" aria-hidden="true" />
        </>
      ) : (
        Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton-block line" aria-hidden="true" />)
      )}
    </div>
  )
}
