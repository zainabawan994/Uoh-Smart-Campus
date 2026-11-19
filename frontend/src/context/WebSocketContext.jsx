import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { useAuth } from './AuthContext'
import { useSocket } from './useSocket'
import { ALERT_TYPES } from '../lib/constants'
import { playSiren, unlockAudio } from '../lib/siren'

const WebSocketContext = createContext(null)

function sortAlerts(list) {
  return [...list].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
}

/**
 * Two app-wide sockets:
 *  - /ws/chat for every signed-in user (messages + who is online)
 *  - /ws/emergency for security staff and admins (live SOS alerts + siren)
 */
export function WebSocketProvider({ children }) {
  const { user } = useAuth()
  const isResponder = user?.role === 'security' || user?.role === 'admin'

  // ---------------- Live chat ----------------
  const [messages, setMessages] = useState([])
  const [online, setOnline] = useState([])
  const [chatError, setChatError] = useState(null)

  const onChat = useCallback((data) => {
    if (data.type === 'history') setMessages(data.messages)
    else if (data.type === 'presence') setOnline(data.users)
    else if (data.type === 'message') setMessages((prev) => [...prev.slice(-199), data])
    else if (data.type === 'error') {
      setChatError(data.detail)
      setTimeout(() => setChatError(null), 3000)
    }
  }, [])
  const chat = useSocket('/ws/chat', { enabled: Boolean(user), onMessage: onChat })
  const chatSend = chat.send
  const sendChat = useCallback((text) => chatSend({ message: text }), [chatSend])

  // ------------- Emergency alerts -------------
  const [alerts, setAlerts] = useState([])
  const [latestAlert, setLatestAlert] = useState(null)
  const [soundOn, setSoundOn] = useState(false)
  const soundRef = useRef(false)

  const upsertAlerts = useCallback((incoming) => {
    setAlerts((prev) => {
      const map = new Map(prev.map((a) => [a.id, a]))
      for (const a of incoming) map.set(a.id, a)
      return sortAlerts(map.values())
    })
  }, [])

  const notify = useCallback((alert) => {
    if (soundRef.current) playSiren(4)
    if ('Notification' in window && Notification.permission === 'granted') {
      const kind = ALERT_TYPES[alert.alert_type]?.label || 'Emergency'
      new Notification(`SOS: ${kind}`, {
        body: `${alert.user.full_name} (${alert.user.reg_no}) ${alert.location_note || ''}`,
        tag: alert.id,
        requireInteraction: true,
      })
    }
  }, [])

  const onEmergency = useCallback(
    (data) => {
      if (data.type === 'snapshot') upsertAlerts(data.alerts)
      else if (data.type === 'alert_updated') upsertAlerts([data.alert])
      else if (data.type === 'new_alert') {
        upsertAlerts([data.alert])
        setLatestAlert(data.alert)
        notify(data.alert)
      }
    },
    [upsertAlerts, notify],
  )
  const emergency = useSocket('/ws/emergency', { enabled: isResponder, onMessage: onEmergency })

  /** Must be called from a click: browsers block audio until the user interacts. */
  const enableSound = useCallback(async () => {
    unlockAudio()
    soundRef.current = true
    setSoundOn(true)
    if ('Notification' in window && Notification.permission === 'default') {
      try {
        await Notification.requestPermission()
      } catch {
        /* not supported */
      }
    }
  }, [])

  const disableSound = useCallback(() => {
    soundRef.current = false
    setSoundOn(false)
  }, [])

  const dismissLatest = useCallback(() => setLatestAlert(null), [])

  const chatValue = useMemo(
    () => ({ status: chat.status, messages, online, error: chatError, send: sendChat }),
    [chat.status, messages, online, chatError, sendChat],
  )
  const emergencyValue = useMemo(
    () => ({
      status: emergency.status, alerts, latestAlert, dismissLatest,
      upsertAlerts, soundOn, enableSound, disableSound,
    }),
    [emergency.status, alerts, latestAlert, dismissLatest, upsertAlerts, soundOn, enableSound, disableSound],
  )
  const value = useMemo(() => ({ chat: chatValue, emergency: emergencyValue }), [chatValue, emergencyValue])

  return <WebSocketContext.Provider value={value}>{children}</WebSocketContext.Provider>
}

export function useRealtime() {
  const ctx = useContext(WebSocketContext)
  if (!ctx) throw new Error('useRealtime must be used inside <WebSocketProvider>')
  return ctx
}
