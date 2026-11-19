import axios from 'axios'

// Old builds kept the login token here; it is removed on load (sessions now use an httpOnly cookie).
const LEGACY_TOKEN_KEY = 'uoh_token'
try { localStorage.removeItem(LEGACY_TOKEN_KEY) } catch { /* storage blocked */ }

// Empty base URL = same origin; the Vite dev server proxies /api to FastAPI.
const API_BASE = import.meta.env.VITE_API_URL || ''

// The session lives in an httpOnly cookie that page scripts cannot read; the browser sends it.
const api = axios.create({ baseURL: API_BASE, timeout: 20000, withCredentials: true })

let unauthorizedHandler = null
export function setUnauthorizedHandler(fn) {
  unauthorizedHandler = fn
}

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const url = err.config?.url || ''
    // An expired/invalid token anywhere except the login form logs the user out.
    if (err.response?.status === 401 && !url.includes('/api/auth/login') && !url.includes('/api/auth/register') && !url.includes('/api/auth/me')) {
      unauthorizedHandler?.()
    }
    return Promise.reject(err)
  },
)

/** Turn an Axios/FastAPI error into a readable sentence. */
export function errorMessage(err, fallback = 'Something went wrong. Please try again.') {
  if (!err?.response) return 'Cannot reach the server. Check that the backend is running.'
  // The Vite proxy answers 502/503/504 itself when FastAPI is down or restarting.
  if ([502, 503, 504].includes(err.response.status) && !err.response.data?.detail) {
    return 'The server is not responding. Make sure the backend is running, then try again.'
  }
  const detail = err.response.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail
      .map((d) => {
        const field = Array.isArray(d.loc) ? d.loc[d.loc.length - 1] : ''
        const msg = String(d.msg || '').replace(/^Value error, /, '')
        return field && field !== 'body' ? `${field}: ${msg}` : msg
      })
      .join(' · ')
  }
  if (err.response.status === 429) return 'Too many attempts. Please wait a minute and try again.'
  if (err.response.status >= 500) return 'Server error. Please try again in a moment.'
  return fallback
}

/** WebSocket URL for a backend path; the session cookie authenticates it. */
export function wsUrl(path) {
  const explicit = import.meta.env.VITE_WS_URL
  let base = explicit
  if (!base && API_BASE) {
    const apiOrigin = new URL(API_BASE, window.location.origin)
    apiOrigin.protocol = apiOrigin.protocol === 'https:' ? 'wss:' : 'ws:'
    base = apiOrigin.origin
  }
  base ||= `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`
  return `${base.replace(/\/$/, '')}${path}`
}

/** Absolute URL for files served by the backend (e.g. /uploads/...). */
export function mediaUrl(path) {
  if (!path) return null
  return path.startsWith('http') ? path : `${API_BASE}${path}`
}

export default api
