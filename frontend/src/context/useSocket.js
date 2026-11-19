import { useCallback, useEffect, useRef, useState } from 'react'
import { wsUrl } from '../api/client'

const PING_MS = 25000
const MAX_BACKOFF_MS = 30000

/**
 * Authenticated WebSocket with automatic reconnect (exponential backoff) and keep-alive pings.
 * status: idle | connecting | open | reconnecting | denied
 */
export function useSocket(path, { enabled = true, onMessage }) {
  const [status, setStatus] = useState('idle')
  const wsRef = useRef(null)
  const handlerRef = useRef(onMessage)

  useEffect(() => {
    handlerRef.current = onMessage
  }, [onMessage])

  useEffect(() => {
    if (!enabled) {
      setStatus('idle')
      return
    }
    let stopped = false
    let attempt = 0
    let retryTimer = null
    let pingTimer = null

    const connect = () => {
      setStatus(attempt === 0 ? 'connecting' : 'reconnecting')
      const ws = new WebSocket(wsUrl(path))
      wsRef.current = ws

      ws.onopen = () => {
        attempt = 0
        setStatus('open')
        pingTimer = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send('ping'), PING_MS)
      }
      ws.onmessage = (event) => {
        if (event.data === 'pong') return
        try {
          handlerRef.current?.(JSON.parse(event.data))
        } catch {
          /* ignore malformed frames */
        }
      }
      ws.onclose = (event) => {
        clearInterval(pingTimer)
        if (wsRef.current === ws) wsRef.current = null
        if (stopped) return
        if (event.code === 4401 || event.code === 4403) {
          setStatus('denied') // not allowed: retrying will not help
          return
        }
        setStatus('reconnecting')
        const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** attempt++)
        retryTimer = setTimeout(connect, delay)
      }
    }

    connect()
    return () => {
      stopped = true
      clearTimeout(retryTimer)
      clearInterval(pingTimer)
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [path, enabled])

  const send = useCallback((data) => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return false
    ws.send(typeof data === 'string' ? data : JSON.stringify(data))
    return true
  }, [])

  return { status, send }
}
