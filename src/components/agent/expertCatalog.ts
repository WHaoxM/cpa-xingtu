/** Frontend catalog for the Agent workspace. These are task perspectives, not backend role IDs. */
export interface WorkspaceExpert {
  id: string
  name: string
  byline: string
  category: string
  description: string
  tags: string[]
  prompts: string[]
  icon: string
  tone: string
  team?: boolean
}

export const expertCategories = ['全部', '职业规划', '求职准备', '能力成长', '研究分析', '作品表达']

export const workspaceExperts: WorkspaceExpert[] = [
  {
    id: 'career-coach', name: '职业规划顾问', byline: '方向与决策', category: '职业规划',
    description: '把个人经历、兴趣和现实约束放在一起，梳理可验证的职业方向与下一步选择。',
    tags: ['方向探索', '职业决策', '行动计划'], icon: 'lucide:compass', tone: 'violet',
    prompts: ['根据我的经历，帮我比较两个职业方向；先列出还需要确认的信息。', '我对未来方向很犹豫，请帮我做一份可执行的探索计划。', '如何判断我现在应该转向新岗位，还是继续积累经验？'],
  },
  {
    id: 'resume-editor', name: '简历优化顾问', byline: '证据与表达', category: '求职准备',
    description: '从目标岗位的筛选视角审视简历，突出可验证的成果、技能与匹配证据。',
    tags: ['简历诊断', '经历改写', '岗位匹配'], icon: 'lucide:file-user', tone: 'coral',
    prompts: ['请针对目标岗位诊断我的简历，按影响录用的程度列出前三个问题。', '帮我把这段项目经历改写得更具体，但不要编造数字或成果。', '对照这份招聘要求，指出我的简历缺少哪些可证明的能力。'],
  },
  {
    id: 'role-analyst', name: '岗位研究员', byline: '岗位与市场', category: '研究分析',
    description: '拆解岗位要求、工作内容和证据门槛，帮助你辨别真正需要补齐的差距。',
    tags: ['岗位拆解', '技能差距', '信息核验'], icon: 'lucide:scan-search', tone: 'blue',
    prompts: ['请拆解这份岗位描述，区分硬性门槛、加分项和模糊表述。', '目标岗位最关键的三项能力是什么？请说明判断依据。', '帮我比较两个岗位的成长路径与入门成本。'],
  },
  {
    id: 'interview-coach', name: '面试教练', byline: '提问与复盘', category: '求职准备',
    description: '围绕真实经历练习表达和追问，发现回答中证据不足或逻辑不清的地方。',
    tags: ['模拟面试', '回答复盘', '追问练习'], icon: 'lucide:messages-square', tone: 'mint',
    prompts: ['针对这个岗位和我的经历，先问我一道行为面试题。', '请追问我这段项目经历中最容易被质疑的细节。', '帮我复盘这段面试回答，指出空泛之处并给出改进建议。'],
  },
  {
    id: 'learning-mentor', name: '成长路径导师', byline: '学习与实践', category: '能力成长',
    description: '将目标能力拆成阶段任务，用可交付的作品和复盘节点验证进步。',
    tags: ['技能成长', '学习计划', '阶段成果'], icon: 'lucide:route', tone: 'amber',
    prompts: ['围绕目标岗位，为我做一份四周学习计划，每周有可验证成果。', '我每天只有一小时，应该怎样安排技能练习优先级？', '请评估我当前的技能差距，并给出最小可行的实践项目。'],
  },
  {
    id: 'portfolio-advisor', name: '作品集顾问', byline: '项目与呈现', category: '作品表达',
    description: '把项目过程整理为清晰案例，说明问题、方法、结果和个人贡献。',
    tags: ['作品集', '项目叙事', '成果展示'], icon: 'lucide:layout-template', tone: 'rose',
    prompts: ['帮我梳理这个项目的作品集叙事结构，突出我的真实贡献。', '这份作品集对目标岗位说服力不足在哪里？', '请把我的项目描述改成问题、行动、结果的结构。'],
  },
  {
    id: 'job-hunt-team', name: '求职准备协作组', byline: '多视角任务', category: '求职准备',
    description: '串联岗位分析、简历整理与面试准备，形成一份可执行的求职清单。',
    tags: ['岗位研究', '简历', '面试'], icon: 'lucide:users-round', tone: 'teal', team: true,
    prompts: ['我想申请这个岗位，请按岗位、简历、面试三个环节制定准备清单。', '请先找出我申请材料中最需要核实的事实，再规划下一步。', '把我的求职目标拆解成未来两周的行动任务。'],
  },
  {
    id: 'growth-team', name: '职业成长协作组', byline: '多视角任务', category: '能力成长',
    description: '联合职业方向、能力差距和学习计划三个视角，梳理长期成长路径。',
    tags: ['职业方向', '能力诊断', '阶段规划'], icon: 'lucide:network', tone: 'indigo', team: true,
    prompts: ['请从职业方向、能力差距和学习安排三方面评估我的目标。', '我想半年后转岗，帮我设计一套有检查点的行动路线。', '先识别我当前最不确定的职业假设，再建议如何验证。'],
  },
]
