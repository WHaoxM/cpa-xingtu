import { getApiMode } from './config'
import { mockGet, mockMutate } from './adapters/mockAdapter'
import { httpGet, httpPost } from './adapters/httpAdapter'

export async function listCourses(params?: { category?: string; limit?: number; offset?: number }) {
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
  user_id: string
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
