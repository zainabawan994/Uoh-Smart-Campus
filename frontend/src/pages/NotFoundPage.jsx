import { ArrowLeft, FileQuestion } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <div className="glass mx-auto mt-16 max-w-lg p-10 text-center">
      <FileQuestion className="mx-auto h-14 w-14 text-slate-500" />
      <h1 className="mt-4 text-2xl font-semibold text-white">Page not found</h1>
      <p className="mt-2 text-sm text-slate-400">The page may have moved, or your role may not have access to it.</p>
      <Link to="/" className="btn btn-primary mt-6"><ArrowLeft className="h-4 w-4" /> Back home</Link>
    </div>
  )
}
