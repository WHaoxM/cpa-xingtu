import { getApiMode } from './config'
import { mockGet, mockMutate } from './adapters/mockAdapter'
import { httpGet, httpPost } from './adapters/httpAdapter'

export async function listCourses(params?: { keyword?: string; category?: string; limit?: number; offset?: number }) {
  if (getApiMode() === 'mock') {
    return mockGet('learning/courses.list.json')
  }
  return httpGet('/api/learning/courses', params)
}

export async function getCourse(courseId: string) {
  if (getApiMode() === 'mock') {
    try {
      return await mockGet(`learning/courses.${courseId}.json`)
    } catch {
      // 缺详情 fixture 时从列表拼装，避免课程详情页空白
      const listEnv = await mockGet<{ courses?: Array<Record<string, unknown>> }>('learning/courses.list.json')
      const courses = (listEnv.data as { courses?: Array<Record<string, unknown>> } | undefined)?.courses ?? []
      const hit = courses.find(c => String(c.course_id ?? c.id) === courseId)
      if (hit) {
        return { success: true, data: hit }
      }
      throw new Error(`Mock course not found: ${courseId}`)
    }
  }
  return httpGet(`/api/learning/courses/${encodeURIComponent(courseId)}`)
}

export async function getProgress(userId: string) {
  if (getApiMode() === 'mock') {
    return mockGet('learning/progress.list.json')
  }
  return httpGet(`/api/learning/learning/progress/${encodeURIComponent(userId)}`)
}

export async function saveProgress(body: {
  user_id?: string
  course_id: string
  chapter_id: string
  progress: number
  completed?: boolean
}) {
  if (getApiMode() === 'mock') {
    return mockMutate('learning/progress.write.ok.json')
  }
  return httpPost('/api/learning/learning/progress', body)
}

// HTTP DTOs deliberately do not inherit the demo Course's invented defaults.
export interface LearningChapter {
  id: string | number
  course_id: string
  title: string
  sequence: number
  content_summary?: string | null
  video_url?: string | null
}
export interface LearningCourse {
  course_id: string
  title: string
  category?: string | null
  category_label?: string
  chapter_count?: number
  thumbnail_url?: string | null
  description?: string | null
  instructor?: string | null
  chapters?: LearningChapter[]
}
export interface CourseCategoryOption { value: string; label: string; course_count: number }
export interface CourseCatalogSummary { total: number; scope: 'all_courses' }
export interface ChapterRecord {
  user_id: string
  course_id: string
  chapter_id: string | number
  progress: number
  completed: boolean | number
}
export const readCourseCatalog = (params: {keyword?: string; category?: string; limit: number; offset: number}) =>
  httpGet<{courses: LearningCourse[]; count: number; total: number; categories: string[];
    category_options: CourseCategoryOption[]; catalog_summary: CourseCatalogSummary}>('/api/learning/courses', params)
export const readLearningCourse = (id: string) =>
  httpGet<LearningCourse>(`/api/learning/courses/${encodeURIComponent(id)}`)
export const readChapterRecords = (owner: string) =>
  httpGet<ChapterRecord[]>(`/api/learning/learning/progress/${encodeURIComponent(owner)}`)
