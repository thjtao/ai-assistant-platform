"""
对话模块 - 核心聊天接口
支持多轮对话、流式输出、历史记录管理
"""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional, AsyncIterator
import json
import asyncio

from app.core.database import get_db
from app.core.config import settings
from app.models.models import User, Conversation, Message
from app.api.auth import get_current_user
from app.services.llm_service import LLMService

router = APIRouter()

# RAG 知识库问答的 System Prompt
RAG_SYSTEM_PROMPT = """你是基于知识库的智能助手。请严格依据以下参考资料回答用户问题：

【参考资料】
{context}

规则：
1. 若资料中有答案，请直接引用回答
2. 若资料中无相关内容，请明确说明「资料中未找到相关信息」
3. 不要编造或推测资料外的内容
4. 回答简洁、结构化
5. 不要添加「来源」行，系统会自动追加"""


# ===== DTO 模型 =====
class ChatRequest(BaseModel):
    conversation_id: Optional[str] = None  # 为空则创建新会话
    message: str
    knowledge_base_id: Optional[str] = None  # 使用知识库问答
    stream: bool = True


class ConversationCreate(BaseModel):
    title: str = "新对话"
    model: str = "gpt-4o-mini"


class ConversationResponse(BaseModel):
    id: str
    title: str
    model: str
    message_count: int = 0

    class Config:
        from_attributes = True


# ===== 对话管理接口 =====
@router.get("/conversations")
async def list_conversations(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """获取当前用户所有会话列表"""
    result = await db.execute(
        select(Conversation)
        .where(Conversation.user_id == current_user.id)
        .order_by(Conversation.updated_at.desc())
    )
    conversations = result.scalars().all()
    return {"conversations": [
        {"id": c.id, "title": c.title, "model": c.model, "updated_at": c.updated_at}
        for c in conversations
    ]}


@router.post("/conversations")
async def create_conversation(
    data: ConversationCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """创建新会话"""
    conv = Conversation(user_id=current_user.id, title=data.title, model=data.model)
    db.add(conv)
    await db.flush()
    return {"id": conv.id, "title": conv.title, "model": conv.model}


@router.delete("/conversations/{conversation_id}")
async def delete_conversation(
    conversation_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """删除会话"""
    result = await db.execute(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.user_id == current_user.id
        )
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="会话不存在")
    await db.delete(conv)
    return {"message": "删除成功"}


@router.get("/conversations/{conversation_id}/messages")
async def get_messages(
    conversation_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """获取会话历史消息"""
    # 验证会话归属
    result = await db.execute(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.user_id == current_user.id
        )
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="会话不存在")

    result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at)
    )
    messages = result.scalars().all()
    return {"messages": [
        {"id": m.id, "role": m.role, "content": m.content, "created_at": m.created_at}
        for m in messages
    ]}


# ===== 核心聊天接口 =====
@router.post("/send")
async def send_message(
    request: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    发送消息 - 支持流式和非流式两种模式
    流式响应使用 SSE (Server-Sent Events) 格式
    """
    # 获取或创建会话
    if request.conversation_id:
        result = await db.execute(
            select(Conversation).where(
                Conversation.id == request.conversation_id,
                Conversation.user_id == current_user.id
            )
        )
        conversation = result.scalar_one_or_none()
        if not conversation:
            raise HTTPException(status_code=404, detail="会话不存在")
    else:
        conversation = Conversation(
            user_id=current_user.id,
            title=request.message[:30] + "..." if len(request.message) > 30 else request.message
        )
        db.add(conversation)
        await db.flush()

    # 保存用户消息
    user_msg = Message(
        conversation_id=conversation.id,
        role="user",
        content=request.message
    )
    db.add(user_msg)
    await db.flush()

    # 获取历史消息（最近10条，避免超出上下文）
    history_result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conversation.id)
        .order_by(Message.created_at.desc())
        .limit(10)
    )
    history = list(reversed(history_result.scalars().all()))

    # 构建消息列表
    messages = [{"role": m.role, "content": m.content} for m in history]

    # 流式响应
    if request.stream:
        async def event_stream() -> AsyncIterator[str]:
            full_content = ""
            llm = LLMService()
            from loguru import logger

            # 如果指定了知识库，先做 RAG 检索
            source_refs: list[str] = []
            logger.info(f"[CHAT] Received message request - knowledge_base_id={request.knowledge_base_id}, stream={request.stream}, message={request.message[:50]}")
            
            if request.knowledge_base_id:
                from app.services.rag_service import RAGService
                rag = RAGService()
                context, source_refs = await rag.retrieve(request.knowledge_base_id, request.message)
                logger.info(f"[CHAT] RAG retrieve returned - context length={len(context) if context else 0}, source_refs={source_refs}")
                if context:
                    messages.insert(0, {
                        "role": "system",
                        "content": RAG_SYSTEM_PROMPT.format(context=context)
                    })

            # 发送会话 ID（前端需要知道）
            yield f"data: {json.dumps({'type': 'conversation_id', 'conversation_id': conversation.id})}\n\n"

            async for chunk in llm.stream_chat(messages):
                full_content += chunk
                yield f"data: {json.dumps({'type': 'content', 'content': chunk})}\n\n"

            # 程序化追加来源（不依赖 LLM）
            if source_refs:
                source_line = "\n\n来源：" + "、".join(source_refs)
                full_content += source_line
                yield f"data: {json.dumps({'type': 'content', 'content': source_line})}\n\n"

            # 保存 AI 回复到数据库
            ai_msg = Message(
                conversation_id=conversation.id,
                role="assistant",
                content=full_content
            )
            db.add(ai_msg)
            await db.commit()

            yield f"data: {json.dumps({'type': 'done', 'message_id': ai_msg.id})}\n\n"

        return StreamingResponse(
            event_stream(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",  # Nginx 关闭缓冲
            }
        )
    else:
        # 非流式（同样支持知识库 RAG）
        from loguru import logger
        logger.info(f"[CHAT] Received message request - knowledge_base_id={request.knowledge_base_id}, stream={request.stream}, message={request.message[:50]}")
        
        source_refs: list[str] = []
        if request.knowledge_base_id:
            from app.services.rag_service import RAGService
            rag = RAGService()
            context, source_refs = await rag.retrieve(request.knowledge_base_id, request.message)
            logger.info(f"[CHAT] RAG retrieve returned - context length={len(context) if context else 0}, source_refs={source_refs}")
            if context:
                messages.insert(0, {
                    "role": "system",
                    "content": RAG_SYSTEM_PROMPT.format(context=context)
                })
        llm = LLMService()
        content = await llm.chat(messages)
        if source_refs:
            content += "\n\n来源：" + "、".join(source_refs)
        ai_msg = Message(conversation_id=conversation.id, role="assistant", content=content)
        db.add(ai_msg)
        return {
            "conversation_id": conversation.id,
            "message": {"role": "assistant", "content": content}
        }
