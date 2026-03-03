/**
 * 全局状态管理 - 使用 Zustand
 * 类比 Java 的 ApplicationContext 或 Redux
 * Zustand 比 Redux 简单得多，不需要 Action/Reducer 模板代码
 */
import { create } from 'zustand'
import { authAPI } from '@/utils/api'

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  created_at?: string
}

export interface Conversation {
  id: string
  title: string
  model: string
  updated_at: string
}

interface ChatStore {
  // 状态
  conversations: Conversation[]
  currentConversationId: string | null
  messages: Message[]
  isLoading: boolean
  selectedKBId: string | null

  // 方法 - 类比 Service 层方法
  setConversations: (convs: Conversation[]) => void
  addConversation: (conv: Conversation) => void
  removeConversation: (id: string) => void
  setCurrentConversation: (id: string | null) => void
  setMessages: (msgs: Message[]) => void
  addMessage: (msg: Message) => void
  updateLastMessage: (content: string) => void  // 用于流式追加
  setLoading: (loading: boolean) => void
  setSelectedKBId: (id: string | null) => void
  reset: () => void
}

export const useChatStore = create<ChatStore>((set) => ({
  conversations: [],
  currentConversationId: null,
  messages: [],
  isLoading: false,
  selectedKBId: null,

  setConversations: (convs) => set({ conversations: convs }),

  addConversation: (conv) =>
    set((state) => ({ conversations: [conv, ...state.conversations] })),

  removeConversation: (id) =>
    set((state) => ({
      conversations: state.conversations.filter((c) => c.id !== id),
      currentConversationId: state.currentConversationId === id ? null : state.currentConversationId,
      messages: state.currentConversationId === id ? [] : state.messages,
    })),

  setCurrentConversation: (id) => set({ currentConversationId: id }),

  setMessages: (msgs) => set({ messages: msgs }),

  addMessage: (msg) =>
    set((state) => ({ messages: [...state.messages, msg] })),

  // 流式更新最后一条消息内容（追加模式）
  updateLastMessage: (content) =>
    set((state) => {
      const msgs = [...state.messages]
      if (msgs.length > 0 && msgs[msgs.length - 1].role === 'assistant') {
        msgs[msgs.length - 1] = {
          ...msgs[msgs.length - 1],
          content: msgs[msgs.length - 1].content + content,
        }
      }
      return { messages: msgs }
    }),

  setLoading: (loading) => set({ isLoading: loading }),
  setSelectedKBId: (id) => set({ selectedKBId: id }),

  reset: () => set({
    currentConversationId: null,
    messages: [],
    isLoading: false,
  }),
}))


interface UserStore {
  user: { id: string; username: string } | null
  token: string | null
  setUser: (user: UserStore['user'], token: string) => void
  logout: () => void
  /** 页面刷新后根据 localStorage 中的 token 恢复用户状态 */
  restoreSession: () => Promise<boolean>
}

export const useUserStore = create<UserStore>((set, get) => ({
  user: null,
  token: typeof window !== 'undefined' ? localStorage.getItem('token') : null,

  setUser: (user, token) => {
    localStorage.setItem('token', token)
    set({ user, token })
  },

  logout: () => {
    localStorage.removeItem('token')
    set({ user: null, token: null })
  },

  restoreSession: async () => {
    if (typeof window === 'undefined') return false
    const token = localStorage.getItem('token')
    if (!token) return false
    try {
      const res = await authAPI.getMe()
      const user = res.data as { id: string; username: string }
      set({ user, token })
      return true
    } catch {
      localStorage.removeItem('token')
      set({ user: null, token: null })
      return false
    }
  },
}))
