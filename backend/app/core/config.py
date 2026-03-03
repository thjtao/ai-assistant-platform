"""
配置管理 - 类似 Spring Boot 的 application.yml + @ConfigurationProperties
使用 Pydantic Settings 自动读取环境变量
"""
from urllib.parse import quote_plus
from pydantic import model_validator
from pydantic_settings import BaseSettings
from typing import List, Optional


class Settings(BaseSettings):
    # ===== 应用基础配置 =====
    APP_NAME: str = "AI Assistant Platform"
    DEBUG: bool = False
    ALLOWED_ORIGINS: List[str] = [
        "http://localhost:3000", "http://127.0.0.1:3000",
        "http://localhost:3001", "http://127.0.0.1:3001",
    ]

    # ===== 数据库配置 =====
    # 方式1: 直接设置 DATABASE_URL 环境变量（优先）
    # 方式2: 使用以下拆分变量，从环境变量读取
    DATABASE_URL: Optional[str] = None
    DB_HOST: str = "localhost"
    DB_PORT: int = 3306
    DB_USER: str = "root"
    DB_PASSWORD: str = ""
    DB_NAME: str = "ai_assistant"

    @model_validator(mode="after")
    def build_database_url(self) -> "Settings":
        if self.DATABASE_URL:
            return self
        password = quote_plus(self.DB_PASSWORD)  # 支持密码中的特殊字符
        object.__setattr__(
            self,
            "DATABASE_URL",
            f"mysql+aiomysql://{self.DB_USER}:{password}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}",
        )
        return self

    # ===== Redis 配置 =====
    REDIS_URL: str = "redis://localhost:6379"

    # ===== JWT 配置 =====
    SECRET_KEY: str = "your-secret-key"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24小时

    # ===== LLM 配置 =====
    LLM_PROVIDER: str = "zhipu"  # openai | anthropic | zhipu
    LLM_MODEL: str = "glm-4.7"  # 智谱 GLM-4.7  flagship 模型
    OPENAI_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""
    ZHIPU_API_KEY: str = ""  # 智谱开放平台 API Key: https://open.bigmodel.cn

    # ===== Embedding 配置（智谱 embedding-3）=====
    EMBEDDING_PROVIDER: str = "zhipu"
    EMBEDDING_MODEL: str = "embedding-3"
    EMBEDDING_DIMENSION: int = 2048  # embedding-3 默认向量维度

    # ===== 文件上传配置 =====
    UPLOAD_DIR: str = "./uploads"
    MAX_FILE_SIZE_MB: int = 50

    # ===== 向量数据库配置（Qdrant）=====
    QDRANT_URL: str = "http://localhost:6333"
    QDRANT_COLLECTION_PREFIX: str = "kb"

    # ===== RAG 检索配置 =====
    RAG_TOP_K: int = 4
    RAG_RELEVANCE_THRESHOLD: float = 0.5  # 距离阈值，Qdrant 余弦距离越小越相似

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
