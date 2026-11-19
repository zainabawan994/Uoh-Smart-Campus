import {
  Flame, HeartPulse, ShieldAlert, UserX,
  UtensilsCrossed, Soup, Cookie, CupSoda,
} from 'lucide-react'

export const APP_NAME = 'UoH Smart Campus'
export const UNIVERSITY = 'The University of Haripur, Khyber Pakhtunkhwa'
export const CAMPUS_CENTER = [33.9946, 72.9106]

// Visual palette: white, University navy and emergency red only.
export const COLORS = { paper: '#ffffff', ink: '#18354f', signal: '#bc2f36' }

export const ROLES = {
  student: { label: 'Student', className: 'badge-neutral' },
  security: { label: 'Security', className: 'badge-signal' },
  cafe_manager: { label: 'Cafe Manager', className: 'badge-neutral' },
  admin: { label: 'Admin', className: 'badge-neutral' },
}

export const ALERT_TYPES = {
  medical: { label: 'Medical', icon: HeartPulse, color: COLORS.signal, className: 'badge-signal' },
  security: { label: 'Security', icon: ShieldAlert, color: COLORS.signal, className: 'badge-signal' },
  fire: { label: 'Fire', icon: Flame, color: COLORS.signal, className: 'badge-signal' },
  harassment: { label: 'Harassment', icon: UserX, color: COLORS.signal, className: 'badge-signal' },
}

export const ALERT_STATUS = {
  active: { label: 'Active', className: 'badge-signal' },
  dispatched: { label: 'Dispatched', className: 'badge-neutral' },
  resolved: { label: 'Resolved', className: 'badge-neutral' },
}

export const POST_CATEGORIES = {
  general: { label: 'General', className: 'border-[#0284c7]/30 bg-[#0284c7]/10 text-[#0369a1]' },
  lost_and_found: { label: 'Lost & Found', className: 'border-[#d97706]/30 bg-[#d97706]/10 text-[#b45309]' },
  study_help: { label: 'Study Help', className: 'border-[#059669]/30 bg-[#059669]/10 text-[#047857]' },
  announcement: { label: 'Announcement', className: 'border-[#db2777]/30 bg-[#db2777]/10 text-[#be185d]' },
}

export const CAFE_CATEGORIES = {
  fast_food: { label: 'Fast Food', icon: UtensilsCrossed, color: '#dc2626' },
  desi: { label: 'Desi', icon: Soup, color: '#d97706' },
  snacks: { label: 'Snacks', icon: Cookie, color: '#db2777' },
  beverages: { label: 'Beverages', icon: CupSoda, color: '#0284c7' },
}

export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export const DEPARTMENTS = [
  'Computer Science', 'Information Technology', 'Software Engineering', 'Agriculture',
  'Environmental Sciences', 'Forestry & Wildlife Management', 'Food Science & Technology',
  'Microbiology', 'Medical Laboratory Technology', 'Chemistry', 'Physics', 'Mathematics',
  'Management Sciences', 'Economics', 'English', 'Education', 'Psychology', 'Law',
  'Islamic & Religious Studies',
]

// One colour theme per section: banner gradient, accent for icons/chips, light tint for the dark sidebar.
export const THEMES = {
  home: { from: '#1e3a8a', to: '#5b21b6', accent: '#4f46e5', light: '#a5b4fc' },
  security: { from: '#dc2626', to: '#7f1d1d', accent: '#dc2626', light: '#fca5a5' },
  feed: { from: '#7c3aed', to: '#4c1d95', accent: '#7c3aed', light: '#c4b5fd' },
  chat: { from: '#0d9488', to: '#155e75', accent: '#0d9488', light: '#5eead4' },
  timetable: { from: '#059669', to: '#065f46', accent: '#059669', light: '#6ee7b7' },
  cafe: { from: '#f97316', to: '#b45309', accent: '#ea580c', light: '#fdba74' },
  events: { from: '#db2777', to: '#7e22ce', accent: '#db2777', light: '#f9a8d4' },
  admin: { from: '#475569', to: '#312e81', accent: '#6366f1', light: '#cbd5e1' },
}

export function themeFor(pathname = '/') {
  return THEMES[pathname.split('/')[1]] || THEMES.home
}

export const gradient = (t) => `linear-gradient(135deg, ${t.from} 0%, ${t.to} 100%)`
