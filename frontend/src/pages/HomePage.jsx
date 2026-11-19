import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight, CalendarClock, Coffee, GraduationCap, Megaphone, MessagesSquare, Newspaper, ShieldCheck, Siren,
} from 'lucide-react'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useRealtime } from '../context/WebSocketContext'
import { CAFE_CATEGORIES, POST_CATEGORIES, ROLES, THEMES, gradient, themeFor } from '../lib/constants'
import { formatPKR, formatTime, todayName } from '../lib/format'

const roleActions = {
  student: [
    ['/feed', 'Campus Feed', 'Post, find lost items and ask for study help', Newspaper],
    ['/chat', 'Live Chat', 'Talk to students and campus staff', MessagesSquare],
    ['/timetable', 'My Timetable', 'See today’s classes and rooms', CalendarClock],
    ['/cafe', 'Cafe Menu', 'Check live availability and PKR prices', Coffee],
    ['/events', 'Events', 'Workshops, seminars, sports and jobs', Megaphone],
  ],
  security: [
    ['/security', 'Emergency Control Room', 'Monitor live SOS alerts and campus map', Siren],
    ['/chat', 'Live Chat', 'Coordinate with the campus community', MessagesSquare],
    ['/cafe', 'Cafe Menu', 'View today’s cafeteria menu', Coffee],
    ['/events', 'Events', 'Workshops, seminars and university news', Megaphone],
  ],
  cafe_manager: [
    ['/cafe', 'Manage Cafe Menu', 'Add items, prices and live availability', Coffee],
    ['/chat', 'Live Chat', 'Connect with students and staff', MessagesSquare],
    ['/events', 'Events', 'Workshops, seminars and university news', Megaphone],
  ],
  admin: [
    ['/admin', 'Administration', 'Manage users, roles and campus records', ShieldCheck],
    ['/security', 'Emergency Control Room', 'Monitor and respond to SOS alerts', Siren],
    ['/timetable', 'Manage Timetable', 'Add, edit or upload class schedules', CalendarClock],
    ['/events', 'Events', 'Find events and add them from social links', Megaphone],
    ['/cafe', 'Cafe Menu', 'Manage cafeteria items and availability', Coffee],
  ],
}


function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

function ActionCard({ item }) {
  const [to, title, text, Icon] = item
  const color = themeFor(to).accent
  return (
    <Link to={to} className="glass group relative overflow-hidden p-5 transition hover:-translate-y-0.5 hover:shadow-lg">
      <span className="absolute inset-x-0 top-0 h-1" style={{ background: color }} />
      <div className="flex items-start justify-between">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: `${color}1a`, color }}><Icon className="h-5 w-5" /></div>
        <ArrowRight className="h-4 w-4 text-[#18354f]/35 transition group-hover:translate-x-1" />
      </div>
      <h2 className="mt-4 font-bold text-[#18354f]">{title}</h2>
      <p className="mt-1 text-sm text-[#18354f]/60">{text}</p>
    </Link>
  )
}

function Stat({ value, label, alert }) {
  return <div className="rounded-xl px-4 py-3 text-center" style={{ background: alert ? 'rgb(188 47 54 / 0.9)' : 'rgb(255 255 255 / 0.12)' }}>
    <p className="text-2xl font-bold text-white!">{value}</p><p className="text-xs text-white/75!">{label}</p>
  </div>
}

export default function HomePage() {
  const { user } = useAuth()
  const { chat, emergency } = useRealtime()
  const [preview, setPreview] = useState({ timetable: [], menu: [], events: [], posts: [] })
  const isStudent = user.role === 'student'

  useEffect(() => {
    let cancelled = false
    const requests = [
      isStudent ? api.get('/api/timetable', { params: { day: todayName() } }) : Promise.resolve({ data: [] }),
      api.get('/api/cafe/menu', { params: { available_only: true } }),
      api.get('/api/events', { params: { limit: 3 } }),
      isStudent ? api.get('/api/posts', { params: { limit: 3 } }) : Promise.resolve({ data: [] }),
    ]
    Promise.allSettled(requests).then((results) => {
      if (cancelled) return
      const data = results.map((r) => (r.status === 'fulfilled' ? r.value.data : []))
      setPreview({ timetable: data[0], menu: data[1], events: data[2], posts: data[3] })
    })
    return () => { cancelled = true }
  }, [isStudent])

  const role = ROLES[user.role]
  const activeAlerts = emergency.alerts.filter((a) => a.status === 'active').length
  return (
    <div>
      <section className="page-banner relative overflow-hidden rounded-2xl p-6 shadow-lg sm:p-8" style={{ background: gradient(THEMES.home) }}>
        <GraduationCap className="pointer-events-none absolute -right-8 -bottom-10 h-52 w-52 text-white/10!" aria-hidden />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <span className="inline-block rounded-full px-3 py-1 text-xs font-semibold text-white!" style={{ background: 'rgb(255 255 255 / 0.14)' }}>{role.label} portal</span>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-white! sm:text-4xl">{greeting()}, {user.full_name.split(' ').find((w) => !/^(dr|mr|mrs|ms|prof|engr|sir)\.?$/i.test(w)) || user.full_name}</h1>
            <p className="mt-1 text-white/75!">{user.department} · {user.reg_no}{isStudent ? ` · Semester ${user.semester}${user.section}` : ''}</p>
          </div>
          <div className="flex gap-3">
            <Stat value={chat.online.length} label="Online now" />
            {isStudent && <Stat value={preview.timetable.length} label="Classes today" />}
            <Stat value={preview.menu.length} label="Cafe items" />
            {(user.role === 'security' || user.role === 'admin') && <Stat value={activeAlerts} label="Active SOS" alert={activeAlerts > 0} />}
          </div>
        </div>
      </section>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {(roleActions[user.role] || roleActions.student).map((item) => <ActionCard key={item[0]} item={item} />)}
      </div>

      <div className={`mt-5 grid gap-4 md:grid-cols-2 ${isStudent ? 'xl:grid-cols-3' : ''}`}>
        {isStudent && (
          <section className="glass p-5">
            <div className="mb-3 flex items-center justify-between"><h2 className="font-bold text-[#18354f]">Today’s classes</h2><Link to="/timetable" className="text-xs font-semibold text-[#24507a] hover:underline">View all</Link></div>
            {preview.timetable.length ? preview.timetable.slice(0, 4).map((t) => (
              <div key={t.id} className="mb-2 flex items-center gap-3 rounded-xl bg-[#f3f6fa] p-3 text-sm">
                <span className="w-16 font-medium text-teal-300">{formatTime(t.start_time)}</span>
                <div className="min-w-0"><p className="truncate text-slate-200">{t.subject_name}</p><p className="text-xs text-slate-500">{t.room_no}</p></div>
              </div>
            )) : <p className="text-sm text-slate-500">No classes scheduled for {todayName()}.</p>}
          </section>
        )}
        <section className="glass p-5">
          <div className="mb-3 flex items-center justify-between"><h2 className="font-bold text-[#18354f]">Cafe available now</h2><Link to="/cafe" className="text-xs font-semibold text-[#24507a] hover:underline">Full menu</Link></div>
          {preview.menu.slice(0, 4).map((item) => (
            <div key={item.id} className="mb-2 flex items-center justify-between gap-2 rounded-xl bg-[#f3f6fa] p-3 text-sm">
              <div><p className="text-slate-200">{item.item_name}</p><p className="text-xs text-slate-500">{CAFE_CATEGORIES[item.category]?.label}</p></div>
              <span className="font-medium text-amber-300">{formatPKR(item.price)}</span>
            </div>
          ))}
        </section>
        <section className="glass p-5">
          <div className="mb-3 flex items-center justify-between"><h2 className="font-bold text-[#18354f]">Latest events</h2><Link to="/events" className="text-xs font-semibold text-[#24507a] hover:underline">View all</Link></div>
          {preview.events.map((event) => (
            <a key={event.id} href={event.source_url} target="_blank" rel="noreferrer" className="mb-2 block rounded-xl bg-[#f3f6fa] p-3 text-sm hover:bg-[#e8eef5]">
              <p className="line-clamp-2 text-slate-200">{event.title}</p><p className="mt-1 text-xs text-slate-500">{event.event_date || 'University update'}</p>
            </a>
          ))}
        </section>
      </div>
    </div>
  )
}
