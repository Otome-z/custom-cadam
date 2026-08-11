# sub-cadam

一个独立的最小参数化 CAD 项目，流程只有一条主链路：

`输入文案/图片 -> Node 后端 -> Gemini API -> OpenSCAD 代码 -> 浏览器 worker -> 3D 预览`

这个项目不包含登录、额度、Supabase 等能力，只保留参数化生成和预览。

## 目录

- `backend/` Node.js 接口与静态资源服务
- `frontend/` Vue 3 + Vite 前端

## 配置

1. 在 `sub-cadam` 目录下复制 `.env.example` 为 `.env`
2. 填好下面两个值（推荐使用 `gemini-1.5-pro` 或 `gemini-1.5-flash`）：

- `GEMINI_API_KEY`
- `GEMINI_MODEL`

默认的 `OPENSCAD_PROVIDER=gemini` 会继续使用原 Google Gemini 请求方式。

如需切换到 lk888.ai 提供的 Gemini 3.1 Pro 兼容接口，请配置：

```dotenv
OPENSCAD_PROVIDER=lk-gemini
LK_GEMINI_API_KEY=your_lk888_api_key
LK_GEMINI_MODEL=gemini-3.1-pro-preview
LK_GEMINI_BASE_URL=https://api.lk888.ai
```

也可以用 `LK_GEMINI_URL` 覆盖完整的 `generateContent` 地址。

前端调用 `/api/generate` 时使用原生 Gemini `contents` 参数结构：

```json
{
  "contents": [{
    "role": "user",
    "parts": [
      { "text": "根据图片生成 OpenSCAD" },
      {
        "inlineData": {
          "mimeType": "image/png",
          "data": "<base64-encoded-image>"
        }
      }
    ]
  }]
}
```

旧的 `prompt` / `image` 请求体仍兼容。lk888 Gemini 请求会绕过
`HTTP_PROXY` / `HTTPS_PROXY` 直连，其他外部请求仍沿用原代理配置。

**注意：** 如果你所在的网络环境无法直接访问 `generativelanguage.googleapis.com`（出现 ConnectTimeoutError），请在 `.env` 中配置代理：
- 如果你有本地代理客户端（如 Clash / V2Ray），请配置 `HTTPS_PROXY=http://127.0.0.1:7890`（端口号请根据实际情况修改）。
- 如果你使用的是 API 代理转发商，请直接在 `.env` 中配置完整的 `GEMINI_URL`，例如 `GEMINI_URL=https://your-proxy-domain.com/v1beta/models/gemini-1.5-pro:generateContent?key=xxx`。

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

