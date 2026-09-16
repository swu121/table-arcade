import { Component } from 'react'
import { Mark } from './Logo.jsx'
import { reportError } from '../lib/crash.js'
import { forgetReloads, reloadNow } from '../lib/reload.js'

const RELOAD_AFTER = 1800

// Rendered in place of a white screen. Shown for a moment before the tablet
// restarts itself; shown for good, with a button, if restarting keeps failing.
function Screen({ stuck }) {
  return (
    <div className="grain vignette relative grid h-full place-items-center overflow-hidden bg-void">
      <div className="anim-fade-in flex max-w-md flex-col items-center gap-4 p-6 text-center">
        <Mark size={56} />
        <div className="overline">{stuck ? 'Something keeps going wrong' : 'Something went wrong'}</div>
        <p className="text-dim">
          {stuck
            ? 'This tablet has restarted a few times in a row. Ask a server to give it a moment.'
            : 'Restarting this tablet.'}
        </p>
        {stuck && (
          <button
            type="button"
            className="btn btn-primary mt-2 h-14 px-8"
            onClick={() => {
              forgetReloads()
              reloadNow()
            }}
          >
            Restart now
          </button>
        )}
      </div>
    </div>
  )
}

// A render crash anywhere below here would otherwise leave a blank tablet
// until someone notices. Report it, then restart — unless restarts are what
// keeps happening, in which case wait for a human.
export class ErrorBoundary extends Component {
  state = { crashed: false, stuck: false }

  static getDerivedStateFromError() {
    return { crashed: true }
  }

  componentDidCatch(error, info) {
    reportError('render', error, { componentStack: String(info?.componentStack ?? '').slice(0, 1500) })
    this.timer = setTimeout(() => {
      if (!reloadNow()) this.setState({ stuck: true })
    }, RELOAD_AFTER)
  }

  componentWillUnmount() {
    clearTimeout(this.timer)
  }

  render() {
    if (this.state.crashed) return <Screen stuck={this.state.stuck} />
    return this.props.children
  }
}
