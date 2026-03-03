import { useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { authAPI } from '@/utils/api'
import { useUserStore } from '@/store'

export default function Register() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const setUser = useUserStore((state) => state.setUser)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('两次输入的密码不一致')
      return
    }

    if (password.length < 6) {
      setError('密码长度至少为6位')
      return
    }

    setLoading(true)

    try {
      const res = await authAPI.register({ username, password })
      setUser(res.data.user, res.data.access_token)
      router.push('/chat')
    } catch (err: any) {
      setError(err.response?.data?.detail || '注册失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
      <div className="w-full max-w-md">
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 shadow-2xl border border-white/20">
          <h1 className="text-3xl font-bold text-white text-center mb-2">注册</h1>
          <p className="text-slate-400 text-center mb-8">创建一个新账号</p>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">账号</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="请输入账号"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">密码</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="请输入密码（至少6位）"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">确认密码</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="请再次输入密码"
                required
              />
            </div>

            {error && (
              <div className="bg-red-500/20 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? '注册中...' : '注册'}
            </button>
          </form>

          <p className="text-center text-slate-400 mt-6">
            已有账号？{' '}
            <Link href="/login" className="text-blue-400 hover:text-blue-300">
              立即登录
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
