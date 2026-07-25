# Demo Fixtures

静态演示数据，供 `VITE_API_MODE=mock` 使用。GitHub Pages 部署默认走此目录，**不会请求后端**。

## 加载方式

`src/api/adapters/mockAdapter.ts` 通过同源 `fetch`：

```
{BASE_URL}fixtures/{path}
```

Pages 上即 `/cpa-xingtu/fixtures/...`。

## 目录

| 目录 | 覆盖页面 / API |
|------|----------------|
| `auth/` | 登录账号（student001 / admin001，密码 123456） |
| `agent/` | AI 助手会话、场景化回复 |
| `ability/` | 能力图谱 |
| `career/` | 职业景观 / 洞察 |
| `favorites/` | 心仪岗位 / 目标角色 |
| `learning/` | 课程列表与详情、进度 |
| `match/` | 人岗匹配解释 |
| `messages` → `home/messages.list.json` | 消息中心 |
| `pipeline/` | 简历解析演示回包 |
| `profile/` | 学生 4D / 岗位画像 |
| `report/` | 报告列表与详情 |
| `admin/` | 管理端数据集 / 知识库 |
| `home/` | 仪表盘摘要（可选） |

## 约定

- 统一 envelope：`{ "success": true, "data": ... }`
- 写操作（收藏、进度、消息已读）复用 canned ok / 原列表 fixture，**不持久化**
- 缺文件时对应 API 应降级或返回空，避免整页崩溃

## 本地预览

```bash
npm run dev:mock
# 或
npm run preview:demo
```
