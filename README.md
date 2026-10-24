<div align="center">

# 职导星图 · cpa-xingtu

**多智能体职业规划决策平台 · 前端交互层**

</br>
<em>Frontend of CPA-Agent (cpa-xingtu) — Multi-Agent Career Planning Platform</em>

[![License](https://img.shields.io/badge/License-AGPL--3.0-blue?style=flat-square&logo=gnu&logoColor=white)](https://github.com/WHaoxM/cpa-agent/blob/main/LICENSE)
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

> GitHub Pages 生产构建默认 **`VITE_API_MODE=http`** 并请求 `https://api.xingtulabs.top`；可用 Actions 仓库变量 `CPA_BACKEND_API_BASE_URL` 覆盖。离线演示需显式运行 `npm run dev:mock` 或设置 `VITE_API_MODE=mock`。
> 本地纯演示：`npm run dev:mock`；独立的宿主机后端联调前端：`npm run dev:backend`（仅监听 `127.0.0.1:5174`）。

统一任务侧栏目前为显式联调能力：在 HTTP 模式设置 `VITE_TASK_COMPANION=true`，并连接已迁移到 `0019_conversation_task_context`、运行对应 Celery worker 的后端。Agent 任务控制面板还要求运行 `0021_agent_run_task_contract_control` 迁移；该面板按 run 回读契约/计划版本、暂停/取消/恢复，且仅在保存回执与计划摘要一致时显示已保存成果。默认关闭，不自动迁移正常库或重启共享服务。原 AI 助手／专家与页面设计继续保留；开关不是完整业务验收通过的声明，实际范围见主仓 `docs/reports/2026-10-22-unified-task-orchestration-replay.md`。

## ⚡ 项目概述

本演示仓库展示 CPA-Agent 系统的**前端交互层**，覆盖学生端职业规划全链路与管理员端数据管理：

- 简历上传 → 能力画像 → 人岗匹配 → 职业报告 → 学习路径
- 三角色权限体系（学生 / 管理员 / 公共页面）
- D3.js + Three.js 数据可视化（雷达图、弦图、Treemap、3D 书架、力导向气泡图）

**数据说明**：Pages 生产构建默认请求 `https://api.xingtulabs.top`；配置 Actions 变量 `CPA_BACKEND_API_BASE_URL` 可覆盖后端 origin。离线 fixtures 仅在显式 Mock 模式使用。`npm run dev` 读取 `.env.development`，**默认是 HTTP 模式**；离线请用 `npm run dev:mock`。本机真实联调使用 `npm run dev:backend`，不要把 Mock 登录当成正式后端账号。

### 🎯 我们的愿景

让每一个"如果"都能看见结果——基于真实简历与岗位数据的个性化诊断，而非泛泛的职业鸡汤。

## 📸 界面预览

本仓未分发上述历史截图文件。运行 `npm run dev:mock` 或访问[在线 Mock 演示](https://whaoxm.github.io/cpa-xingtu/)查看当前页面；静态演示不代表后端业务结果。

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
| 技能提升 | `student/learning` | HTTP：真实课程目录、章节与外部材料、本人已学标记和重登恢复；播放器／测验／笔记不在本轮接入 |
| 职业分析 | `student/career-analysis` | 羊皮卷舆图风格的水墨散点气泡地图 + 职业洞察 |
| 岗位目录 | `student/job-catalog` | 从真实岗位目录搜索并查看资料；区分官方仅展示与管理员审核发布，明确招聘状态未知 |
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
| 岗位管理中心 | `admin/job-dataset` | 官方原文只展示、JSON 私有暂存与逐条预检发布、当前及撤回版本；真实 HTTP，不显示模拟成功 |
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
# 在 cpa-xingtu 仓库根目录，Node ^20.19.0 || >=22.12.0
npm ci

# 纯前端演示（无需后端）
npm run dev:mock
# → http://localhost:5173

# 类型检查
npm run type-check

# 生产构建（Pages 使用 https://api.xingtulabs.top；本地环境变量可以覆盖）
npm run build

# 预览构建产物
npm run preview
```

常规 `npm run dev` 走 `.env.development` 的 HTTP 配置，会请求本机 `127.0.0.1:5001`；没启动后端时出现接口错误是预期现象。不要复制 `.env.example` 到 `.env.local` 后误以为进入 Mock 模式。

职业分析默认保留原岗位舆图、气泡动效、地图卷轴和侧栏，从现有目录接口读取方向线索；没有可信市场数据时原图表区域明确未就绪，不用演示数字填充。主动进入“探索与实践”才承接“原页内讨论与比较 → 本人确认一周尝试 → 学习中心练习 → 复盘 → 本人决定 → 下一轮”，已有 `exploration_id` 仍可回访。基础探索需 `0016_career_exploration`，原页陪伴另需 `0018_exploration_analysis` 和 `cpa.agent` worker；不应整页挡住尚未升级环境里的原分析。不要为联调自动升级正常库。边界和实际回放从主仓 [`career-analysis.md`](../docs/frontend/cpa-xingtu/pages/career-analysis.md) 接续；Mock 和既有 `artifact_id` 阅读保持独立。

### 本地联调（可选）

先按主仓库说明启动 Docker MySQL/Neo4j/Redis，以及宿主机 `mkg` 后端。**职途导航的异步简历解析还必须单独启动 `cpa.pipeline` Celery worker**；只开 Flask 和前端会保存任务但不会解析，Beat 也不能代替 worker。后端须为 `CPA_DEMO_MODE=false`，配置随机、至少 32 字符的 `SECRET_KEY`；仅本机 HTTP 联调时设置 `CPA_AUTH_COOKIE_SECURE=false` 并绑定 `127.0.0.1`。完成账号 MySQL 迁移后，再启动**独立于默认 5173/mock 进程**的联调前端：

```powershell
Copy-Item .env.backend-dev.example .env.backend-dev
npm run dev:backend
# → http://127.0.0.1:5174
```

`backend-dev` 模式读取 `.env.backend-dev`：`VITE_API_MODE=http`、同源 `/api` 经 Vite 开发代理到 `127.0.0.1:5001`。代理不注入开发身份；页面通过 `/api/auth/csrf`、注册/登录、服务端 Cookie 与 `/api/auth/me` 使用平台账号。学生可在登录页注册新账号，管理员仅由后端可信 CLI 开户；HTTP 模式不会在认证失败时退回演示账号。新账号的 `acct_*` ID 不自动认领历史 `student_001` 资料，须自行导入和确认简历。生产 Pages 使用配置的 HTTPS API origin。

后端联调首页的完成标记只依据 owner 范围内的服务端画像与已完成报告；本地演示学习记录、简历缓存和计时器不充当业务完成证据。服务端画像与学生资料不一致时，首页显式提示状态异常，不显示“已完成”。

可复核代理与身份边界：`http://127.0.0.1:5174/health` 应为 200；未登录访问用户资料应为 401。注册/登录后 `/api/auth/me` 的 ID 应与注册所得相同；本人尚无资料可为 404，访问其他学生 ID 应为 403；退出后 `/api/auth/me` 应恢复 401。本机已用临时账号经 5174 代理和浏览器注册、刷新及退出复验，测试账号已清理。

已接入后端的联调点：

- `student/dashboard`: `GET /api/home/dashboard`、`POST /api/profile/student/confirmed-resume/roles`、`GET/POST /api/target-roles`、`POST /api/agent/career-suggestions`；首页只展示 owner 范围内的学习进度、有效画像与核验报告，并可将简历推断的职业方向保存为目标后生成建议
- `student/career-analysis`: `GET /api/career/landscape`
- `student/ai-assistant`: `POST /api/agent/chat`（http 模式走真实 Ask/Agent，保留服务端 Principal）
- `student/learning`: 普通 HTTP 课程区直接读 `/api/learning/courses`（标题 `keyword`、分类、分页与总数）、`/courses/<id>` 和 `/learning/progress/<本人ID>`；不合并 Mock 课程、评分、人数或推荐图。章节“标记本章已学／取消已学”经 `/api/learning/learning/progress` 以 `100/true` 或 `0/false` 保存，body 不发送用户身份，并读回才更新。安全 HTTP(S) 材料链接在新标签打开，不自动写进度／时长；无链接也允许本人记录，旧部分百分比不被改写。`?course_id=…` 刷新恢复同一课程；读取失败显示未知并可重试，不作假空状态。带 `artifact_id` 时仍优先通过 `GET /api/agent/artifacts/<artifact_id>` 读取原计划或显示错误，点击“退出计划，浏览全部课程”才进入课程区。
- `exams`（技能自评）：HTTP 使用 `/api/career/assessment/questionnaire` 读取版本化自述题目，以 `self_reflection` 模式提交到 `/api/career/assessment`，再从 `/assessment/<本人ID>` 读回；重登显示最近一次保存的完整问答。五档自述外可选“暂时无法判断”，不转换成零分；不展示演示岗位要求、竞争力排名或投递建议。题目/回答快照与 owner＋提交标识绑定，失败保留回答，响应不明先读回、主动重试保持同标识；未提交草稿离开不保存。需要后端 `0015_self_reflection` 迁移，不能把隔离浏览器验收当作共享库已升级。Mock 分支保留原演示，旧 `gap_only/skill_levels` 客户端兼容，本轮不改接 `pipeline/ext/exams`。
- `student/career-navigation`: 权威 `/api/profile/student/upload|confirm|pipeline` 与 `/api/pipeline/events/<task_id>`；页面到会话仅传经后端核验的 task 引用
- `student/career-report`: `POST /api/report/generate`
- `student/my-reports`: `GET /api/report/list`、`GET /api/report/{report_id}`
- `student/job-catalog`: `GET /api/profile/job/list`、`/search`、`/<id>`；HTTP 错误显示为不可用/部分结果，不回退至岗位 fixture。官方来源岗位明确标注仅供查看、不参与评分或匹配；所有岗位的招聘状态均保持未知。
- 岗位详情的“用我的简历对照这个岗位”先读取 `/api/profile/student/workbench`，再由学生确认执行 `/api/match/run` 并读回匹配与解释；有持久成果才允许明确请求 `/api/report/generate`。允许如实呈现部分成果及规则估计，不把缺资料或未知项显示为零分，不自动重试生成。`student/my-reports?report_id=…` 刷新和重登后仍重新读取服务端详情；来源失效时不保留旧正文或分数。当前收藏链接核对原发布版本，历史收藏不自动切换版本或开始匹配。
- 更新简历后仍从职途导航核对并确认，再从原收藏重新对照。匹配与解释响应读回后会再次检查当前来源，迟到的旧响应不能恢复旧分数；新画像未就绪时不借旧画像生成报告。更新后回访入口为主仓同一浏览器探针的 `--journey reassess`，流程与证据归用户旅程指南第二条，不是分数改善或模型质量承诺。
- `student/favorites`: `GET /api/saved-jobs` 读取本人具体岗位收藏；目录详情只提交 `{ publication_ref: { job_portrait_id, publication_version, content_sha256 } }` 到 `POST /api/saved-jobs`，服务端按登录 Principal 绑定当前不可变发布快照，不采信客户端岗位内容；按记录删除使用 `DELETE /api/saved-jobs/records/<saved_job_id>`。HTTP 页面将职业方向与具体岗位分开展示，不以 Mock 行情、薪资或匹配数据补齐；撤回/替代版本保留为历史资料，招聘状态仍未知。
- `admin/job-dataset`（页面标题“岗位管理中心”）: 通过真实登录、Cookie 与 CSRF 调用 `/api/admin/job-reviews`、`/api/admin/job-source-listings`、`/api/admin/dataset`、`/api/admin/dataset/upload`、`/api/admin/dataset/<id>/content`、`/api/admin/job-publications/preview`、`/api/admin/job-publications` 及撤回接口。岗位 JSON 文件仅支持 2 MiB 内 UTF-8 数组；上传后只暂存，逐条读回、预检并经管理员确认才发布。模型审查不等于人工批准，官方原文在发布时由服务端重新核验；缺字段、摘要变化或依赖不可用都不会显示发布成功。

上述岗位目录、心仪岗位和岗位管理中心在显式 Mock 模式下不会改用示例岗位或伪造写入结果，而会提示连接真实后端；其余未接入页面仍按既有演示模式使用 Mock 数据。要验收岗位来源到学生浏览/收藏回访及岗位对照报告的流程，请使用 `npm run dev:backend`，不能用 `npm run dev:mock` 或在线 Demo 代替。收藏版本绑定迁移为后端 Alembic `0013_saved_job_pub_binding`；本轮岗位对照未新增迁移。主仓 `backend/tests/manual/job_source_to_catalog_browser_probe.py --journey catalog|favorites|decision` 使用相同 `backend-dev` 模式，在隔离 schema 中运行真实登录和页面回访；命令前置条件、清理及最新证据统一由主仓用户旅程指南第二、六、七条维护。合成资料的页面回放不等于真实招聘来源或建议质量验收。

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

演示模式使用 Pinia + pinia-plugin-persistedstate 缓存部分本地状态；这不是服务端持久化证据。HTTP 模式以 owner 范围内的后端记录为准：

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
- **多模式 Agent** - Supervisor 为默认运行时；旧 LangGraph/ReAct 默认关闭
- **混合数据层** - MySQL · Neo4j · Redis · Milvus
- **知识图谱** - 技能/岗位/职业路径关系网络

主项目仓库与文档：[CPA-Agent 主仓库](https://github.com/WHaoxM/cpa-agent)

## 📜 开源协议

项目协议见主仓库的 [GNU Affero General Public License v3.0](https://github.com/WHaoxM/cpa-agent/blob/main/LICENSE)。当前前端独立仓库尚无本地 `LICENSE` 文件，分发前需确认前端仓库的授权文件与声明一致。

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
