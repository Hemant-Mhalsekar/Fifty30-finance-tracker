import { useEffect, useState } from 'react'
import { canPromptInstall, isAppleMobile, isRunningInstalled, onInstallStateChange, promptInstall } from '../pwa'

// Explains how to put Fifty30 on the home screen, in the way this browser supports.
export default function InstallCard() {
  const [, rerender] = useState(0)
  const [installed, setInstalled] = useState(isRunningInstalled)

  useEffect(() => onInstallStateChange(() => rerender((n) => n + 1)), [])

  if (installed) return null

  return (
    <div className="card stack">
      <h2>Install the app</h2>
      {canPromptInstall() ? (
        <>
          <p className="muted">Add Fifty30 to your home screen. It opens full screen, like any other app.</p>
          <button
            type="button"
            className="block"
            onClick={async () => {
              if (await promptInstall()) setInstalled(true)
            }}
          >
            Install Fifty30
          </button>
        </>
      ) : isAppleMobile() ? (
        <ol className="install-steps">
          <li>
            Open this page in <strong>Safari</strong>.
          </li>
          <li>
            Tap <strong>Share</strong> (the square with an arrow).
          </li>
          <li>
            Choose <strong>Add to Home Screen</strong>, then <strong>Add</strong>.
          </li>
        </ol>
      ) : (
        <p className="muted">
          Open your browser&apos;s menu and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.
        </p>
      )}
    </div>
  )
}
