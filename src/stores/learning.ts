// @ts-nocheck
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Note, WrongQuestion, QuizRecord, Question, AIMessage, AIToolCall, SavedJob, TargetRole } from '@/types'
import type { ArtifactRef, MessagePart } from '@/types'
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
      const lowerInput = input.toLowerCase()
      if (lowerInput.includes('解题') || lowerInput.includes('怎么做') || lowerInput.includes('答案')) return '解题指导'
      if (lowerInput.includes('薄弱') || lowerInput.includes('不足') || lowerInput.includes('差距') || lowerInput.includes('补齐') || lowerInput.includes('技能') || lowerInput.includes('方向')) return '能力补齐'
      if (lowerInput.includes('建议') || lowerInput.includes('怎么学') || lowerInput.includes('提高') || lowerInput.includes('推荐') || lowerInput.includes('项目') || lowerInput.includes('准备')) return '学习建议'
      if (lowerInput.includes('答疑') || lowerInput.includes('问题') || lowerInput.includes('课程') || lowerInput.includes('重点') || lowerInput.includes('梳理') || lowerInput.includes('概念')) return '课程答疑'
      return '默认'
    }

    function mockToolCallsForCategory(category: string): AIToolCall[] {
      if (category === '能力补齐') {
        return [
          { name: 'skill_gap_scan', status: 'done', summary: '已对比目标岗位与当前技能画像', args: { focus: '状态管理 / 路由权限' } },
          { name: 'learning_path_rank', status: 'done', summary: '按性价比排序补齐动作', args: { horizon: '2-4 周' } },
        ]
      }
      if (category === '学习建议') {
        return [
          { name: 'progress_read', status: 'done', summary: '读取近一周学习记录', args: { window: '7d' } },
          { name: 'path_suggest', status: 'done', summary: '生成分周学习路径' },
        ]
      }
      if (category === '课程答疑') {
        return [
          { name: 'kb_lookup', status: 'done', summary: '检索课程知识库相关条目', args: { domain: 'Vue 3' } },
        ]
      }
      return []
    }

    function getAIResponse(input: string): { content: string; thinking: string[]; category: string; toolCalls: AIToolCall[] } {
      const category = getAIResponseCategory(input)
      const responses = mockAIResponses[category] || mockAIResponses['默认']
      const content = responses[Math.floor(Math.random() * responses.length)]
      const thinkingPool = mockThinkingTemplates[category] || mockThinkingTemplates['默认']
      const thinking = thinkingPool[Math.floor(Math.random() * thinkingPool.length)]
      return { content, thinking, category, toolCalls: mockToolCallsForCategory(category) }
    }

    function clearAIMessages(): void {
      aiMessages.value = [
        {
          id: 'ai_msg_init',
          role: 'assistant',
          content: '你好。\n\n可以直接问我：\n- 课程重点与概念梳理\n- 解题思路与练习建议\n- 技能补齐顺序\n- 结合目标方向的下一步安排\n\n从下面任选一个话题开始，或直接输入你的问题。',
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
        if (jobs.length) savedJobs.value = jobs
        if (roles.length) targetRoles.value = roles
      } catch (e) {
        console.warn('[favorites] load failed, keeping local mock', e)
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
