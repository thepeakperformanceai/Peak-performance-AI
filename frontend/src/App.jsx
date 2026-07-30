import { useState } from 'react'
import { Toaster } from 'react-hot-toast'
import Sidebar from './components/Sidebar'
import UploadPage from './pages/UploadPage'
import ReportPage from './pages/ReportPage'
import AdminPage from './pages/AdminPage'
import SettingsPage from './pages/SettingsPage'
import PastReports from './pages/PastReports'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import { useAuth } from './context/AuthContext'

const PAGE_TITLES = {
  upload: 'New report',
  report: 'Report viewer',
  past:   'Past reports',
  admin:  'Admin panel',
  settings: 'Settings',
}

const getResetTokenFromUrl = () => new URLSearchParams(window.location.search).get('token')

export default function App() {
  const { user, loading, logout } = useAuth()

  const [activePage, setActivePage] = useState('upload')
  const [authView, setAuthView] = useState(() => (getResetTokenFromUrl() ? 'reset' : 'login'))
  const [resetToken] = useState(() => getResetTokenFromUrl())

  const backToLogin = () => setAuthView('login')

  // While /auth/me is in flight we don't yet know if there's a valid session
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">
        Loading…
      </div>
    )
  }

  // Logging in or verifying an OTP sets `user` in context, which re-renders here
  if (!user) {
    return (
      <>
        <Toaster position="top-right" toastOptions={{ className: 'text-sm font-medium' }} />
        {authView === 'reset' && resetToken ? (
          <ResetPasswordPage token={resetToken} onBackToLogin={backToLogin} />
        ) : authView === 'forgot' ? (
          <ForgotPasswordPage onBackToLogin={backToLogin} />
        ) : authView === 'signup' ? (
          <SignupPage onBackToLogin={backToLogin} />
        ) : (
          <LoginPage
            onForgotPassword={() => setAuthView('forgot')}
            onSignup={() => setAuthView('signup')}
          />
        )}
      </>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden font-sans">
      <Toaster position="top-right" toastOptions={{ className: 'text-sm font-medium' }} />

      <Sidebar activePage={activePage} onNavigate={setActivePage} />

      <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
        {/* Top bar */}
        <header className="bg-white border-b border-gray-100 px-6 h-[52px] flex items-center justify-between flex-shrink-0">
          <h1 className="text-sm font-medium text-gray-900">
            {PAGE_TITLES[activePage]}
          </h1>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500">{user.name}</span>
            <button
              type="button"
              onClick={logout}
              className="px-3 py-1.5 text-xs font-medium rounded-md border border-gray-200 text-gray-600 hover:bg-gray-100"
            >
              Logout
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          {activePage === 'upload' && (
            <UploadPage onReportGenerated={() => setActivePage('report')} />
          )}
          {activePage === 'report' && <ReportPage />}
          {activePage === 'past' && <PastReports onNavigate={setActivePage} />}
          {activePage === 'admin'  && <AdminPage />}
          {activePage === 'settings' && <SettingsPage />}
        </main>
      </div>
    </div>
  )
}