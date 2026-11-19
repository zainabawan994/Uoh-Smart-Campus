import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { AlertCircle, Inbox, Loader2, X } from 'lucide-react'
import { ALERT_STATUS, ROLES, gradient, themeFor } from '../lib/constants'
import { initials } from '../lib/format'

export function Spinner({ className = 'h-5 w-5' }) {
  return <Loader2 className={`animate-spin text-[#18354f] ${className}`} aria-label="Loading" />
}

export function PageLoader() {
  return <div className="flex min-h-[40vh] items-center justify-center"><Spinner className="h-8 w-8" /></div>
}

export function PageHeader({ icon: Icon, title, subtitle, actions }) {
  const { pathname } = useLocation()
  return (
    <section className="page-banner relative mb-6 overflow-hidden rounded-2xl px-6 py-6 shadow-lg sm:px-8" style={{ background: gradient(themeFor(pathname)) }}>
      {Icon && <Icon className="pointer-events-none absolute -right-6 -bottom-8 h-40 w-40 text-white/10!" aria-hidden />}
      <div className="relative flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {Icon && <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl" style={{ background: 'rgb(255 255 255 / 0.14)' }}><Icon className="h-6 w-6 text-white!" /></div>}
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white! sm:text-3xl">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-white/75!">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </section>
  )
}

export function ErrorBanner({ message, onClose }) {
  if (!message) return null
  return (
    <div role="alert" className="mb-4 flex items-start gap-2 rounded-md border border-[#bc2f36]/35 bg-[#bc2f36]/8 px-3 py-2 text-sm text-[#bc2f36]">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span className="flex-1">{message}</span>
      {onClose && <button onClick={onClose} className="hover:opacity-70" aria-label="Dismiss"><X className="h-4 w-4" /></button>}
    </div>
  )
}

export function EmptyState({ icon: Icon = Inbox, title, children }) {
  return <div className="glass flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
    <Icon className="h-9 w-9 text-[#18354f]/45" /><p className="font-semibold text-[#18354f]">{title}</p>
    {children && <div className="text-sm text-[#18354f]/65">{children}</div>}
  </div>
}

export function RoleBadge({ role }) {
  const r = ROLES[role] || ROLES.student
  return <span className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${r.className}`}>{r.label}</span>
}

export function StatusBadge({ status }) {
  const s = ALERT_STATUS[status]
  return <span className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${s.className}`}>{s.label}</span>
}

export function Avatar({ name, className = 'h-9 w-9 text-sm' }) {
  return <div className={`flex shrink-0 items-center justify-center rounded-md bg-[#18354f] font-bold text-white! ${className}`}>{initials(name) || '?'}</div>
}

export function Modal({ open, onClose, title, children, wide = false }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return <div className="fixed inset-0 z-[1000] flex items-end justify-center p-4 sm:items-center" role="dialog" aria-modal="true">
    <div className="absolute inset-0 bg-[#18354f]/55" onClick={onClose} />
    <div className={`glass-strong relative max-h-[90vh] w-full overflow-y-auto p-6 ${wide ? 'max-w-2xl' : 'max-w-md'}`}>
      <div className="mb-4 flex items-center justify-between gap-4 border-b border-[#18354f]/15 pb-3">
        <h2 className="text-lg font-bold text-[#18354f]">{title}</h2>
        {onClose && <button onClick={onClose} className="rounded p-1 text-[#18354f]/65 hover:bg-[#18354f]/5" aria-label="Close"><X className="h-5 w-5" /></button>}
      </div>{children}
    </div>
  </div>
}
