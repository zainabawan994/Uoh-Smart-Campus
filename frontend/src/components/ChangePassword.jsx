import { useState } from 'react'
import { errorMessage } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { PasswordInput } from '../pages/AuthShell'
import { ErrorBanner, Spinner } from './ui'

export default function ChangePassword({ onClose }) {
  const { changePassword } = useAuth()
  const [form, setForm] = useState({ current: '', next: '', confirm: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    if (form.next !== form.confirm) return setError('New passwords do not match.')
    setBusy(true); setError(null)
    try {
      await changePassword(form.current, form.next)
      setDone(true)
    } catch (err) { setError(errorMessage(err)) } finally { setBusy(false) }
  }

  if (done) return <div className="space-y-4">
    <p className="text-sm text-[#18354f]">Password changed. You have been signed out on all other devices.</p>
    <div className="flex justify-end"><button className="btn btn-primary" onClick={onClose}>Done</button></div>
  </div>

  return (
    <form onSubmit={submit} className="space-y-4">
      <ErrorBanner message={error} />
      <div><label className="label" htmlFor="cp-current">Current password</label><PasswordInput id="cp-current" required autoComplete="current-password" value={form.current} onChange={set('current')} /></div>
      <div><label className="label" htmlFor="cp-new">New password</label><PasswordInput id="cp-new" required minLength={8} maxLength={72} autoComplete="new-password" value={form.next} onChange={set('next')} /></div>
      <div><label className="label" htmlFor="cp-confirm">Confirm new password</label><PasswordInput id="cp-confirm" required autoComplete="new-password" value={form.confirm} onChange={set('confirm')} /></div>
      <p className="text-xs text-[#18354f]/55">At least 8 characters with a letter and a number. Not your registration ID.</p>
      <div className="flex justify-end gap-2 border-t border-[#18354f]/15 pt-4">
        <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={busy}>{busy && <Spinner className="h-4 w-4" />} Change password</button>
      </div>
    </form>
  )
}
