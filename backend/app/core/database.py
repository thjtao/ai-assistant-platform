"""
数据库配置 - 类似 Spring 的 DataSource + JPA EntityManager
使用 SQLAlchemy 异步引擎
"""
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.core.config import settings


# 异步引擎 - 类比 Spring 的 DataSource
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    pool_size=10,
    max_overflow=20,
)

# Session 工厂 - 类比 Spring 的 EntityManagerFactory
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


# Base 类 - 类比 Spring 的 @Entity 基类
class Base(DeclarativeBase):
    pass


# 依赖注入 - 类比 Spring 的 @Autowired DataSource
async def get_db():
    """FastAPI 依赖注入 - 获取数据库 Session"""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
