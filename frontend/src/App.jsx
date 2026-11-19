import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import { PageLoader } from './components/ui'
import { useAuth } from './context/AuthContext'
import { WebSocketProvider } from './context/WebSocketContext'

const AdminPage = lazy(() => import('./pages/admin/AdminPage'))
const CafePage = lazy(() => import('./pages/CafePage'))
const ChatPage = lazy(() => import('./pages/ChatPage'))
const EventsPage = lazy(() => import('./pages/EventsPage'))
const FeedPage = lazy(() => import('./pages/FeedPage'))
const HomePage = lazy(() => import('./pages/HomePage'))
const LoginPage = lazy(() => import('./pages/LoginPage'))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))
const RegisterPage = lazy(() => import('./pages/RegisterPage'))
const SecurityDashboard = lazy(() => import('./pages/SecurityDashboard'))
const TimetablePage = lazy(() => import('./pages/TimetablePage'))

export default function App() {
  const { user } = useAuth()
  return (
    // Keyed by user so chat history and alerts are cleared when someone else signs in.
    <WebSocketProvider key={user?.id || 'anonymous'}>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route index element={<HomePage />} />
            <Route path="chat" element={<ChatPage />} />
            <Route path="cafe" element={<CafePage />} />
            <Route path="events" element={<EventsPage />} />
            <Route element={<ProtectedRoute roles={['student']} />}>
              <Route path="feed" element={<FeedPage />} />
              <Route path="timetable" element={<TimetablePage />} />
            </Route>
            <Route element={<ProtectedRoute roles={['security']} />}>
              <Route path="security" element={<SecurityDashboard />} />
            </Route>
            <Route element={<ProtectedRoute roles={['admin']} />}>
              <Route path="admin" element={<AdminPage />} />
            </Route>
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </Suspense>
    </WebSocketProvider>
  )
}
