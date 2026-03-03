"""
数据库模型 - 类比 Spring 的 @Entity
"""
from sqlalchemy import Column, String, Text, DateTime, Boolean, ForeignKey, Integer, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid

from app.core.database import Base


def gen_uuid():
    return str(uuid.uuid4())


class User(Base):
    """用户表"""
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    username = Column(String(50), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # 关联 - 类比 Spring 的 @OneToMany
    conversations = relationship("Conversation", back_populates="user", cascade="all, delete-orphan")
    knowledge_bases = relationship("KnowledgeBase", back_populates="user", cascade="all, delete-orphan")


class Conversation(Base):
    """对话会话表"""
    __tablename__ = "conversations"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    title = Column(String(200), default="新对话")
    model = Column(String(50), default="gpt-4o-mini")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="conversations")
    messages = relationship("Message", back_populates="conversation", cascade="all, delete-orphan",
                           order_by="Message.created_at")


class Message(Base):
    """消息表"""
    __tablename__ = "messages"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    conversation_id = Column(String(36), ForeignKey("conversations.id"), nullable=False)
    role = Column(String(20), nullable=False)  # user | assistant | system
    content = Column(Text, nullable=False)
    tokens_used = Column(Integer, default=0)
    meta_data = Column(JSON, default={})  # 存储来源引用、工具调用信息等
    created_at = Column(DateTime, default=datetime.utcnow)

    conversation = relationship("Conversation", back_populates="messages")


class KnowledgeBase(Base):
    """知识库表"""
    __tablename__ = "knowledge_bases"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    name = Column(String(100), nullable=False)
    description = Column(Text, default="")
    embedding_model = Column(String(50), default="text-embedding-3-small")
    chunk_size = Column(Integer, default=500)
    chunk_overlap = Column(Integer, default=50)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="knowledge_bases")
    documents = relationship("Document", back_populates="knowledge_base", cascade="all, delete-orphan")


class Document(Base):
    """知识库文档表"""
    __tablename__ = "documents"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    knowledge_base_id = Column(String(36), ForeignKey("knowledge_bases.id"), nullable=False)
    filename = Column(String(255), nullable=False)
    file_path = Column(String(500), nullable=False)
    file_size = Column(Integer, default=0)
    file_type = Column(String(50), default="")
    status = Column(String(20), default="pending")  # pending | processing | done | failed
    chunk_count = Column(Integer, default=0)
    error_msg = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)

    knowledge_base = relationship("KnowledgeBase", back_populates="documents")
