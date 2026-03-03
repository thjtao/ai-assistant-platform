'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import {
  BookOpen, Plus, Trash2, Upload, FileText, Loader2, AlertCircle,
  CheckCircle, XCircle, LogOut, ArrowLeft, RefreshCw
} from 'lucide-react'
import { useDropzone } from 'react-dropzone'
import { knowledgeAPI } from '@/utils/api'
import { useUserStore } from '@/store'
import Link from 'next/link'

interface KnowledgeBase {
  id: string
  name: string
  description: string
  created_at: string
}

interface Document {
  id: string
  filename: string
  status: string
  chunk_count: number
  file_size: number
  created_at: string
  error_msg?: string
}

const ALLOWED_TYPES = { '.pdf': [], '.docx': [], '.txt': [], '.md': [] }

export default function KnowledgePage() {
  const router = useRouter()
  const { user, logout, restoreSession } = useUserStore()
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([])
  const [selectedKB, setSelectedKB] = useState<KnowledgeBase | null>(null)
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createDesc, setCreateDesc] = useState('')
  const [createSubmitting, setCreateSubmitting] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [retryingId, setRetryingId] = useState<string | null>(null)

  useEffect(() => {
    const checkAuth = async () => {
      if (user) {
        loadKnowledgeBases()
        return
      }
      const restored = await restoreSession()
      if (!restored) router.push('/login')
    }
    checkAuth()
  }, [user])

  useEffect(() => {
    if (selectedKB) loadDocuments(selectedKB.id)
  }, [selectedKB?.id])

  // 有文档处理中时轮询状态
  useEffect(() => {
    if (!selectedKB || documents.every((d) => d.status !== 'pending' && d.status !== 'processing')) return
    const id = setInterval(() => loadDocuments(selectedKB.id), 2000)
    return () => clearInterval(id)
  }, [selectedKB?.id, documents])

  const loadKnowledgeBases = async () => {
    try {
      setLoading(true)
      const res = await knowledgeAPI.listKBs()
      setKnowledgeBases(res.data.knowledge_bases || [])
      if (!selectedKB && res.data.knowledge_bases?.length) {
        setSelectedKB(res.data.knowledge_bases[0])
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const loadDocuments = async (kbId: string) => {
    try {
      const res = await knowledgeAPI.listDocuments(kbId)
      setDocuments(res.data.documents || [])
    } catch (e) {
      console.error(e)
    }
  }

  const handleCreateKB = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!createName.trim() || createSubmitting) return
    try {
      setCreateSubmitting(true)
      const res = await knowledgeAPI.createKB({ name: createName.trim(), description: createDesc.trim() })
      await loadKnowledgeBases()
      setSelectedKB({ id: res.data.id, name: res.data.name, description: createDesc.trim(), created_at: '' })
      setShowCreateModal(false)
      setCreateName('')
      setCreateDesc('')
    } catch (e) {
      console.error(e)
    } finally {
      setCreateSubmitting(false)
    }
  }

  const handleDeleteKB = async (id: string) => {
    try {
      await knowledgeAPI.deleteKB(id)
      if (selectedKB?.id === id) setSelectedKB(null)
      await loadKnowledgeBases()
      setDeleteConfirm(null)
    } catch (e) {
      console.error(e)
    }
  }

  const handleRetryDocument = async (docId: string) => {
    if (!selectedKB || retryingId) return
    try {
      setRetryingId(docId)
      await knowledgeAPI.retryDocument(selectedKB.id, docId)
      await loadDocuments(selectedKB.id)
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : '重试失败')
    } finally {
      setRetryingId(null)
    }
  }

  const onDrop = async (acceptedFiles: File[]) => {
    if (!selectedKB || !acceptedFiles.length || uploading) return
    setUploading(true)
    setUploadError(null)
    for (const file of acceptedFiles) {
      try {
        await knowledgeAPI.uploadDocument(selectedKB.id, file)
        await loadDocuments(selectedKB.id)
      } catch (e) {
        const msg = e instanceof Error ? e.message : '上传失败'
        setUploadError(msg)
        console.error(e)
      }
    }
    setUploading(false)
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ALLOWED_TYPES,
    maxSize: 50 * 1024 * 1024,
    disabled: !selectedKB || uploading,
  })

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const statusIcon = (status: string) => {
    switch (status) {
      case 'done':
        return <CheckCircle className="w-4 h-4 text-green-400" />
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-400" />
      case 'processing':
      case 'pending':
        return <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
      default:
        return <AlertCircle className="w-4 h-4 text-gray-400" />
    }
  }

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-gray-100">
      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center justify-between px-6 py-4 border-b border-slate-800/50 bg-slate-900/50">
          <div className="flex items-center gap-4">
            <Link
              href="/chat"
              className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              返回对话
            </Link>
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-br from-blue-500 to-purple-600 p-2.5 rounded-xl">
                <BookOpen className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="font-semibold text-lg bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                  知识库管理
                </h1>
                <p className="text-xs text-gray-500">创建知识库并上传文档，用于 AI 问答检索</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-400">{user?.username}</span>
            <button
              onClick={logout}
              className="p-2 rounded-lg hover:bg-slate-800 text-gray-500 hover:text-gray-300"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        <div className="flex flex-1 min-h-0">
          <aside className="w-72 flex-shrink-0 border-r border-slate-800/50 flex flex-col">
            <div className="p-4">
              <button
                onClick={() => setShowCreateModal(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white text-sm font-medium transition-all duration-300"
              >
                <Plus className="w-4 h-4" />
                新建知识库
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 space-y-2 pb-4">
              {loading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
                </div>
              ) : (
                knowledgeBases.map((kb) => (
                  <div
                    key={kb.id}
                    className={`group flex items-center justify-between px-4 py-3 rounded-xl cursor-pointer transition-all ${
                      selectedKB?.id === kb.id
                        ? 'bg-gradient-to-r from-blue-600/20 to-purple-600/20 border border-blue-500/30'
                        : 'hover:bg-slate-800/60'
                    }`}
                    onClick={() => setSelectedKB(kb)}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{kb.name}</p>
                      {kb.description && (
                        <p className="text-xs text-gray-500 truncate mt-0.5">{kb.description}</p>
                      )}
                    </div>
                    {deleteConfirm === kb.id ? (
                      <div className="flex gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteKB(kb.id) }}
                          className="p-1 rounded text-xs text-red-400 hover:bg-red-500/20"
                        >
                          确认
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteConfirm(null) }}
                          className="p-1 rounded text-xs text-gray-400 hover:bg-slate-700"
                        >
                          取消
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteConfirm(kb.id) }}
                        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-red-500/20 hover:text-red-400 transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))
              )}
              {!loading && knowledgeBases.length === 0 && (
                <div className="text-center py-8 text-gray-500 text-sm">
                  暂无知识库，点击上方创建
                </div>
              )}
            </div>
          </aside>

          <main className="flex-1 flex flex-col min-w-0 p-6 overflow-hidden">
            {selectedKB ? (
              <>
                <div className="mb-6">
                  <h2 className="text-xl font-semibold text-white">{selectedKB.name}</h2>
                  {selectedKB.description && (
                    <p className="text-sm text-gray-500 mt-1">{selectedKB.description}</p>
                  )}
                </div>

                <div
                  {...getRootProps()}
                  className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer mb-6 ${
                    isDragActive
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-slate-700 hover:border-slate-600 bg-slate-800/30'
                  } ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <input {...getInputProps()} />
                  {uploading ? (
                    <Loader2 className="w-10 h-10 mx-auto text-blue-400 animate-spin mb-3" />
                  ) : (
                    <Upload className="w-10 h-10 mx-auto text-gray-400 mb-3" />
                  )}
                  <p className="text-sm text-gray-400">
                    {uploading
                      ? '上传中...'
                      : isDragActive
                      ? '松开以上传'
                      : '拖拽文件到此处，或点击选择文件'}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">支持 PDF、Word、TXT、Markdown，单个文件最大 50MB</p>
                  {uploadError && (
                    <p className="text-sm text-red-400 mt-3">{uploadError}</p>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto">
                  <h3 className="text-sm font-medium text-gray-400 mb-3">文档列表</h3>
                  <div className="space-y-2">
                    {documents.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center gap-4 px-4 py-3 rounded-xl bg-slate-800/50 border border-slate-700/50"
                      >
                        <FileText className="w-4 h-4 text-gray-500 flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm truncate">{doc.filename}</p>
                          <div className="flex items-center gap-4 text-xs text-gray-500 mt-1">
                            <span>{formatFileSize(doc.file_size)}</span>
                            {doc.chunk_count > 0 && (
                              <span>{doc.chunk_count} 个切片</span>
                            )}
                            {doc.status === 'failed' && doc.error_msg && (
                              <span className="text-red-400 truncate max-w-[200px]" title={doc.error_msg}>
                                {doc.error_msg}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {statusIcon(doc.status)}
                          <span className="text-xs text-gray-500 capitalize">{doc.status}</span>
                          {doc.status === 'failed' && (
                            <button
                              onClick={() => handleRetryDocument(doc.id)}
                              disabled={!!retryingId}
                              className="p-1.5 rounded-lg hover:bg-blue-500/20 text-blue-400 hover:text-blue-300 disabled:opacity-50 transition-all"
                              title="重新解析"
                            >
                              <RefreshCw className={`w-3.5 h-3.5 ${retryingId === doc.id ? 'animate-spin' : ''}`} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    {documents.length === 0 && (
                      <div className="text-center py-12 text-gray-500 text-sm">
                        暂无文档，拖拽或选择文件上传
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-gray-500">
                <BookOpen className="w-16 h-16 mb-4 opacity-50" />
                <p className="text-sm">选择左侧知识库，或新建一个</p>
              </div>
            )}
          </main>
        </div>
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-semibold text-white mb-4">新建知识库</h3>
            <form onSubmit={handleCreateKB}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">名称 *</label>
                  <input
                    type="text"
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    placeholder="例如：产品手册"
                    className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">描述（可选）</label>
                  <textarea
                    value={createDesc}
                    onChange={(e) => setCreateDesc(e.target.value)}
                    placeholder="知识库用途说明"
                    rows={2}
                    className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none"
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => { setShowCreateModal(false); setCreateName(''); setCreateDesc('') }}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-slate-600 text-gray-300 hover:bg-slate-700 transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={!createName.trim() || createSubmitting}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white font-medium hover:from-blue-500 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {createSubmitting ? '创建中...' : '创建'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
