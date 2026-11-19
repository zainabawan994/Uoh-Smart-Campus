import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { LogIn } from 'lucide-react'
import { errorMessage } from '../api/client'
import { ErrorBanner, Spinner } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import AuthShell, { PasswordInput } from './AuthShell'

const HOME_BY_ROLE = { security: '/security', cafe_manager: '/cafe', admin: '/', student: '/' }

export default function LoginPage() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  if (user) return <Navigate to={HOME_BY_ROLE[user.role] || '/'} replace />

  const submit = async (e) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const u = await login(identifier.trim(), password)
      navigate(location.state?.from || HOME_BY_ROLE[u.role] || '/', { replace: true })
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title="Sign in"
      subtitle="Use your University Registration ID (e.g. F23-0382) or email."
      footer={<>New student? <Link to="/register" className="font-semibold text-[#18354f] underline-offset-2 hover:underline">Create an account</Link></>}
    >
      <ErrorBanner message={error} />
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label" htmlFor="identifier">Registration ID or email</label>
          <input id="identifier" className="input" autoComplete="username" required autoFocus
            placeholder="F23-0382" value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <PasswordInput id="password" autoComplete="current-password" required
            value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <button className="btn btn-primary w-full py-2.5" disabled={busy}>
          {busy ? <Spinner className="h-4 w-4" /> : <LogIn className="h-4 w-4" />} Sign in
        </button>
      </form>
    </AuthShell>
  )
}
