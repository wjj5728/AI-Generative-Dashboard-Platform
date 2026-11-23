# 免费部署指南（Vercel / Render / Koyeb）

本项目已内置 **Vercel Serverless** 与 **单进程全栈托管（Render / Koyeb / Railway / Docker）** 两套开箱即用的生产部署支持。

---

## 方案一：一键免费部署到 Vercel（推荐）

项目根目录已配置好 [`vercel.json`](../vercel.json) 与 [`api/index.ts`](../api/index.ts)：
- 前端静态资源（`apps/web/dist`）由 Vercel 全球 CDN 托管，并配置好 SPA 路由回退。
- 后端 `/api/*`（含 `/api/dashboards/generate-stream` SSE 流式推送）由 `api/index.ts` Serverless Function 处理。
- **零外部数据库配置即可运行**：在 Vercel 环境下，服务端会自动将 SQLite 指向可写目录 `file:/tmp/ai-dashboard.db`，并在冷启动时通过 `ensureDatabaseReady()` 自动建表并导入 2 个预置 Seed 看板（耗时 < 10ms）。

### 部署步骤（网页端 GitHub 导入）

1. 将本项目代码推送到你的 GitHub 仓库。
2. 登录 [Vercel](https://vercel.com/) → **Add New... → Project** → 选择该 GitHub 仓库。
3. **Framework Preset** 保持 `Other`（Vercel 会自动读取根目录 `vercel.json` 中的 `installCommand`、`buildCommand` 与 `outputDirectory`）。
4. （可选）展开 **Environment Variables**：
   - 默认无需配置任何环境变量即可使用 `AI_PROVIDER=mock` 免费运行全部功能。
   - 如需接入真实大模型，可添加：`AI_PROVIDER=openai`、`OPENAI_API_KEY`、`OPENAI_BASE_URL`、`OPENAI_MODEL`。
5. 点击 **Deploy**，约 1 分钟即可获得公开 HTTPS 域名。

### 部署步骤（命令行 Vercel CLI）

```bash
npx vercel
# 生产发布：
npx vercel --prod
```

> **关于 Vercel 上 SQLite 持久化的说明**：
> - 默认 `file:/tmp/ai-dashboard.db` 在同一个 Serverless 实例存活期内（通常连续访问的数分钟到十几分钟）可正常新建、拖拽、AI 编辑与保存新版本；当实例长时间闲置冷重启后会恢复为初始 Seed 看板，非常适合作为公开在线 Demo。
> - 如果需要**永久保留用户创建的看板**，可在 Vercel Storage 中一键添加免费的 **Neon Postgres** 或 **Supabase**，将 `prisma/schema.prisma` 中的 `provider = "sqlite"` 改为 `"postgresql"`（并相应调整 `bootstrap.ts` 或在构建时执行 `prisma db push`）。

---

## 方案二：免费部署到 Render / Koyeb / Railway（常驻单进程）

[`apps/server/src/app.ts`](../apps/server/src/app.ts) 在非 Vercel 环境下会自动检测并托管 `apps/web/dist` 静态文件与 SPA 路由，因此只需启动单个 Node 进程即可同时提供前端页面与后端 API。

### Render Web Service（Free Tier）配置

1. 登录 [Render](https://render.com/) → **New → Web Service** → 连接你的 GitHub 仓库。
2. 填写构建与启动命令：
   - **Build Command**：`pnpm install && pnpm db:generate && pnpm build`
   - **Start Command**：`pnpm start`
3. 环境变量（可选）：
   - `NODE_ENV=production`
   - `AI_PROVIDER=mock`（或配置 `OPENAI_API_KEY`）
4. 点击 **Create Web Service**，服务启动后也会在首次启动时自动建表并导入 Seed 看板。

### 本地模拟单进程生产环境

```bash
pnpm build
NODE_ENV=production PORT=3001 pnpm start
# 浏览器直接访问 http://localhost:3001 即可同时访问前端页面与 /api 接口
```
