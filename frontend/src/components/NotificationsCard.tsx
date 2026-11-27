import { useEffect, useState } from 'react'
import { getNotificationSettings, sendTestPush, updateNotificationSettings, type NotificationSettings } from '../api'
import { disablePush, enablePush, pushState, type PushState } from '../push'

const KINDS: { key: keyof NotificationSettings; label: string; hint: string }[] = [
  {
    key: 'recurringDue',
    label: 'Recurring payment due',
    hint: 'In the morning on the day rent, a SIP or a bill is due.',
  },
  { key: 'eveningReminder', label: 'Evening reminder', hint: 'At about 9 pm, only if nothing was logged that day.' },
  { key: 'budgetAlerts', label: 'Budget alerts', hint: 'When needs or wants reach 80% and 100% of the plan.' },
  {
    key: 'cycleSummary',
    label: 'New cycle and weekly summary',
    hint: 'On pay day, and a short summary on Sunday evening.',
  },
]

const DEVICE_HINTS: Record<PushState, string> = {
  unsupported: 'This browser cannot show notifications.',
  unavailable: 'Notifications are not available in this version of the app.',
  denied:
    'Notifications are blocked for Fifty30. In Chrome: tap ⋮ › Settings › Site settings › Notifications, allow this site, then come back.',
  off: 'Turn on to get reminders on this phone. Each device is turned on separately.',
  on: 'On for this phone. Each device is turned on separately.',
}

// The switch for this device, a test button, and which kinds of notification to get. The kinds
// are saved for the account, so they apply on every device that has notifications on.
export default function NotificationsCard() {
  const [device, setDevice] = useState<PushState | null>(null)
  const [settings, setSettings] = useState<NotificationSettings | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    pushState()
      .then((state) => !cancelled && setDevice(state))
      .catch(() => !cancelled && setDevice('unavailable'))
    getNotificationSettings()
      .then((saved) => !cancelled && setSettings(saved))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : 'Something went wrong'))
    return () => {
      cancelled = true
    }
  }, [])

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    setStatus(null)
    try {
      await action()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  const toggleDevice = (on: boolean) =>
    run(async () => {
      if (on) {
        const state = await enablePush()
        setDevice(state)
        if (state === 'on') setStatus('Notifications are on for this phone.')
      } else {
        await disablePush()
        setDevice('off')
        setStatus('Notifications are off for this phone.')
      }
    })

  const sendTest = () =>
    run(async () => {
      const result = await sendTestPush()
      setStatus(
        result.delivered === result.devices
          ? `Test sent to ${result.devices} ${result.devices === 1 ? 'device' : 'devices'}.`
          : `Test sent to ${result.delivered} of ${result.devices} devices.`,
      )
    })

  const toggleKind = (key: keyof NotificationSettings, on: boolean) => {
    if (!settings) return
    const previous = settings
    const next = { ...settings, [key]: on }
    // Shown at once; put back if the server refuses.
    setSettings(next)
    void run(async () => {
      try {
        setSettings(await updateNotificationSettings(next))
      } catch (e) {
        setSettings(previous)
        throw e
      }
    })
  }

  const canToggle = device === 'on' || device === 'off'
  return (
    <article className="card notifications-card" aria-labelledby="notifications-title">
      <h2 id="notifications-title">Notifications</h2>
      <label className="switch-row">
        <input
          type="checkbox"
          role="switch"
          checked={device === 'on'}
          disabled={busy || !canToggle}
          onChange={(e) => toggleDevice(e.target.checked)}
        />
        <span className="track" aria-hidden="true" />
        <span className="text">
          Notifications on this phone
          <small className="hint">{device ? DEVICE_HINTS[device] : 'Checking…'}</small>
        </span>
      </label>
      {device === 'on' && (
        <div className="form-actions">
          <button type="button" className="secondary" disabled={busy} onClick={sendTest}>
            Send a test
          </button>
        </div>
      )}
      {settings && (
        <fieldset className="field notification-kinds">
          <legend>Notify me about</legend>
          {KINDS.map((kind) => (
            <label key={kind.key} className="switch-row">
              <input
                type="checkbox"
                role="switch"
                checked={settings[kind.key]}
                disabled={busy}
                onChange={(e) => toggleKind(kind.key, e.target.checked)}
              />
              <span className="track" aria-hidden="true" />
              <span className="text">
                {kind.label}
                <small className="hint">{kind.hint}</small>
              </span>
            </label>
          ))}
        </fieldset>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {status && (
        <p className="success" role="status">
          {status}
        </p>
      )}
    </article>
  )
}
