# 🚀 部署指南 - GitHub Pages

## 在线演示

🌐 **https://whaoxm.github.io/cpa-xingtu/**

演示站默认 **`VITE_API_MODE=mock`**：只读 `public/fixtures/`，**不请求后端**。

| 角色 | 用户名 | 密码 |
|------|--------|------|
| 学生 | `student001` | `123456` |
| 管理员 | `admin001` | `123456` |

登录页会显示「演示数据 · 无需后端」标记。

## ✅ 已配置

1. `vite.config.ts` — production `base: '/cpa-xingtu/'`
2. `.env.production` — `VITE_API_MODE=mock`
3. `.github/workflows/deploy.yml` — Build 步骤强制 `VITE_API_MODE=mock`
4. `public/fixtures/` — 全站演示 JSON
5. `public/404.html` — SPA 刷新兜底

## 启用 GitHub Pages

1. 打开 https://github.com/WHaoxM/cpa-xingtu/settings/pages
2. **Source** 选 **GitHub Actions**
3. 推送 `main` 后等待 Actions 完成：https://github.com/WHaoxM/cpa-xingtu/actions

## 本地预览（纯 Mock）

```bash
cd cpa-xingtu
npm ci
npm run dev:mock          # 开发态，mode=demo
# 或构建后预览（与 Pages 同为 production + mock）
npm run preview:demo
```

联调真实后端：

```bash
# .env.local
VITE_API_MODE=http
VITE_API_PROXY_TARGET=http://127.0.0.1:5001
npm run dev
```

## 注意事项

- Mock 模式下写操作（收藏、进度、消息已读）不落库，刷新后恢复 fixture
- 页面刷新若短暂 404：属 SPA 路由问题，回到首页或依赖 `404.html` 回跳
- 详细 fixture 说明见 `public/fixtures/README.md`
