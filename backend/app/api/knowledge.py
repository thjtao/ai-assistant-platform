"""
知识库模块 - 文件上传、解析、管理
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
import asyncio
import aiofiles
import os
import uuid

from app.core.database import get_db
from app.core.config import settings
from app.models.models import User, KnowledgeBase, Document
from app.api.auth import get_current_user
from app.services.rag_service import RAGService

router = APIRouter()


# ===== DTO =====
class KBCreate(BaseModel):
    name: str
    description: str = ""
    chunk_size: int = 500
    chunk_overlap: int = 50


# ===== 知识库 CRUD =====
@router.get("/")
async def list_knowledge_bases(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(KnowledgeBase).where(KnowledgeBase.user_id == current_user.id)
    )
    kbs = result.scalars().all()
    return {"knowledge_bases": [
        {"id": kb.id, "name": kb.name, "description": kb.description, "created_at": kb.created_at}
        for kb in kbs
    ]}


@router.post("/", status_code=201)
async def create_knowledge_base(
    data: KBCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    kb = KnowledgeBase(
        user_id=current_user.id,
        name=data.name,
        description=data.description,
        chunk_size=data.chunk_size,
        chunk_overlap=data.chunk_overlap,
    )
    db.add(kb)
    await db.flush()
    return {"id": kb.id, "name": kb.name}


@router.delete("/{kb_id}")
async def delete_knowledge_base(
    kb_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(KnowledgeBase).where(KnowledgeBase.id == kb_id, KnowledgeBase.user_id == current_user.id)
    )
    kb = result.scalar_one_or_none()
    if not kb:
        raise HTTPException(status_code=404, detail="知识库不存在")

    # 删除向量数据
    rag = RAGService()
    await rag.delete_knowledge_base(kb_id)

    await db.delete(kb)
    return {"message": "删除成功"}


# ===== 文档上传与处理 =====
# 注意：更具体的路径需定义在前，否则会被 /{kb_id}/documents 匹配掉
@router.post("/{kb_id}/documents/{doc_id}/retry")
async def retry_document(
    kb_id: str,
    doc_id: str,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """重新解析失败的文档"""
    kb_result = await db.execute(
        select(KnowledgeBase).where(KnowledgeBase.id == kb_id, KnowledgeBase.user_id == current_user.id)
    )
    kb = kb_result.scalar_one_or_none()
    if not kb:
        raise HTTPException(status_code=404, detail="知识库不存在")

    doc_result = await db.execute(
        select(Document).where(
            Document.id == doc_id,
            Document.knowledge_base_id == kb_id,
        )
    )
    doc = doc_result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")

    if not os.path.exists(doc.file_path):
        raise HTTPException(status_code=400, detail="原文件已丢失，无法重试")

    doc.status = "pending"
    doc.error_msg = ""
    await db.commit()

    background_tasks.add_task(
        process_document_background,
        doc_id, kb_id, doc.file_path, doc.filename, kb.chunk_size, kb.chunk_overlap
    )
    return {"id": doc_id, "status": "pending", "message": "已加入重新解析队列"}


@router.post("/{kb_id}/documents")
async def upload_document(
    kb_id: str,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    上传文档到知识库
    1. 保存文件到磁盘
    2. 记录数据库
    3. 后台异步处理（解析 + 向量化）
    """
    # 验证知识库归属
    result = await db.execute(
        select(KnowledgeBase).where(KnowledgeBase.id == kb_id, KnowledgeBase.user_id == current_user.id)
    )
    kb = result.scalar_one_or_none()
    if not kb:
        raise HTTPException(status_code=404, detail="知识库不存在")

    # 验证文件类型
    allowed_types = {".pdf", ".docx", ".txt", ".md"}
    file_ext = os.path.splitext(file.filename)[1].lower()
    if file_ext not in allowed_types:
        raise HTTPException(status_code=400, detail=f"不支持的文件类型，支持: {allowed_types}")

    # 保存文件
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    file_id = str(uuid.uuid4())
    save_path = os.path.join(settings.UPLOAD_DIR, f"{file_id}{file_ext}")

    async with aiofiles.open(save_path, "wb") as f:
        content = await file.read()
        await f.write(content)

    # 创建文档记录
    doc = Document(
        knowledge_base_id=kb_id,
        filename=file.filename,
        file_path=save_path,
        file_size=len(content),
        file_type=file_ext,
        status="pending",
    )
    db.add(doc)
    await db.commit()
    doc_id = doc.id

    # 后台异步处理 - 类比 Spring 的 @Async
    background_tasks.add_task(
        process_document_background,
        doc_id, kb_id, save_path, file.filename, kb.chunk_size, kb.chunk_overlap
    )

    return {"id": doc_id, "filename": file.filename, "status": "pending"}


@router.get("/{kb_id}/documents")
async def list_documents(
    kb_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """获取知识库下的所有文档"""
    kb_result = await db.execute(
        select(KnowledgeBase).where(KnowledgeBase.id == kb_id, KnowledgeBase.user_id == current_user.id)
    )
    if not kb_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="知识库不存在")

    result = await db.execute(
        select(Document).where(Document.knowledge_base_id == kb_id)
        .order_by(Document.created_at.desc())
    )
    docs = result.scalars().all()
    return {"documents": [
        {
            "id": d.id, "filename": d.filename, "status": d.status,
            "chunk_count": d.chunk_count, "file_size": d.file_size,
            "created_at": d.created_at, "error_msg": d.error_msg
        }
        for d in docs
    ]}


async def process_document_background(
    doc_id: str, kb_id: str, file_path: str, filename: str,
    chunk_size: int, chunk_overlap: int
):
    """
    后台任务：解析文档并向量化
    注意：后台任务需要独立的数据库 Session
    """
    from loguru import logger
    from app.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        try:
            # 更新状态为处理中（主请求可能尚未 commit，稍作重试）
            doc = None
            for _ in range(3):
                result = await db.execute(select(Document).where(Document.id == doc_id))
                doc = result.scalar_one_or_none()
                if doc:
                    break
                await asyncio.sleep(0.5)

            if not doc:
                logger.warning(f"Document {doc_id} not found, skip processing")
                return

            doc.status = "processing"
            await db.commit()

            # 执行 RAG 入库
            rag = RAGService()
            chunk_count = await rag.index_document(kb_id, file_path, filename, chunk_size, chunk_overlap)

            # 更新状态为完成
            doc.status = "done"
            doc.chunk_count = chunk_count
            await db.commit()

        except Exception as e:
            result = await db.execute(select(Document).where(Document.id == doc_id))
            doc = result.scalar_one_or_none()
            if doc:
                doc.status = "failed"
                doc.error_msg = str(e)[:2000]
                await db.commit()
