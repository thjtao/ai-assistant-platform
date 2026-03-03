# AI Assistant Platform

全栈 AI 助手平台，支持多轮对话、RAG 知识库检索与多模型切换（OpenAI / Anthropic / 智谱），适合作为企业知识问答或智能客服底座。

---

## 功能特性

- **用户认证**：注册、登录、JWT 会话管理
- **智能对话**：多轮对话、流式输出、会话列表与历史记录
- **知识库 RAG**：创建知识库、上传文档（PDF/Word/TXT）、自动分块与向量化，对话时基于知识库检索回答
- **多模型支持**：可配置使用 OpenAI、Anthropic 或智谱 GLM，统一接口切换
- **向量存储**：基于 Qdrant 的向量检索，支持 Embedding（如智谱 embedding-3）

---

## 技术栈

| 层级     | 技术 |
|----------|------|
| 前端     | Next.js 14、React 18、TypeScript、Tailwind CSS、Zustand、Axios |
| 后端     | FastAPI、Python 3.x、SQLAlchemy 2（异步）、Pydantic |
| 数据库   | MySQL、Redis |
| 向量库   | Qdrant |
| AI/LLM   | LangChain、OpenAI / Anthropic / 智谱 API、RAG 检索 |

---

## 项目结构

```
ai-assistant-platform/
├── backend/                 # FastAPI 后端
│   ├── app/
│   │   ├── api/             # 路由：auth, chat, knowledge
│   │   ├── core/            # 配置、数据库、安全
│   │   ├── models/          # SQLAlchemy 模型
│   │   └── services/        # LLM、RAG 等业务逻辑
│   ├── requirements.txt
│   └── .env                 # 环境变量（见 .env.example）
├── frontend/                # Next.js 前端
│   ├── src/
│   │   ├── pages/           # 页面：登录、注册、对话、知识库
│   │   ├── store/           # Zustand 状态
│   │   └── utils/           # API 封装等
│   ├── package.json
│   └── .env.local           # 前端环境变量
├── docs/
│   └── screenshots/         # 界面截图
├── .env.example
└── README.md
```

---

## 界面预览

### 首页 / 登录入口

![首页](docs/screenshots/home.png)

### 对话页（多轮对话 + 知识库选择）

![对话页](docs/screenshots/chat.png)

### 知识库管理（创建知识库、上传文档）

![知识库](docs/screenshots/knowledge.png)


---

## 快速开始

### 环境要求

- Python 3.10+
- Node.js 18+
- MySQL 8+
- Redis
- Qdrant（可选 Docker：`docker run -p 6333:6333 qdrant/qdrant`）

### 1. 克隆项目

```bash
git clone https://github.com/thjtao/ai-assistant-platform.git
cd ai-assistant-platform
```

### 2. 后端

```bash
cd backend
cp ../.env.example .env
# 编辑 .env：数据库、Redis、Qdrant、LLM API Key（如智谱 ZHIPU_API_KEY）
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 3. 前端

```bash
cd frontend
cp .env.example .env.local
# 编辑 .env.local：NEXT_PUBLIC_API_URL=http://localhost:8000
npm install
npm run dev
```

浏览器访问：http://localhost:3000

### 4. 环境变量说明

关键配置见根目录 `.env.example`：

- **数据库**：`DB_HOST`、`DB_PORT`、`DB_USER`、`DB_PASSWORD`、`DB_NAME`
- **Redis**：`REDIS_URL`
- **Qdrant**：`QDRANT_URL`（默认 `http://localhost:6333`）
- **LLM**：`LLM_PROVIDER`（openai / anthropic / zhipu）、`LLM_MODEL`、对应 `*_API_KEY`
- **智谱 Embedding**：`EMBEDDING_MODEL=embedding-3`（知识库向量化）
- **JWT**：`SECRET_KEY`、`ACCESS_TOKEN_EXPIRE_MINUTES`

---

## API 概览

| 模块     | 前缀              | 说明 |
|----------|-------------------|------|
| 认证     | `/api/auth`       | 注册、登录、Token |
| 对话     | `/api/chat`       | 会话列表、创建会话、发送消息（流式）、历史消息 |
| 知识库   | `/api/knowledge`  | 知识库 CRUD、文档上传、解析、向量化 |

健康检查：`GET /health`

---

## 开发与部署

- **后端**：推荐使用虚拟环境；生产可用 `gunicorn + uvicorn workers`。
- **前端**：`npm run build` 后 `npm run start`；可配合 Nginx 反向代理。
- **数据库**：生产建议使用 Alembic 做迁移（项目内已接 SQLAlchemy，可自行添加 Alembic 配置）。

---

## 许可证

MIT
