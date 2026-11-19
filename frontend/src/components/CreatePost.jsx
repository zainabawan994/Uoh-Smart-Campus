import { useEffect, useRef, useState } from 'react'
import { ImagePlus, Send, X } from 'lucide-react'
import api, { errorMessage } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { POST_CATEGORIES } from '../lib/constants'
import { Avatar, ErrorBanner, Spinner } from './ui'

const MAX_MB = 5

export default function CreatePost({ onCreated }) {
  const { user } = useAuth()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [category, setCategory] = useState('general')
  const [image, setImage] = useState(null)
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const fileRef = useRef(null)

  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview])

  const categories = Object.entries(POST_CATEGORIES).filter(([k]) => k !== 'announcement' || user.role === 'admin')

  const pickImage = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) return setError('Please choose an image file.')
    if (file.size > MAX_MB * 1024 * 1024) return setError(`Image must be under ${MAX_MB} MB.`)
    setError(null)
    setImage(file)
    setPreview(URL.createObjectURL(file))
  }

  const clearImage = () => {
    setImage(null)
    setPreview(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!content.trim()) return
    setBusy(true)
    setError(null)
    const form = new FormData()
    form.append('content', content.trim())
    form.append('category', category)
    if (title.trim()) form.append('title', title.trim())
    if (image) form.append('image', image)
    try {
      const res = await api.post('/api/posts', form)
      onCreated(res.data)
      setTitle('')
      setContent('')
      setCategory('general')
      clearImage()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="glass mb-6 p-4">
      <ErrorBanner message={error} onClose={() => setError(null)} />
      <div className="flex gap-3">
        <Avatar name={user.full_name} />
        <div className="flex-1 space-y-2">
          <input className="input" placeholder="Title (optional)" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea className="input min-h-[90px] resize-y" placeholder="Share something with campus…" maxLength={5000}
            required value={content} onChange={(e) => setContent(e.target.value)} />
          {preview && (
            <div className="relative inline-block">
              <img src={preview} alt="Selected upload" className="max-h-48 rounded-xl border border-white/10" />
              <button type="button" onClick={clearImage} className="absolute top-2 right-2 rounded-md bg-[#18354f] p-1 text-white!" aria-label="Remove image">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <select className="input w-auto" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
              {categories.map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}
            </select>
            <button type="button" className="btn btn-ghost" onClick={() => fileRef.current?.click()}>
              <ImagePlus className="h-4 w-4" /> Photo
            </button>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="hidden" onChange={pickImage} />
            <button className="btn btn-primary ml-auto" disabled={busy || !content.trim()}>
              {busy ? <Spinner className="h-4 w-4" /> : <Send className="h-4 w-4" />} Post
            </button>
          </div>
        </div>
      </div>
    </form>
  )
}
