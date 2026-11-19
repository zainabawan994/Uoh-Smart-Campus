import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarClock, FileUp, Pencil, Plus, Trash2 } from 'lucide-react'
import api, { errorMessage } from '../api/client'
import { EmptyState, ErrorBanner, Modal, PageHeader, PageLoader, Spinner } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { DAYS } from '../lib/constants'
import { formatTime, todayName } from '../lib/format'

const EMPTY = { department: '', semester: 1, section: 'A', day_of_week: 'Monday', subject_name: '', teacher_name: '', room_no: '', start_time: '08:30', end_time: '10:00' }

function EntryForm({ item, user, onClose, onSaved }) {
  const [form, setForm] = useState(item ? { ...item, start_time: item.start_time.slice(0, 5), end_time: item.end_time.slice(0, 5) } : { ...EMPTY, department: user.department, semester: user.semester, section: user.section })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError(null)
    try {
      const payload = { ...form, semester: Number(form.semester), department: form.department.trim(), section: form.section.trim().toUpperCase() }
      const res = item ? await api.put(`/api/timetable/${item.id}`, payload) : await api.post('/api/timetable', payload)
      onSaved(res.data); onClose()
    } catch (err) { setError(errorMessage(err)) } finally { setBusy(false) }
  }
  return <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
    <div className="sm:col-span-2"><ErrorBanner message={error} /></div>
    <div className="sm:col-span-2"><label className="label">Department</label><input className="input" required value={form.department} onChange={set('department')} /></div>
    <div><label className="label">Semester</label><input className="input" type="number" min="1" max="12" required value={form.semester} onChange={set('semester')} /></div>
    <div><label className="label">Section</label><input className="input uppercase" maxLength="10" required value={form.section} onChange={set('section')} /></div>
    <div><label className="label">Day</label><select className="input" value={form.day_of_week} onChange={set('day_of_week')}>{DAYS.map((d) => <option key={d}>{d}</option>)}</select></div>
    <div><label className="label">Room</label><input className="input" required value={form.room_no} onChange={set('room_no')} /></div>
    <div className="sm:col-span-2"><label className="label">Subject</label><input className="input" required value={form.subject_name} onChange={set('subject_name')} /></div>
    <div className="sm:col-span-2"><label className="label">Teacher</label><input className="input" required value={form.teacher_name} onChange={set('teacher_name')} /></div>
    <div><label className="label">Start time</label><input className="input" type="time" required value={form.start_time} onChange={set('start_time')} /></div>
    <div><label className="label">End time</label><input className="input" type="time" required value={form.end_time} onChange={set('end_time')} /></div>
    <div className="sm:col-span-2 flex justify-end gap-2"><button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy}>{busy && <Spinner className="h-4 w-4" />} Save entry</button></div>
  </form>
}

function CSVUpload({ onClose, onDone }) {
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const submit = async (e) => {
    e.preventDefault(); if (!file) return; setBusy(true); setError(null)
    const form = new FormData(); form.append('file', file)
    try { const res = await api.post('/api/timetable/upload-csv', form); setResult(res.data); onDone() }
    catch (err) { setError(errorMessage(err)) } finally { setBusy(false) }
  }
  return <div className="space-y-4">
    <p className="text-sm text-slate-400">CSV headers: department, semester, section, day_of_week, subject_name, teacher_name, room_no, start_time, end_time. Use HH:MM times.</p>
    <ErrorBanner message={error} />
    <form onSubmit={submit} className="space-y-3"><input className="input" type="file" accept=".csv,text/csv" required onChange={(e) => setFile(e.target.files?.[0])} />
      <button className="btn btn-primary w-full" disabled={!file || busy}>{busy && <Spinner className="h-4 w-4" />} Upload CSV</button></form>
    {result && <div className="rounded-xl bg-white/5 p-3 text-sm"><p className="text-emerald-300">Inserted {result.inserted} rows.</p>{result.errors.map((x) => <p key={x} className="mt-1 text-red-300">{x}</p>)}</div>}
    <button className="btn btn-ghost w-full" onClick={onClose}>Close</button>
  </div>
}

function ScheduleCard({ entry, canManage, onEdit, onDelete }) {
  return <article className="glass flex items-start gap-4 p-4">
    <div className="w-24 shrink-0"><p className="font-semibold text-teal-300">{formatTime(entry.start_time)}</p><p className="text-xs text-slate-500">to {formatTime(entry.end_time)}</p></div>
    <div className="min-w-0 flex-1"><h3 className="font-semibold text-white">{entry.subject_name}</h3><p className="text-sm text-slate-400">{entry.teacher_name}</p><p className="mt-1 text-xs text-amber-300">Room {entry.room_no}</p></div>
    {canManage && <div className="flex gap-1"><button className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white" onClick={() => onEdit(entry)}><Pencil className="h-4 w-4" /></button><button className="rounded-lg p-2 text-slate-400 hover:bg-red-500/10 hover:text-red-300" onClick={() => onDelete(entry)}><Trash2 className="h-4 w-4" /></button></div>}
  </article>
}

export default function TimetablePage() {
  const { user } = useAuth()
  const admin = user.role === 'admin'
  const [options, setOptions] = useState([])
  const [selected, setSelected] = useState(admin ? '' : `${user.department}|${user.semester}|${user.section}`)
  const [day, setDay] = useState(todayName())
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(null)
  const [formOpen, setFormOpen] = useState(false)
  const [csvOpen, setCsvOpen] = useState(false)

  const queryParams = useMemo(() => {
    const [department, semester, section] = selected.split('|')
    return selected ? { department, semester: Number(semester), section, day } : { day }
  }, [selected, day])

  const load = useCallback(() => {
    setLoading(true); setError(null)
    return api.get('/api/timetable', { params: queryParams }).then((r) => setEntries(r.data))
      .catch((err) => setError(errorMessage(err))).finally(() => setLoading(false))
  }, [queryParams])

  useEffect(() => { api.get('/api/timetable/options').then((r) => setOptions(r.data)).catch(() => {}) }, [])
  useEffect(() => { load() }, [load])

  const saved = () => { load() }
  const edit = (item) => { setEditing(item); setFormOpen(true) }
  const add = () => { setEditing(null); setFormOpen(true) }
  const remove = async (item) => {
    if (!window.confirm(`Delete ${item.subject_name} on ${item.day_of_week}?`)) return
    try { await api.delete(`/api/timetable/${item.id}`); setEntries((prev) => prev.filter((x) => x.id !== item.id)) }
    catch (err) { setError(errorMessage(err)) }
  }

  return <div>
    <PageHeader icon={CalendarClock} title={admin ? 'Timetable Management' : 'Class Timetable'} subtitle={admin ? 'Create, edit and bulk-upload class schedules' : `${user.department} · Semester ${user.semester}${user.section}`}
      actions={admin && <><button className="btn btn-ghost" onClick={() => setCsvOpen(true)}><FileUp className="h-4 w-4" /> Upload CSV</button><button className="btn btn-primary" onClick={add}><Plus className="h-4 w-4" /> Add entry</button></>} />
    <ErrorBanner message={error} onClose={() => setError(null)} />
    <div className="glass mb-5 grid gap-3 p-4 sm:grid-cols-2">
      <div><label className="label">Class</label><select className="input" value={selected} onChange={(e) => setSelected(e.target.value)}>
        {admin && <option value="">All classes</option>}
        {options.map((o) => { const value = `${o.department}|${o.semester}|${o.section}`; return <option key={value} value={value}>{o.department} — Sem {o.semester}{o.section}</option> })}
      </select></div>
      <div><label className="label">Day</label><select className="input" value={day} onChange={(e) => setDay(e.target.value)}>{DAYS.map((d) => <option key={d}>{d}</option>)}</select></div>
    </div>

    {loading ? <PageLoader /> : entries.length === 0 ? <EmptyState title={`No classes on ${day}`}>Choose another day or class.</EmptyState> : <div className="space-y-3">{entries.map((entry) => <ScheduleCard key={entry.id} entry={entry} canManage={admin} onEdit={edit} onDelete={remove} />)}</div>}
    <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? 'Edit timetable entry' : 'Add timetable entry'} wide>{formOpen && <EntryForm key={editing?.id || 'new'} item={editing} user={user} onClose={() => setFormOpen(false)} onSaved={saved} />}</Modal>
    <Modal open={csvOpen} onClose={() => setCsvOpen(false)} title="Bulk upload timetable" wide>{csvOpen && <CSVUpload onClose={() => setCsvOpen(false)} onDone={load} />}</Modal>
  </div>
}
