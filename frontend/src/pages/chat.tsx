'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/cjs/styles/prism'
import {
  Plus, Trash2, Send, Bot, User, Loader2,
  BookOpen, ChevronDown, Sparkles, LogOut, MessageSquare, MoreVertical
} from 'lucide-react'
import { chatAPI, knowledgeAPI } from '@/utils/api'
import { useChatStore, useUserStore } from '@/store'

export default function ChatPage() {
  const router = useRouter()
  const {
    conversations, currentConversationId, messages, isLoading, selectedKBId,
    setConversations, addConversation, removeConversation,
    setCurrentConversation, setMessages, addMessage, updateLastMessage,
    setLoading, setSelectedKBId,
  } = useChatStore()

  const { user, logout, restoreSession } = useUserStore()
  const [input, setInput] = useState('')
  const [knowledgeBases, setKnowledgeBases] = useState<any[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const checkAuth = async () => {
      if (user) {
        loadConversations()
        loadKnowledgeBases()
        return
      }
      // 页面刷新后 user 会丢失，尝试根据 localStorage 中的 token 恢复会话
      const restored = await restoreSession()
      if (!restored) {
        router.push('/login')
      }
    }
    checkAuth()
  }, [user])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const loadConversations = async () => {
    try {
      const res = await chatAPI.listConversations()
      setConversations(res.data.conversations)
    } catch (e) { console.error(e) }
  }

  const loadKnowledgeBases = async () => {
    try {
      const res = await knowledgeAPI.listKBs()
      setKnowledgeBases(res.data.knowledge_bases)
    } catch (e) { console.error(e) }
  }

  const selectConversation = async (id: string) => {
    setCurrentConversation(id)
    try {
      const res = await chatAPI.getMessages(id)
      setMessages(res.data.messages)
    } catch (e) { console.error(e) }
  }

  const newConversation = () => {
    setCurrentConversation(null)
    setMessages([])
  }

  const deleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await chatAPI.deleteConversation(id)
      removeConversation(id)
    } catch (e) { console.error(e) }
  }

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return

    const userMessage = input.trim()
    setInput('')
    setLoading(true)

    addMessage({ id: Date.now().toString(), role: 'user', content: userMessage })
    addMessage({ id: (Date.now() + 1).toString(), role: 'assistant', content: '' })

    let convId = currentConversationId

    try {
      await chatAPI.sendMessageStream(
        userMessage,
        convId,
        selectedKBId,
        (chunk) => updateLastMessage(chunk),
        (id) => {
          convId = id
          setCurrentConversation(id)
          loadConversations()
        },
        () => setLoading(false),
      )
    } catch (e) {
      updateLastMessage('发送失败，请重试。')
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-gray-100">
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <div className="relative mb-8">
                <div className="absolute inset-0 bg-blue-500/20 blur-3xl rounded-full animate-pulse" />
                <div className="relative bg-gradient-to-br from-blue-500 to-purple-600 p-6 rounded-3xl shadow-2xl">
                  <Sparkles className="w-16 h-16 text-white" />
                </div>
              </div>
              <h2 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent mb-2">
                有什么可以帮你的？
              </h2>
              <p className="text-gray-500">发送消息开始对话</p>
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id} className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'assistant' && (
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-blue-500/20">
                  <Bot className="w-5 h-5 text-white" />
                </div>
              )}

              <div className={`max-w-3xl rounded-3xl px-6 py-4 shadow-2xl ${
                msg.role === 'user'
                  ? 'bg-gradient-to-br from-blue-600 to-blue-700 text-white rounded-tr-sm shadow-blue-500/20'
                  : 'bg-slate-800/80 backdrop-blur-xl text-gray-100 rounded-tl-sm border border-slate-700/50'
              }`}>
                {msg.role === 'assistant' ? (
                  <div className="prose prose-invert prose-sm max-w-none">
                    {msg.content ? (
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          code({ node, inline, className, children, ...props }: any) {
                            const match = /language-(\w+)/.exec(className || '')
                            return !inline && match ? (
                              <SyntaxHighlighter
                                style={oneDark}
                                language={match[1]}
                                PreTag="div"
                                {...props}
                              >
                                {String(children).replace(/\n$/, '')}
                              </SyntaxHighlighter>
                            ) : (
                              <code className="bg-slate-700/50 px-1.5 py-0.5 rounded text-blue-400 text-xs" {...props}>
                                {children}
                              </code>
                            )
                          },
                        }}
                      >
                        {msg.content}
                      </ReactMarkdown>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                        <span className="text-gray-500">思考中...</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                )}
              </div>

              {msg.role === 'user' && (
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center flex-shrink-0 shadow-lg">
                  <User className="w-5 h-5 text-gray-300" />
                </div>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-6 border-t border-slate-800/50 bg-slate-900/50 backdrop-blur-xl">
          {selectedKBId && (
            <div className="flex items-center gap-2 text-xs text-blue-400 mb-3 bg-blue-500/10 px-4 py-2 rounded-xl border border-blue-500/20">
              <BookOpen className="w-3.5 h-3.5" />
              <span>已启用知识库: {knowledgeBases.find(k => k.id === selectedKBId)?.name}</span>
            </div>
          )}
          <div className="flex gap-4 items-end bg-slate-800/60 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-4 shadow-2xl shadow-black/20 focus-within:border-blue-500/50 focus-within:shadow-blue-500/10 transition-all duration-300">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入消息... (Enter 发送，Shift+Enter 换行)"
              className="flex-1 bg-transparent text-sm text-gray-100 placeholder-gray-500 resize-none outline-none max-h-32 min-h-[24px] leading-relaxed"
              rows={1}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || isLoading}
              className="flex-shrink-0 p-3 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 disabled:opacity-40 disabled:cursor-not-allowed disabled:from-slate-600 disabled:to-slate-700 transition-all duration-300 shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:scale-105 active:scale-95"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 text-white animate-spin" />
              ) : (
                <Send className="w-4 h-4 text-white" />
              )}
            </button>
          </div>
          <p className="text-xs text-slate-600 mt-3 text-center">
            AI 生成内容可能存在错误，请注意甄别
          </p>
        </div>
      </div>

      <div className="w-80 flex-shrink-0 bg-slate-900/80 backdrop-blur-xl border-l border-slate-800/50 flex flex-col">
        <div className="p-6 border-b border-slate-800/50">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="absolute inset-0 bg-blue-500/20 blur-xl rounded-full" />
              <div className="relative bg-gradient-to-br from-blue-500 to-purple-600 p-3 rounded-xl">
                <MessageSquare className="w-5 h-5 text-white" />
              </div>
            </div>
            <span className="font-semibold text-lg bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              AI Assistant
            </span>
          </div>
        </div>

        <div className="p-4">
          <button
            onClick={newConversation}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white text-sm font-medium transition-all duration-300 shadow-lg shadow-blue-500/20 hover:shadow-blue-500/40 hover:scale-[1.02] active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" />
            新建对话
          </button>
        </div>

        <div className="px-4 pb-3 space-y-3">
          <Link
            href="/knowledge"
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-600/50 text-gray-400 hover:bg-slate-800/60 hover:text-white text-sm transition-all"
          >
            <BookOpen className="w-4 h-4" />
            知识库管理
          </Link>
          <div className="relative">
            <BookOpen className="absolute left-3 top-3 w-4 h-4 text-gray-500" />
            <select
              value={selectedKBId || ''}
              onChange={(e) => setSelectedKBId(e.target.value || null)}
              className="w-full pl-10 pr-10 py-3 text-xs bg-slate-800/60 backdrop-blur-xl border border-slate-700/50 rounded-xl text-gray-300 appearance-none cursor-pointer focus:outline-none focus:border-blue-500/50 transition-colors"
            >
              <option value="">不使用知识库</option>
              {knowledgeBases.map((kb) => (
                <option key={kb.id} value={kb.id}>{kb.name}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-3 w-4 h-4 text-gray-500 pointer-events-none" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 space-y-2">
          {conversations.map((conv) => (
            <div
              key={conv.id}
              onClick={() => selectConversation(conv.id)}
              className={`group flex items-center justify-between px-4 py-3 rounded-xl cursor-pointer text-sm transition-all duration-200 ${
                currentConversationId === conv.id
                  ? 'bg-gradient-to-r from-blue-600/20 to-purple-600/20 border border-blue-500/30 text-white'
                  : 'text-gray-400 hover:bg-slate-800/60 hover:text-gray-200'
              }`}
            >
              <span className="truncate flex-1">{conv.title}</span>
              <button
                onClick={(e) => deleteConversation(conv.id, e)}
                className="opacity-0 group-hover:opacity-100 ml-2 p-1.5 rounded-lg hover:bg-red-500/20 hover:text-red-400 transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-slate-800/50 bg-slate-900/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center">
                <User className="w-4 h-4 text-gray-300" />
              </div>
              <span className="text-sm text-gray-400 font-medium">{user?.username}</span>
            </div>
            <button
              onClick={logout}
              className="p-2 rounded-lg hover:bg-slate-800 text-gray-500 hover:text-gray-300 transition-all"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
