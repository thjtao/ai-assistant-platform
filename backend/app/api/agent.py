"""
Agent 模块 - 工具调用 + 自主推理
使用 LangChain ReAct Agent 实现工具调用
"""
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List
import json

from langchain_openai import ChatOpenAI
from langchain.agents import create_react_agent, AgentExecutor
from langchain.tools import Tool
from langchain_community.tools import DuckDuckGoSearchRun
from langchain.prompts import PromptTemplate

from app.core.config import settings
from app.models.models import User
from app.api.auth import get_current_user

router = APIRouter()


class AgentRequest(BaseModel):
    query: str
    tools: List[str] = ["search", "calculator"]  # 选择要使用的工具


# ===== 工具定义 - 类比 Spring 的 @Bean =====
def get_search_tool():
    search = DuckDuckGoSearchRun()
    return Tool(
        name="web_search",
        description="搜索互联网获取最新信息。当需要查询实时数据、新闻、或不确定的事实时使用。",
        func=search.run,
    )


def get_calculator_tool():
    def calculate(expression: str) -> str:
        try:
            # 安全计算（仅支持数学表达式）
            allowed = set("0123456789+-*/().,% ")
            if all(c in allowed for c in expression):
                result = eval(expression)
                return str(result)
            return "不支持的计算表达式"
        except Exception as e:
            return f"计算错误: {e}"

    return Tool(
        name="calculator",
        description="执行数学计算。输入数学表达式，返回计算结果。例如: 123 * 456",
        func=calculate,
    )


def get_datetime_tool():
    from datetime import datetime

    def get_datetime(_: str) -> str:
        now = datetime.now()
        return f"当前时间: {now.strftime('%Y年%m月%d日 %H:%M:%S')}"

    return Tool(
        name="get_datetime",
        description="获取当前日期和时间。当用户询问当前时间时使用。",
        func=get_datetime,
    )


AVAILABLE_TOOLS = {
    "search": get_search_tool,
    "calculator": get_calculator_tool,
    "datetime": get_datetime_tool,
}

# ReAct Prompt 模板
REACT_PROMPT = PromptTemplate.from_template("""你是一个智能助手，能够使用工具来回答问题。

可用工具:
{tools}

工具名称列表: {tool_names}

请按照以下格式思考和行动:
Question: 需要回答的问题
Thought: 我需要先思考如何解决这个问题
Action: 要使用的工具名称（必须是工具名称列表中的一个）
Action Input: 工具的输入
Observation: 工具返回的结果
... (可以多次使用工具)
Thought: 我现在知道答案了
Final Answer: 最终回答（用中文）

开始!

Question: {input}
Thought: {agent_scratchpad}""")


@router.post("/run")
async def run_agent(
    request: AgentRequest,
    current_user: User = Depends(get_current_user),
):
    """
    运行 Agent - 自主选择工具解决问题
    使用 SSE 流式推送思考过程
    """
    # 构建工具列表
    tools = []
    for tool_name in request.tools:
        if tool_name in AVAILABLE_TOOLS:
            tools.append(AVAILABLE_TOOLS[tool_name]())

    llm = ChatOpenAI(
        model=settings.LLM_MODEL,
        openai_api_key=settings.OPENAI_API_KEY,
        temperature=0,
        streaming=True,
    )

    async def agent_stream():
        steps = []
        try:
            # 发送开始信号
            yield f"data: {json.dumps({'type': 'start', 'query': request.query})}\n\n"

            agent = create_react_agent(llm, tools, REACT_PROMPT)
            executor = AgentExecutor(
                agent=agent,
                tools=tools,
                verbose=True,
                max_iterations=5,
                return_intermediate_steps=True,
            )

            # 同步执行（LangChain 的 ReAct Agent 暂不完全支持异步）
            import asyncio
            result = await asyncio.to_thread(
                executor.invoke,
                {"input": request.query}
            )

            # 推送中间步骤（思考链）
            for action, observation in result.get("intermediate_steps", []):
                step = {
                    "type": "step",
                    "tool": action.tool,
                    "tool_input": str(action.tool_input),
                    "observation": str(observation)[:500],  # 截断过长输出
                }
                yield f"data: {json.dumps(step, ensure_ascii=False)}\n\n"

            # 推送最终答案
            yield f"data: {json.dumps({'type': 'answer', 'content': result['output']}, ensure_ascii=False)}\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(
        agent_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/tools")
async def list_tools(current_user: User = Depends(get_current_user)):
    """获取可用工具列表"""
    return {
        "tools": [
            {"name": "search", "description": "网络搜索"},
            {"name": "calculator", "description": "数学计算"},
            {"name": "datetime", "description": "获取当前时间"},
        ]
    }
