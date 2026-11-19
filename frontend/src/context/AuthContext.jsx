import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import api, { setUnauthorizedHandler } from '../api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // Session expired elsewhere: just forget the user.
  const clearUser = useCallback(() => setUser(null), [])

  const logout = useCallback(async () => {
    try { await api.post('/api/auth/logout') } catch { /* already signed out */ }
    setUser(null)
  }, [])

  useEffect(() => {
    setUnauthorizedHandler(clearUser)
    return () => setUnauthorizedHandler(null)
  }, [clearUser])

  // Restore the session from the cookie, if there is one.
  useEffect(() => {
    let cancelled = false
    api
      .get('/api/auth/me')
      .then((res) => !cancelled && setUser(res.data))
      .catch(() => !cancelled && setUser(null))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [])

  // The server has already set the session cookie; only the user profile is kept here.
  const saveSession = useCallback((data) => {
    setUser(data.user)
    return data.user
  }, [])

  const login = useCallback(
    async (identifier, password) => saveSession((await api.post('/api/auth/login', { identifier, password })).data),
    [saveSession],
  )

  const register = useCallback(
    async (form) => saveSession((await api.post('/api/auth/register', form)).data),
    [saveSession],
  )

  // The server signs out all other sessions and returns a fresh token for this one.
  const changePassword = useCallback(
    async (current_password, new_password) => saveSession((await api.post('/api/auth/change-password', { current_password, new_password })).data),
    [saveSession],
  )

  const hasRole = useCallback((...roles) => Boolean(user) && (user.role === 'admin' || roles.includes(user.role)), [user])

  const value = useMemo(
    () => ({ user, loading, login, register, logout, hasRole, changePassword }),
    [user, loading, login, register, logout, hasRole, changePassword],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
