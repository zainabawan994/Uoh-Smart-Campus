import { useCallback, useEffect, useState } from 'react'
import {
  Briefcase, CalendarDays, ExternalLink, FileText, GraduationCap, Hammer, Link2, Megaphone, Mic,
  Music, RefreshCw, Search, Trophy, Volleyball,
} from 'lucide-react'
import api, { errorMessage } from '../api/client'
import { EmptyState, ErrorBanner, PageLoader, Spinner } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { THEMES, gradient } from '../lib/constants'
import { formatDateTime } from '../lib/format'

const PAGE_SIZE = 18

// Keys match backend app/scraper.py CATEGORIES (+ "news" for everything else).
const CATEGORIES = {
  workshop: { label: 'Workshops', icon: Hammer, color: '#7c3aed' },
  seminar: { label: 'Seminars & Talks', icon: Mic, color: '#0284c7' },
  competition: { label: 'Competitions', icon: Trophy, color: '#d97706' },
  sports: { label: 'Sports', icon: Volleyball, color: '#059669' },
  cultural: { label: 'Cultural', icon: Music, color: '#db2777' },
  career: { label: 'Jobs & Careers', icon: Briefcase, color: '#0d9488' },
  admissions: { label: 'Admissions', icon: GraduationCap, color: '#4f46e5' },
  tender: { label: 'Tenders', icon: FileText, color: '#475569' },
  news: { label: 'News', icon: Megaphone, color: '#2563eb' },
}
const PLATFORMS = {
  uoh: 'uoh.edu.pk', facebook: 'Facebook', instagram: 'Instagram', linkedin: 'LinkedIn', web: 'Website',
}

function EventCard({ event }) {
  const category = CATEGORIES[event.category] || CATEGORIES.news
  const Icon = category.icon
  const [imageOk, setImageOk] = useState(Boolean(event.image_url))
  return (
    <article className="group flex flex-col overflow-hidden rounded-xl border border-[#18354f]/12 bg-white transition hover:-translate-y-0.5 hover:border-[#18354f]/30 hover:shadow-lg">
      <div className="relative h-36 overflow-hidden" style={{ background: `linear-gradient(135deg, ${category.color}, ${category.color}b3)` }}>
        {imageOk
          ? <img src={event.image_url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setImageOk(false)} className="h-full w-full object-cover" />
          : <Icon className="absolute -right-4 -bottom-6 h-32 w-32 text-white/15!" aria-hidden />}
        <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-white! px-2.5 py-1 text-xs font-bold shadow" style={{ color: category.color }}>
          <Icon className="h-3.5 w-3.5" /> {category.label}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-[#bc2f36]">
          <CalendarDays className="h-3.5 w-3.5" /> {event.event_date || `Posted ${new Date(event.scraped_at).toLocaleDateString('en-PK', { day: 'numeric', month: 'short' })}`}
        </div>
        <h2 className="line-clamp-2 font-bold leading-snug text-[#18354f]">{event.title}</h2>
        {event.summary && <p className="mt-2 line-clamp-3 flex-1 text-sm leading-6 text-[#18354f]/70">{event.summary}</p>}
        <div className="mt-4 flex items-center justify-between border-t border-[#18354f]/10 pt-3 text-xs">
          <span className="text-[#18354f]/55" title={`Found ${formatDateTime(event.scraped_at)}`}>via {PLATFORMS[event.platform] || 'Website'}</span>
          <a href={event.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-[#18354f] hover:underline">
            Details <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </article>
  )
}

function Chip({ active, onClick, children, color = THEMES.events.accent }) {
  return <button onClick={onClick} aria-pressed={active} style={active ? { background: color, borderColor: color } : undefined}
    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition ${active ? 'text-white!' : 'border-[#18354f]/15 bg-white! text-[#18354f] hover:border-[#18354f]/40'}`}>
    {children}
  </button>
}

export default function EventsPage() {
  const { user } = useAuth()
  const isAdmin = user.role === 'admin'
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [platform, setPlatform] = useState('')
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [more, setMore] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [link, setLink] = useState('')
  const [importing, setImporting] = useState(false)
  const [notice, setNotice] = useState(null)
  const [error, setError] = useState(null)

  const load = useCallback(async (skip = 0) => {
    const params = { search: search || undefined, category: category || undefined, platform: platform || undefined, skip, limit: PAGE_SIZE }
    return (await api.get('/api/events', { params })).data
  }, [search, category, platform])

  const reload = useCallback(async () => {
    const data = await load()
    setEvents(data); setMore(data.length === PAGE_SIZE)
  }, [load])

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(null)
    load().then((data) => { if (!cancelled) { setEvents(data); setMore(data.length === PAGE_SIZE) } })
      .catch((err) => !cancelled && setError(errorMessage(err))).finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [load])

  const loadMore = async () => {
    try {
      const data = await load(events.length)
      setEvents((prev) => [...prev, ...data.filter((x) => !prev.some((p) => p.id === x.id))])
      setMore(data.length === PAGE_SIZE)
    } catch (err) { setError(errorMessage(err)) }
  }
  const sync = async () => {
    setSyncing(true); setError(null); setNotice(null)
    try {
      const res = await api.post('/api/events/sync')
      setNotice(`Checked all sources: ${res.data.inserted} new events added.`)
      await reload()
    } catch (err) { setError(errorMessage(err)) } finally { setSyncing(false) }
  }
  const importLink = async (e) => {
    e.preventDefault()
    setImporting(true); setError(null); setNotice(null)
    try {
      const res = await api.post('/api/events/import', { url: link.trim() })
      setNotice(`Added: ${res.data.title}`); setLink('')
      await reload()
    } catch (err) { setError(errorMessage(err)) } finally { setImporting(false) }
  }

  return (
    <div>
      <section className="relative mb-6 overflow-hidden rounded-2xl px-6 py-7 shadow-lg sm:px-8" style={{ background: gradient(THEMES.events) }}>
        <CalendarDays className="absolute -right-6 -bottom-8 h-44 w-44 text-white/10!" aria-hidden />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white!">Events & Opportunities</h1>
            <p className="mt-1 max-w-xl text-sm text-white/75!">Workshops, seminars, competitions, sports, jobs and notices from uoh.edu.pk, Facebook, Instagram and LinkedIn in one place.</p>
          </div>
          {isAdmin && <button className="btn bg-white! text-[#18354f]! hover:opacity-90" onClick={sync} disabled={syncing}>
            {syncing ? <Spinner className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />} Find new events
          </button>}
        </div>
      </section>

      {isAdmin && <form onSubmit={importLink} className="mb-5 flex flex-wrap gap-2 rounded-xl border border-dashed border-[#18354f]/25 p-3">
        <div className="relative min-w-60 flex-1"><Link2 className="absolute top-2.5 left-3 h-4 w-4 text-[#18354f]/55" />
          <input className="input pl-9" type="url" required placeholder="Paste a public Facebook, Instagram or LinkedIn post link…" value={link} onChange={(e) => setLink(e.target.value)} />
        </div>
        <button className="btn btn-primary" disabled={importing}>{importing && <Spinner className="h-4 w-4" />} Add event</button>
      </form>}

      <ErrorBanner message={error} onClose={() => setError(null)} />
      {notice && <div className="mb-4 rounded-md border border-[#18354f]/20 bg-[#18354f]/5 px-4 py-2 text-sm text-[#18354f]">{notice}</div>}

      <div className="mb-6 space-y-3">
        <form onSubmit={(e) => { e.preventDefault(); setSearch(query.trim()) }} className="flex gap-2">
          <div className="relative flex-1"><Search className="absolute top-2.5 left-3 h-4 w-4 text-[#18354f]/55" /><input className="input pl-9" placeholder="Search events…" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
          <button className="btn btn-ghost">Search</button>
          {search && <button type="button" className="btn btn-ghost" onClick={() => { setQuery(''); setSearch('') }}>Clear</button>}
        </form>
        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
          <Chip active={!category} onClick={() => setCategory('')}>All types</Chip>
          {Object.entries(CATEGORIES).filter(([key]) => key !== 'news').map(([key, c]) => {
            const Icon = c.icon
            return <Chip key={key} color={c.color} active={category === key} onClick={() => setCategory(key)}><Icon className="h-4 w-4" style={category === key ? undefined : { color: c.color }} /> {c.label}</Chip>
          })}
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1 text-sm [scrollbar-width:none]">
          <span className="shrink-0 font-semibold text-[#18354f]/60">Source:</span>
          <Chip active={!platform} onClick={() => setPlatform('')}>All</Chip>
          {Object.entries(PLATFORMS).filter(([key]) => key !== 'web').map(([key, label]) => (
            <Chip key={key} active={platform === key} onClick={() => setPlatform(key)}>{label}</Chip>
          ))}
        </div>
      </div>

      {loading ? <PageLoader /> : events.length === 0 ? (
        <EmptyState icon={CalendarDays} title="No events found">{category || platform || search ? 'Try another filter.' : 'Ask an admin to find new events.'}</EmptyState>
      ) : (
        <>
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{events.map((event) => <EventCard key={event.id} event={event} />)}</div>
          {more && <button className="btn btn-ghost mt-6 w-full" onClick={loadMore}>Load more</button>}
        </>
      )}
    </div>
  )
}
