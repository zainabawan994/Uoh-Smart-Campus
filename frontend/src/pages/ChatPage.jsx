import { MessagesSquare } from 'lucide-react'
import LiveChat from '../components/LiveChat'
import { PageHeader } from '../components/ui'

export default function ChatPage() {
  return (
    <div>
      <PageHeader icon={MessagesSquare} title="Campus Live Chat" subtitle="Talk with students and campus staff in real time" />
      <LiveChat />
    </div>
  )
}
