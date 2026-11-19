import { useCallback, useEffect, useState } from 'react'
import { Newspaper } from 'lucide-react'
import api, { errorMessage } from '../api/client'
import CreatePost from '../components/CreatePost'
import PostCard from '../components/PostCard'
import { EmptyState, ErrorBanner, PageHeader, PageLoader, Spinner } from '../components/ui'

const PAGE_SIZE = 10
const TABS = [
  { key: '', label: 'All' },
  { key: 'lost_and_found', label: 'Lost & Found' },
  { key: 'study_help', label: 'Study Help' },
  { key: 'general', label: 'General' },
  { key: 'announcement', label: 'Announcements' },
]

export default function FeedPage() {
  const [category, setCategory] = useState('')
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState(null)

  const fetchPage = useCallback(
    (skip) => api.get('/api/posts', { params: { category: category || undefined, skip, limit: PAGE_SIZE } }).then((r) => r.data),
    [category],
  )

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchPage(0)
      .then((data) => {
        if (cancelled) return
        setPosts(data)
        setHasMore(data.length === PAGE_SIZE)
      })
      .catch((err) => !cancelled && setError(errorMessage(err)))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [fetchPage])

  const loadMore = async () => {
    setLoadingMore(true)
    try {
      const data = await fetchPage(posts.length)
      setPosts((prev) => {
        const seen = new Set(prev.map((p) => p.id))
        return [...prev, ...data.filter((p) => !seen.has(p.id))]
      })
      setHasMore(data.length === PAGE_SIZE)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoadingMore(false)
    }
  }

  const created = (post) => {
    if (!category || category === post.category) setPosts((prev) => [post, ...prev])
  }
  const changed = (post) => setPosts((prev) => prev.map((p) => (p.id === post.id ? post : p)))
  const deleted = (id) => setPosts((prev) => prev.filter((p) => p.id !== id))

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader icon={Newspaper} title="Campus Feed" subtitle="Lost & found, study help and campus updates" />
      <CreatePost onCreated={created} />

      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setCategory(t.key)}
            className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition ${category === t.key ? 'border-[#7c3aed] bg-[#7c3aed] text-white!' : 'border-[#18354f]/20 bg-white! text-[#18354f] hover:border-[#18354f]/50'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <ErrorBanner message={error} onClose={() => setError(null)} />
      {loading ? <PageLoader /> : posts.length === 0 ? (
        <EmptyState title="No posts yet">Be the first to post in this category.</EmptyState>
      ) : (
        <div className="space-y-4">
          {posts.map((p) => <PostCard key={p.id} post={p} onChange={changed} onDelete={deleted} />)}
          {hasMore && (
            <button className="btn btn-ghost w-full" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? <Spinner className="h-4 w-4" /> : null} Load more
            </button>
          )}
        </div>
      )}
    </div>
  )
}
