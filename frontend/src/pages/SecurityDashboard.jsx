import { useEffect, useMemo, useState } from 'react'
import { BellOff, BellRing, CheckCheck, ExternalLink, MapPin, Siren, Truck, Wifi, WifiOff } from 'lucide-react'
import api, { errorMessage } from '../api/client'
import EmergencyMap from '../components/EmergencyMap'
import { EmptyState, ErrorBanner, PageHeader, Spinner, StatusBadge } from '../components/ui'
import { useRealtime } from '../context/WebSocketContext'
import { ALERT_TYPES } from '../lib/constants'
import { formatDateTime, timeAgo } from '../lib/format'

const FILTERS = {
  open: { label: 'Open', test: (a) => a.status !== 'resolved' },
  resolved: { label: 'Resolved', test: (a) => a.status === 'resolved' },
  all: { label: 'All', test: () => true },
}

function ConnectionPill({ status }) {
  const live = status === 'open'
  return (
    <span className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${
      live ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/30 bg-amber-500/10 text-amber-300'}`}>
      {live ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
      {live ? 'Live' : status === 'denied' ? 'Access denied' : 'Reconnecting…'}
    </span>
  )
}

function Stat({ label, value, className }) {
  return (
    <div className="glass px-4 py-3">
      <p className="text-xs tracking-wide text-slate-400 uppercase">{label}</p>
      <p className={`text-2xl font-bold ${className}`}>{value}</p>
    </div>
  )
}

function AlertCard({ alert, selected, onSelect, onStatus, busy }) {
  const type = ALERT_TYPES[alert.alert_type]
  const Icon = type.icon
  const mapsUrl = `https://www.google.com/maps?q=${alert.latitude},${alert.longitude}`
  return (
    <div
      onClick={() => onSelect(alert.id)}
      className={`cursor-pointer rounded-2xl border p-4 transition ${
        selected ? 'border-teal-400/50 bg-teal-400/10' : 'border-white/10 bg-slate-900/50 hover:bg-white/5'
      } ${alert.status === 'active' ? 'shadow-lg shadow-red-900/30 ring-1 ring-red-500/40' : ''}`}
    >
      <div className="flex items-start gap-3">
        <div className={`rounded-xl border p-2 ${type.className}`}><Icon className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-white">{type.label}</p>
            <StatusBadge status={alert.status} />
            <span className="ml-auto text-xs text-slate-400" title={formatDateTime(alert.created_at)}>{timeAgo(alert.created_at)}</span>
          </div>
          <p className="mt-1 text-sm text-slate-200">{alert.user.full_name} · <span className="font-mono">{alert.user.reg_no}</span></p>
          <p className="text-xs text-slate-400">{alert.user.department}</p>
          {alert.location_note && <p className="mt-2 flex items-start gap-1 text-sm text-amber-200"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />{alert.location_note}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-400">
            <span className="font-mono">{alert.latitude.toFixed(5)}, {alert.longitude.toFixed(5)}</span>
            <a href={mapsUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1 text-teal-300 hover:underline">Directions <ExternalLink className="h-3 w-3" /></a>
            {alert.resolved_at && <span>Resolved {timeAgo(alert.resolved_at)}</span>}
          </div>
        </div>
      </div>
      {alert.status !== 'resolved' && (
        <div className="mt-3 flex gap-2" onClick={(e) => e.stopPropagation()}>
          {alert.status === 'active' && (
            <button className="btn flex-1 bg-amber-500 py-1.5 text-slate-950 hover:bg-amber-400" disabled={busy} onClick={() => onStatus(alert, 'dispatched')}>
              <Truck className="h-4 w-4" /> Dispatch
            </button>
          )}
          <button className="btn flex-1 bg-emerald-600 py-1.5 text-white hover:bg-emerald-500" disabled={busy} onClick={() => onStatus(alert, 'resolved')}>
            <CheckCheck className="h-4 w-4" /> Resolve
          </button>
        </div>
      )}
    </div>
  )
}

export default function SecurityDashboard() {
  const { emergency } = useRealtime()
  const { alerts, upsertAlerts, latestAlert, dismissLatest } = emergency
  const [filter, setFilter] = useState('open')
  const [selectedId, setSelectedId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState(null)
  const [, setTick] = useState(0)

  // Load history (including resolved alerts); the socket adds live changes on top.
  useEffect(() => {
    api.get('/api/emergency/alerts', { params: { limit: 200 } })
      .then((res) => upsertAlerts(res.data))
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false))
  }, [upsertAlerts])

  // Focus the newest SOS as soon as it arrives.
  useEffect(() => {
    if (!latestAlert) return
    setSelectedId(latestAlert.id)
    setFilter('open')
    dismissLatest()
  }, [latestAlert, dismissLatest])

  // Refresh the "x min ago" labels.
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30000)
    return () => clearInterval(t)
  }, [])

  const visible = useMemo(() => alerts.filter(FILTERS[filter].test), [alerts, filter])
  const today = new Date().toDateString()
  const stats = {
    active: alerts.filter((a) => a.status === 'active').length,
    dispatched: alerts.filter((a) => a.status === 'dispatched').length,
    resolvedToday: alerts.filter((a) => a.status === 'resolved' && new Date(a.resolved_at).toDateString() === today).length,
  }

  const changeStatus = async (alert, status) => {
    if (status === 'resolved' && !window.confirm(`Mark ${alert.user.full_name}'s alert as resolved?`)) return
    setBusyId(alert.id)
    setError(null)
    try {
      const res = await api.patch(`/api/emergency/alerts/${alert.id}/status`, { status })
      upsertAlerts([res.data])
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      <PageHeader
        icon={Siren}
        title="Emergency Control Room"
        subtitle="Live SOS alerts from students across campus"
        actions={
          <>
            <ConnectionPill status={emergency.status} />
            {emergency.soundOn ? (
              <button className="btn btn-ghost" onClick={emergency.disableSound}><BellRing className="h-4 w-4 text-emerald-300" /> Siren on</button>
            ) : (
              <button className="btn btn-danger animate-pulse" onClick={emergency.enableSound}><BellOff className="h-4 w-4" /> Enable siren</button>
            )}
          </>
        }
      />
      {!emergency.soundOn && (
        <p className="mb-4 text-sm text-amber-200/90">
          Browsers block sound until you click. Press <b>Enable siren</b> once so new SOS alerts play an audio alarm.
        </p>
      )}
      <ErrorBanner message={error} onClose={() => setError(null)} />

      <div className="mb-4 grid grid-cols-3 gap-3">
        <Stat label="Active" value={stats.active} className={stats.active ? 'text-red-400' : 'text-white'} />
        <Stat label="Dispatched" value={stats.dispatched} className="text-amber-300" />
        <Stat label="Resolved today" value={stats.resolvedToday} className="text-emerald-300" />
      </div>

      <div className="grid gap-4 xl:grid-cols-5">
        <div className="xl:col-span-3">
          <EmergencyMap alerts={visible} selectedId={selectedId} onSelect={setSelectedId} className="h-[360px] xl:h-[640px]" />
        </div>
        <div className="xl:col-span-2">
          <div className="mb-3 flex gap-2">
            {Object.entries(FILTERS).map(([key, f]) => (
              <button key={key} onClick={() => setFilter(key)}
                className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition ${filter === key ? 'border-[#dc2626] bg-[#dc2626] text-white!' : 'border-[#18354f]/20 bg-white! text-[#18354f] hover:border-[#18354f]/50'}`}>
                {f.label} ({alerts.filter(f.test).length})
              </button>
            ))}
          </div>
          <div className="max-h-[600px] space-y-3 overflow-y-auto pr-1">
            {loading ? <div className="flex justify-center py-10"><Spinner className="h-7 w-7" /></div>
              : visible.length === 0 ? <EmptyState icon={CheckCheck} title="No alerts here">All clear on campus.</EmptyState>
              : visible.map((a) => (
                <AlertCard key={a.id} alert={a} selected={a.id === selectedId} onSelect={setSelectedId}
                  onStatus={changeStatus} busy={busyId === a.id} />
              ))}
          </div>
        </div>
      </div>
    </div>
  )
}
