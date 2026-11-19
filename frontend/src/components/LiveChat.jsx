import { useEffect, useRef, useState } from 'react'
import { Send, Users, Wifi, WifiOff } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useRealtime } from '../context/WebSocketContext'
import { departmentColor, formatClock } from '../lib/format'
import { Avatar, RoleBadge } from './ui'

function Message({ msg, mine, showHeader }) {
  return (
    <div className={`flex gap-2 ${mine ? 'flex-row-reverse' : ''} ${showHeader ? 'mt-3' : 'mt-0.5'}`}>
      <div className="w-8 shrink-0">
        {showHeader && !mine && <Avatar name={msg.sender_name} className="h-8 w-8 text-xs" />}
      </div>
      <div className={`flex max-w-[75%] flex-col ${mine ? 'items-end' : 'items-start'}`}>
        {showHeader && (
          <div className="mb-1 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="font-semibold text-slate-200">{mine ? 'You' : msg.sender_name}</span>
            <span className={`rounded px-1.5 py-0.5 text-[10px] ${departmentColor(msg.department)}`}>{msg.department}</span>
          </div>
        )}
        <div className={`rounded-2xl px-3 py-2 text-sm break-words whitespace-pre-wrap ${
          mine ? 'rounded-tr-sm bg-[#18354f] text-white!' : 'rounded-tl-sm border border-[#18354f]/15 bg-[#18354f]/5 text-[#18354f]'}`}>
          {msg.message}
          <span className={`ml-2 align-bottom text-[10px] ${mine ? 'text-white!/70' : 'text-[#18354f]/55'}`}>
            {formatClock(msg.timestamp)}
          </span>
        </div>
      </div>
    </div>
  )
}

function OnlineList({ users }) {
  return (
    <div className="space-y-2">
      {users.map((u) => (
        <div key={u.id} className="flex items-center gap-2">
          <div className="relative">
            <Avatar name={u.full_name} className="h-8 w-8 text-xs" />
            <span className="absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-[#18354f]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-slate-200">{u.full_name}</p>
            <p className="truncate text-[11px] text-slate-500">{u.department}</p>
          </div>
          {u.role !== 'student' && <RoleBadge role={u.role} />}
        </div>
      ))}
    </div>
  )
}

export default function LiveChat({ className = 'h-[calc(100vh-11rem)]' }) {
  const { user } = useAuth()
  const { chat } = useRealtime()
  const [text, setText] = useState('')
  const listRef = useRef(null)
  const stickToBottom = useRef(true)
  const live = chat.status === 'open'

  // Auto-scroll only when the reader is already at the bottom.
  useEffect(() => {
    const el = listRef.current
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight
  }, [chat.messages])

  const onScroll = () => {
    const el = listRef.current
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  const submit = (e) => {
    e.preventDefault()
    const value = text.trim()
    if (!value) return
    if (chat.send(value)) {
      setText('')
      stickToBottom.current = true
    }
  }

  return (
    <div className={`glass grid min-h-0 overflow-hidden md:grid-cols-[1fr_240px] ${className}`}>
      <section className="flex min-h-0 flex-col">
        <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div>
            <h2 className="font-semibold text-white">Campus group chat</h2>
            <p className="text-xs text-slate-400">Messages remain available until the server restarts.</p>
          </div>
          <span className={`flex items-center gap-1.5 text-xs ${live ? 'text-emerald-300' : 'text-amber-300'}`}>
            {live ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
            {live ? 'Live' : chat.status === 'denied' ? 'Access denied' : 'Connecting…'}
          </span>
        </header>

        <div ref={listRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto px-4 py-3" aria-live="polite">
          {chat.messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center text-slate-500">
              <Users className="mb-2 h-9 w-9" />
              <p className="text-sm">No messages yet. Start the conversation.</p>
            </div>
          ) : chat.messages.map((msg, index) => {
            const previous = chat.messages[index - 1]
            const showHeader = !previous || previous.sender_id !== msg.sender_id
            return <Message key={`${msg.sender_id}-${msg.timestamp}-${index}`} msg={msg} mine={msg.sender_id === user.id} showHeader={showHeader} />
          })}
        </div>

        {chat.error && <p className="border-t border-red-500/20 bg-red-500/10 px-4 py-2 text-xs text-red-200">{chat.error}</p>}
        <form onSubmit={submit} className="flex gap-2 border-t border-white/10 p-3">
          <input className="input" maxLength={1000} placeholder={live ? 'Message everyone on campus…' : 'Waiting for connection…'}
            value={text} onChange={(e) => setText(e.target.value)} disabled={!live} />
          <button className="btn btn-primary px-3" disabled={!live || !text.trim()} aria-label="Send message">
            <Send className="h-4 w-4" />
          </button>
        </form>
      </section>

      <aside className="hidden min-h-0 overflow-y-auto border-l border-white/10 bg-slate-950/25 p-4 md:block">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
          <Users className="h-4 w-4 text-teal-300" /> Online ({chat.online.length})
        </h3>
        {chat.online.length ? <OnlineList users={chat.online} /> : <p className="text-xs text-slate-500">Nobody else is online.</p>}
      </aside>
    </div>
  )
}
