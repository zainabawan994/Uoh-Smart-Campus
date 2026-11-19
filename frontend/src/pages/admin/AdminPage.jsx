import { useCallback, useEffect, useMemo, useState } from 'react'
import { Search, ShieldCheck, Trash2, Users } from 'lucide-react'
import api, { errorMessage } from '../../api/client'
import { Avatar, ErrorBanner, PageHeader, PageLoader, RoleBadge } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { ROLES } from '../../lib/constants'
import { formatDateTime } from '../../lib/format'

const roleOrder = ['student', 'security', 'cafe_manager', 'admin']

export default function AdminPage() {
  const { user: currentUser } = useAuth()
  const [users, setUsers] = useState([])
  const [stats, setStats] = useState({})
  const [query, setQuery] = useState('')
  const [role, setRole] = useState('')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [list, counts] = await Promise.all([
        api.get('/api/users', { params: { search: query.trim() || undefined, role: role || undefined, limit: 200 } }),
        api.get('/api/users/stats'),
      ])
      setUsers(list.data); setStats(counts.data)
    } catch (err) { setError(errorMessage(err)) } finally { setLoading(false) }
  }, [query, role])

  useEffect(() => {
    const timer = setTimeout(load, 250)
    return () => clearTimeout(timer)
  }, [load])

  const total = useMemo(() => Object.values(stats).reduce((a, b) => a + b, 0), [stats])
  const changeRole = async (account, newRole) => {
    if (newRole === account.role) return
    if (!window.confirm(`Change ${account.full_name}'s role to ${ROLES[newRole].label}?`)) return
    setBusyId(account.id)
    try {
      const res = await api.patch(`/api/users/${account.id}/role`, { role: newRole })
      setUsers((prev) => prev.map((u) => u.id === account.id ? res.data : u))
      const counts = (await api.get('/api/users/stats')).data; setStats(counts)
    } catch (err) { setError(errorMessage(err)) } finally { setBusyId(null) }
  }
  const remove = async (account) => {
    if (!window.confirm(`Permanently delete ${account.full_name} and their posts, comments and alerts?`)) return
    setBusyId(account.id)
    try {
      await api.delete(`/api/users/${account.id}`)
      setUsers((prev) => prev.filter((u) => u.id !== account.id))
      setStats((s) => ({ ...s, [account.role]: Math.max(0, (s[account.role] || 1) - 1) }))
    } catch (err) { setError(errorMessage(err)) } finally { setBusyId(null) }
  }

  return <div>
    <PageHeader icon={ShieldCheck} title="Administration" subtitle="Manage campus users, roles and access" />
    <ErrorBanner message={error} onClose={() => setError(null)} />
    <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
      <div className="glass p-4"><p className="text-xs text-slate-400 uppercase">All users</p><p className="mt-1 text-2xl font-bold text-white">{total}</p></div>
      {roleOrder.map((r) => <div key={r} className="glass p-4"><p className="text-xs text-slate-400 uppercase">{ROLES[r].label}</p><p className="mt-1 text-2xl font-bold text-white">{stats[r] || 0}</p></div>)}
    </div>
    <div className="glass mb-4 grid gap-3 p-4 sm:grid-cols-[1fr_220px]">
      <label className="relative"><Search className="absolute top-2.5 left-3 h-4 w-4 text-slate-500" /><input className="input pl-9" placeholder="Search name, registration ID or email…" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
      <select className="input" value={role} onChange={(e) => setRole(e.target.value)}><option value="">All roles</option>{roleOrder.map((r) => <option key={r} value={r}>{ROLES[r].label}</option>)}</select>
    </div>

    {loading ? <PageLoader /> : users.length === 0 ? <div className="glass p-10 text-center text-slate-400"><Users className="mx-auto mb-2 h-9 w-9" />No matching users.</div> : (
      <div className="glass overflow-x-auto">
        <table className="w-full min-w-[850px] text-left text-sm">
          <thead className="border-b border-white/10 bg-white/5 text-xs text-slate-400 uppercase"><tr><th className="px-4 py-3">User</th><th className="px-4 py-3">Department</th><th className="px-4 py-3">Class</th><th className="px-4 py-3">Joined</th><th className="px-4 py-3">Role</th><th className="px-4 py-3 text-right">Action</th></tr></thead>
          <tbody className="divide-y divide-white/10">{users.map((account) => {
            const self = account.id === currentUser.id
            return <tr key={account.id} className="hover:bg-white/[0.03]">
              <td className="px-4 py-3"><div className="flex items-center gap-3"><Avatar name={account.full_name} /><div><p className="font-medium text-white">{account.full_name}</p><p className="text-xs text-slate-500">{account.reg_no} · {account.email}</p></div></div></td>
              <td className="px-4 py-3 text-slate-300">{account.department}</td>
              <td className="px-4 py-3 text-slate-400">Sem {account.semester}{account.section}</td>
              <td className="px-4 py-3 text-slate-400">{formatDateTime(account.created_at)}</td>
              <td className="px-4 py-3">{self ? <RoleBadge role={account.role} /> : <select className="input min-w-36 py-1.5" value={account.role} disabled={busyId === account.id} onChange={(e) => changeRole(account, e.target.value)}>{roleOrder.map((r) => <option key={r} value={r}>{ROLES[r].label}</option>)}</select>}</td>
              <td className="px-4 py-3 text-right"><button className="rounded-lg p-2 text-slate-500 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-30" disabled={self || busyId === account.id} onClick={() => remove(account)} title={self ? 'You cannot delete your own account' : 'Delete user'}><Trash2 className="h-4 w-4" /></button></td>
            </tr>
          })}</tbody>
        </table>
      </div>
    )}
  </div>
}
