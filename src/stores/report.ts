import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ReportRecord } from '@/types'
import { createReport, deleteReport, getReportDetail, getReportList } from '@/api/report'

export const useReportStore = defineStore(
  'report',
  () => {
    const records = ref<ReportRecord[]>([])
    const mockInitialized = ref(false)

    const portraitRecords = computed(() =>
      records.value.filter(r => r.type === 'portrait').sort(
        (a, b) => b.createdAt.localeCompare(a.createdAt)
      )
    )

    const careerRecords = computed(() =>
      records.value.filter(r => r.type === 'career').sort(
        (a, b) => b.createdAt.localeCompare(a.createdAt)
      )
    )

    const latestPortrait = computed(() => portraitRecords.value[0] ?? null)
    const latestCareer = computed(() => careerRecords.value[0] ?? null)

    async function fetchReportList(userId?: string): Promise<void> {
      // mock / http：优先服务端或 fixture 列表；失败时保留本地持久化，避免 Pages 白屏
      try {
        const list = await getReportList(userId)
        if (list.length > 0) {
          records.value = list
        }
      } catch {
        /* keep persisted records */
      }
    }

    async function fetchReportDetailById(id: string): Promise<ReportRecord | null> {
      // [API] 后端接入点：点击书籍后按 id 拉取报告详情。
      const detail = await getReportDetail(id)
      if (detail) return detail
      return records.value.find(item => item.id === id) ?? null
    }

    function addRecord(r: Omit<ReportRecord, 'id' | 'createdAt'>): ReportRecord {
      // [API] 后端接入点：同步调用 createReport(r)，以服务端返回的 id/createdAt 为准。
      const record: ReportRecord = {
        ...r,
        id: `report_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        createdAt: new Date().toISOString().slice(0, 10),
      }
      records.value.unshift(record)

      createReport(r).then(serverRecord => {
        const idx = records.value.findIndex(item => item.id === record.id)
        if (idx !== -1) records.value[idx] = serverRecord
      }).catch(() => {
      })

      return record
    }

    function removeRecord(id: string): void {
      // [API] 后端接入点：调用 deleteReport(id) 同步删除，失败时回滚本地状态。
      const idx = records.value.findIndex(r => r.id === id)
      if (idx === -1) return

      const snapshot = records.value[idx]
      if (!snapshot) return
      records.value.splice(idx, 1)
      deleteReport(id).catch(() => {
        records.value.splice(idx, 0, snapshot)
      })
    }

    return {
      records,
      mockInitialized,
      portraitRecords,
      careerRecords,
      latestPortrait,
      latestCareer,
      fetchReportList,
      fetchReportDetailById,
      addRecord,
      removeRecord,
    }
  },
  {
    persist: {
      key: 'report-store',
      storage: localStorage,
      pick: ['records', 'mockInitialized'],
    },
  },
)
