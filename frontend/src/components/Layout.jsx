import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { CalendarClock, Coffee, GraduationCap, House, KeyRound, LogOut, Megaphone, Menu, MessagesSquare, Newspaper, ShieldCheck, Siren, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useRealtime } from '../context/WebSocketContext'
import { ALERT_TYPES, APP_NAME, themeFor } from '../lib/constants'
import ChangePassword from './ChangePassword'
import SOSButton from './SOSButton'
import { Avatar, Modal, RoleBadge } from './ui'

const ALL = ['student', 'security', 'cafe_manager', 'admin']
export const NAV_ITEMS = [
  { to: '/', label: 'Home', icon: House, roles: ALL, end: true },
  { to: '/security', label: 'Control Room', icon: Siren, roles: ['security', 'admin'] },
  { to: '/feed', label: 'Social Feed', icon: Newspaper, roles: ['student', 'admin'] },
  { to: '/chat', label: 'Live Chat', icon: MessagesSquare, roles: ALL },
  { to: '/timetable', label: 'Timetable', icon: CalendarClock, roles: ['student', 'admin'] },
  { to: '/cafe', label: 'Cafe Menu', icon: Coffee, roles: ALL },
  { to: '/events', label: 'Events', icon: Megaphone, roles: ALL },
  { to: '/admin', label: 'Administration', icon: ShieldCheck, roles: ['admin'] },
]

function Brand() {
  return <Link to="/" className="flex items-center gap-3 pb-5" style={{ borderBottom: '1px solid rgb(255 255 255 / 0.12)' }}>
    <div className="on-light flex h-10 w-10 items-center justify-center rounded-xl bg-white!"><GraduationCap className="h-6 w-6" /></div>
    <div className="leading-tight"><p className="font-bold text-white!">{APP_NAME}</p><p className="text-[11px]">University of Haripur</p></div>
  </Link>
}

function SideNav({ role, onNavigate, activeAlerts }) {
  return <nav className="flex flex-col gap-1">{NAV_ITEMS.filter((item) => item.roles.includes(role)).map(({ to, label, icon: Icon, end }) =>
    <NavLink key={to} to={to} end={end} onClick={onNavigate} className={({ isActive }) => `nav-link relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${isActive ? 'nav-active' : ''}`}>
      {({ isActive }) => <>
      {isActive && <span className="absolute top-2 bottom-2 left-0 w-1 rounded-r" style={{ background: themeFor(to).light }} />}
      <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: `${themeFor(to).light}${isActive ? '40' : '1f'}` }}><Icon className="h-4 w-4" style={{ color: themeFor(to).light }} /></span><span className="flex-1">{label}</span>
      {to === '/security' && activeAlerts > 0 && <span className="rounded-md bg-[#bc2f36] px-2 py-0.5 text-xs font-bold text-white!">{activeAlerts}</span>}
      </>}
    </NavLink>)}</nav>
}

function NewAlertBanner() {
  const { emergency } = useRealtime(); const location = useLocation(); const alert = emergency.latestAlert
  if (!alert || location.pathname === '/security') return null
  return <div className="mb-5 flex flex-wrap items-center gap-3 rounded-md border-l-4 border-[#bc2f36] bg-[#bc2f36]/8 px-4 py-3 text-[#bc2f36]">
    <Siren className="h-5 w-5" /><span className="flex-1 text-sm"><b>New {ALERT_TYPES[alert.alert_type]?.label} SOS</b> from {alert.user.full_name} ({alert.user.reg_no}){alert.location_note ? ` · ${alert.location_note}` : ''}</span>
    <Link to="/security" onClick={emergency.dismissLatest} className="btn btn-danger py-1.5">Open Control Room</Link>
    <button onClick={emergency.dismissLatest} aria-label="Dismiss"><X className="h-4 w-4" /></button>
  </div>
}

export default function Layout() {
  const { user, logout } = useAuth(); const { emergency } = useRealtime(); const [menuOpen, setMenuOpen] = useState(false); const [passwordOpen, setPasswordOpen] = useState(false); const location = useLocation()
  const activeAlerts = emergency.alerts.filter((a) => a.status === 'active').length
  useEffect(() => setMenuOpen(false), [location.pathname])
  const sidebar = <div className="flex h-full flex-col gap-6 p-5"><Brand /><SideNav role={user.role} activeAlerts={activeAlerts} onNavigate={() => setMenuOpen(false)} />
    <div className="mt-auto rounded-xl p-3" style={{ background: 'rgb(255 255 255 / 0.07)', border: '1px solid rgb(255 255 255 / 0.1)' }}><div className="flex items-center gap-3"><Avatar name={user.full_name} className="h-9 w-9 text-sm bg-[#bc2f36]!" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-white!">{user.full_name}</p><p className="truncate text-xs">{user.reg_no}</p></div></div>
      <div className="mt-3 flex items-center justify-between"><RoleBadge role={user.role} /><button onClick={logout} className="flex items-center gap-1 text-xs font-semibold hover:opacity-70"><LogOut className="h-4 w-4" /> Log out</button></div>
      <button onClick={() => setPasswordOpen(true)} className="mt-2 flex items-center gap-1 text-xs font-semibold hover:opacity-70"><KeyRound className="h-3.5 w-3.5" /> Change password</button></div></div>
  return <div className="min-h-screen lg:pl-64">
    <aside className="sidebar fixed inset-y-0 left-0 z-40 hidden w-64 lg:block">{sidebar}</aside>
    <header className="sidebar sticky top-0 z-40 flex items-center justify-between [&>a]:border-0! [&>a]:pb-0! px-4 py-3 lg:hidden"><Brand /><button onClick={() => setMenuOpen(true)} className="rounded p-2 hover:opacity-70" aria-label="Open menu"><Menu className="h-6 w-6" /></button></header>
    {menuOpen && <div className="fixed inset-0 z-50 lg:hidden"><div className="absolute inset-0 bg-[#18354f]/55" onClick={() => setMenuOpen(false)} /><aside className="sidebar absolute inset-y-0 left-0 w-72"><button onClick={() => setMenuOpen(false)} className="absolute top-4 right-4" aria-label="Close menu"><X className="h-5 w-5" /></button>{sidebar}</aside></div>}
    <main className="mx-auto max-w-7xl px-4 py-7 sm:px-6 lg:px-10">{(user.role === 'security' || user.role === 'admin') && <NewAlertBanner />}<Outlet /></main>
    {user.role === 'student' && <SOSButton />}
    <Modal open={passwordOpen} onClose={() => setPasswordOpen(false)} title="Change password">
      {passwordOpen && <ChangePassword onClose={() => setPasswordOpen(false)} />}
    </Modal>
  </div>
}
