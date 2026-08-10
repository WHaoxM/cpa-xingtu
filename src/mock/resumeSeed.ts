import type { ParsedSkill } from '@/stores/resume'
import { getCareerInsightsMock } from '@/composables/useCareerInsights'

const RESUME_RAW_TEXT = `钟梓珉
大模型工程师/AI Agent开发
2006/11 13330772777
hosheil@outlook.com
熟练掌握 Python，具备 FastAPI/Flask 后端开发能力，能独立完成接口开发与服务搭建
具备 AI Agent 开发经验，基于 LangChain/LangGraph 实现多 Agent 协作架构（路由、检索、生成），掌握任务规划与 Function Calling / Tool Calling 的实际应用
具备 RAG 系统开发经验，熟悉向量检索（Milvus/FAISS）与重排序，在项目中实现过 GraphRAG（知识图谱 + 向量检索融合）
掌握 Prompt Engineering，了解 Qwen、GPT、Claude 等主流模型，有 Qwen LoRA参数微调的实际项目经历
熟悉图数据库（Neo4j）与向量数据库（Milvus），能支撑 Agent 记忆与知识检索
熟悉 Docker 容器化与 Git 版本管理，具备基础部署能力
熟悉本地大模型部署（Ollama）与 MCP 协议的基本实践
省重点人工智能实验室 学生科研组成员 2024/11 - 至今
省级大创项目（负责人，在研）：研究长序列复杂指令下的分层规划与视觉-动作具身智能体，聚焦智能体操作系统。已完成基于LLM动态编排、VLM时空记忆与NoMaD VLA控制的三层解耦架构原型，在Unitree Go2四足机器人上开展真机验证。预期成果：以第一作者或共一身份发表AI领域顶刊论文1篇。
职导星图--大学生职业规划智能体 核心开发者 2026/02 - 2026/04
基于外包服务竞赛真实需求，设计面向大学生的职业规划智能体系统。
• 模型微调：针对职业规划实体识别精度低的问题，基于Qwen3.5 2B进行LoRA微调（r=16），在500+条标注数据上F1-score达87.3%（通用基线68.5%），精准抽取岗位、技能、薪资等12类实体。
• 知识图谱：构建Neo4j职业知识图谱，覆盖8大职业方向，包含3200+实体节点、5800+关系边，实现GraphRAG检索，关联性问题召回率从传统RAG的61%提升至89%，平均查询响应约120ms。
• Agent编排：基于LangGraph设计3-Agent协作架构（路由/检索/生成），端到端对话响应延迟约800ms，支持10轮以上上下文连贯对话，单接口并发处理能力达50 QPS。
• 项目成果：交付可交互原型，实体抽取准确率较通用模型提升18.8个百分点，支撑从职业咨询到规划输出的完整闭环。
智网·图谱——基于多模态融合与多Agent协同的网络课程智能教学平台 核心开发者 2025/09 - 2026/02
承接校内教学平台委托，开发面向课程学习场景的基于大模型问答助手。作为技术负责人，主导 Agent 核心模块设计与落地，覆盖 1 门课程、3 种模态（视频/课件/教材）、500+ 知识节点，实现从多模态数据解析到精准问答的完整链路。
• 任务规划与工具调用：设计基于 LangGraph 的 Agent 任务规划逻辑，将用户复杂问题拆解为"意图识别→知识检索→答案生成"子任务序列，绑定知识图谱查询、向量检索等工具，平均问题拆解步数约 3 步，工具调用成功率达92%，端到端问答延迟从约 15s 降至 8s。
• 上下文管理与记忆系统：基于 LangGraph 设计多轮对话上下文管理机制，实现用户学习偏好与历史问答记录的轻量级记忆存储，支持 10 轮以上上下文连贯对话，百次随机问题测试上下文紊乱率从 45% 降至 12%，关键信息留存率提升至 95%。
• 混合检索策略与性能调优：设计"知识图谱精确匹配 + Milvus 向量语义召回"混合检索链路，结合 RRF 重排序算法优化专业场景准确率，单轮问答准确率达 89%（纯 RAG 基线 72%），平均检索响应时间从约 200ms 降至 85ms，CPU 高峰占用降低约 20%。
• 原型验证与交付：完成系统原型工程化开发（FastAPI + Docker），推动真实学习场景业务落地，系统可用性达 99.5%，支撑 200+ 名学生期末复习场景，日均查询量约 300 次。
四川轻化工大学 计算机科学与技术 · 本科 2024/09 - 2028/06
主修课程：数据结构、人工智能、操作系统、计算机组成原理
专业排名前 1%，获得一等奖学金
担任人工智能协会协会学科竞赛部副部长
获得2025年全球校园人工智能算法精英大赛国家级一等奖
组织校内个人小型开发团队交付多个盈利项目`

const PARSED_SKILLS: ParsedSkill[] = [
  { name: 'Python', weight: 0.95, category: '机器学习' },
  { name: 'LangChain / LangGraph', weight: 0.92, category: '机器学习' },
  { name: 'RAG 系统', weight: 0.90, category: '机器学习' },
  { name: 'Prompt Engineering', weight: 0.88, category: '机器学习' },
  { name: 'FastAPI', weight: 0.85, category: '后端' },
  { name: 'Neo4j', weight: 0.82, category: '数据' },
  { name: 'Milvus / 向量检索', weight: 0.80, category: '数据' },
  { name: 'LoRA 微调', weight: 0.78, category: '机器学习' },
  { name: 'Docker', weight: 0.75, category: '通用' },
  { name: 'Git', weight: 0.72, category: '通用' },
  { name: 'Ollama', weight: 0.70, category: '机器学习' },
  { name: 'MCP 协议', weight: 0.65, category: '机器学习' },
  { name: 'Flask', weight: 0.60, category: '后端' },
]

export function seedResumeStore() {
  try {
    const existing = localStorage.getItem('resume-store')
    if (existing) {
      try {
        const parsed = JSON.parse(existing)
        if (parsed && parsed.isParsed) return
      } catch { /* 解析失败则覆盖 */ }
    }

    const insights = getCareerInsightsMock('机器学习工程师')

    const seed = {
      rawText: RESUME_RAW_TEXT,
      fileName: '钟梓珉_大模型工程师_AIAgent开发.pdf',
      parsedSkills: PARSED_SKILLS,
      matchedCareers: insights.candidates,
      insights,
      isParsed: true,
      evaluatingRole: '',
    }

    localStorage.setItem('resume-store', JSON.stringify(seed))
  } catch {
    // localStorage 不可用时静默失败
  }
}
