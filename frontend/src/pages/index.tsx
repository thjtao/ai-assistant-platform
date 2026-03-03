'use client'
import { useRouter } from 'next/navigation'
import { useUserStore } from '@/store'
import { useEffect } from 'react'

export default function Home() {
  const router = useRouter()
  const user = useUserStore((state) => state.user)

  useEffect(() => {
    if (user) {
      router.push('/chat')
    }
  }, [user, router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
      <div className="text-center">
        <h1 className="text-5xl font-bold text-white mb-6">AI Assistant Platform</h1>
        <p className="text-xl text-slate-400 mb-8">智能对话 · 知识检索 · 工具调用</p>
        <div className="flex gap-4 justify-center">
          <button
            onClick={() => router.push('/login')}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-8 py-3 rounded-lg transition-colors"
          >
            登录
          </button>
          <button
            onClick={() => router.push('/register')}
            className="bg-transparent border border-blue-600 text-blue-400 hover:bg-blue-600/10 font-medium px-8 py-3 rounded-lg transition-colors"
          >
            注册
          </button>
        </div>
      </div>
    </div>
  )
}
