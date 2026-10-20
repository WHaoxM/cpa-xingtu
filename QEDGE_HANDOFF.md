# QEdge 接入与现有落地页说明

## 目标

- `https://www.xingtulabs.top/` 使用项目里**现有的** Vue 落地页 `src/views/LandingView.vue`，不新建第二份落地页。
- 落地页根路径 `/` 留在 `www`；登录/平台等非根路由以及落地页入口，通过 GitHub Actions 仓库变量 `CPA_PLATFORM_ORIGIN` 跳转到 app。
- app 域名来自部署变量，不写死在前端源码。变量未配置时本地开发/预览继续使用同源路由。
- QEdge 的 app 回源、HTTPS、证书验证、资源和登录路由已通过线上检查；真实账号后端仍是独立事项，当前 Pages 构建继续使用 Mock。
- 印刷材料中的旧地址 `https://whaoxm.github.io/cpa-xingtu/` 继续跳转到 `www`。
- 两个域名继续通过 QEdge 加速同一个 GitHub Pages 项目源站 `whaoxm.github.io/cpa-xingtu`。

不创建新落地页，不部署或迁移后端，不更改现有 `www`、`app` DNS 目标。两条域名记录已指向 QEdge；本轮应修正/验证站点回源配置，而非重建 DNS 记录。

## 前端已准备的行为

- Vite 生产资源路径为 `/`，供自定义域名使用。
- `www` 根路径显示现有 `LandingView.vue`，不新建落地页。
- `www` 上只有根路由保留落地页；用户点击登录/进入平台或直接访问其他路由时，按 `CPA_PLATFORM_ORIGIN` 跳转并保留路由、查询参数和锚点。
- app 目标通过 `CPA_PLATFORM_ORIGIN` 仓库变量配置，不硬编码在源码；未配置时同源行为不变。
- Pages 的 404 fallback 会将 SPA 深路径、查询参数和锚点带回站点根路径，再由 Vue Router 恢复。
- 旧 `whaoxm.github.io/cpa-xingtu` 地址会在启动 Vue 前跳到 `www`。
- 未配置真实后端时，现有前端仍按项目配置使用 Mock 演示数据；CDN 接通不代表后端已部署。

## QEdge 站点配置

两个加速站点都回源同一 GitHub Pages 主机。不要把路径放进「回源 Host」字段。

| 项目 | `www.xingtulabs.top` | `app.xingtulabs.top` |
|---|---|---|
| 源站域名 | `whaoxm.github.io` | `whaoxm.github.io` |
| 回源协议/端口 | HTTPS / 443 | HTTPS / 443 |
| 回源 Host | `whaoxm.github.io` | `whaoxm.github.io` |
| TLS SNI | `whaoxm.github.io` | `whaoxm.github.io` |
| 路径改写 | `/` → `/cpa-xingtu` | `/` → `/cpa-xingtu` |
| 查询参数 | 保留 | 保留 |

如果 QEdge 将 `/cpa-xingtu/` 自动规范化显示为 `/cpa-xingtu`，不要反复尝试输入末尾斜线。保存后用 QEdge 测试/回源日志确认拼接结果：

| 用户请求 | 预期源站请求 |
|---|---|
| `/` | `/cpa-xingtu/` |
| `/assets/<文件>` | `/cpa-xingtu/assets/<文件>` |
| `/login` | `/cpa-xingtu/login`，Pages 404 fallback 应被正常返回 |
| `/?__spa_redirect=%2Flogin` | `/cpa-xingtu/?__spa_redirect=%2Flogin`，查询参数必须保留 |

**重点检查重定向：**如果 QEdge 收到 GitHub Pages 将 `/cpa-xingtu` 规范化为 `/cpa-xingtu/` 的 301/302，最终浏览器的 `Location` 必须仍留在请求中的 `www.xingtulabs.top` 或 `app.xingtulabs.top`，不能暴露并跳回 `whaoxm.github.io`。若 QEdge 无法正确拼接路径或处理 `Location`，先找 QEdge 支持确认，不要改 DNS 来掩盖回源错误。

### 其他回源选项

- 证书校验开启；QEdge 对外证书须分别覆盖 `www.xingtulabs.top` 和 `app.xingtulabs.top`，状态为已部署。
- Keep-Alive 开启；单源站保留默认负载均衡即可；Range 回源可关闭。
- GitHub Pages 是公开静态源站，回源鉴权关闭。
- 不要对 HTML、`404.html` 或 SPA fallback 设长缓存。带内容哈希的 `/assets/*` 可长缓存。
- 如未来让前端同域代理真实 API，`/api/*`、认证请求和带 Cookie 的响应必须绕过共享缓存；当前 CDN 接入本身不启用后端。

## 实施顺序

1. 在 GitHub Actions 仓库变量设置 `CPA_PLATFORM_ORIGIN=https://app.xingtulabs.top`；该值为公开站点配置，不是密钥。
2. 本地验证前端改动，提交并合并到仓库 `main`；等待 GitHub Actions Pages 部署成功。
3. 在 QEdge 现有 `www` 与 `app` 站点分别修正源站 Host、SNI 和 `/` 路径改写；不要新建落地页，也不要重建现有站点。
4. 用 QEdge 的临时测试域名、回源日志或支持人员提供的验证方式核对上表路径和 `Location`。**DNS 已指向 QEdge，因此这里不需要再次切换或替换 CNAME。**
5. 检查两个 QEdge HTTPS 证书部署完成后，再从浏览器分别访问以下地址。

## 验收

- `https://www.xingtulabs.top/` 显示项目原有落地页；入口跳转到 app 的 `/login`，而 app 域名由 `CPA_PLATFORM_ORIGIN` 仓库变量提供。
- `www` 根路径仍为落地页；点击入口及直接访问 `/login`、其他平台路由时转到配置的 app origin。
- app 上的 `/login` 和前端静态资源已通过线上浏览器/请求验证；当前仍为 Mock 演示，真实账号后端尚未接入。
- 两个域名请求的 JS、CSS、图片都能加载；浏览器没有证书告警，也不会跳回 GitHub 域名。
- `https://whaoxm.github.io/cpa-xingtu/` 仍跳到 `www`。
- 若任一项失败，先看 QEdge 回源日志里的实际 URI、Host、SNI 和 `Location`，不要先动 DNS。

## 回滚

优先回滚这次修改的 QEdge 路径改写/Host 配置到记录下来的旧值。由于当前 `www` 和 `app` DNS 已经指向 QEdge，若需暂时绕过 QEdge，应先记录并确认各自当前的 CNAME 与证书/源站状态，再单独决定回滚哪条记录；不要删除或改动不相关的根域名记录。
