import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { installSnoozed, snoozeInstall } from '../installPrompt'
import { canPromptInstall, isAppleMobile, isRunningInstalled, onInstallStateChange, promptInstall } from '../pwa'
import { BrandMark } from './icons'

// A one-line offer on the phone dashboard to put Fifty30 on the home screen: full screen, opens
// offline, and on iPhone the only way to get notifications. Hidden once installed or snoozed.
export default function InstallBanner() {
  const [, rerender] = useState(0)
  const [hidden, setHidden] = useState(() => isRunningInstalled() || installSnoozed())
  useEffect(() => onInstallStateChange(() => rerender((n) => n + 1)), [])

  const canPrompt = canPromptInstall()
  const apple = isAppleMobile()
  if (hidden || (!canPrompt && !apple)) return null

  return (
    <section className="install-banner" aria-label="Install the app">
      <span className="install-icon" aria-hidden="true">
        <BrandMark />
      </span>
      <div className="install-text">
        <strong>Install Fifty30</strong>
        <small>
          {apple
            ? 'Opens full screen and can send reminders. Takes three taps.'
            : 'Opens full screen, starts offline and feels like an app.'}
        </small>
      </div>
      <div className="install-actions">
        {canPrompt ? (
          <button
            type="button"
            onClick={async () => {
              if (await promptInstall()) setHidden(true)
            }}
          >
            Install
          </button>
        ) : (
          <Link to="/more" className="button">
            How
          </Link>
        )}
        <button
          type="button"
          className="secondary"
          onClick={() => {
            snoozeInstall()
            setHidden(true)
          }}
        >
          Not now
        </button>
      </div>
    </section>
  )
}
