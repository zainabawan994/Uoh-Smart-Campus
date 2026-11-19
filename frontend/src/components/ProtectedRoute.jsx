import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { PageLoader } from './ui'

/** Requires a signed-in user; with `roles`, also requires one of them (admins always pass). */
export default function ProtectedRoute({ roles, children }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <PageLoader />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (roles && user.role !== 'admin' && !roles.includes(user.role)) return <Navigate to="/" replace />
  return children ?? <Outlet />
}
