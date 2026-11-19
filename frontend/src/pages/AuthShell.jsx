import { useState } from 'react'
import { CalendarDays, Coffee, Eye, EyeOff, GraduationCap, MessagesSquare, ShieldAlert } from 'lucide-react'
import { APP_NAME, UNIVERSITY } from '../lib/constants'

const FEATURES = [
  [ShieldAlert, 'One-tap SOS with your GPS location to campus security'],
  [MessagesSquare, 'Campus feed, lost & found and live chat'],
  [CalendarDays, 'Your timetable, workshops and university events'],
  [Coffee, 'Live cafe menu with prices and availability'],
]

/** Password field with a show/hide toggle. */
export function PasswordInput({ id, ...props }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input id={id} type={show ? 'text' : 'password'} className="input pr-10" {...props} />
      <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'}
        className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-[#18354f]/55 hover:bg-[#18354f]/5">
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  )
}

/** Shared frame for the login and registration screens. */
export default function AuthShell({ title, subtitle, children, footer, wide = false }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f3f6f9] px-4 py-8">
      <div className={`grid w-full overflow-hidden rounded-2xl bg-white shadow-xl lg:grid-cols-[1fr_1.1fr] ${wide ? 'max-w-5xl' : 'max-w-4xl'}`}>
        <aside className="relative overflow-hidden bg-[#18354f] p-7 lg:p-10">
          <GraduationCap className="absolute -right-10 -bottom-10 h-56 w-56 text-white/10!" aria-hidden />
          <div className="relative">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-white! p-2.5"><GraduationCap className="h-7 w-7 text-[#18354f]" /></div>
              <div>
                <p className="font-bold leading-tight text-white!">{APP_NAME}</p>
                <p className="text-xs text-white/70!">{UNIVERSITY}</p>
              </div>
            </div>
            <h1 className="mt-8 hidden text-3xl font-bold leading-tight text-white! lg:block">Everything on campus,<br />in one place.</h1>
            <ul className="mt-6 hidden space-y-4 lg:block">
              {FEATURES.map(([Icon, text]) => (
                <li key={text} className="flex items-start gap-3 text-sm text-white/85!">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-white!" /> {text}
                </li>
              ))}
            </ul>
          </div>
        </aside>
        <main className="p-7 sm:p-10">
          <h2 className="text-2xl font-bold text-[#18354f]">{title}</h2>
          {subtitle && <p className="mt-1 mb-6 text-sm text-[#18354f]/65">{subtitle}</p>}
          {children}
          {footer && <div className="mt-6 border-t border-[#18354f]/10 pt-5 text-center text-sm text-[#18354f]/70">{footer}</div>}
        </main>
      </div>
    </div>
  )
}
