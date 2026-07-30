import { useState } from 'react'
import toast from 'react-hot-toast'
import { useAuth } from '../context/AuthContext'
import { authApi, apiError } from '../services/auth'
import PasswordInput from '../components/PasswordInput'
import PasswordChecklist from '../components/PasswordChecklist'
import { isStrongPassword, PASSWORD_RULE } from '../utils/password'

const INPUT = 'w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm outline-none ' +
              'focus:border-pp-orange focus:ring-1 focus:ring-pp-orange'

export default function SettingsPage() {
  const { user } = useAuth()

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const canSubmit =
    currentPassword.length > 0 &&
    isStrongPassword(newPassword) &&
    newPassword === confirmPassword

  const handleSubmit = async () => {
    setError('')
    if (!currentPassword) return setError('Enter your current password.')
    if (!isStrongPassword(newPassword)) return setError(PASSWORD_RULE)
    if (newPassword !== confirmPassword) return setError('New passwords do not match.')
    if (newPassword === currentPassword) return setError('New password must be different from the current one.')

    setBusy(true)
    try {
      await authApi.changePassword({ currentPassword, newPassword, confirmPassword })
      toast.success('Password updated')
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('')
    } catch (err) {
      setError(apiError(err, 'Could not update password.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-md">
      <section className="bg-white rounded-xl border border-gray-100 p-6 mb-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Account</h2>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-gray-500">Name</dt><dd className="text-gray-900">{user?.name}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">Email</dt><dd className="text-gray-900">{user?.email}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">Role</dt><dd className="text-gray-900 capitalize">{user?.role}</dd>
          </div>
        </dl>
      </section>

      <section className="bg-white rounded-xl border border-gray-100 p-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-1">Change password</h2>
        <p className="text-xs text-gray-500 mb-4">Choose a strong password you don't use elsewhere.</p>

        <div className="space-y-3">
          <PasswordInput className={INPUT + ' pr-10'} placeholder="Current password"
            autoComplete="current-password"
            value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />

          <PasswordInput className={INPUT + ' pr-10'} placeholder="New password"
            autoComplete="new-password"
            value={newPassword} onChange={e => setNewPassword(e.target.value)} />
          <PasswordChecklist value={newPassword} />

          <PasswordInput className={INPUT + ' pr-10'} placeholder="Confirm new password"
            autoComplete="new-password"
            value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && canSubmit && handleSubmit()} />
        </div>

        {error && <p className="text-xs text-red-600 mt-3">{error}</p>}

        <button onClick={handleSubmit} disabled={busy || !canSubmit}
          className="mt-5 px-4 py-2.5 rounded-lg bg-pp-orange text-white text-sm font-medium disabled:opacity-60">
          {busy ? 'Updating…' : 'Update password'}
        </button>
      </section>
    </div>
  )
}