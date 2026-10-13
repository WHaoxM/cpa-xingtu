// @ts-nocheck
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Note, WrongQuestion, QuizRecord, Question, AIMessage, AIToolCall, SavedJob, TargetRole } from '@/types'
import type { ArtifactRef, MessagePart, TurnOutcome } from '@/types'
import {
  mockNotes,
  mockWrongQuestions,
  mockQuizRecords,
  mockQuestions,
  mockAIMessages,
  mockAIResponses,
  mockThinkingTemplates,
  mockSavedJobs,
  CURRENT_USER_ID,
} from '@/mock/data'
import {
  addTargetRole,
  createSavedJob,
  deleteSavedJob,
  deleteTargetRole,
  listSavedJobs,
  listTargetRoles,
} from '@/api/favorites'
import {
  chat as agentChat,
  createSession as createAgentSession,
  clearAgentSessionId,
  ensureSession,
  mapAgentToolCalls,
  publicTurnToMessageParts,
  getAgentSessionId,
} from '@/api/agent'
import { useUserStore } from '@/stores/user'
import { getApiMode } from '@/api/config'

// 学习记录接口
export interface LearningRecord {
  id: string
  userId: string
  courseId: string
  courseName: string
  courseType: 'programming' | 'design' | 'math' | 'english' | 'science'
  difficulty: 'beginner' | 'intermediate' | 'advanced' | 'expert'
  studyTime: number // 学习时长（分钟）
  completedAt: string
  progress: number // 进度百分比
  score?: number // 测试分数
  notes?: string // 学习笔记
}

// 筛选条件接口
export interface DataFilters {
  timeRange: string
  dateRange: [string, string] | null
  courseType: string
  difficulty: string
  viewMode: 'chart' | 'table' | 'both'
}

// 统计数据接口
export interface LearningStatistics {
  totalCourses: number
  totalStudyTime: number
  averageScore: number
  completionRate: number
  streakDays: number
  achievements: number
}

export const useLearningStore = defineStore(
  'learning',
  () => {
    // State
    const notes = ref<Note[]>([...mockNotes])
    const wrongQuestions = ref<WrongQuestion[]>([...mockWrongQuestions])
    const quizRecords = ref<QuizRecord[]>([...mockQuizRecords])
    const aiMessages = ref<AIMessage[]>([...mockAIMessages])
    const noteFavorites = ref<string[]>([])

    // TODO: API — GET /api/saved-jobs?userId=xxx
    const savedJobs = ref<SavedJob[]>([...mockSavedJobs])

    // 职业分析中关注的职业方向（与 savedJobs 具体职位区分）
    const targetRoles = ref<TargetRole[]>([])

    // 蒱弱点记录页输出的高优先弱技能标签（供技能提升页读取）
    const weakSkillTags = ref<string[]>([])

    // 可视化相关状态
    const learningHistory = ref<LearningRecord[]>([])
    const filters = ref<DataFilters>({
      timeRange: 'month',
      dateRange: null,
      courseType: 'all',
      difficulty: 'all',
      viewMode: 'chart'
    })
    const loading = ref(false)
    const cache = ref(new Map<string, any>())

    // Getters
    const getUserNotes = computed(() => (userId: string) => {
      return notes.value.filter(n => n.userId === userId)
    })

    const getUserWrongQuestions = computed(() => (userId: string) => {
      return wrongQuestions.value.filter(wq => wq.userId === userId)
    })

    const getUserQuizRecords = computed(() => (userId: string) => {
      return quizRecords.value.filter(qr => qr.userId === userId)
    })

    const getNotesByCourse = computed(() => (userId: string, courseId: string) => {
      return notes.value.filter(n => n.userId === userId && n.courseId === courseId)
    })

    const isNoteFavorite = computed(() => (noteId: string) => {
      return noteFavorites.value.includes(noteId)
    })

    const getFavoriteNotes = computed(() => (userId: string) => {
      return notes.value.filter(n => n.userId === userId && noteFavorites.value.includes(n.id))
    })

    const getNotesByTag = computed(() => (userId: string, tag: string) => {
      return notes.value.filter(n => n.userId === userId && n.tags.includes(tag))
    })

    const getKnowledgePoints = computed(() => (userId: string) => {
      const userNotes = notes.value.filter(n => n.userId === userId)
      const points = new Set<string>()
      userNotes.forEach(note => {
        note.tags.forEach(tag => points.add(tag))
      })
      return Array.from(points)
    })

    // 可视化相关的getters
    const filteredLearningHistory = computed(() => {
      let filtered = learningHistory.value

      // 时间范围筛选
      if (filters.value.dateRange) {
        const [startDate, endDate] = filters.value.dateRange
        filtered = filtered.filter(record => {
          const recordDate = record.completedAt.split('T')[0]
          return recordDate >= startDate && recordDate <= endDate
        })
      }

      // 课程类型筛选
      if (filters.value.courseType !== 'all') {
        filtered = filtered.filter(record => record.courseType === filters.value.courseType)
      }

      // 难度筛选
      if (filters.value.difficulty !== 'all') {
        filtered = filtered.filter(record => record.difficulty === filters.value.difficulty)
      }

      return filtered
    })

    const statistics = computed((): LearningStatistics => {
      const filtered = filteredLearningHistory.value
      
      const totalCourses = new Set(filtered.map(r => r.courseId)).size
      const totalStudyTime = filtered.reduce((sum, r) => sum + r.studyTime, 0)
      const averageScore = filtered.length > 0 
        ? filtered.reduce((sum, r) => sum + (r.score || 0), 0) / filtered.filter(r => r.score).length
        : 0
      const completionRate = filtered.length > 0
        ? filtered.reduce((sum, r) => sum + r.progress, 0) / filtered.length
        : 0
      const streakDays = calculateStreakDays()
      
      // Calculate achievements inline to avoid circular dependency
      let achievements = 0
      if (totalCourses >= 10) achievements++
      if (totalStudyTime >= 1000) achievements++
      if (averageScore >= 85) achievements++
      if (completionRate >= 80) achievements++
      if (streakDays >= 7) achievements++
      
      return {
        totalCourses,
        totalStudyTime,
        averageScore,
        completionRate,
        streakDays,
        achievements
      }
    })

    const progressData = computed(() => {
      const filtered = filteredLearningHistory.value
      const total = filtered.length
      
      if (total === 0) {
        return [
          { name: '无数据', value: 1, color: '#e0e0e0' }
        ]
      }

      const completed = filtered.filter(r => r.progress === 100).length
      const inProgress = filtered.filter(r => r.progress > 0 && r.progress < 100).length
      const notStarted = filtered.filter(r => r.progress === 0).length
      const paused = filtered.filter(r => r.progress > 0 && r.progress < 100 && Math.random() > 0.7).length

      return [
        { name: '已完成', value: completed, color: '#67C23A' },
        { name: '学习中', value: inProgress, color: '#409EFF' },
        { name: '未开始', value: notStarted, color: '#E6A23C' },
        { name: '已暂停', value: paused, color: '#F56C6C' }
      ].filter(item => item.value > 0)
    })

    const timelineData = computed(() => {
      const filtered = filteredLearningHistory.value
      const groupedByDate = new Map<string, LearningRecord[]>()

      // 按日期分组
      filtered.forEach(record => {
        const date = record.completedAt.split('T')[0]
        if (!groupedByDate.has(date)) {
          groupedByDate.set(date, [])
        }
        groupedByDate.get(date)!.push(record)
      })

      // 转换为时间轴数据格式
      return Array.from(groupedByDate.entries())
        .map(([date, records]) => ({
          date,
          studyTime: Math.round(records.reduce((sum, r) => sum + r.studyTime, 0) / 60 * 10) / 10, // 转换为小时
          completedCourses: records.filter(r => r.progress === 100).length,
          testScore: records.length > 0 
            ? Math.round(records.reduce((sum, r) => sum + (r.score || 0), 0) / records.filter(r => r.score).length)
            : 0
        }))
        .sort((a, b) => a.date.localeCompare(b.date))
    })

    const timeDistribution = computed(() => {
      const filtered = filteredLearningHistory.value
      const timeSlots = {
        morning: 0,    // 6:00-12:00
        afternoon: 0,  // 12:00-18:00
        evening: 0     // 18:00-24:00
      }

      filtered.forEach(record => {
        const hour = new Date(record.completedAt).getHours()
        
        if (hour >= 6 && hour < 12) {
          timeSlots.morning += record.studyTime
        } else if (hour >= 12 && hour < 18) {
          timeSlots.afternoon += record.studyTime
        } else {
          timeSlots.evening += record.studyTime
        }
      })

      const total = timeSlots.morning + timeSlots.afternoon + timeSlots.evening

      return [
        { 
          name: '上午', 
          value: Math.round(timeSlots.morning / total * 100), 
          color: '#91CC75' 
        },
        { 
          name: '下午', 
          value: Math.round(timeSlots.afternoon / total * 100), 
          color: '#5470C6' 
        },
        { 
          name: '晚上', 
          value: Math.round(timeSlots.evening / total * 100), 
          color: '#FAC858' 
        }
      ].filter(item => item.value > 0)
    })

    // 辅助函数
    function calculateStreakDays(): number {
      const dates = Array.from(new Set(
        learningHistory.value.map(r => r.completedAt.split('T')[0])
      )).sort().reverse()

      if (dates.length === 0) return 0

      let streak = 1
      const today = new Date().toISOString().split('T')[0]
      
      // 检查今天是否有学习记录
      if (dates[0] !== today) {
        // 检查昨天是否有学习记录
        const yesterday = new Date()
        yesterday.setDate(yesterday.getDate() - 1)
        if (dates[0] !== yesterday.toISOString().split('T')[0]) {
          return 0
        }
      }

      for (let i = 1; i < dates.length; i++) {
        const currentDate = new Date(dates[i - 1])
        const prevDate = new Date(dates[i])
        
        const diffTime = currentDate.getTime() - prevDate.getTime()
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
        
        if (diffDays === 1) {
          streak++
        } else {
          break
        }
      }

      return streak
    }

    function calculateAchievements(): number {
      const stats = statistics.value
      let achievements = 0
      
      if (stats.totalCourses >= 10) achievements++
      if (stats.totalStudyTime >= 1000) achievements++ // 1000分钟
      if (stats.averageScore >= 85) achievements++
      if (stats.completionRate >= 80) achievements++
      if (stats.streakDays >= 7) achievements++
      
      return achievements
    }

    // Actions
    function addNote(note: Omit<Note, 'id' | 'createdAt' | 'updatedAt'>): Note {
      const now = new Date().toISOString().replace('T', ' ').substring(0, 16)
      const newNote: Note = {
        ...note,
        id: `note_${Date.now()}`,
        createdAt: now,
        updatedAt: now,
      }
      notes.value.push(newNote)
      return newNote
    }

    function updateNote(id: string, data: Partial<Note>): boolean {
      const index = notes.value.findIndex(n => n.id === id)
      if (index !== -1) {
        const now = new Date().toISOString().replace('T', ' ').substring(0, 16)
        notes.value[index] = {
          ...notes.value[index],
          ...data,
          updatedAt: now,
        }
        return true
      }
      return false
    }

    function deleteNote(id: string): boolean {
      const index = notes.value.findIndex(n => n.id === id)
      if (index !== -1) {
        notes.value.splice(index, 1)
        // 同时从收藏中移除
        const favIndex = noteFavorites.value.indexOf(id)
        if (favIndex !== -1) {
          noteFavorites.value.splice(favIndex, 1)
        }
        return true
      }
      return false
    }

    function toggleNoteFavorite(noteId: string): void {
      const index = noteFavorites.value.indexOf(noteId)
      if (index !== -1) {
        noteFavorites.value.splice(index, 1)
      } else {
        noteFavorites.value.push(noteId)
      }
    }

    function addWrongQuestion(
      userId: string,
      question: Question,
      wrongAnswer: string | string[],
    ): void {
      const existingIndex = wrongQuestions.value.findIndex(
        wq => wq.userId === userId && wq.questionId === question.id,
      )

      const now = new Date().toISOString().replace('T', ' ').substring(0, 16)

      if (existingIndex !== -1) {
        wrongQuestions.value[existingIndex].times++
        wrongQuestions.value[existingIndex].wrongAnswer = wrongAnswer
        wrongQuestions.value[existingIndex].lastWrongAt = now
      } else {
        wrongQuestions.value.push({
          id: `wq_${Date.now()}`,
          userId,
          questionId: question.id,
          question,
          wrongAnswer,
          times: 1,
          lastWrongAt: now,
        })
      }
    }

    function removeWrongQuestion(userId: string, questionId: string): boolean {
      const index = wrongQuestions.value.findIndex(
        wq => wq.userId === userId && wq.questionId === questionId,
      )
      if (index !== -1) {
        wrongQuestions.value.splice(index, 1)
        return true
      }
      return false
    }

    function addQuizRecord(record: Omit<QuizRecord, 'id'>): QuizRecord {
      const newRecord: QuizRecord = {
        ...record,
        id: `quiz_${Date.now()}`,
      }
      quizRecords.value.push(newRecord)

      // 记录错题
      Object.entries(record.correctAnswers).forEach(([questionId, isCorrect]) => {
        if (!isCorrect) {
          const question = mockQuestions.find(q => q.id === questionId)
          if (question) {
            addWrongQuestion(record.userId, question, record.answers[questionId])
          }
        }
      })

      return newRecord
    }

    function addAIMessage(message: Omit<AIMessage, 'id'>): AIMessage {
      const newMessage: AIMessage = {
        ...message,
        id: `ai_msg_${Date.now()}`,
      }
      aiMessages.value.push(newMessage)
      return newMessage
    }

    function getAIResponseCategory(input: string): string {
      const t = input.toLowerCase()
      if (t.includes('报告')) return '报告'
      if (t.includes('简历')) return '简历'
      if (t.includes('课程')) return '课程'
      if (t.includes('差距') || t.includes('匹配')) return '匹配'
      if (t.includes('重点学') || t.includes('建议') || t.includes('怎么学') || t.includes('提高') || t.includes('学什么')) return '建议'
      if (t.includes('计划') || t.includes('本周')) return '计划'
      if (t.includes('画像')) return '画像'
      if (t.includes('自评') || t.includes('评估')) return '自评'
      if (t.includes('职业方向') || t.includes('方向') || t.includes('做什么')) return '方向'
      if (t.includes('模块') || t.includes('功能') || t.includes('导航')) return '导航'
      return '默认'
    }

    // 工具卡 ui_view 契约：只给真实工具名 + 一句摘要，不暴露 args / task_id（见物料契约 §4）
    function mockToolCallsForCategory(category: string): AIToolCall[] {
      switch (category) {
        case '方向':
          return [
            { name: 'semantic_search', status: 'done', summary: '检索与你技能匹配的职业方向' },
            { name: 'skill_match', status: 'done', summary: '对比候选方向的技能覆盖率' },
          ]
        case '画像':
          return [{ name: 'portrait_generate', status: 'done', summary: '按四维权重生成能力画像' }]
        case '计划':
          return [{ name: 'learning_path', status: 'done', summary: '按缺口生成分周学习计划' }]
        case '自评':
          return [{ name: 'skill_match', status: 'done', summary: '按后端校招要求做技能自评' }]
        case '导航':
          return []
        case '匹配':
          return [
            { name: 'skill_match', status: 'done', summary: '计算你与目标岗位的技能覆盖率' },
            { name: 'db_query', status: 'done', summary: '读取目标岗位的硬性门槛与需求' },
          ]
        case '建议':
          return [
            { name: 'skill_match', status: 'done', summary: '定位当前技能缺口' },
            { name: 'llm_reason', status: 'done', summary: '生成高杠杆建议' },
          ]
        case '简历':
          return [
            { name: 'pipeline_run', status: 'done', summary: '解析简历结构与技能字段' },
            { name: 'llm_reason', status: 'done', summary: '对照岗位要求给出改进项' },
          ]
        case '报告':
          return [{ name: 'career_report', status: 'done', summary: '整理岗位匹配、能力差距与行动建议' }]
        case '课程':
          return [
            { name: 'learning_path', status: 'done', summary: '按缺口排序学习路径' },
            { name: 'db_query', status: 'done', summary: '读取可补缺口的课程' },
          ]
        default:
          return []
      }
    }

    // 成果物卡契约（见物料契约 §5）：kind + action 必须可被 ArtifactCard 路由
    function mockArtifactsForCategory(category: string): ArtifactRef[] {
      switch (category) {
        case '方向':
          return [{
            artifact_id: 'mock_artifact_direction', kind: 'match', status: 'completed', title: '候选职业方向',
            summary: 'Java 后端 / 大数据 / 测试开发，按覆盖率排序',
            preview: {
              type: 'match_preview', primary_role: 'Java 后端工程师', total_score: 76, coverage: 72,
              gaps: ['消息队列', '系统设计'],
              candidates: [
                { role: 'Java 后端工程师', score: 76, coverage: 72 },
                { role: '大数据开发工程师', score: 68, coverage: 65 },
                { role: '测试开发工程师', score: 64, coverage: 61 },
              ],
            },
            actions: [{ id: 'open_match', label: '查看方向对比' }],
          }]
        case '画像':
          return [{
            artifact_id: 'mock_artifact_portrait', kind: 'portrait', status: 'completed', title: '四维能力画像',
            summary: 'D1 76 · D2 72 · D3 58 · D4 48，决定项：项目深度',
            preview: { type: 'portrait_preview', scores: { d1: 76, d2: 72, d3: 58, d4: 48 }, strengths: ['基础素质', '专业技能'], weaknesses: ['项目深度'] },
            actions: [{ id: 'view_portrait', label: '打开画像' }],
          }]
        case '计划':
          return [{
            artifact_id: 'mock_artifact_plan', kind: 'action_plan', status: 'completed', title: '本周学习计划',
            summary: '第 1 周：项目深化 + 消息队列入门，周日验收',
            preview: {
              type: 'plan_preview', steps: 3, completed: 0, duration: '本周',
              items: [
                { id: 'project', title: '深化一个后端项目', detail: '补齐背景、技术难点、方案与量化结果，形成可讲述的项目故事。', keyword: 'Spring Boot', done: false },
                { id: 'mq', title: '消息队列入门', detail: '理解异步解耦、重试与幂等，并在项目中完成一个最小实践。', keyword: '消息队列', done: false },
                { id: 'review', title: '周日验收与复盘', detail: '用 10 分钟讲清项目改动，记录遇到的问题和下周行动。', keyword: 'Java', done: false },
              ],
            },
            actions: [{ id: 'continue_plan', label: '查看计划' }],
          }]
        case '匹配':
          return [{
            artifact_id: 'mock_artifact_match', kind: 'match', status: 'completed', title: '与 Java 后端的匹配结果',
            summary: '匹配分 76 · 覆盖率 72% · 缺消息队列与系统设计',
            preview: { type: 'match_preview', total_score: 76, coverage: 72, gaps: ['消息队列', '系统设计'] },
            actions: [{ id: 'open_match', label: '查看匹配' }],
          }]
        case '简历':
          return [{
            artifact_id: 'mock_artifact_resume', kind: 'file', status: 'completed', title: '简历改进清单',
            summary: '项目描述过薄、缺技术难点，3 条可执行改进',
            preview: {
              type: 'resume_improvement_preview',
              draft: { name: '演示学生', targetRole: 'Java 后端工程师', skills: ['Java', 'Spring Boot', 'MySQL'], projects: [{ name: '校园后端项目（演示）', role: '后端开发', desc: '使用 Spring Boot + MySQL 完成基础接口。' }] },
              recommendations: [
                { id: 'result', target: 'projects', title: '补充量化结果', detail: '项目描述增加业务规模、性能指标或可核验的结果。', applied: false },
                { id: 'challenge', target: 'projects', title: '写清技术难点', detail: '按背景、难点、方案、结果四段式补充项目经历。', applied: false },
                { id: 'skills', target: 'skills', title: '技能分层', detail: '将技能按熟练、熟悉、了解分层，避免笼统罗列。', applied: false },
              ],
            },
            actions: [{ id: 'open_resume', label: '查看改进清单' }],
          }]
        case '课程':
          return [{
            artifact_id: 'mock_artifact_courses', kind: 'action_plan', status: 'completed', title: '课程学习顺序',
            summary: 'Spring Boot 进阶 → Redis → 消息队列 → 系统设计',
            preview: {
              type: 'plan_preview', steps: 4, completed: 0, duration: '四周',
              items: [
                { id: 'spring', title: 'Spring Boot 进阶', detail: '巩固服务分层、接口设计和异常处理。', keyword: 'Spring Boot', done: false },
                { id: 'redis', title: 'Redis 缓存实践', detail: '在项目中加入缓存并观察命中率与一致性问题。', keyword: 'Redis', done: false },
                { id: 'mq', title: '消息队列与异步任务', detail: '完成事件发布、消费与失败重试的最小实践。', keyword: '消息队列', done: false },
                { id: 'design', title: '系统设计复盘', detail: '输出一页架构图，解释扩展性与关键权衡。', keyword: '系统设计', done: false },
              ],
            },
            actions: [{ id: 'continue_plan', label: '去学习' }],
          }]
        case '报告':
          return [{
            artifact_id: 'mock_artifact_report', kind: 'career_report', status: 'completed', title: 'Java 后端职业发展报告',
            summary: '围绕岗位匹配、项目深度与本周行动生成的演示报告。',
            preview: {
              type: 'report_preview', chapters: ['岗位匹配摘要', '七维能力差距', '个性化成长计划', '关键技能要求'],
              markdown: '# 职业生涯发展报告\n\n**目标岗位**：Java 后端工程师    **数据范围**：演示对话\n\n## 岗位匹配摘要\n\n当前技能覆盖了 Java、Spring Boot 与 MySQL；项目深度仍需补强。\n\n## 七维能力差距\n\n优先改进项目经验、技术表达与系统设计。\n\n## 个性化成长计划\n\n第一阶段：深化一个后端项目并补充量化结果。\n第二阶段：实践 Redis 和消息队列，完成一次架构复盘。\n\n## 关键技能要求\n\n- Java 与 Spring Boot\n- MySQL 与 Redis\n- 消息队列与系统设计\n',
              word_count: 266,
            },
            actions: [{ id: 'open_report', label: '打开报告' }],
          }]
        default:
          return []
      }
    }

    function getAIResponse(input: string): {
      content: string
      thinking: string[]
      category: string
      toolCalls: AIToolCall[]
      artifacts: ArtifactRef[]
    } {
      const category = getAIResponseCategory(input)
      const responses = mockAIResponses[category] || mockAIResponses['默认']
      const content = category === '报告'
        ? '已整理一份 Java 后端职业发展报告演示稿，包含岗位匹配、能力差距、成长计划和关键技能。打开下方报告即可在平台报告编辑器中继续修改。'
        : responses[Math.floor(Math.random() * responses.length)]
      const thinkingPool = mockThinkingTemplates[category] || mockThinkingTemplates['默认']
      const thinking = thinkingPool[Math.floor(Math.random() * thinkingPool.length)]
      return { content, thinking, category, toolCalls: mockToolCallsForCategory(category), artifacts: mockArtifactsForCategory(category) }
    }

    function clearAIMessages(): void {
      aiMessages.value = [
        {
          id: 'ai_msg_init',
          role: 'assistant',
          content: '你好，我是职导星图助手。可以帮你分析职业方向、能力画像、岗位差距，并制定学习计划。\n\n先上传一份简历，或直接问：\n- 帮我分析适合的职业方向\n- 我和目标岗位差距有多大？\n- 现阶段我应该重点学什么？',
          timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
        },
      ]
    }

    // 可视化相关的actions
    function addLearningRecord(record: Omit<LearningRecord, 'id'>): LearningRecord {
      const newRecord: LearningRecord = {
        ...record,
        id: `learning_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      }
      
      learningHistory.value.push(newRecord)
      saveToStorage()
      
      return newRecord
    }

    function updateLearningRecord(id: string, updates: Partial<LearningRecord>): boolean {
      const index = learningHistory.value.findIndex(record => record.id === id)
      
      if (index !== -1) {
        learningHistory.value[index] = {
          ...learningHistory.value[index],
          ...updates
        }
        saveToStorage()
        return true
      }
      return false
    }

    function deleteLearningRecord(id: string): boolean {
      const index = learningHistory.value.findIndex(record => record.id === id)
      
      if (index !== -1) {
        learningHistory.value.splice(index, 1)
        saveToStorage()
        return true
      }
      return false
    }

    function updateFilters(newFilters: Partial<DataFilters>): void {
      filters.value = {
        ...filters.value,
        ...newFilters
      }
    }

    function resetFilters(): void {
      filters.value = {
        timeRange: 'month',
        dateRange: null,
        courseType: 'all',
        difficulty: 'all',
        viewMode: 'chart'
      }
    }

    function loadSampleData(): void {
      const sampleData: LearningRecord[] = []
      const courseTypes: LearningRecord['courseType'][] = ['programming', 'design', 'math', 'english', 'science']
      const difficulties: LearningRecord['difficulty'][] = ['beginner', 'intermediate', 'advanced', 'expert']
      const courseNames = {
        programming: ['Vue.js基础', 'React进阶', 'TypeScript实战', 'Node.js后端'],
        design: ['UI设计原理', 'Figma实战', '色彩理论', '用户体验设计'],
        math: ['高等数学', '线性代数', '概率统计', '离散数学'],
        english: ['商务英语', '口语训练', '写作技巧', '词汇扩展'],
        science: ['物理学', '化学基础', '生物学', '天文学']
      }

      // 生成最近30天的学习数据
      for (let i = 0; i < 50; i++) {
        const courseType = courseTypes[Math.floor(Math.random() * courseTypes.length)]
        const difficulty = difficulties[Math.floor(Math.random() * difficulties.length)]
        const courseList = courseNames[courseType]
        const courseName = courseList[Math.floor(Math.random() * courseList.length)]
        
        const date = new Date()
        date.setDate(date.getDate() - Math.floor(Math.random() * 30))
        
        sampleData.push({
          id: `sample_${i}`,
          userId: CURRENT_USER_ID,
          courseId: `course_${i}`,
          courseName,
          courseType,
          difficulty,
          studyTime: Math.floor(Math.random() * 120) + 30, // 30-150分钟
          completedAt: date.toISOString(),
          progress: Math.floor(Math.random() * 101),
          score: Math.floor(Math.random() * 30) + 70, // 70-100分
          notes: `学习笔记 ${i + 1}`
        })
      }

      learningHistory.value = sampleData
      saveToStorage()
    }

    function saveToStorage(): void {
      try {
        localStorage.setItem('learning_history', JSON.stringify(learningHistory.value))
      } catch (error) {
        console.error('保存学习数据失败:', error)
      }
    }

    function loadFromStorage(): void {
      try {
        const stored = localStorage.getItem('learning_history')
        if (stored) {
          learningHistory.value = JSON.parse(stored)
        } else {
          loadSampleData() // 没有数据时加载示例数据
        }
      } catch (error) {
        console.error('加载学习数据失败:', error)
        loadSampleData() // 加载失败时使用示例数据
      }
    }

    function clearData(): void {
      learningHistory.value = []
      localStorage.removeItem('learning_history')
    }

    function resolveUserId(): string {
      try {
        const userStore = useUserStore()
        return userStore.currentUser?.id || CURRENT_USER_ID
      } catch {
        return CURRENT_USER_ID
      }
    }

    async function loadFavoritesFromApi(userId?: string): Promise<void> {
      const uid = userId || resolveUserId()
      try {
        const [jobs, roles] = await Promise.all([
          listSavedJobs(uid),
          listTargetRoles(uid),
        ])
        // Empty is an authoritative server result too. In HTTP mode never let
        // starter fixtures/local state leak into a user's real collection.
        savedJobs.value = jobs
        targetRoles.value = roles
      } catch (e) {
        console.warn('[favorites] server read failed', e)
        if (getApiMode() === 'http') {
          // A failed real read is not evidence that the mock collection is real.
          savedJobs.value = []
          targetRoles.value = []
        }
      }
    }

    // 心仪岗位 actions
    function toggleSaveJob(job: SavedJob): void {
      const idx = savedJobs.value.findIndex(j => j.id === job.id)
      const uid = resolveUserId()
      if (idx === -1) {
        const next = { ...job, savedAt: new Date().toISOString().slice(0, 10) }
        savedJobs.value.unshift(next)
        createSavedJob(uid, next).catch(() => {})
      } else {
        savedJobs.value.splice(idx, 1)
        deleteSavedJob(job.id).catch(() => {})
      }
    }

    function removeSavedJob(jobId: string): void {
      const idx = savedJobs.value.findIndex(j => j.id === jobId)
      if (idx !== -1) savedJobs.value.splice(idx, 1)
      deleteSavedJob(jobId).catch(() => {})
    }

    function isJobSaved(jobId: string): boolean {
      return savedJobs.value.some(j => j.id === jobId)
    }

    // targetRoles actions — POST always uses role_name via favorites API
    function toggleTargetRole(role: string): void {
      const idx = targetRoles.value.findIndex(r => r.role === role)
      const uid = resolveUserId()
      if (idx === -1) {
        targetRoles.value.push({ role, savedAt: new Date().toISOString().slice(0, 10) })
        addTargetRole(uid, role).catch(() => {})
      } else {
        targetRoles.value.splice(idx, 1)
        deleteTargetRole(uid, role).catch(() => {})
      }
    }

    function isTargetRole(role: string): boolean {
      return targetRoles.value.some(r => r.role === role)
    }

    /**
     * Freeform chat via agent API.
     * - mock：本地回复 + 独白模板 + 模拟工具卡
     * - http：真引擎；thinking 只用后端 thinking_steps（Claude/Qoder 风格推演），不回落假模板
     */
    async function getAIResponseFromApi(
      input: string,
      opts?: {
        interactionMode?: 'ask' | 'agent' | 'experts'
        planMode?: boolean
        attachmentIds?: string[]
        voiceTurnId?: string
        contentParts?: Array<Record<string, unknown>>
      },
    ): Promise<{
      content: string
      thinking: string[]
      category: string
      toolCalls: AIToolCall[]
      elapsedSeconds?: number
      engine?: string
      activeSubagent?: string
      sessionId?: string
      interactionMode?: string
      upgradeHint?: { to: string; reason?: string }
      parts?: MessagePart[]
      artifacts?: ArtifactRef[]
      turnId?: string
      outcome?: TurnOutcome
      sessionTitle?: string
      sessionSummary?: string
      fromApi: boolean
    }> {
      const local = getAIResponse(input)
      const { getApiMode } = await import('@/api/config')
      if (getApiMode() !== 'http') {
        return { ...local, fromApi: false }
      }

      const studentId = resolveUserId()
      await ensureSession(studentId)
      const interactionMode = opts?.interactionMode ?? 'ask'
      const data = await agentChat({
        message: input,
        student_id: studentId,
        session_id: getAgentSessionId(),
        mode: 'supervisor',
        interaction_mode: interactionMode,
        plan_mode: opts?.planMode === true,
        attachment_ids: opts?.attachmentIds,
        voice_turn_id: opts?.voiceTurnId,
        content_parts: opts?.contentParts,
      })

      const remoteTools = mapAgentToolCalls(data?.tool_calls)
      const sub = data?.active_subagent
        || data?.orchestration?.active_subagent
        || ''
      const elapsedRaw = typeof data?.elapsed_seconds === 'number' ? data.elapsed_seconds : undefined
      const elapsed = elapsedRaw != null ? Math.max(1, Math.round(elapsedRaw)) : undefined
      const imode = data?.interaction_mode || interactionMode
      const orchSteps = data?.orchestration && Array.isArray((data.orchestration as { thinking_steps?: unknown }).thinking_steps)
        ? (data.orchestration as { thinking_steps: unknown[] }).thinking_steps
        : []
      const thinking = (Array.isArray(data?.thinking_steps) ? data.thinking_steps : orchSteps)
        .map(s => String(s || '').trim())
        .filter(Boolean)
      const denials = data?.permission_denials
        || data?.orchestration?.permission_denials
        || []
      if (Array.isArray(denials) && denials.length) {
        thinking.push(
          `权限层拦截：${String(denials[0]?.reason || denials[0]?.tool || '部分工具调用被拒绝').slice(0, 120)}`,
        )
      }
      const upgradeHint = data?.upgrade_hint || data?.orchestration?.upgrade_hint

      return {
        content: data?.reply || '（模型未返回内容）',
        thinking,
        category: local.category,
        toolCalls: remoteTools,
        elapsedSeconds: elapsed,
        engine: data?.engine,
        activeSubagent: sub || undefined,
        sessionId: data?.session_id || getAgentSessionId() || undefined,
        interactionMode: imode,
        upgradeHint: upgradeHint || undefined,
        parts: publicTurnToMessageParts(data),
        artifacts: data?.artifacts || [],
        turnId: data?.turn_id,
        outcome: data?.outcome,
        sessionTitle: data?.session_title || undefined,
        sessionSummary: data?.session_summary || undefined,
        fromApi: true,
      }
    }

    async function startAgentSession(): Promise<string | null> {
      try {
        clearAgentSessionId()
        const created = await createAgentSession(resolveUserId())
        return created.session_id || null
      } catch (e) {
        console.warn('[agent] createSession failed', e)
        clearAgentSessionId()
        return null
      }
    }

    function resetAgentSession(): void {
      clearAgentSessionId()
    }

    return {
      // 原有状态
      notes,
      wrongQuestions,
      quizRecords,
      aiMessages,
      noteFavorites,
      savedJobs,
      targetRoles,
      weakSkillTags,
      
      // 可视化相关状态
      learningHistory,
      filters,
      loading,
      cache,
      
      // 原有getters
      getUserNotes,
      getUserWrongQuestions,
      getUserQuizRecords,
      getNotesByCourse,
      isNoteFavorite,
      getFavoriteNotes,
      getNotesByTag,
      getKnowledgePoints,
      
      // 可视化相关getters
      filteredLearningHistory,
      statistics,
      progressData,
      timelineData,
      timeDistribution,
      
      // 原有actions
      addNote,
      updateNote,
      deleteNote,
      toggleNoteFavorite,
      addWrongQuestion,
      removeWrongQuestion,
      addQuizRecord,
      addAIMessage,
      getAIResponse,
      getAIResponseFromApi,
      startAgentSession,
      resetAgentSession,
      loadFavoritesFromApi,
      clearAIMessages,
      
      // 心仪岗位 actions
      toggleSaveJob,
      removeSavedJob,
      isJobSaved,

      // 职业方向 actions
      toggleTargetRole,
      isTargetRole,

      // 可视化相关actions
      addLearningRecord,
      updateLearningRecord,
      deleteLearningRecord,
      updateFilters,
      resetFilters,
      loadSampleData,
      saveToStorage,
      loadFromStorage,
      clearData,
    }
  },
  {
    persist: {
      key: 'learning-store',
      storage: localStorage,
      // aiMessages 已迁到 agentChat 按 session 隔离，不再持久化全局胶带
      pick: ['notes', 'wrongQuestions', 'quizRecords', 'noteFavorites', 'learningHistory', 'targetRoles'],
    },
  },
)
