# sub-cadam

一个独立的最小参数化 CAD 项目，流程只有一条主链路：

`输入文案 -> Node 后端 -> OpenRouter -> OpenSCAD 代码 -> 浏览器 worker -> 3D 预览`

这个项目不包含登录、额度、Supabase 等能力，只保留参数化生成和预览。

## 目录

- `backend/` Node.js 接口与静态资源服务
- `frontend/` Vue 3 + Vite 前端

## 配置

1. 在 `sub-cadam` 目录下复制 `.env.example` 为 `.env`
2. 填好下面两个值：

- `QIANWEN_API_KEY`
- `QIANWEN_MODEL`

## 本地开发

先安装依赖：

```bash
npm install
```

然后分别启动后端和前端：

```bash
npm run dev:backend
npm run dev:frontend
```

前端默认地址是 `http://localhost:5174`，后端默认地址是 `http://localhost:3001`。

## 生产构建

```bash
npm run build
npm run start
```

构建后的前端会输出到 `backend/public`，Node 服务会直接托管静态页面和 `/api/generate`。

