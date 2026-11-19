const pkr = new Intl.NumberFormat('en-PK', { maximumFractionDigits: 0 })

export function formatPKR(value) {
  return `Rs. ${pkr.format(Number(value))}`
}

/** "14:30:00" -> "2:30 PM" */
export function formatTime(hhmmss) {
  if (!hhmmss) return ''
  const [h, m] = hhmmss.split(':').map(Number)
  const suffix = h >= 12 ? 'PM' : 'AM'
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${suffix}`
}

export function formatDateTime(iso) {
  return new Date(iso).toLocaleString('en-PK', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  })
}

export function formatClock(iso) {
  return new Date(iso).toLocaleTimeString('en-PK', { hour: 'numeric', minute: '2-digit' })
}

export function timeAgo(iso) {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (seconds < 45) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days} d ago`
  return new Date(iso).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Today's weekday name; weekends fall back to Monday for the timetable. */
export function todayName({ weekendFallback = true } = {}) {
  const name = new Date().toLocaleDateString('en-US', { weekday: 'long' })
  if (weekendFallback && name === 'Sunday') return 'Monday'
  return name
}

/** Stable colour class for a department badge. */
export function departmentColor() {
  return 'badge-neutral'
}

export function initials(name = '') {
  return name
    .replace(/\(.*?\)/g, '')
    .replace(/^(Dr|Mr|Ms|Mrs|Prof)\.?\s+/i, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
}
