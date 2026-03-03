"""
RAG 服务 - 检索增强生成
负责文档解析、向量化存储、语义检索
使用智谱 embedding-3 + Qdrant 向量库
"""
from typing import List, Optional, Tuple
from pathlib import Path
import asyncio

from langchain_community.document_loaders import PyPDFLoader, Docx2txtLoader, TextLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_openai import OpenAIEmbeddings
from langchain_qdrant import QdrantVectorStore
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams
from langchain_core.documents import Document as LCDocument

from app.core.config import settings


def _create_embeddings():
    """创建智谱 embedding-3（兼容 OpenAI 接口）"""
    return OpenAIEmbeddings(
        model=settings.EMBEDDING_MODEL,
        openai_api_key=settings.ZHIPU_API_KEY,
        openai_api_base="https://open.bigmodel.cn/api/paas/v4",
    )


class RAGService:
    """
    RAG 服务 - 智谱 embedding-3 + Qdrant

    核心流程：
    1. 文档加载（PDF/Word/TXT/Markdown）
    2. 文本切分（Chunking）
    3. 向量化（智谱 embedding-3）
    4. 存入 Qdrant 向量库
    5. 语义检索
    """

    def __init__(self):
        self.embeddings = _create_embeddings()
        self.qdrant_client = QdrantClient(url=settings.QDRANT_URL)
        self.collection_prefix = settings.QDRANT_COLLECTION_PREFIX

    def _get_collection_name(self, knowledge_base_id: str) -> str:
        """每个知识库对应一个独立的 collection"""
        return f"{self.collection_prefix}_{knowledge_base_id.replace('-', '_')}"

    def _ensure_collection_exists(self, knowledge_base_id: str) -> None:
        """若 collection 不存在则自动创建"""
        collection_name = self._get_collection_name(knowledge_base_id)
        try:
            self.qdrant_client.get_collection(collection_name)
        except Exception:
            self.qdrant_client.create_collection(
                collection_name=collection_name,
                vectors_config=VectorParams(
                    size=settings.EMBEDDING_DIMENSION,
                    distance=Distance.COSINE,
                ),
            )

    def _get_vectorstore(self, knowledge_base_id: str) -> QdrantVectorStore:
        """获取指定知识库的 Qdrant 向量存储"""
        collection_name = self._get_collection_name(knowledge_base_id)
        return QdrantVectorStore(
            client=self.qdrant_client,
            collection_name=collection_name,
            embedding=self.embeddings,
        )

    async def index_document(
        self,
        knowledge_base_id: str,
        file_path: str,
        filename: str,
        chunk_size: int = 500,
        chunk_overlap: int = 50,
    ) -> int:
        """
        文档入库 - 解析、切分、向量化、存储到 Qdrant
        返回切片数量
        """
        # 1. 加载文档
        docs = await asyncio.to_thread(self._load_document, file_path, filename)

        # 2. 文本切分
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            separators=["\n\n", "\n", "。", "！", "？", ".", "!", "?", " ", ""],
        )
        chunks = splitter.split_documents(docs)

        # 为每个 chunk 添加元数据
        for i, chunk in enumerate(chunks):
            chunk.metadata.update({
                "filename": filename,
                "knowledge_base_id": knowledge_base_id,
                "chunk_index": i,
            })

        # 3. 确保 collection 存在后向量化 + 存储
        await asyncio.to_thread(self._ensure_collection_exists, knowledge_base_id)
        vectorstore = self._get_vectorstore(knowledge_base_id)
        await asyncio.to_thread(vectorstore.add_documents, chunks)

        return len(chunks)

    def _load_document(self, file_path: str, filename: str) -> List[LCDocument]:
        """根据文件类型选择对应的 Loader"""
        ext = Path(filename).suffix.lower()

        if ext == ".pdf":
            loader = PyPDFLoader(file_path)
        elif ext in [".docx", ".doc"]:
            loader = Docx2txtLoader(file_path)
        elif ext in [".txt", ".md"]:
            loader = TextLoader(file_path, encoding="utf-8")
        else:
            raise ValueError(f"不支持的文件类型: {ext}")

        return loader.load()

    async def retrieve(
        self,
        knowledge_base_id: str,
        query: str,
        top_k: Optional[int] = None,
    ) -> Tuple[str, List[str]]:
        """
        语义检索 - 在 Qdrant 中查找最相关的文档片段
        返回 (拼接后的上下文字符串, 参考资料编号列表如 ["参考资料 0", "参考资料 1"])
        """
        top_k = top_k or settings.RAG_TOP_K
        threshold = settings.RAG_RELEVANCE_THRESHOLD

        # 确保 collection 存在（空知识库时可能未创建）
        await asyncio.to_thread(self._ensure_collection_exists, knowledge_base_id)
        vectorstore = self._get_vectorstore(knowledge_base_id)

        # Qdrant 使用 similarity_search_with_score，score 为相似度（越大越相关）
        results = await asyncio.to_thread(
            vectorstore.similarity_search_with_score,
            query,
            k=top_k,
        )

        if not results:
            return "", []

        # 过滤低相关度结果（相似度需大于阈值）
        relevant = [(doc, score) for doc, score in results if score > threshold]

        if not relevant:
            return "", []

        # 调试：打印向量数据库返回结果
        from loguru import logger
        refs: list[str] = []
        for i, (doc, score) in enumerate(relevant):
            source = doc.metadata.get("filename", "未知来源")
            chunk_idx = doc.metadata.get("chunk_index", i)
            refs.append(f"chunk {chunk_idx}")
            logger.info(
                f"[RAG] result[{i}] chunk_index={chunk_idx} filename={source} "
                f"score={score:.4f} metadata_keys={list(doc.metadata.keys())}"
            )

        # 拼接上下文
        context_parts = []
        for i, (doc, score) in enumerate(relevant):
            source = doc.metadata.get("filename", "未知来源")
            chunk_idx = doc.metadata.get("chunk_index", i)
            context_parts.append(
                f"【{refs[i]}】来源：{source}\n{doc.page_content}"
            )

        context_str = "\n\n---\n\n".join(context_parts)
        return context_str, refs

    async def delete_knowledge_base(self, knowledge_base_id: str):
        """删除知识库在 Qdrant 中的 collection"""
        collection_name = self._get_collection_name(knowledge_base_id)

        def _delete():
            try:
                self.qdrant_client.delete_collection(collection_name)
            except Exception:
                pass  # collection 可能从未创建，忽略

        await asyncio.to_thread(_delete)
