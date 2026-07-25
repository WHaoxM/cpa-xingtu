<div align="center">

# Career Star Map · cpa-xingtu

**Frontend of CPA-Agent (cpa-xingtu) — Multi-Agent Career Planning Platform**

</br>
<em>多智能体职业规划决策平台 · 前端交互层</em>

[![License](https://img.shields.io/badge/License-AGPL--3.0-blue?style=flat-square&logo=gnu&logoColor=white)](./LICENSE)
[![GitHub Stars](https://img.shields.io/github/stars/WHaoxM/cpa-xingtu?style=flat-square&color=DAA520)](https://github.com/WHaoxM/cpa-xingtu/stargazers)
[![GitHub Forks](https://img.shields.io/github/forks/WHaoxM/cpa-xingtu?style=flat-square)](https://github.com/WHaoxM/cpa-xingtu/network)
[![Vue](https://img.shields.io/badge/Vue-3.5-42b883?style=flat-square&logo=vue.js&logoColor=white)](https://vuejs.org/)
[![Vite](https://img.shields.io/badge/Vite-7-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

[![Live Demo](https://img.shields.io/badge/Live%20Demo-GitHub%20Pages-6E40C9?style=flat-square&logo=github&logoColor=white)](https://whaoxm.github.io/cpa-xingtu/)

[English](./README.en.md) | [中文](./README.md)

</div>

> This repository **cpa-xingtu** is the **frontend sub-repository** of [CPA-Agent](https://github.com/WHaoxM/cpa-agent) (formerly `cpa-agent-demo`), containing frontend code and Mock data for online demos and local integration.  
> For the complete project (Flask backend, knowledge graph, multi-agent, L0–L4 pipeline), please visit the main repository.

## 🌐 Live Demo

👉 **[https://whaoxm.github.io/cpa-xingtu/](https://whaoxm.github.io/cpa-xingtu/)**

## 🔑 Demo Accounts

| Role | Username | Password |
|------|----------|----------|
| Student | student001 | 123456 |
| Admin | admin001 | 123456 |

> GitHub Pages / production builds default to **`VITE_API_MODE=mock`** (fixtures only, no backend).  
> Local mock preview: `npm run dev:mock`. Backend integration: set `VITE_API_MODE=http` in `.env.local`.

## ⚡ Overview

This demo repository showcases the **frontend interactive layer** of the CPA-Agent system, covering the full student-side career planning workflow and admin-side data management:

- Resume Upload → Capability Portrait → Job Matching → Career Report → Learning Path
- Three-role permission system (Student / Admin / Public pages)
- D3.js + Three.js data visualization (radar charts, chord diagrams, treemaps, 3D bookshelves, force-directed bubble charts)

**Data Note**: All pages use Mock data by default and can run independently without backend dependencies.  
For local integration, connect to the CPA-Agent backend via `VITE_API_BASE_URL`.

### 🎯 Our Vision

Let every "what if" see its outcome — personalized diagnosis based on real resumes and job data, not generic career advice.

## 🛠️ Tech Stack

- **Vue 3** (v3.5) - Composition API + `<script setup>`
- **TypeScript** (v5.9) - Type safety
- **Vite** (v7) - Build tool
- **Element Plus** - Vue 3 component library
- **Vue Router** (v5) - Route management
- **Pinia** (v3) + pinia-plugin-persistedstate - State management and persistence
- **D3.js** (v7) - Data visualization (radar charts, chord diagrams, treemaps)
- **ECharts** (v5) + vue-echarts - Charts and maps
- **GSAP** (v3) - Animation engine (ScrollTrigger / TextPlugin / MotionPath)
- **Three.js** - 3D scene rendering
- **Tiptap** - Rich text editor
- **Iconify** + Element Plus Icons - Icon system

## 🔄 Feature Modules

### Student-Side Core Modules

| Module | Route | Description |
|--------|-------|-------------|
| Skill Enhancement | `student/learning` | Course learning center, video playback, chapter quizzes, notes |
| Career Analysis | `student/career-analysis` | Parchment map style ink-wash scatter bubble map + career insights |
| Career Navigation | `student/career-navigation` | Resume import and job matching |
| Career Ability Graph | `student/career-ability` | Shell container + graph/dual-column/workspace tri-view switching |
| Course System | `student/course-system` | 5 domains × 15 sub-careers hierarchical network graph |
| Favorite Jobs | `student/favorites` | Saved target jobs, salary filtering, job matching entry |
| Personal Capability Portrait | `student/career-portrait` | Agent-driven multi-dimensional capability radar + staged reports |
| Career Report | `student/career-report` | D3 force-directed bubble chart + seven-dimensional assessment + growth plan |
| Resume Builder | `student/resume-builder` | magicv.art-style three-column resume editor |
| My Reports | `student/my-reports` | Bookshelf-style report management and viewing |
| AI Assistant | `student/ai-assistant` | Learning Q&A desk with preset replies |
| Skill Self-Assessment | `exams` | Skill assessment by career direction/sub-track |

### Admin-Side Modules

| Module | Route | Description |
|--------|-------|-------------|
| Job Dataset | `admin/job-dataset` | Job data CRUD management |
| Knowledge Base Maintenance | `admin/knowledge-base` | Local knowledge base content management |

### Data Visualization Components (D3.js)

| Component | Description |
|-----------|-------------|
| `D3RadarChart` | Polygon radar chart, dual-series comparison (personal ability vs job requirements) |
| `D3ChordDiagram` | Skill affinity chord diagram, gradient Ribbon + outer arc ticks |
| `D3Treemap` | Course structure Treemap |

## 🚀 Quick Start

### Online Experience (Recommended)

Visit the [Live Demo](https://whaoxm.github.io/cpa-xingtu/) directly and log in with the demo account.

### Local Run

```bash
# Install dependencies
npm install

# Start dev server (auto-opens browser)
npm run dev
# → http://localhost:5173

# Type check
npm run type-check

# Production build
npm run build

# Preview build output
npm run preview
```

**Node Version Requirement**: `^20.19.0 || >=22.12.0`

### Local Integration (Optional)

To connect to the CPA-Agent backend for real integration:

```bash
# Copy environment variable template
cp .env.example .env.local
# Windows PowerShell:
# Copy-Item .env.example .env.local
```

`.env.local` configuration:

```env
VITE_API_BASE_URL=http://127.0.0.1:5001
```

Backend integration points already connected:

- `student/career-analysis`: `GET /api/career/landscape`
- `student/ai-assistant`: `POST /api/agent/chat` (`mode=demo`)
- `student/career-navigation`: `POST /api/pipeline/ext/parse/resume`, `POST /api/pipeline/trigger`, `GET /api/pipeline/status/{task_id}`
- `student/career-report`: `POST /api/report/generate`
- `student/my-reports`: `GET /api/report/list`, `GET /api/report/{report_id}`

Pages not connected to the backend retain Mock data as fallback.

## 📁 Project Structure

```
src/
├── api/                  # API interface layer (connects to backend during integration)
├── assets/               # Static assets
│   ├── styles/           # CSS styles (base / theme / main)
│   ├── images/           # Image assets
│   └── data/             # Large data files (geo JSON, etc.)
├── components/
│   ├── charts/           # D3.js chart components
│   ├── book/             # Ancient book style UI components
│   ├── bookshelf/        # Bookshelf 3D scene and expand overlay
│   ├── career/           # Career module sub-components
│   ├── UserInfoBar.vue
│   └── TiptapEditor.vue
├── composables/          # Vue Composition API reusable logic
├── constants/            # Icon constants
├── layouts/              # App main framework
├── mock/                 # Demo data (out of the box)
├── plugins/              # GSAP plugin registration
├── router/               # Route guards and route definitions
├── stores/               # Pinia setup stores
├── types/                # Domain type definitions
├── utils/                # Utility functions
├── views/
│   ├── student/          # Student-side pages
│   ├── admin/            # Admin-side pages
│   ├── course/           # Public course pages
│   ├── HomeCenter.vue    # Homepage
│   ├── LoginView.vue     # Login page
│   └── NotFoundView.vue  # 404
└── main.ts
```

## 🚢 Deployment

This repository is automatically deployed to GitHub Pages via GitHub Actions, see [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

- **Base path**: `/cpa-xingtu/` (see `vite.config.ts`)
- **SPA routing**: `public/404.html` handles GitHub Pages refresh redirects
- **Trigger**: Push to `main` branch triggers deployment

See [DEPLOY.md](DEPLOY.md) for detailed deployment instructions.

## 🔐 Role Permissions

The system implements role-based access control via route guards:

- Unauthenticated users can only access the login page `/login`
- After login, users enter `/app/dashboard` by default
- Students can access `student/*` and public routes
- Admins can access `admin/*` and public routes
- Unauthorized access is automatically redirected to the homepage

## 💾 Data Storage

Uses Pinia + pinia-plugin-persistedstate for data persistence:

- User login state stored in localStorage
- Learning progress auto-syncs
- Resume and skill parsing results persist
- Report records persist

## 🎨 D3.js Chart Encapsulation Principles

1. **Responsive**: Auto-redraws on container resize via `useResizeObserver`
2. **Data-driven**: Data passed via props, auto-updates on watch
3. **Interactive**: Supports hover tooltips and transition animations
4. **Type-safe**: Complete TypeScript type definitions
5. **Lifecycle management**: Auto-disposes on `onBeforeUnmount` to prevent memory leaks

## 📄 About the CPA-Agent Main Project

This demo repository is the frontend presentation layer of CPA-Agent (Career Star Map). The complete project includes:

- **Flask Backend** - API, service layer, Agent engine
- **L0–L4 Pipeline** - Resume parsing → Graph building → Four-dimensional portrait → Job matching → Report generation
- **Dual-Engine Agent** - LangGraph (primary) + ReAct (fallback) + 12 tools
- **Hybrid Data Layer** - MySQL · Neo4j · Redis · Milvus
- **Knowledge Graph** - Skill/job/career path relationship network

Main project repository and docs: [CPA-Agent Main Repository](https://github.com/WHaoxM/cpa-agent)

## 📜 License

This project is open-sourced under the [GNU Affero General Public License v3.0](./LICENSE).

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

**Career Star Map** · Maintained by the SUSE team

</div>
