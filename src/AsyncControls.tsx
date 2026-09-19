import { createContext, useContext, useEffect, useRef, useState, type ButtonHTMLAttributes, type FormHTMLAttributes, type FormEvent } from 'react'

const Submission = createContext({ busy: false, label: 'Saving...' })

export function AsyncForm({ onSubmit, busyLabel = 'Saving...', children, ...props }: Omit<FormHTMLAttributes<HTMLFormElement>, 'onSubmit'> & { onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>; busyLabel?: string }) {
  const locked = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!error) return
    const timeout = window.setTimeout(() => setError(''), 10_000)
    return () => window.clearTimeout(timeout)
  }, [error])
  return <Submission.Provider value={{ busy, label: busyLabel }}><form {...props} aria-busy={busy} onSubmit={async event => {
    event.preventDefault()
    if (locked.current) return
    locked.current = true
    setBusy(true)
    setError('')
    try { await onSubmit(event) }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to complete this action. Please try again.') }
    finally { locked.current = false; setBusy(false) }
  }}><fieldset className="submission-fields" disabled={busy}>{children}</fieldset>{error && <p className="auth-error" role="alert">{error}</p>}</form></Submission.Provider>
}

export function SubmitButton({ children, disabled, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { busy, label } = useContext(Submission)
  return <button {...props} type="submit" disabled={disabled || busy} aria-busy={busy}>{busy ? <><span className="button-spinner" aria-hidden="true" />{label}</> : children}</button>
}

export function AsyncButton({ onClick, busyLabel = 'Working...', children, disabled, ...props }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> & { onClick: () => void | Promise<void>; busyLabel?: string }) {
  const locked = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!error) return
    const timeout = window.setTimeout(() => setError(''), 10_000)
    return () => window.clearTimeout(timeout)
  }, [error])
  return <><button {...props} type="button" disabled={disabled || busy} aria-busy={busy} onClick={async () => {
    if (locked.current) return
    locked.current = true; setBusy(true); setError('')
    try { await onClick() }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to complete this action. Please try again.') }
    finally { locked.current = false; setBusy(false) }
  }}>{busy ? <><span className="button-spinner" aria-hidden="true" />{busyLabel}</> : children}</button>{error && <span className="auth-error" role="alert">{error}</span>}</>
}
