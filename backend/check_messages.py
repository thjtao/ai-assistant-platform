import asyncio
from sqlalchemy import text
from app.core.database import engine

async def check():
    async with engine.begin() as conn:
        result = await conn.execute(text('SELECT content FROM messages ORDER BY created_at DESC LIMIT 3'))
        rows = result.fetchall()
        [print(f'=== 消息 {i+1} ===\n{row[0]}\n') for i, row in enumerate(rows)]

asyncio.run(check())
