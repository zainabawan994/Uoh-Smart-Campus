import { useMemo, useState } from 'react'
import { CornerDownRight, Send, Trash2 } from 'lucide-react'
import api, { errorMessage } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { departmentColor, timeAgo } from '../lib/format'
import { Avatar, Spinner } from './ui'

const MAX_INDENT = 3

function CommentForm({ postId, parentId, onAdded, onCancel, autoFocus }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    if (!text.trim()) return
    setBusy(true)
    setError(null)
    try {
      const res = await api.post(`/api/posts/${postId}/comments`, { comment_text: text.trim(), parent_id: parentId ?? null })
      onAdded(res.data)
      setText('')
      onCancel?.()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-2">
      <div className="flex gap-2">
        <input className="input py-1.5" placeholder={parentId ? 'Write a reply…' : 'Write a comment…'} maxLength={2000}
          autoFocus={autoFocus} value={text} onChange={(e) => setText(e.target.value)} />
        <button className="btn btn-primary px-3 py-1.5" disabled={busy || !text.trim()} aria-label="Send comment">
          {busy ? <Spinner className="h-4 w-4" /> : <Send className="h-4 w-4" />}
        </button>
        {onCancel && <button type="button" className="btn btn-ghost px-3 py-1.5" onClick={onCancel}>Cancel</button>}
      </div>
      {error && <p className="mt-1 text-xs text-red-300">{error}</p>}
    </form>
  )
}

function CommentNode({ node, depth, postId, onAdded, onDeleted }) {
  const { user } = useAuth()
  const [replying, setReplying] = useState(false)
  const c = node.comment
  const canDelete = c.user.id === user.id || user.role === 'admin'

  const remove = async () => {
    if (!window.confirm('Delete this comment and its replies?')) return
    try {
      await api.delete(`/api/posts/comments/${c.id}`)
      onDeleted(c.id)
    } catch (err) {
      window.alert(errorMessage(err))
    }
  }

  return (
    <div className={depth > 0 ? 'mt-3 border-l border-white/10 pl-3 sm:pl-4' : 'mt-3'}>
      <div className="flex gap-2">
        <Avatar name={c.user.full_name} className="h-7 w-7 text-[11px]" />
        <div className="min-w-0 flex-1">
          <div className="rounded-xl bg-white/5 px-3 py-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold text-slate-100">{c.user.full_name}</span>
              <span className={`rounded px-1.5 py-0.5 text-[10px] ${departmentColor(c.user.department)}`}>{c.user.department}</span>
              <span className="text-slate-500">{timeAgo(c.created_at)}</span>
            </div>
            <p className="mt-1 text-sm break-words whitespace-pre-wrap text-slate-200">{c.comment_text}</p>
          </div>
          <div className="mt-1 flex gap-3 pl-1 text-xs text-slate-400">
            <button onClick={() => setReplying((r) => !r)} className="flex items-center gap-1 hover:text-teal-300">
              <CornerDownRight className="h-3 w-3" /> Reply
            </button>
            {canDelete && (
              <button onClick={remove} className="flex items-center gap-1 hover:text-red-300">
                <Trash2 className="h-3 w-3" /> Delete
              </button>
            )}
          </div>
          {replying && (
            <CommentForm postId={postId} parentId={c.id} onAdded={onAdded} onCancel={() => setReplying(false)} autoFocus />
          )}
        </div>
      </div>
      <div className={depth + 1 >= MAX_INDENT ? '' : 'sm:ml-4'}>
        {node.children.map((child) => (
          <CommentNode key={child.comment.id} node={child} depth={depth + 1} postId={postId} onAdded={onAdded} onDeleted={onDeleted} />
        ))}
      </div>
    </div>
  )
}

/** Builds a reply tree from the flat comment list (each comment has an optional parent_id). */
function buildTree(comments) {
  const nodes = new Map(comments.map((c) => [c.id, { comment: c, children: [] }]))
  const roots = []
  for (const node of nodes.values()) {
    const parent = node.comment.parent_id != null ? nodes.get(node.comment.parent_id) : null
    ;(parent ? parent.children : roots).push(node)
  }
  return roots
}

/** Ids of a comment and all of its replies (the server deletes them together). */
function withDescendants(comments, id) {
  const ids = new Set([id])
  let grew = true
  while (grew) {
    grew = false
    for (const c of comments) {
      if (c.parent_id != null && ids.has(c.parent_id) && !ids.has(c.id)) {
        ids.add(c.id)
        grew = true
      }
    }
  }
  return ids
}

export default function CommentThread({ postId, comments, onChange }) {
  const tree = useMemo(() => buildTree(comments), [comments])
  const added = (comment) => onChange([...comments, comment])
  const deleted = (id) => {
    const gone = withDescendants(comments, id)
    onChange(comments.filter((c) => !gone.has(c.id)))
  }

  return (
    <div className="border-t border-white/10 pt-2">
      {tree.map((node) => (
        <CommentNode key={node.comment.id} node={node} depth={0} postId={postId} onAdded={added} onDeleted={deleted} />
      ))}
      <CommentForm postId={postId} onAdded={added} />
    </div>
  )
}
