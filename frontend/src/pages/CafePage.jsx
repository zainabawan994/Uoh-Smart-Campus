import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Camera, Coffee, ImageOff, ImagePlus, Pencil, Plus, ScanText, Search, Trash2, X } from 'lucide-react'
import api, { errorMessage, mediaUrl } from '../api/client'
import { EmptyState, ErrorBanner, Modal, PageLoader, Spinner } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useSocket } from '../context/useSocket'
import { CAFE_CATEGORIES, THEMES, gradient } from '../lib/constants'
import { formatPKR } from '../lib/format'

const EMPTY = { item_name: '', category: 'fast_food', price: '', is_available: true }
const MAX_IMAGE_MB = 5

// Phone photos are often 5+ MB; shrink before upload so the menu reader accepts them.
async function shrinkPhoto(file, maxSide = 2000) {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
}

function ScanMenu({ onClose, onSaved }) {
  const [photo, setPhoto] = useState(null)
  const [rows, setRows] = useState(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState(null)
  const fileRef = useRef(null)

  useEffect(() => () => photo && URL.revokeObjectURL(photo), [photo])

  const pick = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) return setError('Select a photo of the menu (JPG, PNG or WEBP).')
    setPhoto(URL.createObjectURL(file)); setRows(null); setError(null); setBusy(true)
    try {
      const upload = new FormData()
      upload.append('image', await shrinkPhoto(file), 'menu.jpg')
      const { data } = await api.post('/api/cafe/menu/extract', upload)
      if (!data.length) setError('No items with prices were found. Try a clearer, straight-on photo.')
      setRows(data.map((item) => ({ ...item, price: String(item.price), keep: true })))
    } catch (err) { setError(errorMessage(err)) } finally { setBusy(false) }
  }

  const update = (index, key, value) => setRows((current) => current.map((row, i) => i === index ? { ...row, [key]: value } : row))
  const selected = rows?.filter((row) => row.keep && row.item_name.trim() && Number(row.price) > 0) || []

  const publish = async () => {
    setBusy(true); setError(null)
    const failed = []
    for (const [index, row] of selected.entries()) {
      setProgress(`${index + 1} / ${selected.length}`)
      try {
        const { data } = await api.post('/api/cafe/menu', {
          item_name: row.item_name.trim(), category: row.category, price: Number(row.price), is_available: true,
        })
        onSaved(data)
      } catch (err) { failed.push(`${row.item_name}: ${errorMessage(err)}`) }
    }
    setBusy(false); setProgress(null)
    if (failed.length) setError(`Some items were not saved. ${failed.join(' · ')}`)
    else onClose()
  }

  return (
    <div className="space-y-4">
      <ErrorBanner message={error} />
      <button type="button" onClick={() => fileRef.current?.click()} disabled={busy}
        className="flex w-full items-center gap-4 rounded-lg border-2 border-dashed border-[#18354f]/25 p-4 text-left transition hover:border-[#18354f]/50 hover:bg-[#18354f]/5">
        {photo ? <img src={photo} alt="Menu photo" className="h-20 w-20 rounded-md object-cover" /> : (
          <div className="flex h-20 w-20 items-center justify-center rounded-md bg-[#18354f]/8"><Camera className="h-8 w-8 text-[#18354f]" /></div>
        )}
        <div>
          <p className="font-semibold text-[#18354f]">{photo ? 'Use a different photo' : 'Upload a photo of your menu'}</p>
          <p className="text-sm text-[#18354f]/60">Items, prices and categories are read automatically. You check them before publishing.</p>
        </div>
      </button>
      <input ref={fileRef} type="file" className="hidden" accept="image/*" capture="environment" onChange={pick} />

      {busy && !rows && <div className="flex items-center gap-3 rounded-md bg-[#18354f]/5 px-4 py-3 text-sm text-[#18354f]"><Spinner className="h-4 w-4" /> Reading the menu… this can take up to a minute.</div>}

      {rows?.length > 0 && <>
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold text-[#18354f]">{rows.length} items found</span>
          <span className="text-[#18354f]/60">Untick anything wrong, fix names or prices</span>
        </div>
        <div className="max-h-[45vh] space-y-2 overflow-y-auto pr-1">
          {rows.map((row, index) => (
            <div key={index} className={`grid grid-cols-[auto_1fr] gap-2 rounded-md border border-[#18354f]/15 p-2 sm:grid-cols-[auto_1fr_8rem_6rem] sm:items-center ${row.keep ? '' : 'opacity-45'}`}>
              <input type="checkbox" className="h-4 w-4 accent-[#18354f]" checked={row.keep} onChange={(e) => update(index, 'keep', e.target.checked)} aria-label={`Include ${row.item_name}`} />
              <input className="input py-1.5" value={row.item_name} maxLength={120} onChange={(e) => update(index, 'item_name', e.target.value)} aria-label="Item name" />
              <select className="input col-start-2 py-1.5 sm:col-start-auto" value={row.category} onChange={(e) => update(index, 'category', e.target.value)} aria-label="Category">
                {Object.entries(CAFE_CATEGORIES).map(([key, c]) => <option key={key} value={key}>{c.label}</option>)}
              </select>
              <input className="input col-start-2 py-1.5 sm:col-start-auto" type="number" min="1" step="0.01" value={row.price} onChange={(e) => update(index, 'price', e.target.value)} aria-label="Price in PKR" />
            </div>
          ))}
        </div>
      </>}

      <div className="flex justify-end gap-2 border-t border-[#18354f]/15 pt-4">
        <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={busy || !selected.length} onClick={publish}>
          {busy && rows && <Spinner className="h-4 w-4" />} {progress ? `Publishing ${progress}` : `Publish ${selected.length || ''} items`}
        </button>
      </div>
    </div>
  )
}

function ItemForm({ item, onClose, onSaved }) {
  const [workingItem, setWorkingItem] = useState(item)
  const [form, setForm] = useState(item ? {
    item_name: item.item_name, category: item.category, price: String(item.price), is_available: item.is_available,
  } : EMPTY)
  const [image, setImage] = useState(null)
  const [preview, setPreview] = useState(item?.image_url ? mediaUrl(item.image_url) : null)
  const [removeRequested, setRemoveRequested] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const fileRef = useRef(null)
  const objectUrlRef = useRef(null)
  const set = (key) => (event) => setForm((current) => ({
    ...current, [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value,
  }))

  useEffect(() => () => objectUrlRef.current && URL.revokeObjectURL(objectUrlRef.current), [])

  const pickImage = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) return setError('Select a JPG, PNG, GIF or WEBP image.')
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) return setError(`Image must be under ${MAX_IMAGE_MB} MB.`)
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    objectUrlRef.current = URL.createObjectURL(file)
    setImage(file); setPreview(objectUrlRef.current); setRemoveRequested(false); setError(null)
  }

  const clearImage = () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    objectUrlRef.current = null; setImage(null); setPreview(null)
    setRemoveRequested(Boolean(workingItem?.image_url))
    if (fileRef.current) fileRef.current.value = ''
  }

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true); setError(null)
    let saved = workingItem
    try {
      const payload = {
        item_name: form.item_name.trim(), category: form.category,
        price: Number(form.price), is_available: form.is_available,
      }
      const metadata = saved
        ? await api.patch(`/api/cafe/menu/${saved.id}`, payload)
        : await api.post('/api/cafe/menu', payload)
      saved = metadata.data
      setWorkingItem(saved)
      onSaved(saved)

      if (image) {
        const upload = new FormData()
        upload.append('image', image)
        saved = (await api.put(`/api/cafe/menu/${saved.id}/image`, upload)).data
      } else if (removeRequested && saved.image_url) {
        saved = (await api.delete(`/api/cafe/menu/${saved.id}/image`)).data
      }
      onSaved(saved)
      onClose()
    } catch (err) {
      const prefix = saved && !item ? 'Item details were saved, but the image was not. ' : ''
      setError(prefix + errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <ErrorBanner message={error} />
      <div>
        <label className="label">Food photo (optional)</label>
        <div className="overflow-hidden rounded-md border border-[#18354f]/20 bg-[#18354f]/5">
          {preview ? <img src={preview} alt="Menu item preview" className="aspect-[16/10] w-full object-cover" /> : (
            <div className="flex aspect-[16/10] flex-col items-center justify-center text-[#18354f]/55">
              <ImageOff className="h-9 w-9" /><span className="mt-2 text-sm">No photo</span>
            </div>
          )}
        </div>
        <div className="mt-2 flex gap-2">
          <button type="button" className="btn btn-ghost flex-1" onClick={() => fileRef.current?.click()}>
            <ImagePlus className="h-4 w-4" /> {preview ? 'Replace photo' : 'Add photo'}
          </button>
          {preview && <button type="button" className="btn btn-ghost" onClick={clearImage}><ImageOff className="h-4 w-4" /> Remove</button>}
        </div>
        <input ref={fileRef} type="file" className="hidden" accept="image/jpeg,image/png,image/gif,image/webp" onChange={pickImage} />
      </div>

      <div><label className="label">Item name</label><input className="input" required maxLength={120} value={form.item_name} onChange={set('item_name')} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">Category</label><select className="input" value={form.category} onChange={set('category')}>{Object.entries(CAFE_CATEGORIES).map(([key, category]) => <option key={key} value={key}>{category.label}</option>)}</select></div>
        <div><label className="label">Price (PKR)</label><input className="input" type="number" required min="1" step="0.01" value={form.price} onChange={set('price')} /></div>
      </div>
      <label className="flex items-center gap-2 text-sm font-medium text-[#18354f]"><input type="checkbox" checked={form.is_available} onChange={set('is_available')} className="accent-[#18354f]" /> Available now</label>
      <div className="flex justify-end gap-2 border-t border-[#18354f]/15 pt-4"><button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy}>{busy && <Spinner className="h-4 w-4" />} {workingItem ? 'Save changes' : 'Publish item'}</button></div>
    </form>
  )
}

function MenuRow({ item, canManage, onEdit, onToggle, onDelete, busy }) {
  const { icon: Icon, color } = CAFE_CATEGORIES[item.category]
  return (
    <article className={`group flex items-center gap-4 rounded-xl border border-[#18354f]/12 bg-white p-3 transition hover:border-[#18354f]/30 hover:shadow-md ${!item.is_available ? 'opacity-60' : ''}`}>
      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg" style={{ background: `linear-gradient(135deg, ${color}26, ${color}0d)` }}>
        {item.image_url
          ? <img src={mediaUrl(item.image_url)} alt={item.item_name} loading="lazy" className="h-full w-full object-cover" />
          : <div className="flex h-full items-center justify-center"><Icon className="h-8 w-8" style={{ color }} /></div>}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <h3 className="truncate font-semibold text-[#18354f]">{item.item_name}</h3>
          <span className="flex-1 border-b border-dotted border-[#18354f]/25" aria-hidden />
          <span className="shrink-0 font-bold" style={{ color }}>{formatPKR(item.price)}</span>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold ${item.is_available ? 'text-[#18354f]/70' : 'text-[#bc2f36]'}`}>
            <span className={`h-2 w-2 rounded-full ${item.is_available ? 'bg-[#2f8f5b]' : 'bg-[#bc2f36]'}`} />
            {item.is_available ? 'Available' : 'Out of stock'}
          </span>
          {canManage && <div className="flex items-center gap-1">
            <button className="btn btn-ghost px-2 py-1 text-xs whitespace-nowrap" disabled={busy} onClick={() => onToggle(item)}>{item.is_available ? 'Mark out' : 'Restock'}</button>
            <button className="rounded p-1.5 text-[#18354f]/65 hover:bg-[#18354f]/5" onClick={() => onEdit(item)} aria-label={`Edit ${item.item_name}`}><Pencil className="h-4 w-4" /></button>
            <button className="rounded p-1.5 text-[#bc2f36] hover:bg-[#bc2f36]/8" onClick={() => onDelete(item)} aria-label={`Delete ${item.item_name}`}><Trash2 className="h-4 w-4" /></button>
          </div>}
        </div>
      </div>
    </article>
  )
}

export default function CafePage() {
  const { user } = useAuth()
  const canManage = user.role === 'cafe_manager' || user.role === 'admin'
  const [items, setItems] = useState([])
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [availableOnly, setAvailableOnly] = useState(false)
  const [editing, setEditing] = useState(null)
  const [modal, setModal] = useState(null) // 'item' | 'scan' | null
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState(null)

  const upsert = useCallback((item) => setItems((previous) => {
    const exists = previous.some((current) => current.id === item.id)
    return exists ? previous.map((current) => current.id === item.id ? item : current) : [...previous, item]
  }), [])

  const onCafeMessage = useCallback((data) => {
    if (data.type === 'item_created' || data.type === 'item_updated') upsert(data.item)
    if (data.type === 'item_deleted') setItems((previous) => previous.filter((item) => item.id !== data.item_id))
  }, [upsert])
  const cafeSocket = useSocket('/ws/cafe', { enabled: Boolean(user), onMessage: onCafeMessage })

  useEffect(() => {
    let cancelled = false
    api.get('/api/cafe/menu').then((response) => !cancelled && setItems(response.data))
      .catch((err) => !cancelled && setError(errorMessage(err))).finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [])

  const visible = useMemo(() => items.filter((item) => {
    const query = search.trim().toLowerCase()
    return (!query || item.item_name.toLowerCase().includes(query))
      && (!category || item.category === category)
      && (!availableOnly || item.is_available)
  }).sort((left, right) => left.item_name.localeCompare(right.item_name)), [items, search, category, availableOnly])

  const groups = useMemo(() => Object.keys(CAFE_CATEGORIES)
    .map((key) => [key, visible.filter((item) => item.category === key)])
    .filter(([, list]) => list.length), [visible])

  const countFor = (key) => items.filter((item) => item.category === key).length
  const availableCount = items.filter((item) => item.is_available).length

  const toggle = async (item) => {
    setBusyId(item.id); setError(null)
    try {
      const response = await api.patch(`/api/cafe/menu/${item.id}/availability`, { is_available: !item.is_available })
      upsert(response.data)
    } catch (err) { setError(errorMessage(err)) } finally { setBusyId(null) }
  }
  const remove = async (item) => {
    if (!window.confirm(`Delete ${item.item_name}?`)) return
    setBusyId(item.id); setError(null)
    try {
      await api.delete(`/api/cafe/menu/${item.id}`)
      setItems((previous) => previous.filter((current) => current.id !== item.id))
    } catch (err) { setError(errorMessage(err)) } finally { setBusyId(null) }
  }
  const edit = (item) => { setEditing(item); setModal('item') }
  const add = () => { setEditing(null); setModal('item') }
  const live = cafeSocket.status === 'open'

  return (
    <div>
      <section className="relative mb-6 overflow-hidden rounded-2xl px-6 py-7 text-white! shadow-lg sm:px-8" style={{ background: gradient(THEMES.cafe) }}>
        <Coffee className="absolute -right-6 -bottom-8 h-44 w-44 text-white/10!" aria-hidden />
        <div className="relative flex flex-wrap items-end justify-between gap-5">
          <div>
            <span style={{ background: "rgb(255 255 255 / 0.15)" }} className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold text-white!">
              <span className={`h-2 w-2 rounded-full ${live ? "bg-[#4ade80]" : "bg-[#9fb0c0]"}`} /> {live ? 'Live menu' : 'Connecting…'}
            </span>
            <h1 className="mt-3 text-3xl font-bold text-white!">Campus Cafe</h1>
            <p className="mt-1 text-sm text-white/75!">{availableCount} of {items.length} items available right now</p>
          </div>
          {canManage && <div className="flex flex-wrap gap-2">
            <button className="btn bg-white! text-[#18354f]! hover:opacity-90" onClick={() => setModal('scan')}><ScanText className="h-4 w-4" /> Scan menu photo</button>
            <button style={{ border: "1px solid rgb(255 255 255 / 0.45)" }} className="btn text-white! hover:opacity-80" onClick={add}><Plus className="h-4 w-4" /> Add item</button>
          </div>}
        </div>
      </section>

      <ErrorBanner message={error} onClose={() => setError(null)} />

      <div className="sticky top-0 z-10 -mx-1 mb-6 space-y-3 bg-[#f6f7fb]/95 px-1 py-3 backdrop-blur">
        <div className="flex gap-2">
          <label className="relative flex-1"><Search className="absolute top-2.5 left-3 h-4 w-4 text-[#18354f]/55" /><input className="input pl-9" placeholder="Search food or drinks…" value={search} onChange={(event) => setSearch(event.target.value)} />
            {search && <button className="absolute top-2 right-2 rounded p-0.5 text-[#18354f]/55 hover:bg-[#18354f]/5" onClick={() => setSearch('')} aria-label="Clear search"><X className="h-4 w-4" /></button>}
          </label>
          <button className={`btn ${availableOnly ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setAvailableOnly((v) => !v)} aria-pressed={availableOnly}>Available only</button>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
          {[['', { label: 'All', icon: Coffee, color: THEMES.cafe.accent }], ...Object.entries(CAFE_CATEGORIES)].map(([key, c]) => {
            const Icon = c.icon
            const active = category === key
            return <button key={key || 'all'} onClick={() => setCategory(key)} aria-pressed={active}
              style={active ? { background: c.color, borderColor: c.color } : undefined}
              className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${active ? 'text-white!' : 'border-[#18354f]/15 bg-white! text-[#18354f] hover:border-[#18354f]/40'}`}>
              <Icon className="h-4 w-4" style={active ? undefined : { color: c.color }} /> {c.label} <span className={active ? 'text-white/70!' : 'text-[#18354f]/50'}>{key ? countFor(key) : items.length}</span>
            </button>
          })}
        </div>
      </div>

      {loading ? <PageLoader /> : items.length === 0 ? (
        <EmptyState icon={Coffee} title="The menu is empty">{canManage ? 'Use "Scan menu photo" to add all items from one picture.' : 'The cafe has not published its menu yet.'}</EmptyState>
      ) : groups.length === 0 ? <EmptyState icon={Search} title="Nothing matches">Try another search or category.</EmptyState> : (
        <div className="space-y-8">{groups.map(([key, list]) => {
          const Icon = CAFE_CATEGORIES[key].icon
          return <section key={key}>
            <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-[#18354f]"><Icon className="h-5 w-5" style={{ color: CAFE_CATEGORIES[key].color }} /> {CAFE_CATEGORIES[key].label} <span className="text-sm font-normal text-[#18354f]/50">{list.length}</span></h2>
            <div className="grid gap-3 xl:grid-cols-2">{list.map((item) => <MenuRow key={item.id} item={item} canManage={canManage} onEdit={edit} onToggle={toggle} onDelete={remove} busy={busyId === item.id} />)}</div>
          </section>
        })}</div>
      )}

      <Modal open={modal === 'item'} onClose={() => setModal(null)} title={editing ? 'Edit menu item' : 'Add menu item'}>
        {modal === 'item' && <ItemForm key={editing?.id || 'new'} item={editing} onClose={() => setModal(null)} onSaved={upsert} />}
      </Modal>
      <Modal open={modal === 'scan'} onClose={() => setModal(null)} title="Scan menu photo" wide>
        {modal === 'scan' && <ScanMenu onClose={() => setModal(null)} onSaved={upsert} />}
      </Modal>
    </div>
  )
}
