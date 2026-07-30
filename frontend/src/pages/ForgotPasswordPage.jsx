import { useState } from 'react';
import toast from 'react-hot-toast';
import axios from 'axios';

const authApi = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  timeout: 30000,
});

export default function ForgotPasswordPage({ onBackToLogin }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);

    try {
      const { data } = await authApi.post('/auth/forgot-password', { email });
      setSent(true);
      toast.success(data.message);
    } catch (error) {
      const message = error.response?.data?.error || error.message || 'Request failed';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h1 className="text-xl font-semibold text-gray-900 mb-1">Forgot password</h1>
        <p className="text-sm text-gray-500 mb-6">
          Enter your email and we&apos;ll send you a link to reset your password.
        </p>

        {sent ? (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              If an account exists for that email, a reset link has been sent. Check your inbox.
            </p>
            <button
              type="button"
              onClick={onBackToLogin}
              className="w-full border border-gray-300 text-gray-700 rounded-lg py-2.5 text-sm font-medium hover:bg-gray-50"
            >
              Back to sign in
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pp-orange/30"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-pp-orange text-white rounded-lg py-2.5 text-sm font-medium hover:opacity-95 disabled:opacity-60"
            >
              {loading ? 'Sending...' : 'Send reset link'}
            </button>

            <button
              type="button"
              onClick={onBackToLogin}
              className="w-full text-sm text-gray-500 hover:text-gray-700"
            >
              Back to sign in
            </button>
          </form>
        )}
      </div>
    </div>
  );
}