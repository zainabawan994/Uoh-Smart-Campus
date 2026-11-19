import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, MapPin, Siren } from 'lucide-react'
import api, { errorMessage } from '../api/client'
import { ALERT_TYPES, CAMPUS_CENTER } from '../lib/constants'
import { ErrorBanner, Modal, Spinner, StatusBadge } from './ui'

const GPS_TIMEOUT_MS = 10000

/** Resolve to the browser position, or the campus centre if GPS is denied or unavailable. */
function getLocation() {
  return new Promise((resolve) => {
    const fallback = () => resolve({ latitude: CAMPUS_CENTER[0], longitude: CAMPUS_CENTER[1], accurate: false })
    if (!navigator.geolocation) return fallback()
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accurate: true }),
      fallback,
      { enableHighAccuracy: true, timeout: GPS_TIMEOUT_MS, maximumAge: 30000 },
    )
  })
}

export default function SOSButton() {
  const [open, setOpen] = useState(false)
  const [type, setType] = useState(null)
  const [note, setNote] = useState('')
  const [phase, setPhase] = useState('choose') // choose | locating | sending | sent
  const [error, setError] = useState(null)
  const [alert, setAlert] = useState(null)
  const [gpsAccurate, setGpsAccurate] = useState(true)

  const reset = useCallback(() => {
    setType(null)
    setNote('')
    setPhase('choose')
    setError(null)
    setAlert(null)
  }, [])

  const close = useCallback(() => {
    setOpen(false)
    if (phase === 'sent') reset()
  }, [phase, reset])

  const send = async () => {
    if (!type) return
    setError(null)
    setPhase('locating')
    const loc = await getLocation()
    setGpsAccurate(loc.accurate)
    setPhase('sending')
    const cleanNote = note.trim()
    const location_note = loc.accurate ? cleanNote : `${cleanNote} [GPS unavailable: campus centre used]`.trim()
    try {
      const res = await api.post('/api/emergency/sos', {
        alert_type: type,
        latitude: loc.latitude,
        longitude: loc.longitude,
        location_note: location_note.slice(0, 255) || null,
      })
      setAlert(res.data)
      setPhase('sent')
    } catch (err) {
      setError(errorMessage(err, 'Could not send the SOS. Call campus security directly.'))
      setPhase('choose')
    }
  }

  // While the confirmation is open, poll so the student sees "Dispatched" / "Resolved".
  useEffect(() => {
    if (!alert || alert.status === 'resolved' || !open) return
    const timer = setInterval(async () => {
      try {
        const res = await api.get('/api/emergency/my')
        const latest = res.data.find((a) => a.id === alert.id)
        if (latest) setAlert(latest)
      } catch {
        /* keep the last known status */
      }
    }, 8000)
    return () => clearInterval(timer)
  }, [alert, open])

  const busy = phase === 'locating' || phase === 'sending'

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed right-5 bottom-5 z-[900] flex h-16 w-16 items-center justify-center rounded-full bg-[#bc2f36] font-bold text-white! shadow-[0_6px_20px_rgba(188,47,54,0.28)] transition hover:scale-105 focus-visible:ring-4 focus-visible:ring-[#bc2f36]/25 focus-visible:outline-none"
        aria-label="Send emergency SOS"
      >
        <span className="sos-ring absolute inset-0 rounded-full bg-red-500" aria-hidden />
        <span className="relative flex flex-col items-center leading-none">
          <Siren className="h-6 w-6" />
          <span className="mt-0.5 text-[11px] tracking-widest">SOS</span>
        </span>
      </button>

      <Modal open={open} onClose={busy ? undefined : close} title={phase === 'sent' ? 'SOS sent' : 'Emergency SOS'}>
        {phase === 'sent' && alert ? (
          <div className="space-y-4 text-center">
            <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-400" />
            <p className="text-slate-200">
              Campus security has received your <b>{ALERT_TYPES[alert.alert_type].label}</b> alert.
            </p>
            <div className="flex items-center justify-center gap-2 text-sm text-slate-400">
              Status: <StatusBadge status={alert.status} />
            </div>
            {!gpsAccurate && (
              <p className="rounded-md border border-[#18354f]/20 bg-[#18354f]/5 px-3 py-2 text-sm text-[#18354f]">
                Your exact GPS location was not available. Stay where you are and keep your phone reachable.
              </p>
            )}
            <button className="btn btn-ghost w-full" onClick={close}>Close</button>
          </div>
        ) : (

          <div className="space-y-4">
            <ErrorBanner message={error} />
            <p className="text-sm text-slate-400">Choose the type of emergency. Your location is shared with campus security.</p>
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(ALERT_TYPES).map(([key, t]) => {
                const Icon = t.icon
                const selected = type === key
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={busy}
                    onClick={() => setType(key)}
                    className={`flex flex-col items-center gap-2 rounded-md border p-4 text-sm font-semibold transition ${
                      selected ? 'badge-signal ring-2 ring-[#bc2f36]/25' : 'border-[#18354f]/20 bg-white text-[#18354f] hover:bg-[#18354f]/5'
                    }`}
                    style={undefined}
                    aria-pressed={selected}
                  >
                    <Icon className="h-8 w-8" style={{ color: t.color }} />
                    {t.label}
                  </button>
                )
              })}
            </div>
            <div>
              <label className="label" htmlFor="sos-note">Building / room (optional)</label>
              <input
                id="sos-note"
                className="input"
                maxLength={200}
                placeholder="e.g. CS Block, Room 104"
                value={note}
                disabled={busy}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
            <button className="btn btn-danger w-full py-3 text-base" disabled={!type || busy} onClick={send}>
              {busy ? <Spinner className="h-5 w-5" /> : <MapPin className="h-5 w-5" />}
              {phase === 'locating' ? 'Getting your location…' : phase === 'sending' ? 'Sending…' : 'Send SOS now'}
            </button>
          </div>
        )}
      </Modal>
    </>
  )
}
