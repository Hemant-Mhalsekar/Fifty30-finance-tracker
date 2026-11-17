import { Component, type ErrorInfo, type ReactNode } from 'react'
import { reportError } from '../monitoring'
import { BrandMark } from './icons'

type State = { failed: boolean }

// A crash anywhere in the app shows this instead of a blank page, and is reported to Sentry.
export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    reportError(Object.assign(error, { componentStack: info.componentStack }))
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="welcome">
        <div className="brand">
          <BrandMark />
          Fifty30
        </div>
        <div className="card stack" role="alert">
          <p>
            <strong>Something went wrong.</strong>
          </p>
          <p className="muted">The problem has been noted. Reloading the page usually fixes it.</p>
          <button type="button" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </main>
    )
  }
}
