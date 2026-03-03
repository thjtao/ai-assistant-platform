"""
AI Assistant Platform - 后端入口
FastAPI 应用主文件
"""
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from contextlib import asynccontextmanager
from loguru import logger

from app.core.config import settings

# 配置文件日志输出（backend/logs/）
LOG_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "logs")
os.makedirs(LOG_DIR, exist_ok=True)
logger.add(
    os.path.join(LOG_DIR, "app_{time:YYYY-MM-DD}.log"),
    rotation="1 day",
    retention="7 days",
    level="INFO",
    encoding="utf-8",
)
from app.core.database import engine, Base
from app.api import auth, chat, knowledge
# from app.api import agent  # 暂时注释，API 变更需要更新


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理 - 类似 Spring 的 @PostConstruct"""
    logger.info("🚀 AI Assistant Platform starting up...")
    # 创建数据库表（生产环境用 Alembic 迁移）
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("✅ Database tables initialized")
    yield
    logger.info("👋 AI Assistant Platform shutting down...")


app = FastAPI(
    title="AI Assistant Platform",
    description="全栈 AI 助手平台 - 支持 RAG 知识库 + Agent 工具调用",
    version="1.0.0",
    lifespan=lifespan,
)

# ===== 中间件配置 =====
# CORS - 类似 Spring 的 CorsConfiguration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=1000)

# ===== 路由注册 - 类似 Spring 的 @RequestMapping =====
app.include_router(auth.router, prefix="/api/auth", tags=["认证"])
app.include_router(chat.router, prefix="/api/chat", tags=["对话"])
app.include_router(knowledge.router, prefix="/api/knowledge", tags=["知识库"])
# app.include_router(agent.router, prefix="/api/agent", tags=["Agent"])  # 暂时注释


@app.get("/health")
async def health_check():
    """健康检查接口"""
    return {"status": "ok", "version": "1.0.0"}
