/**
 * API 客户端 - 封装所有后端请求
 * 类比 Java 中的 Feign Client 或 RestTemplate
 */
import axios from 'axios'

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

// axios 实例 - 带基础配置
export const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

// 请求拦截器：自动添加 Token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// 响应拦截器：统一错误处理
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)


export const authAPI = {
  register: (data: { username: string; password: string }) =>
    api.post('/api/auth/register', data),

  login: (username: string, password: string) =>
    api.post('/api/auth/login', new URLSearchParams({ username, password }), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    }),

  getMe: () => api.get('/api/auth/me'),
}


// ===== 对话 API =====
export const chatAPI = {
  listConversations: () => api.get('/api/chat/conversations'),

  createConversation: (title?: string) =>
    api.post('/api/chat/conversations', { title: title || '新对话' }),

  deleteConversation: (id: string) =>
    api.delete(`/api/chat/conversations/${id}`),

  getMessages: (conversationId: string) =>
    api.get(`/api/chat/conversations/${conversationId}/messages`),

  /**
   * 流式发送消息 - 使用原生 fetch + EventSource 模式
   * axios 不支持 SSE 流式读取，需要用 fetch
   */
  sendMessageStream: async (
    message: string,
    conversationId: string | null,
    knowledgeBaseId: string | null,
    onChunk: (text: string) => void,
    onConversationId: (id: string) => void,
    onDone: () => void,
  ) => {
    const token = localStorage.getItem('token')
    const response = await fetch(`${BASE_URL}/api/chat/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        message,
        conversation_id: conversationId,
        knowledge_base_id: knowledgeBaseId,
        stream: true,
      }),
    })

    if (!response.ok) throw new Error('发送失败')

    const reader = response.body!.getReader()
    const decoder = new TextDecoder()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const text = decoder.decode(value)
      const lines = text.split('\n')

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        try {
          const data = JSON.parse(line.slice(6))
          if (data.type === 'conversation_id') onConversationId(data.conversation_id)
          if (data.type === 'content') onChunk(data.content)
          if (data.type === 'done') onDone()
        } catch {}
      }
    }
  },
}


// ===== 知识库 API =====
export const knowledgeAPI = {
  listKBs: () => api.get('/api/knowledge/'),
  createKB: (data: { name: string; description?: string }) =>
    api.post('/api/knowledge/', data),
  deleteKB: (id: string) => api.delete(`/api/knowledge/${id}`),

  listDocuments: (kbId: string) => api.get(`/api/knowledge/${kbId}/documents`),

  retryDocument: (kbId: string, docId: string) =>
    api.post(`/api/knowledge/${kbId}/documents/${docId}/retry`),

  /** 文件上传 - 使用 fetch 避免 axios 默认 Content-Type 覆盖 FormData */
  uploadDocument: async (kbId: string, file: File) => {
    const token = localStorage.getItem('token')
    const form = new FormData()
    form.append('file', file)
    const response = await fetch(`${BASE_URL}/api/knowledge/${kbId}/documents`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: form,
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({ detail: '上传失败' }))
      throw new Error(typeof err.detail === 'string' ? err.detail : JSON.stringify(err.detail))
    }
    return { data: await response.json() }
  },
}


// ===== Agent API =====
export const agentAPI = {
  listTools: () => api.get('/api/agent/tools'),

  runAgentStream: async (
    query: string,
    tools: string[],
    onStep: (step: { tool: string; tool_input: string; observation: string }) => void,
    onAnswer: (answer: string) => void,
  ) => {
    const token = localStorage.getItem('token')
    const response = await fetch(`${BASE_URL}/api/agent/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query, tools }),
    })

    const reader = response.body!.getReader()
    const decoder = new TextDecoder()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const text = decoder.decode(value)
      for (const line of text.split('\n')) {
        if (!line.startsWith('data: ')) continue
        try {
          const data = JSON.parse(line.slice(6))
          if (data.type === 'step') onStep(data)
          if (data.type === 'answer') onAnswer(data.content)
        } catch {}
      }
    }
  },
}
