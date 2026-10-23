/**
 * P0 回归检查：岗位介绍（getRoleIntro）不得对未收录岗位静默冒充其它岗位文案。
 *
 * 背景（2026-08）：useAbilityGraph.ts 曾以 `map[resolved] ?? map['Vue 前端工程师']!`
 * 兜底，导致 http 联调 / BE 目录角色（如 RAG工程师、SRE工程师）进能力图谱时，
 * 「01 职业分析」区块展示 Vue 前端文案 —— 路演高危 JD 穿帮。
 *
 * 检查项：
 *   1. 15 个 canonical 岗位 → 必须返回非空介绍
 *   2. 未收录角色（SRE工程师 / 移动端开发 / 网络安全工程师 …）→ 必须返回空壳（summary=''）
 *      —— 禁止出现 Vue 前端文案
 *   3. BE 目录角色别名（RAG工程师 / 大模型算法工程师 …）→ 必须解析到非空介绍
 *
 * 运行：node tools/check-ability-intro.mjs  （exit code 非 0 即失败）
 */
import { buildSync } from 'esbuild'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'

const require = createRequire(import.meta.url)
const root = dirname(fileURLToPath(import.meta.url))
const srcFile = join(root, '..', 'src', 'composables', 'useAbilityGraph.ts')

const tmp = mkdtempSync(join(tmpdir(), 'ability-intro-'))
const outFile = join(tmp, 'useAbilityGraph.cjs')

try {
  buildSync({
    entryPoints: [srcFile],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: outFile,
    alias: { '@': join(root, '..', 'src') },
    logLevel: 'error',
  })
  const { getRoleIntro } = require(outFile)

  const VUE_MARKERS = ['Vue 前端开发工程师', '负责基于 Vue 生态', 'Vue 3', 'Element Plus']

  const canonicalRoles = [
    'Vue 前端工程师', 'React 前端工程师', '可视化工程师',
    'Java 后端工程师', 'Go 后端工程师', 'Python 后端工程师',
    '测试开发工程师', '质量平台工程师', '性能测试工程师',
    '数据分析师', '数据开发工程师', '增长分析师',
    '算法工程师', '大模型工程师', 'AI 应用工程师',
  ]
  const aliasRoles = [
    '前端开发', '后端开发', '测试开发', '自动化测试工程师',
    '数据分析', '商业数据分析师', '机器学习工程师', '大模型应用工程师',
    'RAG工程师', '大模型算法工程师', 'AI智能体工程师', '提示词工程师',
    'MLOps工程师', '具身智能工程师', '机器人算法工程师',
    '数据分析师', '数据工程师', '数据挖掘工程师', '全栈开发',
  ]
  const unmappedRoles = [
    'SRE工程师', '移动端开发', '客户端开发', '网络安全工程师',
    'AI安全工程师', 'DevOps工程师', '平台工程师', '产品经理',
    'AI产品经理', '游戏策划', 'Java 后端', '随便输入的岗位',
  ]

  const failures = []

  for (const role of canonicalRoles) {
    const r = getRoleIntro(role)
    if (!r.summary || !r.outlook || !r.skills.length) {
      failures.push(`[canonical] ${role} 返回了空内容`)
    }
  }

  for (const role of aliasRoles) {
    const r = getRoleIntro(role)
    if (!r.summary) {
      failures.push(`[alias] ${role} 未解析到非空介绍`)
    }
  }

  for (const role of unmappedRoles) {
    const r = getRoleIntro(role)
    if (r.summary !== '') {
      failures.push(`[unmapped] ${role} 未返回空壳（summary="${r.summary}"）`)
    }
    if (VUE_MARKERS.some((m) => r.summary.includes(m) || r.skills.includes(m))) {
      failures.push(`[unmapped] ${role} 泄漏了 Vue 前端文案（P0 复发）`)
    }
    if (r.title !== role) {
      failures.push(`[unmapped] ${role} 空壳 title 应为自身，实际="${r.title}"`)
    }
  }

  // 空壳字段全空 + 数组为空
  const shell = getRoleIntro('SRE工程师')
  if (shell.responsibilities.length || shell.requirements.length || shell.skills.length || shell.topRegions.length || shell.outlook) {
    failures.push('[shell] 空壳非空字段检查失败')
  }

  if (failures.length) {
    console.error('FAIL — 岗位介绍回归检查未通过：')
    for (const f of failures) console.error('  ✗ ' + f)
    process.exitCode = 1
  } else {
    console.log(`OK — 岗位介绍回归检查通过（canonical=${canonicalRoles.length} alias=${aliasRoles.length} unmapped=${unmappedRoles.length}）`)
  }
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
