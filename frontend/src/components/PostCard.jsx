import { useState } from 'react'
import { Heart, MessageCircle, Trash2 } from 'lucide-react'
import api, { errorMessage, mediaUrl } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { POST_CATEGORIES } from '../lib/constants'
import { departmentColor, formatDateTime, timeAgo } from '../lib/format'
import CommentThread from './CommentThread'
import { Avatar } from './ui'

export default function PostCard({ post, onChange, onDelete }) {
  const { user } = useAuth()
  const [showComments, setShowComments] = useState(post.comments.length > 0 && post.comments.length <= 3)
  const [liking, setLiking] = useState(false)
  const category = POST_CATEGORIES[post.category]
  const canDelete = post.user.id === user.id || user.role === 'admin'

  const toggleLike = async () => {
    if (liking) return
    setLiking(true)
    // Optimistic update, then reconcile with the server's count.
    const before = post
    onChange({ ...post, liked_by_me: !post.liked_by_me, likes_count: post.likes_count + (post.liked_by_me ? -1 : 1) })
    try {
      const res = await api.post(`/api/posts/${post.id}/like`)
      onChange({ ...before, liked_by_me: res.data.liked, likes_count: res.data.likes_count })
    } catch {
      onChange(before)
    } finally {
      setLiking(false)
    }
  }

  const remove = async () => {
    if (!window.confirm('Delete this post?')) return
    try {
      await api.delete(`/api/posts/${post.id}`)
      onDelete(post.id)
    } catch (err) {
      window.alert(errorMessage(err))
    }
  }

  return (
    <article className={`glass p-5 ${post.category === 'announcement' ? 'border-violet-400/30' : ''}`}>
      <header className="flex items-start gap-3">
        <Avatar name={post.user.full_name} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-white">{post.user.full_name}</span>
            <span className={`rounded px-1.5 py-0.5 text-[10px] ${departmentColor(post.user.department)}`}>{post.user.department}</span>
          </div>
          <p className="text-xs text-slate-400" title={formatDateTime(post.created_at)}>
            {post.user.reg_no} · {timeAgo(post.created_at)}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${category.className}`}>{category.label}</span>
        {canDelete && (
          <button onClick={remove} className="rounded-lg p-1.5 text-slate-500 hover:bg-red-500/10 hover:text-red-300" aria-label="Delete post">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </header>

      <div className="mt-3">
        {post.title && <h3 className="mb-1 text-lg font-semibold text-white">{post.title}</h3>}
        <p className="break-words whitespace-pre-wrap text-slate-200">{post.content}</p>
        {post.image_url && (
          <img src={mediaUrl(post.image_url)} alt={post.title || 'Post image'} loading="lazy"
            className="mt-3 max-h-[480px] w-full rounded-xl border border-white/10 object-cover" />
        )}
      </div>

      <footer className="mt-4 flex items-center gap-2">
        <button onClick={toggleLike} aria-pressed={post.liked_by_me}
          className={`btn px-3 py-1.5 ${post.liked_by_me ? 'bg-rose-500/15 text-rose-300' : 'btn-ghost'}`}>
          <Heart className={`h-4 w-4 ${post.liked_by_me ? 'fill-current' : ''}`} /> {post.likes_count}
        </button>
        <button onClick={() => setShowComments((s) => !s)} className="btn btn-ghost px-3 py-1.5">
          <MessageCircle className="h-4 w-4" /> {post.comments.length} {post.comments.length === 1 ? 'comment' : 'comments'}
        </button>
      </footer>

      {showComments && (
        <div className="mt-3">
          <CommentThread postId={post.id} comments={post.comments} onChange={(comments) => onChange({ ...post, comments })} />
        </div>
      )}
    </article>
  )
}
