# 部署与复现：GitHub Pages 演示 / 后端接入

## 在线演示

🌐 **https://whaoxm.github.io/cpa-xingtu/**

GitHub Pages 生产构建默认使用 **`VITE_API_MODE=http`**，并请求 `https://api.xingtulabs.top`。它只配置前端 API 地址，**不会部署 Flask、数据库、Redis、Neo4j 或 Celery**。只有登录成功且服务端具备相应数据的功能才会显示真实业务结果；目录为空或接口不可用时，页面应展示明确的空态/错误态。

如需改用其他生产后端，可用仓库变量 `CPA_BACKEND_API_BASE_URL` 覆盖默认 origin。演示数据仅由显式 `VITE_API_MODE=mock` 或 `npm run dev:mock` 启用。

| 角色 | 账号来源 |
|------|----------|
| 学生、管理员 | 由配置的后端账号服务管理；Mock 演示账号仅适用于显式 Mock 模式 |

登录页在离线演示模式显示「演示数据 · 无需后端」标记。

## ✅ 已配置

1. `vite.config.ts` — production `base: '/cpa-xingtu/'`
2. `.env.production` — `VITE_API_MODE=http`，默认 API origin 为 `https://api.xingtulabs.top`
3. `.github/workflows/deploy.yml` — 使用 `CPA_BACKEND_API_BASE_URL`，缺省时回退到上述生产 origin
4. `public/fixtures/` — 全站演示 JSON
5. `public/404.html` — SPA 刷新回跳；应恢复原路径、查询参数及锚点

## 启用 GitHub Pages

1. 在本仓库的 GitHub **Settings → Pages** 中打开 Pages 设置
2. **Source** 选 **GitHub Actions**
3. 推送 `main`，确认 `.github/workflows/deploy.yml` 的 build 和 deploy 均成功，再访问页面；Actions 绿灯不代替页面登录和深链接刷新检查

## 本地预览（纯 Mock）

```bash
# 在 cpa-xingtu 仓库根目录；Node ^20.19.0 || >=22.12.0
npm ci
npm run dev:mock          # 开发态，mode=demo
# 或构建后预览纯 Mock 演示
npm run preview:demo
```

不要用 `npm run dev` 验证离线演示：它读取 `.env.development`，默认 HTTP 模式。若本机存在 `.env.local`，它也可能覆盖模式。生产构建不会回退到浏览器 localhost；本地联调时仅 Vite 开发代理使用本机服务地址。

## 本机真实后端联调（不部署到 Pages）

```powershell
# 先按 CPA-Agent 主仓库 DEPLOY.md 完成数据库、迁移、Flask；
# 异步任务还需 cpa.pipeline worker 与 Beat
Copy-Item .env.backend-dev.example .env.backend-dev
npm run dev:backend
# http://127.0.0.1:5174
```

此模式使用正式账号的 CSRF、Cookie、注册/登录与 owner 范围数据；演示账号 `student001/admin001` 不适用。先检查 `http://127.0.0.1:5174/health`，再检查未登录受保护 API 为 401、登录后 `/api/auth/me` 为本人 ID。真实任务须查看后端最终状态，不以页面动画或 HTTP 200 代替。尚未接线的页面可能仍展示 Mock；详见 [README.md](README.md)。

## Pages 接入独立后端

1. 先把 CPA-Agent 后端部署到可公开访问的 HTTPS 地址，并验证 `/health`、账号登录和首页所需 API。
2. 在 GitHub 仓库 **Settings → Secrets and variables → Actions → Variables** 新增 `CPA_BACKEND_API_BASE_URL`，值为后端 origin（例如 `https://api.example.com`，不要带账号、密码或访问令牌）。下一次 Pages 构建会向该 HTTPS origin 发请求；删除该变量会恢复默认的 `https://api.xingtulabs.top`。
3. 后端必须只允许实际前端 origin，并正确配置带凭据 CORS、CSRF、HTTPS 与安全 Cookie。当前默认 session cookie 为 `SameSite=Lax`；如果前后端不属于同一站点，浏览器的跨站 Cookie 策略会阻止登录态，单改前端 API 地址不能解决。生产环境优先使用同站点自定义域名/API 反向代理，并完成真实浏览器登录、刷新和 owner 隔离验收。
4. 这只切换前端构建模式，不代表后端已部署、数据库已迁移或异步 worker 已运行。后端部署与数据迁移须另行按 CPA-Agent 主仓库运行手册完成。

## 注意事项

- Mock 模式下写操作（收藏、进度、消息已读）不落库，刷新后恢复 fixture
- 若部署切换期间已打开的旧页面请求到已移除的哈希 JS chunk，客户端会使用一次性查询参数刷新页面以获取新版本，并在成功后清除参数；最多自动重试一次，避免循环刷新。若重试仍失败，再手动刷新并检查本次 Pages 发布状态。
- 直接打开或刷新 `/cpa-xingtu/app/...` 时，Pages 先返回 `404.html`，再跳回入口并在 Vue Router 启动前恢复原路径、查询参数与锚点；不应落回首页
- 详细 fixture 说明见 `public/fixtures/README.md`
- 静态 Pages 无法承载 Flask、MySQL、Redis、Neo4j 或 Celery；需要真实服务时单独部署后端并完成安全、数据和任务验收
