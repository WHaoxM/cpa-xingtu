// @ts-nocheck
import type {
  User,
  Course,
  Chapter,
  Question,
  Note,
  WrongQuestion,
  QuizRecord,
  LearningProgress,
  Category,
  ClassData,
  AIMessage,
  ReportRecord,
} from '@/types'
import { UserRole, QuestionType } from '@/types'

// 当前登录用户ID（模拟）
export const CURRENT_USER_ID = 'student_001'

// 用户数据
export const mockUsers: User[] = [
  {
    id: 'student_001',
    username: 'student001',
    name: '钟同学',
    email: 'student001@example.com',
    avatar: 'https://cube.elemecdn.com/3/7c/3ea6beec64369c2642b92c6726f1epng.png',
    role: UserRole.STUDENT,
    createdAt: '2024-01-15',
    status: 'active',
    classId: 'class_001',
    phone: '13800138001',
  },
  {
    id: 'student_002',
    username: 'student002',
    name: '李同学',
    email: 'student002@example.com',
    avatar: 'https://cube.elemecdn.com/3/7c/3ea6beec64369c2642b92c6726f1epng.png',
    role: UserRole.STUDENT,
    createdAt: '2024-01-15',
    status: 'active',
    classId: 'class_001',
  },
  {
    id: 'student_003',
    username: 'student003',
    name: '王同学',
    email: 'student003@example.com',
    avatar: 'https://cube.elemecdn.com/3/7c/3ea6beec64369c2642b92c6726f1epng.png',
    role: UserRole.STUDENT,
    createdAt: '2024-01-15',
    status: 'active',
    classId: 'class_001',
  },
  {
    id: 'admin_001',
    username: 'admin001',
    name: '管理员',
    email: 'admin001@example.com',
    avatar: 'https://cube.elemecdn.com/3/7c/3ea6beec64369c2642b92c6726f1epng.png',
    role: UserRole.ADMIN,
    createdAt: '2023-08-01',
    status: 'active',
    phone: '13700137001',
  },
]

// 分类数据
export const mockCategories: Category[] = [
  { id: 'cat_001', name: '前端开发', icon: 'Monitor' },
  { id: 'cat_002', name: '后端开发', icon: 'Server' },
  { id: 'cat_003', name: '人工智能', icon: 'Cpu' },
  { id: 'cat_004', name: '数据库', icon: 'Coin' },
  { id: 'cat_005', name: '云计算', icon: 'Cloud' },
]

// 章节数据
export const mockChapters: Chapter[] = [
  { id: 'ch_001', title: '课程介绍与环境搭建', duration: 15, videoUrl: 'https://example.com/video1.mp4', order: 1 },
  { id: 'ch_002', title: 'Vue 3 基础语法', duration: 45, videoUrl: 'https://example.com/video2.mp4', order: 2 },
  { id: 'ch_003', title: 'Composition API 详解', duration: 60, videoUrl: 'https://example.com/video3.mp4', order: 3 },
  { id: 'ch_004', title: '组件通信与状态管理', duration: 50, videoUrl: 'https://example.com/video4.mp4', order: 4 },
  { id: 'ch_005', title: '路由与导航', duration: 40, videoUrl: 'https://example.com/video5.mp4', order: 5 },
  { id: 'ch_006', title: '项目实战', duration: 90, videoUrl: 'https://example.com/video6.mp4', order: 6 },
]

// 课程数据
export const mockCourses: Course[] = [
  {
    id: 'course_001',
    title: 'Vue 3 前端开发实战',
    description: '从零开始学习 Vue 3，掌握现代前端开发技术栈，包括 Composition API、Pinia、Vue Router 等核心技术。',
    skillTags: ['专业技能', '学习能力'],
    externalUrl: 'https://www.bilibili.com/video/BV1Zy4y1K7SH/',
    cover: 'https://picsum.photos/400/300?random=1',
    categoryId: 'cat_001',
    teacherId: 'teacher_001',
    teacherName: '刘老师',
    chapters: mockChapters,
    status: 'published',
    createdAt: '2024-01-10',
    updatedAt: '2024-02-01',
    totalDuration: 300,
    studentCount: 128,
    rating: 4.8,
  },
  {
    id: 'course_002',
    title: 'TypeScript 进阶开发',
    description: '深入学习 TypeScript 高级特性，掌握类型体操、泛型编程等进阶技术。',
    skillTags: ['专业技能', '创新能力'],
    externalUrl: 'https://www.bilibili.com/video/BV1Xy4y1v7S2/',
    cover: 'https://picsum.photos/400/300?random=2',
    categoryId: 'cat_001',
    teacherId: 'teacher_001',
    teacherName: '刘老师',
    chapters: [
      { id: 'ch_101', title: 'TS 基础回顾', duration: 30, order: 1 },
      { id: 'ch_102', title: '高级类型', duration: 45, order: 2 },
      { id: 'ch_103', title: '泛型编程', duration: 60, order: 3 },
      { id: 'ch_104', title: '类型体操', duration: 50, order: 4 },
    ],
    status: 'published',
    createdAt: '2024-01-15',
    updatedAt: '2024-02-05',
    totalDuration: 185,
    studentCount: 85,
    rating: 4.7,
  },
  {
    id: 'course_003',
    title: 'Node.js 后端开发',
    description: '学习 Node.js 服务端开发，掌握 Express、Koa 等主流框架。',
    skillTags: ['专业技能', '实习能力'],
    externalUrl: 'https://www.bilibili.com/video/BV1a34y167AZ/',
    cover: 'https://picsum.photos/400/300?random=3',
    categoryId: 'cat_002',
    teacherId: 'teacher_001',
    teacherName: '刘老师',
    chapters: [
      { id: 'ch_201', title: 'Node.js 基础', duration: 40, order: 1 },
      { id: 'ch_202', title: 'Express 框架', duration: 50, order: 2 },
      { id: 'ch_203', title: '数据库操作', duration: 60, order: 3 },
      { id: 'ch_204', title: 'API 设计', duration: 45, order: 4 },
    ],
    status: 'published',
    createdAt: '2024-01-20',
    updatedAt: '2024-02-10',
    totalDuration: 195,
    studentCount: 96,
    rating: 4.6,
  },
  {
    id: 'course_004',
    title: 'Python 人工智能入门',
    description: '从零开始学习 Python 和人工智能基础，包括机器学习算法和深度学习框架。',
    skillTags: ['专业技能', '创新能力', '学习能力'],
    externalUrl: 'https://www.bilibili.com/video/BV1Fzszz4Ek7/',
    cover: 'https://picsum.photos/400/300?random=4',
    categoryId: 'cat_003',
    teacherId: 'teacher_001',
    teacherName: '刘老师',
    chapters: [
      { id: 'ch_301', title: 'Python 基础', duration: 50, order: 1 },
      { id: 'ch_302', title: 'NumPy 与 Pandas', duration: 45, order: 2 },
      { id: 'ch_303', title: '机器学习算法', duration: 70, order: 3 },
      { id: 'ch_304', title: '深度学习入门', duration: 80, order: 4 },
    ],
    status: 'under_review',
    createdAt: '2024-02-01',
    updatedAt: '2024-02-10',
    totalDuration: 245,
    studentCount: 0,
    rating: 0,
  },
  {
    id: 'course_005',
    title: 'MySQL 数据库设计与优化',
    description: '深入学习 MySQL 数据库设计、SQL 优化和高可用架构。',
    externalUrl: 'https://www.bilibili.com/video/BV1iF411z7Pu/',
    cover: 'https://picsum.photos/400/300?random=5',
    categoryId: 'cat_004',
    teacherId: 'teacher_001',
    teacherName: '刘老师',
    chapters: [
      { id: 'ch_401', title: 'SQL 基础', duration: 35, order: 1 },
      { id: 'ch_402', title: '数据库设计', duration: 45, order: 2 },
      { id: 'ch_403', title: '索引与优化', duration: 50, order: 3 },
      { id: 'ch_404', title: '事务与锁', duration: 40, order: 4 },
    ],
    status: 'published',
    createdAt: '2024-01-25',
    updatedAt: '2024-02-08',
    totalDuration: 170,
    studentCount: 72,
    rating: 4.5,
  },
]

// 题目数据
export const mockQuestions: Question[] = [
  {
    id: 'q_001',
    courseId: 'course_001',
    chapterId: 'ch_002',
    type: QuestionType.SINGLE_CHOICE,
    content: 'Vue 3 中引入的新的组合式 API 名称是什么？',
    options: ['Options API', 'Composition API', 'Class API', 'Functional API'],
    correctAnswer: 'Composition API',
    knowledgePoint: 'Vue3基础',
    difficulty: 'easy',
    score: 10,
  },
  {
    id: 'q_002',
    courseId: 'course_001',
    chapterId: 'ch_002',
    type: QuestionType.SINGLE_CHOICE,
    content: '以下哪个不是 Vue 3 的响应式 API？',
    options: ['ref()', 'reactive()', 'computed()', 'watchEffect()', 'setData()'],
    correctAnswer: 'setData()',
    knowledgePoint: 'Vue3基础',
    difficulty: 'easy',
    score: 10,
  },
  {
    id: 'q_003',
    courseId: 'course_001',
    chapterId: 'ch_003',
    type: QuestionType.FILL_BLANK,
    content: '在 Composition API 中，用于创建响应式引用对象的函数是 ____。',
    correctAnswer: 'ref',
    knowledgePoint: 'Composition API',
    difficulty: 'medium',
    score: 15,
  },
  {
    id: 'q_004',
    courseId: 'course_001',
    chapterId: 'ch_003',
    type: QuestionType.MULTIPLE_CHOICE,
    content: 'Vue 3 生命周期钩子有哪些？（多选）',
    options: ['onMounted', 'onUnmounted', 'onUpdated', 'beforeCreate', 'created'],
    correctAnswer: ['onMounted', 'onUnmounted', 'onUpdated'],
    knowledgePoint: '生命周期',
    difficulty: 'medium',
    score: 20,
  },
  {
    id: 'q_005',
    courseId: 'course_001',
    chapterId: 'ch_004',
    type: QuestionType.SINGLE_CHOICE,
    content: 'Pinia 中用于修改状态的推荐方式是什么？',
    options: ['直接修改', '通过 actions', '通过 mutations', '通过 computed'],
    correctAnswer: '通过 actions',
    knowledgePoint: 'Pinia状态管理',
    difficulty: 'medium',
    score: 15,
  },
  {
    id: 'q_006',
    courseId: 'course_001',
    chapterId: 'ch_005',
    type: QuestionType.SINGLE_CHOICE,
    content: 'Vue Router 4 中，路由守卫 beforeEnter 应该在哪个位置配置？',
    options: ['全局', '路由配置', '组件内', '以上都可以'],
    correctAnswer: '路由配置',
    knowledgePoint: 'Vue Router',
    difficulty: 'hard',
    score: 20,
  },
  {
    id: 'q_007',
    courseId: 'course_002',
    chapterId: 'ch_102',
    type: QuestionType.SINGLE_CHOICE,
    content: 'TypeScript 中，interface 和 type 的主要区别是什么？',
    options: ['interface 可以合并声明', 'type 可以合并声明', '没有区别', 'interface 性能更好'],
    correctAnswer: 'interface 可以合并声明',
    knowledgePoint: 'TS高级类型',
    difficulty: 'medium',
    score: 15,
  },
  {
    id: 'q_008',
    courseId: 'course_002',
    chapterId: 'ch_103',
    type: QuestionType.FILL_BLANK,
    content: 'TypeScript 中泛型使用 ____ 符号定义。',
    correctAnswer: '<>',
    knowledgePoint: '泛型',
    difficulty: 'easy',
    score: 10,
  },
]

// 学习进度数据
export const mockLearningProgress: LearningProgress[] = [
  { userId: 'student_001', courseId: 'course_001', chapterId: 'ch_001', progress: 100, lastPosition: 900, completed: true, updatedAt: '2024-02-10 10:00' },
  { userId: 'student_001', courseId: 'course_001', chapterId: 'ch_002', progress: 85, lastPosition: 2295, completed: false, updatedAt: '2024-02-10 14:30' },
  { userId: 'student_001', courseId: 'course_001', chapterId: 'ch_003', progress: 45, lastPosition: 1620, completed: false, updatedAt: '2024-02-09 16:00' },
  { userId: 'student_001', courseId: 'course_002', chapterId: 'ch_101', progress: 100, lastPosition: 1800, completed: true, updatedAt: '2024-02-08 09:00' },
  { userId: 'student_001', courseId: 'course_002', chapterId: 'ch_102', progress: 60, lastPosition: 1620, completed: false, updatedAt: '2024-02-10 11:00' },
  { userId: 'student_002', courseId: 'course_001', chapterId: 'ch_001', progress: 100, lastPosition: 900, completed: true, updatedAt: '2024-02-10 09:00' },
  { userId: 'student_002', courseId: 'course_001', chapterId: 'ch_002', progress: 100, lastPosition: 2700, completed: true, updatedAt: '2024-02-10 15:00' },
  { userId: 'student_002', courseId: 'course_001', chapterId: 'ch_003', progress: 30, lastPosition: 1080, completed: false, updatedAt: '2024-02-09 14:00' },
  { userId: 'student_003', courseId: 'course_001', chapterId: 'ch_001', progress: 100, lastPosition: 900, completed: true, updatedAt: '2024-02-10 08:00' },
  { userId: 'student_003', courseId: 'course_001', chapterId: 'ch_002', progress: 20, lastPosition: 540, completed: false, updatedAt: '2024-02-10 10:00' },
]

// 测验记录
export const mockQuizRecords: QuizRecord[] = [
  {
    id: 'quiz_001',
    userId: 'student_001',
    courseId: 'course_001',
    chapterId: 'ch_002',
    score: 75,
    totalScore: 100,
    answers: { q_001: 'Composition API', q_002: 'setData()' },
    correctAnswers: { q_001: true, q_002: true, q_003: false, q_004: false },
    duration: 15,
    completedAt: '2024-02-10 15:00',
  },
  {
    id: 'quiz_002',
    userId: 'student_001',
    courseId: 'course_002',
    chapterId: 'ch_101',
    score: 90,
    totalScore: 100,
    answers: { q_007: 'interface 可以合并声明', q_008: '<>' },
    correctAnswers: { q_007: true, q_008: true },
    duration: 12,
    completedAt: '2024-02-08 10:00',
  },
  {
    id: 'quiz_003',
    userId: 'student_002',
    courseId: 'course_001',
    chapterId: 'ch_002',
    score: 85,
    totalScore: 100,
    answers: { q_001: 'Composition API', q_002: 'setData()' },
    correctAnswers: { q_001: true, q_002: true, q_003: false, q_004: false },
    duration: 18,
    completedAt: '2024-02-10 16:00',
  },
  {
    id: 'quiz_004',
    userId: 'student_003',
    courseId: 'course_001',
    chapterId: 'ch_002',
    score: 60,
    totalScore: 100,
    answers: { q_001: 'Composition API', q_002: 'computed()' },
    correctAnswers: { q_001: true, q_002: false, q_003: false, q_004: false },
    duration: 20,
    completedAt: '2024-02-10 11:00',
  },
]

// 错题数据
export const mockWrongQuestions: WrongQuestion[] = [
  {
    id: 'wq_001',
    userId: 'student_001',
    questionId: 'q_003',
    question: mockQuestions.find(q => q.id === 'q_003')!,
    wrongAnswer: 'reactive',
    times: 2,
    lastWrongAt: '2024-02-10 15:00',
  },
  {
    id: 'wq_002',
    userId: 'student_001',
    questionId: 'q_004',
    question: mockQuestions.find(q => q.id === 'q_004')!,
    wrongAnswer: ['onMounted', 'onUnmounted'],
    times: 1,
    lastWrongAt: '2024-02-10 15:00',
  },
  {
    id: 'wq_003',
    userId: 'student_003',
    questionId: 'q_002',
    question: mockQuestions.find(q => q.id === 'q_002')!,
    wrongAnswer: 'computed()',
    times: 1,
    lastWrongAt: '2024-02-10 11:00',
  },
]

// 笔记数据（职涯笔记：记录职业探索与规划思考）
export const mockNotes: Note[] = [
  {
    id: 'note_001',
    userId: 'student_001',
    courseId: 'career',
    chapterId: '',
    title: '前端行业调研笔记',
    content: '<p>调研了前端开发岗位现状：</p><ul><li>需求量大，但内卷严重，需要差异化竞争力</li><li>Vue/React 二选一，公司偏好差异明显</li><li>大厂更注重工程化能力和性能优化经验</li><li>中小厂更注重独立完成业务的能力</li></ul><p>结论：要在掌握框架基础的同时，补强工程化和系统设计能力。</p>',
    tags: ['行业调研'],
    isFavorite: true,
    createdAt: '2024-02-10 10:30',
    updatedAt: '2024-02-10 10:30',
  },
  {
    id: 'note_002',
    userId: 'student_001',
    courseId: 'career',
    chapterId: '',
    title: '我的职业兴趣自测',
    content: '<p>用 MBTI + 霍兰德模型做了自我测评：</p><ul><li>偏好有创造性、有技术含量的工作</li><li>不喜欢纯重复性操作，喜欢解决问题</li><li>沟通能力一般，但逻辑思维较强</li></ul><p>适合方向：后端开发、数据分析、算法工程师。不太适合纯销售、客服类岗位。</p>',
    tags: ['自我探索'],
    isFavorite: false,
    createdAt: '2024-02-09 16:30',
    updatedAt: '2024-02-09 16:30',
  },
  {
    id: 'note_003',
    userId: 'student_001',
    courseId: 'career',
    chapterId: '',
    title: 'Python 学习路径规划',
    content: '<p>为了进入数据分析岗位，制定了以下学习计划：</p><ol><li><strong>第1个月</strong>：Python 基础 + Pandas 操作</li><li><strong>第2个月</strong>：SQL 进阶 + 数据可视化</li><li><strong>第3个月</strong>：机器学习基础 + 实际项目</li></ol><p>目标：3个月内具备参加数据分析实习的能力。</p>',
    tags: ['能力提升'],
    isFavorite: true,
    createdAt: '2024-02-08 14:00',
    updatedAt: '2024-02-08 14:00',
  },
  {
    id: 'note_004',
    userId: 'student_001',
    courseId: 'career',
    chapterId: '',
    title: '收到 Offer 对比记录',
    content: '<p>目前收到两个意向：</p><ul><li><strong>A公司（互联网）</strong>：15k，技术氛围好，但加班多</li><li><strong>B公司（国企）</strong>：10k，稳定，发展较慢</li></ul><p>综合考量：优先选A，获得更多成长机会，2年后再看。</p>',
    tags: ['offer对比'],
    isFavorite: false,
    createdAt: '2024-02-10 09:30',
    updatedAt: '2024-02-10 09:30',
  },
  {
    id: 'note_005',
    userId: 'student_001',
    courseId: 'career',
    chapterId: '',
    title: '字节跳动实习面试复盘',
    content: '<p>一面挂了，主要问题：</p><ul><li>算法题没做出来（手撕快排）</li><li>项目经验描述不够具体，STAR法则用得不好</li><li>CSS 布局基础薄弱</li></ul><p>下次改进：每天刷1道算法，用 STAR 重写项目描述，补 CSS 网格布局。</p>',
    tags: ['求职心得'],
    isFavorite: true,
    createdAt: '2024-02-07 20:00',
    updatedAt: '2024-02-07 20:00',
  },
]

// 班级数据
export const mockClasses: ClassData[] = [
  {
    id: 'class_001',
    name: '2024 前端开发班',
    studentCount: 3,
    courseIds: ['course_001', 'course_002'],
  },
]

// AI 预设回复（职业规划域；人设：计算机大三、目标后端，见 docs/frontend/cpa-xingtu/contracts/ai-assistant-materials.md）
export const mockAIResponses: Record<string, string[]> = {
  '方向': [
    '结合你的技能（Java、Spring Boot、MySQL、Redis）与在校经历，我筛出 3 个比较现实的起点，按匹配度排：\n\n1. **Java 后端开发工程师**（覆盖率 87%）——技能最对口，中厂校招门槛是「1–2 个可讲的完整项目 + 熟悉常用框架」\n2. **大数据开发工程师**（覆盖率 54%）——Java 底子可迁移，但缺 Hadoop/Spark 实栈，需 3–4 个月补\n3. **测试开发工程师**（覆盖率 46%）——需求量大、上手快，适合作为保底方向\n\n> 决定项不是技能数量，而是「项目深度 + 能否讲清技术选型」。二本背景进算法/大模型赛道当前很难，后端是更稳的起点。',
  ],
  '画像': [
    '你的四维画像如下：\n\n- **D1 基础要求 76**（良好）：学历、专业、证书等硬约束达标\n- **D2 职业技能 72**（良好）：Java、Spring Boot、MySQL、Redis 覆盖率够用\n- **D3 职业素养 58**（待提升）：项目/实习经历偏薄，沟通与复盘不足\n- **D4 发展潜力 48**（待提升）：竞赛、论文、开源等产出较少\n\n**决定项**：D4 发展潜力只有 48——你的项目都在简历上「出现」了，但没有一个是能撑住面试追问的完整作品。D3 素养（沟通/复盘）也拖后腿。\n\n先把一个项目做成「能讲 30 分钟」的深度，比再学两个框架更值。',
  ],
  '计划': [
    '本周（第 1 周）只做一件事：**把一个现有 Spring Boot 项目升级成「可讲 30 分钟」的作品**。\n\n1. **周一–周二**：梳理项目，明确 3 个技术难点（如缓存一致性、幂等设计）\n2. **周三–周四**：补上消息队列入门，给项目加一个异步场景\n3. **周五–周六**：写技术选型文档 + README，模拟一次 30 分钟面试讲解\n4. **周日**：自评复盘，标出讲不深的地方\n\n验收标准：能不看文档讲清「为什么用这个技术、不用另一个」。',
  ],
  '自评': [
    '按后端校招要求做了一次技能自评：\n\n- **Java / Spring Boot**：熟练（能独立写接口、做登录鉴权）\n- **MySQL**：熟练（索引、事务、慢查询基本能答）\n- **Redis**：入门（会用常用命令，缓存一致性讲不清）\n- **分布式 / 消息队列**：缺口（无实栈）\n\n> 结论：你处在一个「够用但不深」的档位。最值得投入的是把 Redis 场景讲透 + 补一个消息队列实战。',
  ],
  '导航': [
    '职导星图帮你把「简历 → 画像 → 匹配 → 计划 → 报告」走通，各模块分工：\n\n1. **职途导航**：上传简历 → 自动解析技能 → 推断方向 → 生成画像\n2. **职业分析**：看人岗匹配分、技能差距与晋升/转岗路径\n3. **人才画像**：四维能力画像 + 短板提示\n4. **学习中心**：按缺口推荐课程、管理学习进度\n5. **职业报告**：一键生成六章规划报告，可保存回看\n\n你可以先上传简历，或直接问「我和目标岗位差距有多大」。',
  ],
  '匹配': [
    '你与 **Java 后端开发工程师**（中厂校招）的匹配结果：\n\n- **匹配分**：76 / 100\n- **技能覆盖率**：72%（已具备 Java、Spring Boot、MySQL、Redis）\n- **硬约束**：通过（本科 / 计算机相关）\n- **缺失技能**：消息队列（Kafka/RabbitMQ）、分布式缓存一致性、系统设计基础\n\n> 最影响录用决策的是「有没有一个完整项目 + 消息队列实战」。这两项补上，匹配分会明显提升。',
  ],
  '建议': [
    '现阶段高杠杆动作就 3 件，别摊太开：\n\n1. **把项目做深**：一个能讲 30 分钟的 Spring Boot 作品 > 十个 demo\n2. **补消息队列实战**：用 RabbitMQ 给现有项目加一个异步/解耦场景\n3. **把 Redis 讲透**：缓存一致性、缓存穿透/击穿/雪崩是高频考点\n\n> 基于常见校招筛选经验：二本进后端，项目深度和实习经历比证书数量更决定结果。',
  ],
  '简历': [
    '这份简历结构是完整的（基本信息 / 教育 / 技能 / 项目），但有两个致命短板：\n\n1. **项目描述太薄**：只有「用了 Spring Boot + MySQL」，没有量化结果（QPS、响应时间、解决的问题）\n2. **没有技术难点**：面试官看不到你处理复杂问题的能力\n\n改进建议：\n- 每个项目补上「背景 → 难点 → 方案 → 结果」四段式\n- 技能部分按「熟练 / 熟悉 / 了解」分级，别全列「熟悉」\n- 补一段技术选型说明（为什么用 Redis 不用本地缓存）',
  ],
  '课程': [
    '针对你的缺口，推荐这个学习顺序：\n\n1. **Spring Boot 实战进阶**（加深：拦截器、事务、多数据源）\n2. **Redis 深入**（缓存一致性、穿透/击穿/雪崩）\n3. **消息队列入门**（RabbitMQ 基础 + 一个异步场景实战）\n4. **系统设计基础**（高并发、分布式基本概念）\n\n> 按 1→4 顺序，每门课配一个可验收的小练习。别同时开多条线。',
  ],
  '默认': [
    '收到。围绕「简历 → 画像 → 匹配 → 计划」都可以帮你分析。你可以试试：\n- 「帮我分析适合的职业方向」\n- 「我和目标岗位差距有多大？」\n- 「现阶段我应该重点学什么？」\n\n如果想基于你的简历回答，先在左侧上传一份简历。',
  ],
}

// AI 思考过程模板（Claude 式内部独白，展开后按段落展示；遵守 Honest Career Stance）
export const mockThinkingTemplates: Record<string, string[][]> = {
  '方向': [
    [
      '先看技能能对到什么方向：Java 栈最匹配后端，大数据/测试是迁移选项。',
      '校招语境下，决定项是项目深度与稀缺度，而不是技能数量。给出覆盖率作为依据。',
    ],
  ],
  '画像': [
    [
      '画像要回答「差在哪」：四维里 D4 潜力是决定项。',
      '不能面面俱到夸，点出最影响录用的那一个短板。',
    ],
  ],
  '计划': [
    [
      '计划要可验收：按周拆，每周一个产出。',
      '先做能立刻转化到简历/面试的动作，而不是再开新知识线。',
    ],
  ],
  '自评': [
    [
      '自评用档位而非分数堆砌：熟练/入门/缺口。',
      '结论收敛到一个最值得投入的点。',
    ],
  ],
  '导航': [
    [
      '导航要讲清模块如何串成链路，而不是列功能名。',
      '引导用户走「简历 → 画像 → 匹配」主路径。',
    ],
  ],
  '匹配': [
    [
      '匹配要给出分数来源：覆盖率 + 硬约束 + 缺失技能。',
      '重点是差距，不是分数本身。',
    ],
  ],
  '建议': [
    [
      '建议遵守诚实立场：先抓决定项（项目深度），再给可执行动作。',
      '控制在 2-4 条，避免清单过长。',
    ],
  ],
  '简历': [
    [
      '简历要看结构是否完整 + 项目是否可支撑面试追问。',
      '给出可操作的改进项，不空泛夸赞。',
    ],
  ],
  '课程': [
    [
      '课程按缺口排序，给先后顺序而不是全量清单。',
      '每门课配验收练习，避免只收藏不学。',
    ],
  ],
  '默认': [
    [
      '先确认用户意图，信息不足时给一个可用起点并引导上传简历。',
    ],
  ],
}

// AI 消息历史
export const mockAIMessages: AIMessage[] = [
  {
    id: 'ai_msg_001',
    role: 'assistant',
    content: '你好，我是职导星图助手。可以帮你分析职业方向、能力画像、岗位差距，并制定学习计划。\n\n先上传一份简历，或直接问：\n- 帮我分析适合的职业方向\n- 我和目标岗位差距有多大？\n- 现阶段我应该重点学什么？',
    timestamp: '2026-08-06 08:00',
  },
]

// 学习统计数据（用于图表）
export const mockStudyStats = {
  weeklyProgress: [
    { date: '周一', duration: 120, chapters: 2 },
    { date: '周二', duration: 90, chapters: 1 },
    { date: '周三', duration: 150, chapters: 3 },
    { date: '周四', duration: 60, chapters: 1 },
    { date: '周五', duration: 180, chapters: 4 },
    { date: '周六', duration: 240, chapters: 5 },
    { date: '周日', duration: 200, chapters: 4 },
  ],
  knowledgePoints: [
    { name: 'Vue3基础', score: 85 },
    { name: 'Composition API', score: 70 },
    { name: '生命周期', score: 60 },
    { name: 'Pinia状态管理', score: 75 },
    { name: 'Vue Router', score: 80 },
    { name: 'TypeScript', score: 90 },
  ],
  scoreHistory: [
    { date: '第1周', score: 75 },
    { date: '第2周', score: 82 },
    { date: '第3周', score: 78 },
    { date: '第4周', score: 88 },
    { date: '第5周', score: 92 },
  ],
  chapterProgress: [
    { name: '课程介绍', completed: 100, studying: 0, notStarted: 0 },
    { name: 'Vue3基础', completed: 85, studying: 15, notStarted: 0 },
    { name: 'Composition API', completed: 45, studying: 55, notStarted: 0 },
    { name: '状态管理', completed: 0, studying: 30, notStarted: 70 },
    { name: '路由导航', completed: 0, studying: 0, notStarted: 100 },
    { name: '项目实战', completed: 0, studying: 0, notStarted: 100 },
  ],
}

export const mockReportRecords: ReportRecord[] = [
  {
    id: 'report_portrait_001',
    type: 'portrait',
    createdAt: '2026-03-30',
    title: '个人能力画像（前端进阶）',
    snapshot: {
      predictedRole: '前端开发工程师',
      competitivenessScore: 84,
      completenessScore: 92,
      sevenDim: [
        { name: '基础知识', score: 86 },
        { name: '工程能力', score: 80 },
        { name: '框架掌握', score: 88 },
        { name: '算法思维', score: 72 },
        { name: '项目经验', score: 81 },
        { name: '沟通协作', score: 85 },
        { name: '学习效率', score: 90 },
      ],
      skillTags: [
        { name: 'Vue 3', weight: 0.92, category: '前端' },
        { name: 'TypeScript', weight: 0.88, category: '前端' },
        { name: '工程化', weight: 0.80, category: '前端' },
        { name: 'CSS / 动画', weight: 0.76, category: '前端' },
        { name: '算法', weight: 0.55, category: '通用' },
      ],
    },
  },
  {
    id: 'report_portrait_002',
    type: 'portrait',
    createdAt: '2026-03-24',
    title: '个人能力画像（全栈探索）',
    snapshot: {
      predictedRole: '全栈开发工程师',
      competitivenessScore: 76,
      completenessScore: 85,
      sevenDim: [
        { name: '基础知识', score: 78 },
        { name: '工程能力', score: 75 },
        { name: '框架掌握', score: 80 },
        { name: '算法思维', score: 66 },
        { name: '项目经验', score: 74 },
        { name: '沟通协作', score: 79 },
        { name: '学习效率', score: 82 },
      ],
      skillTags: [
        { name: 'Vue 3', weight: 0.82, category: '前端' },
        { name: 'Node.js', weight: 0.75, category: '后端' },
        { name: 'TypeScript', weight: 0.72, category: '前端' },
        { name: 'MySQL', weight: 0.60, category: '后端' },
        { name: '性能优化', weight: 0.48, category: '前端' },
      ],
    },
  },
  {
    id: 'report_portrait_003',
    type: 'portrait',
    createdAt: '2026-03-17',
    title: '个人能力画像（工程化方向）',
    snapshot: {
      predictedRole: '前端工程化开发',
      competitivenessScore: 69,
      completenessScore: 78,
      sevenDim: [
        { name: '基础知识', score: 72 },
        { name: '工程能力', score: 77 },
        { name: '框架掌握', score: 68 },
        { name: '算法思维', score: 60 },
        { name: '项目经验', score: 64 },
        { name: '沟通协作', score: 71 },
        { name: '学习效率', score: 74 },
      ],
      skillTags: [
        { name: 'Webpack / Vite', weight: 0.82, category: '前端' },
        { name: 'Git 协作', weight: 0.76, category: '通用' },
        { name: 'ESLint / 规范', weight: 0.70, category: '前端' },
        { name: 'CI/CD', weight: 0.52, category: '通用' },
        { name: '单元测试', weight: 0.44, category: '通用' },
      ],
    },
  },
  {
    id: 'report_portrait_004',
    type: 'portrait',
    createdAt: '2026-03-10',
    title: '个人能力画像（数据可视化）',
    snapshot: {
      predictedRole: '数据可视化开发',
      competitivenessScore: 63,
      completenessScore: 72,
      sevenDim: [
        { name: '基础知识', score: 64 },
        { name: '工程能力', score: 62 },
        { name: '框架掌握', score: 67 },
        { name: '算法思维', score: 58 },
        { name: '项目经验', score: 59 },
        { name: '沟通协作', score: 70 },
        { name: '学习效率', score: 68 },
      ],
      skillTags: [
        { name: 'D3.js', weight: 0.78, category: '可视化' },
        { name: 'ECharts', weight: 0.74, category: '可视化' },
        { name: 'JavaScript', weight: 0.68, category: '前端' },
        { name: 'Canvas / SVG', weight: 0.60, category: '可视化' },
        { name: 'Vue 3', weight: 0.50, category: '前端' },
      ],
    },
  },
  {
    id: 'report_portrait_005',
    type: 'portrait',
    createdAt: '2026-03-05',
    title: '个人能力画像（应届冲刺）',
    snapshot: {
      predictedRole: '初级前端开发',
      competitivenessScore: 58,
      completenessScore: 65,
      sevenDim: [
        { name: '基础知识', score: 60 },
        { name: '工程能力', score: 54 },
        { name: '框架掌握', score: 62 },
        { name: '算法思维', score: 50 },
        { name: '项目经验', score: 52 },
        { name: '沟通协作', score: 64 },
        { name: '学习效率', score: 66 },
      ],
      skillTags: [
        { name: 'HTML / CSS', weight: 0.72, category: '前端' },
        { name: 'JavaScript', weight: 0.65, category: '前端' },
        { name: 'Vue 基础', weight: 0.58, category: '前端' },
        { name: '数据结构', weight: 0.42, category: '通用' },
        { name: '项目实践', weight: 0.38, category: '通用' },
      ],
    },
  },
  {
    id: 'report_portrait_006',
    type: 'portrait',
    createdAt: '2026-02-27',
    title: '个人能力画像（基础回顾）',
    snapshot: {
      predictedRole: '前端实习生',
      competitivenessScore: 51,
      completenessScore: 58,
      sevenDim: [
        { name: '基础知识', score: 55 },
        { name: '工程能力', score: 48 },
        { name: '框架掌握', score: 53 },
        { name: '算法思维', score: 44 },
        { name: '项目经验', score: 46 },
        { name: '沟通协作', score: 58 },
        { name: '学习效率', score: 60 },
      ],
      skillTags: [
        { name: 'HTML / CSS', weight: 0.60, category: '前端' },
        { name: 'JavaScript 基础', weight: 0.52, category: '前端' },
        { name: 'Git 基础', weight: 0.45, category: '通用' },
        { name: 'Vue 入门', weight: 0.38, category: '前端' },
        { name: '算法基础', weight: 0.32, category: '通用' },
      ],
    },
  },
  {
    id: 'report_career_001',
    type: 'career',
    createdAt: '2026-03-29',
    title: '职业发展规划（前端主线）',
    snapshot: {
      topMatchScore: 82,
      targetRoles: ['前端开发工程师', '前端工程化开发', '可视化开发工程师'],
    },
  },
  {
    id: 'report_career_002',
    type: 'career',
    createdAt: '2026-03-22',
    title: '职业发展规划（产品技术复合）',
    snapshot: {
      topMatchScore: 74,
      targetRoles: ['前端开发工程师', '产品技术经理', '增长分析师'],
    },
  },
  {
    id: 'report_career_003',
    type: 'career',
    createdAt: '2026-03-15',
    title: '职业发展规划（全栈试探）',
    snapshot: {
      topMatchScore: 67,
      targetRoles: ['全栈开发工程师', 'Node.js 开发工程师', '平台研发工程师'],
    },
  },
  {
    id: 'report_career_004',
    type: 'career',
    createdAt: '2026-03-08',
    title: '职业发展规划（实习投递）',
    snapshot: {
      topMatchScore: 61,
      targetRoles: ['前端开发实习生', '测试开发实习生', '低代码平台运营'],
    },
  },
  {
    id: 'report_career_005',
    type: 'career',
    createdAt: '2026-03-01',
    title: '职业发展规划（能力补齐）',
    snapshot: {
      topMatchScore: 56,
      targetRoles: ['前端开发实习生', '数据分析助理', '技术支持工程师'],
    },
  },
]

// 管理员统计数据
export const mockAdminStats = {
  userDistribution: [
    { name: '学生', value: 320 },
    { name: '管理员', value: 5 },
  ],
  activityStats: {
    daily: [120, 135, 142, 128, 155, 180, 175],
    weekly: [680, 720, 750, 780, 820, 850, 880],
    monthly: [2800, 2950, 3100, 3250, 3400, 3550, 3800],
  },
  courseStats: [
    { category: '前端开发', count: 15, learners: 450 },
    { category: '后端开发', count: 12, learners: 320 },
    { category: '人工智能', count: 8, learners: 280 },
    { category: '数据库', count: 10, learners: 350 },
    { category: '云计算', count: 6, learners: 180 },
  ],
  pendingCourses: [
    { id: 'course_004', title: 'Python 人工智能入门', teacher: '刘老师', submitDate: '2024-02-10', status: 'pending' },
    { id: 'course_006', title: 'Docker 容器化部署', teacher: '王老师', submitDate: '2024-02-09', status: 'pending' },
    { id: 'course_007', title: 'React 高级进阶', teacher: '李老师', submitDate: '2024-02-08', status: 'pending' },
  ],
}

// 获取当前用户
export function getCurrentUser(role?: UserRole): User {
  if (role) {
    return mockUsers.find(u => u.role === role) || mockUsers[0]
  }
  return mockUsers.find(u => u.id === CURRENT_USER_ID) || mockUsers[0]
}

// 根据ID获取课程
export function getCourseById(id: string): Course | undefined {
  return mockCourses.find(c => c.id === id)
}

// 获取用户学习进度
export function getUserProgress(userId: string): LearningProgress[] {
  return mockLearningProgress.filter(p => p.userId === userId)
}

// 心仪岗位数据（学生收藏的目标岗位）
// TODO: API — GET /api/saved-jobs?userId=xxx
export const mockSavedJobs: import('@/types').SavedJob[] = [
  {
    id: 'sj_001',
    jobTitle: '前端开发工程师',
    company: '字节跳动',
    industry: '互联网',
    salary: '15k-25k',
    location: '北京',
    matchScore: 78,
    requiredSkills: ['Vue/React', 'TypeScript', '工程化', '性能优化'],
    savedAt: '2024-02-10',
    notes: '技术氛围好，面试难度高，需加强算法',
  },
  {
    id: 'sj_002',
    jobTitle: '后端开发工程师',
    company: '腾讯',
    industry: '互联网',
    salary: '15k-22k',
    location: '深圳',
    matchScore: 65,
    requiredSkills: ['Java/Go', '分布式系统', 'MySQL', 'Redis'],
    savedAt: '2024-02-09',
  },
  {
    id: 'sj_003',
    jobTitle: '数据分析师',
    company: '阿里巴巴',
    industry: '电子商务',
    salary: '12k-20k',
    location: '杭州',
    matchScore: 82,
    requiredSkills: ['Python', 'SQL', '数据可视化', '统计分析'],
    savedAt: '2024-02-08',
    notes: '匹配度较高，优先投递',
  },
  {
    id: 'sj_004',
    jobTitle: '产品经理（技术方向）',
    company: '美团',
    industry: '本地生活',
    salary: '15k-22k',
    location: '北京',
    matchScore: 54,
    requiredSkills: ['需求分析', '用户研究', '数据分析', '项目管理'],
    savedAt: '2024-02-07',
  },
  {
    id: 'sj_005',
    jobTitle: '测试开发工程师',
    company: '华为',
    industry: '硬件/通信',
    salary: '12k-18k',
    location: '深圳',
    matchScore: 71,
    requiredSkills: ['Python自动化', '测试框架', 'Linux', 'CI/CD'],
    savedAt: '2024-02-06',
  },
  {
    id: 'sj_006',
    jobTitle: 'AI算法工程师（应届）',
    company: '百度',
    industry: '人工智能',
    salary: '18k-28k',
    location: '北京',
    matchScore: 43,
    requiredSkills: ['深度学习', 'PyTorch', '机器学习', '数学基础'],
    savedAt: '2024-02-05',
    notes: '当前匹配度低，需要1年提升',
  },
]

export const mockTargetRoleMarkets: import('@/types').TargetRoleMarket[] = [
  {
    role: '前端开发',
    salaryRange: '12K-24K',
    medianSalary: 18,
    demandLevel: '需求稳定，校招与实习岗位充足',
    hotCities: ['上海', '杭州', '深圳', '北京'],
    industries: ['互联网', '企业服务', '新消费'],
    skillTags: ['Vue 3', 'React', 'TypeScript', '工程化', '性能优化', '组件库', '可视化'],
    sampleJobs: ['Vue 前端工程师', 'React 前端工程师', '可视化工程师'],
    trendNote: '企业更看重组件抽象、工程规范和跨端协作能力。',
    referenceMatch: 78,
  },
  {
    role: '后端开发',
    salaryRange: '14K-26K',
    medianSalary: 20,
    demandLevel: '中大型团队需求持续，服务治理能力加分明显',
    hotCities: ['北京', '深圳', '杭州', '成都'],
    industries: ['互联网', '金融科技', '企业平台'],
    skillTags: ['Java', 'Spring Boot', 'MySQL', 'Redis', '消息队列', 'Docker', '服务治理'],
    sampleJobs: ['Java 后端工程师', 'Go 后端工程师', 'Python 后端工程师'],
    trendNote: '分布式、缓存与接口稳定性仍是校招和社招的高频考点。',
    referenceMatch: 69,
  },
  {
    role: '测试开发',
    salaryRange: '11K-20K',
    medianSalary: 16,
    demandLevel: '质量工程岗位增多，自动化与接口测试权重提升',
    hotCities: ['深圳', '上海', '苏州', '北京'],
    industries: ['互联网', '智能硬件', '游戏'],
    skillTags: ['Python 自动化', 'Playwright', '接口测试', '测试用例设计', 'CI/CD', '质量体系', '缺陷分析'],
    sampleJobs: ['自动化测试工程师', '质量平台工程师', '性能测试工程师'],
    trendNote: '从手工测试转向自动化与质量平台建设是明显趋势。',
    referenceMatch: 72,
  },
  {
    role: '数据分析',
    salaryRange: '12K-22K',
    medianSalary: 17,
    demandLevel: '数据驱动岗位稳定增长，业务理解能力很关键',
    hotCities: ['杭州', '上海', '北京', '广州'],
    industries: ['电商', '本地生活', '内容平台'],
    skillTags: ['Python', 'SQL', '统计分析', 'BI 工具', '指标体系', 'A/B 测试', '数据清洗'],
    sampleJobs: ['商业数据分析师', '数据开发工程师', '增长分析师'],
    trendNote: '能把分析结果转化为业务建议，比单纯会出图更有竞争力。',
    referenceMatch: 82,
  },
  {
    role: '机器学习工程师',
    salaryRange: '18K-32K',
    medianSalary: 24,
    demandLevel: '高薪但门槛较高，算法基础与工程落地能力并重',
    hotCities: ['北京', '上海', '深圳', '杭州'],
    industries: ['人工智能', '自动驾驶', '医疗科技'],
    skillTags: ['Python', '机器学习', 'PyTorch', '特征工程', '模型部署', '数据处理', 'MLOps'],
    sampleJobs: ['算法工程师', '深度学习工程师', 'AI 应用工程师'],
    trendNote: '企业越来越关注模型上线、评估与业务闭环，而不只看算法竞赛经历。',
    referenceMatch: 58,
  },
]

// 获取用户笔记
export function getUserNotes(userId: string): Note[] {
  return mockNotes.filter(n => n.userId === userId)
}

// 获取用户错题
export function getUserWrongQuestions(userId: string): WrongQuestion[] {
  return mockWrongQuestions.filter(wq => wq.userId === userId)
}

// 获取班级学生
export function getClassStudents(classId: string): User[] {
  return mockUsers.filter(u => u.classId === classId && u.role === UserRole.STUDENT)
}

// 获取课程的测验题目
export function getQuestionsByChapter(chapterId: string): Question[] {
  return mockQuestions.filter(q => q.chapterId === chapterId)
}
