"""
LLM 服务层 - 统一封装不同 AI 提供商
支持 OpenAI、Anthropic、智谱 ZhiPu (GLM-4.7)，可扩展其他提供商
类比 Spring 的 Service 层 + 策略模式
"""
from typing import AsyncIterator, List, Dict
from app.core.config import settings
import openai
import anthropic


class LLMService:
    """
    LLM 服务 - 策略模式封装多个提供商
    根据配置自动选择 OpenAI、Anthropic 或 智谱 ZhiPu
    """

    def __init__(self):
        self.provider = settings.LLM_PROVIDER
        self.model = settings.LLM_MODEL

        if self.provider == "openai":
            self.client = openai.AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        elif self.provider == "anthropic":
            self.client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
        elif self.provider == "zhipu":
            # 智谱 GLM-4 API 兼容 OpenAI 接口
            self.client = openai.AsyncOpenAI(
                api_key=settings.ZHIPU_API_KEY,
                base_url="https://open.bigmodel.cn/api/paas/v4/",
            )

    async def chat(self, messages: List[Dict[str, str]]) -> str:
        """非流式对话"""
        if self.provider in ("openai", "zhipu"):
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
            )
            return response.choices[0].message.content or ""

        elif self.provider == "anthropic":
            # Anthropic API 的 system 消息格式不同
            system_msg = ""
            filtered = []
            for m in messages:
                if m["role"] == "system":
                    system_msg = m["content"]
                else:
                    filtered.append(m)

            response = await self.client.messages.create(
                model=self.model,
                max_tokens=2048,
                system=system_msg,
                messages=filtered,
            )
            return response.content[0].text

    async def stream_chat(self, messages: List[Dict[str, str]]) -> AsyncIterator[str]:
        """
        流式对话 - 逐字输出
        使用 Python 异步生成器，类比 Java 的 Flux<String>（响应式编程）
        """
        if self.provider in ("openai", "zhipu"):
            stream = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                stream=True,
            )
            async for chunk in stream:
                if chunk.choices and chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content

        elif self.provider == "anthropic":
            system_msg = ""
            filtered = []
            for m in messages:
                if m["role"] == "system":
                    system_msg = m["content"]
                else:
                    filtered.append(m)

            async with self.client.messages.stream(
                model=self.model,
                max_tokens=2048,
                system=system_msg,
                messages=filtered,
            ) as stream:
                async for text in stream.text_stream:
                    yield text
