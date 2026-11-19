import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { UserPlus } from 'lucide-react'
import { errorMessage } from '../api/client'
import { ErrorBanner, Spinner } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { DEPARTMENTS } from '../lib/constants'
import AuthShell, { PasswordInput } from './AuthShell'

const REG_NO = /^[A-Za-z]\d{2}-\d{3,5}$/
const EMPTY = { reg_no: '', full_name: '', email: '', department: DEPARTMENTS[0], semester: 1, section: 'A', password: '', confirm: '' }

export default function RegisterPage() {
  const { user, register } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  if (user) return <Navigate to="/" replace />
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    if (!REG_NO.test(form.reg_no.trim())) return setError('Registration ID must look like F23-0382.')
    if (form.password.length < 8) return setError('Password must be at least 8 characters.')
    if (!/[A-Za-z]/.test(form.password) || !/\d/.test(form.password)) return setError('Password must contain at least one letter and one number.')
    if (form.password !== form.confirm) return setError('Passwords do not match.')
    setError(null)
    setBusy(true)
    try {
      const { confirm: _confirm, ...payload } = form
      await register({ ...payload, reg_no: payload.reg_no.trim().toUpperCase(), semester: Number(payload.semester) })
      navigate('/', { replace: true })
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <AuthShell
      wide
      title="Create student account"
      subtitle="Register with your University of Haripur details."
      footer={<>Already registered? <Link to="/login" className="font-semibold text-[#18354f] underline-offset-2 hover:underline">Sign in</Link></>}
    >
      <ErrorBanner message={error} />
      <form onSubmit={submit} className="grid grid-cols-2 gap-4">
        <div className="col-span-2 sm:col-span-1">
          <label className="label" htmlFor="reg_no">Registration ID</label>
          <input id="reg_no" className="input uppercase" required autoFocus placeholder="F23-0382" value={form.reg_no} onChange={set('reg_no')} />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label className="label" htmlFor="full_name">Full name</label>
          <input id="full_name" className="input" required minLength={2} maxLength={120} autoComplete="name" value={form.full_name} onChange={set('full_name')} />
        </div>
        <div className="col-span-2">
          <label className="label" htmlFor="email">Email</label>
          <input id="email" type="email" className="input" required autoComplete="email" value={form.email} onChange={set('email')} />
        </div>
        <div className="col-span-2">
          <label className="label" htmlFor="department">Department</label>
          <select id="department" className="input" value={form.department} onChange={set('department')}>
            {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="semester">Semester</label>
          <select id="semester" className="input" value={form.semester} onChange={set('semester')}>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="section">Section</label>
          <select id="section" className="input" value={form.section} onChange={set('section')}>
            {['A', 'B', 'C', 'D'].map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label className="label" htmlFor="password">Password</label>
          <PasswordInput id="password" required minLength={8} autoComplete="new-password" value={form.password} onChange={set('password')} />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label className="label" htmlFor="confirm">Confirm password</label>
          <PasswordInput id="confirm" required autoComplete="new-password" value={form.confirm} onChange={set('confirm')} />
        </div>
        <p className="col-span-2 -mt-2 text-xs text-[#18354f]/55">At least 8 characters with a letter and a number. Not your registration ID.</p>
        <button className="btn btn-primary col-span-2 py-2.5" disabled={busy}>
          {busy ? <Spinner className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />} Create account
        </button>
      </form>
    </AuthShell>
  )
}
