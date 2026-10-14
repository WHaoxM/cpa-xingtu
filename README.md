<div align="center">

# 职导星图 · cpa-xingtu

**多智能体职业规划决策平台 · 前端交互层**

</br>
<em>Frontend of CPA-Agent (cpa-xingtu) — Multi-Agent Career Planning Platform</em>

[![License](https://img.shields.io/badge/License-AGPL--3.0-blue?style=flat-square&logo=gnu&logoColor=white)](./LICENSE)
[![GitHub Stars](https://img.shields.io/github/stars/WHaoxM/cpa-xingtu?style=flat-square&color=DAA520)](https://github.com/WHaoxM/cpa-xingtu/stargazers)
[![GitHub Forks](https://img.shields.io/github/forks/WHaoxM/cpa-xingtu?style=flat-square)](https://github.com/WHaoxM/cpa-xingtu/network)
[![Vue](https://img.shields.io/badge/Vue-3.5-42b883?style=flat-square&logo=vue.js&logoColor=white)](https://vuejs.org/)
[![Vite](https://img.shields.io/badge/Vite-7-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

[![Live Demo](https://img.shields.io/badge/Live%20Demo-GitHub%20Pages-6E40C9?style=flat-square&logo=github&logoColor=white)](https://whaoxm.github.io/cpa-xingtu/)

[中文](./README.md) | [English](./README.en.md)

</div>

> 本仓库 **cpa-xingtu** 是 [CPA-Agent](https://github.com/WHaoxM/cpa-agent) 的**前端子仓库**（原 `cpa-agent-demo`），包含前端代码与 Mock 数据，用于在线展示与本地联调。  
> 完整项目（含 Flask 后端、知识图谱、多智能体、L0–L4 管线）请访问主仓库。

## 🌐 在线演示

👉 **[https://whaoxm.github.io/cpa-xingtu/](https://whaoxm.github.io/cpa-xingtu/)**

## 🔑 演示账号

| 角色 | 用户名 | 密码 |
|------|--------|------|
| 学生 | student001 | 123456 |
| 管理员 | admin001 | 123456 |

> GitHub Pages / `npm run build` 默认 **`VITE_API_MODE=mock`**，登录页会显示「演示数据 · 无需后端」，所有接口走 `public/fixtures/`，不连接后端。  
> 本地纯演示：`npm run dev:mock`；独立的宿主机后端联调前端：`npm run dev:backend`（仅监听 `127.0.0.1:5174`）。

## ⚡ 项目概述

本演示仓库展示 CPA-Agent 系统的**前端交互层**，覆盖学生端职业规划全链路与管理员端数据管理：

- 简历上传 → 能力画像 → 人岗匹配 → 职业报告 → 学习路径
- 三角色权限体系（学生 / 管理员 / 公共页面）
- D3.js + Three.js 数据可视化（雷达图、弦图、Treemap、3D 书架、力导向气泡图）

**数据说明**：生产构建与 Pages 部署使用 Mock（`public/fixtures` + `src/mock`），可独立运行，无需后端。  
本地联调时设置 `VITE_API_MODE=http`，并通过 Vite proxy / `VITE_API_BASE_URL` 连接 CPA-Agent 后端。

### 🎯 我们的愿景

让每一个"如果"都能看见结果——基于真实简历与岗位数据的个性化诊断，而非泛泛的职业鸡汤。

## 📸 系统截图

<div align="center">
<table>
<tr>
<td><img src="./docs/screenshots/career-analysis.png" alt="职业分析" width="100%"/></td>
<td><img src="./docs/screenshots/career-ability.png" alt="能力图谱" width="100%"/></td>
</tr>
<tr>
<td><img src="./docs/screenshots/career-report.png" alt="职业报告" width="100%"/></td>
<td><img src="./docs/screenshots/talent-portrait.png" alt="人才画像" width="100%"/></td>
</tr>
</table>
</div>

> 截图以实际在线 Demo 为准。

## 🛠️ 技术栈

- **Vue 3** (v3.5) - Composition API + `<script setup>`
- **TypeScript** (v5.9) - 类型安全
- **Vite** (v7) - 构建工具
- **Element Plus** - Vue 3 组件库
- **Vue Router** (v5) - 路由管理
- **Pinia** (v3) + pinia-plugin-persistedstate - 状态管理与持久化
- **D3.js** (v7) - 数据可视化（雷达图、弦图、Treemap）
- **ECharts** (v5) + vue-echarts - 图表与地图
- **GSAP** (v3) - 动画引擎（ScrollTrigger / TextPlugin / MotionPath）
- **Three.js** - 3D 场景渲染
- **Tiptap** - 富文本编辑器
- **Iconify** + Element Plus Icons - 图标体系

## 🔄 功能模块

### 学生端核心模块

| 模块 | 路由 | 说明 |
|------|------|------|
| 技能提升 | `student/learning` | 课程学习中心，视频播放、章节测验、笔记 |
| 职业分析 | `student/career-analysis` | 羊皮卷舆图风格的水墨散点气泡地图 + 职业洞察 |
| 职途导航 | `student/career-navigation` | 简历导入与人岗匹配 |
| 职业能力图谱 | `student/career-ability` | Shell 容器 + 图谱/双栏/工作台三视图切换 |
| 课程体系 | `student/course-system` | 5 大领域 × 15 细分职业的分层网络关系图 |
| 心仪岗位 | `student/favorites` | 收藏的目标岗位、薪资筛选与人岗匹配入口 |
| 个人能力画像 | `student/career-portrait` | Agent 驱动的多维能力雷达 + 分阶段报告 |
| 职业生涯报告 | `student/career-report` | D3 力导向气泡图 + 七维评估 + 成长计划 |
| 快速制作简历 | `student/resume-builder` | 仿 magicv.art 三栏简历编辑器 |
| 我的报告 | `student/my-reports` | 书架式报告管理与查看 |
| AI 助手 | `student/ai-assistant` | 学习问答台，预设回复 |
| 技能自评 | `exams` | 按职业方向/细分赛道的技能评估 |

### 管理员端模块

| 模块 | 路由 | 说明 |
|------|------|------|
| 岗位数据集 | `admin/job-dataset` | 岗位数据的增删改查管理 |
| 知识库维护 | `admin/knowledge-base` | 本地知识库内容管理 |

### 数据可视化组件（D3.js）

| 组件 | 说明 |
|------|------|
| `D3RadarChart` | 多边形雷达图，双系列对比（个人能力 vs 岗位要求） |
| `D3ChordDiagram` | 技能亲和力弦图，渐变 Ribbon + 外弧刻度 |
| `D3Treemap` | 课程结构 Treemap 图 |

## 🚀 快速开始

### 在线体验（推荐）

直接访问 [在线 Demo](https://whaoxm.github.io/cpa-xingtu/)，使用演示账号登录。

### 本地运行

```bash
# 安装依赖
npm install

# 启动开发服务器（自动打开浏览器）
npm run dev
# → http://localhost:5173

# 类型检查
npm run type-check

# 生产构建
npm run build

# 预览构建产物
npm run preview
```

**Node 版本要求**：`^20.19.0 || >=22.12.0`

### 本地联调（可选）

先按主仓库说明启动 Docker MySQL/Neo4j/Redis，以及宿主机 `mkg` 后端。后端须为 `CPA_DEMO_MODE=false`，配置随机、至少 32 字符的 `SECRET_KEY`；仅本机 HTTP 联调时设置 `CPA_AUTH_COOKIE_SECURE=false` 并绑定 `127.0.0.1`。完成账号 MySQL 迁移后，再启动**独立于默认 5173/mock 进程**的联调前端：

```powershell
Copy-Item .env.backend-dev.example .env.backend-dev
npm run dev:backend
# → http://127.0.0.1:5174
```

`backend-dev` 模式读取 `.env.backend-dev`：`VITE_API_MODE=http`、同源 `/api` 经 Vite 代理到 `127.0.0.1:5001`。代理不注入开发身份；页面通过 `/api/auth/csrf`、注册/登录、服务端 Cookie 与 `/api/auth/me` 使用平台账号。学生可在登录页注册新账号，管理员仅由后端可信 CLI 开户；HTTP 模式不会在认证失败时退回演示账号。新账号的 `acct_*` ID 不自动认领历史 `student_001` 资料，须自行导入和确认简历。公开 Pages 仍使用纯 Mock 登录。

后端联调首页的完成标记只依据 owner 范围内的服务端画像与已完成报告；本地演示学习记录、简历缓存和计时器不充当业务完成证据。服务端画像与学生资料不一致时，首页显式提示状态异常，不显示“已完成”。

可复核代理与身份边界：`http://127.0.0.1:5174/health` 应为 200；未登录访问用户资料应为 401。注册/登录后 `/api/auth/me` 的 ID 应与注册所得相同；本人尚无资料可为 404，访问其他学生 ID 应为 403；退出后 `/api/auth/me` 应恢复 401。本机已用临时账号经 5174 代理和浏览器注册、刷新及退出复验，测试账号已清理。

已接入后端的联调点：

- `student/career-analysis`: `GET /api/career/landscape`
- `student/ai-assistant`: `POST /api/agent/chat`（http 模式走真实 Ask/Agent，保留服务端 Principal）
- `student/learning`: 对话中已保存的 `action_plan` 通过 `GET /api/agent/artifacts/<artifact_id>` 读取同 owner 的完整计划正文；HTTP 模式不伪造未落库的步骤勾选进度
- `student/career-navigation`: 权威 `/api/profile/student/upload|confirm|pipeline` 与 `/api/pipeline/events/<task_id>`；页面到会话仅传经后端核验的 task 引用
- `student/career-report`: `POST /api/report/generate`
- `student/my-reports`: `GET /api/report/list`、`GET /api/report/{report_id}`

未接入后端的页面保留 Mock 数据作为降级展示。

## 📁 项目结构

```
src/
├── api/                  # API 接口层（联调时接后端）
├── assets/               # 静态资源
│   ├── styles/           # CSS 样式 (base / theme / main)
│   ├── images/           # 图片资源
│   └── data/             # 大型数据文件（地理 JSON 等）
├── components/
│   ├── charts/           # D3.js 图表组件
│   ├── book/             # 古籍风格 UI 组件
│   ├── bookshelf/        # 书架 3D 场景与展开浮层
│   ├── career/           # 职业模块子组件
│   ├── UserInfoBar.vue
│   └── TiptapEditor.vue
├── composables/          # Vue Composition API 可复用逻辑
├── constants/            # 图标常量集合
├── layouts/              # 应用主框架
├── mock/                 # 演示数据（开箱即用）
├── plugins/              # GSAP 插件注册
├── router/               # 路由守卫与路由定义
├── stores/               # Pinia setup store
├── types/                # 领域类型定义
├── utils/                # 工具函数
├── views/
│   ├── student/          # 学生端页面
│   ├── admin/            # 管理员端页面
│   ├── course/           # 公共课程页
│   ├── HomeCenter.vue    # 首页
│   ├── LoginView.vue     # 登录页
│   └── NotFoundView.vue  # 404
└── main.ts
```

## 🚢 部署

本仓库通过 GitHub Actions 自动部署至 GitHub Pages，配置见 [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)。

- **base 路径**：`/cpa-xingtu/`（见 `vite.config.ts`）
- **SPA 路由**：`public/404.html` 处理 GitHub Pages 刷新重定向
- **触发条件**：推送至 `main` 分支自动部署

详细部署说明见 [DEPLOY.md](DEPLOY.md)。

## 🔐 角色权限说明

系统通过路由守卫实现角色权限控制：

- 未登录用户只能访问登录页 `/login`
- 登录后默认进入 `/app/dashboard`
- 学生可访问 `student/*` 及公共路由
- 管理员可访问 `admin/*` 及公共路由
- 越权访问自动重定向到首页

## 💾 数据存储

使用 Pinia + pinia-plugin-persistedstate 实现数据持久化：

- 用户登录状态存储在 localStorage
- 学习进度自动同步
- 简历与技能解析结果持久化
- 报告记录持久化

## 🎨 D3.js 图表封装原则

1. **响应式**：通过 `useResizeObserver` 监听容器大小变化自动重绘
2. **数据驱动**：通过 props 传入数据，watch 监听变化自动更新
3. **交互性**：支持 hover 提示、过渡动画
4. **类型安全**：完整的 TypeScript 类型定义
5. **生命周期管理**：`onBeforeUnmount` 时自动 dispose，防止内存泄漏

## 📄 关于 CPA-Agent 主项目

本演示仓库是 CPA-Agent（职导星图）的前端展示层。完整项目包含：

- **Flask 后端** - API、服务层、Agent 引擎
- **L0–L4 管线** - 简历解析 → 图谱构建 → 四维画像 → 人岗匹配 → 报告生成
- **双引擎 Agent** - LangGraph（主） + ReAct（备）+ 12 工具
- **混合数据层** - MySQL · Neo4j · Redis · Milvus
- **知识图谱** - 技能/岗位/职业路径关系网络

主项目仓库与文档：[CPA-Agent 主仓库](https://github.com/WHaoxM/cpa-agent)

## 📜 开源协议

本项目基于 [GNU Affero General Public License v3.0](./LICENSE) 开源。

## 📈 Star History

<a href="https://www.star-history.com/#WHaoxM/cpa-xingtu&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=WHaoxM/cpa-xingtu&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=WHaoxM/cpa-xingtu&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=WHaoxM/cpa-xingtu&type=Date" />
 </picture>
</a>

---

<div align="center">

**职导星图** · 由四川轻化工大学团队维护

</div>
