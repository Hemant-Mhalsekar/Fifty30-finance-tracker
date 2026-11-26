import { useEffect, useId, useRef, type ReactNode } from 'react'

/**
 * A panel that slides up from the bottom of a phone screen, over the page, so the list behind it
 * keeps its place. Built on the browser's own modal <dialog>: focus stays inside, Escape and a tap
 * on the dimmed backdrop close it, and focus returns to what opened it.
 */
export default function Sheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      // The panel, not its first field: on a phone a focused field pops the keyboard or a date
      // picker up before the person has chosen what to change.
      panel.current?.focus()
    }
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        // The dialog element itself is only hit outside the panel: on the backdrop.
        if (e.target === ref.current) onClose()
      }}
    >
      <div className="sheet-panel" ref={panel} tabIndex={-1}>
        <div className="sheet-handle" aria-hidden="true" />
        <h2 id={titleId}>{title}</h2>
        {open && children}
      </div>
    </dialog>
  )
}
