import { computed, onBeforeUnmount, reactive, watch } from 'vue'
import type { Router, RouteLocationNormalizedLoaded } from 'vue-router'
import type { ReportRecord } from '@/types'
import { getReportDetail, getReportShelfPage } from '@/api/report'
import { getStudentPortraitSnapshot, getStudentPortraitSnapshots } from '@/api/pipeline'
import type { PortraitSnapshot } from '@/api/pipeline'

export type ShelfKind = 'portrait' | 'career'
export type ShelfBook = ReportRecord & { source: 'portrait_snapshot' | 'career_report' }
export function snapshotBook(item: PortraitSnapshot): ShelfBook {
  return { id: item.snapshot_id, type: 'portrait', source: 'portrait_snapshot',
    portraitVersion: item.is_current ? 'current' : 'historical',
    title: `能力画像 · ${item.is_current ? '当前版本' : '历史版本'}`,
    createdAt: item.created_at, snapshot: item as unknown as Record<string, unknown> }
}
export function useReportBookshelves(owner: () => string, route: RouteLocationNormalizedLoaded, router: Router, enabled: boolean) {
  const shelves = reactive({
    portrait: { books: [] as ShelfBook[], total: 0, page: 1, limit: 12, loading: false, error: '' },
    career: { books: [] as ShelfBook[], total: 0, page: 1, limit: 12, loading: false, error: '' },
  })
  const detail = reactive({ book: null as ShelfBook | null, loading: false, error: '' })
  let alive = true, accountEpoch = 0, selectionEpoch = 0
  const listEpoch = { portrait: 0, career: 0 }
  const valid = (id: string, epoch: number) => alive && !!id && id === owner() && epoch === accountEpoch
  const selection = computed(() => {
    const { snapshot_id, report_id } = route.query
    if (snapshot_id === undefined && report_id === undefined) return null
    if ((snapshot_id !== undefined && report_id !== undefined) ||
      (snapshot_id !== undefined && (typeof snapshot_id !== 'string' || !/^ps_[0-9a-f]{32}$/.test(snapshot_id))) ||
      (report_id !== undefined && (typeof report_id !== 'string' || !report_id.trim() || report_id.length > 128))) {
      return { kind: 'career' as ShelfKind, id: '', invalid: true }
    }
    return { kind: snapshot_id !== undefined ? 'portrait' as const : 'career' as const,
      id: String(snapshot_id ?? report_id), invalid: false }
  })
  const overlayBook = computed<ShelfBook | null>(() => detail.book || (selection.value ? {
    id: selection.value.id, type: selection.value.kind,
    source: selection.value.kind === 'portrait' ? 'portrait_snapshot' : 'career_report',
    title: '正在打开报告', createdAt: '', snapshot: {},
  } : null))

  async function load(kind: ShelfKind) {
    if (!enabled || !owner()) return
    const shelf = shelves[kind], id = owner(), account = accountEpoch, epoch = ++listEpoch[kind]
    shelf.loading = true; shelf.error = ''; shelf.books = []
    try {
      const offset = (shelf.page - 1) * shelf.limit
      const response = kind === 'portrait'
        ? await getStudentPortraitSnapshots({ limit: shelf.limit, offset }) : null
      if (response && (!response.success || !response.data || !Array.isArray(response.data.items)
        || !Number.isSafeInteger(response.data.total))) throw Error('画像目录暂时无法读取')
      const data = response?.data
      const result = data ? { items: data.items.map(snapshotBook), total: data.total }
        : await getReportShelfPage(shelf.limit, offset).then(page => ({
          ...page, items: page.items.map(item => ({ ...item, source: 'career_report' as const })),
        }))
      if (!valid(id, account) || epoch !== listEpoch[kind]) return
      shelf.total = result.total
      if (offset >= result.total && shelf.page > 1) {
        shelf.page = Math.max(1, Math.ceil(result.total / shelf.limit))
        await load(kind); return
      }
      shelf.books = result.items
    } catch {
      if (valid(id, account) && epoch === listEpoch[kind]) shelf.error = '暂时无法读取这组报告，请重试。'
    } finally {
      if (valid(id, account) && epoch === listEpoch[kind]) shelf.loading = false
    }
  }
  async function readSelection() {
    const epoch = ++selectionEpoch, id = owner(), account = accountEpoch, selected = selection.value
    detail.book = null; detail.error = ''; detail.loading = false
    if (!enabled || !selected || !id) return
    if (selected.invalid) { detail.error = '报告链接无效，请返回书架重新选择。'; return }
    detail.loading = true
    try {
      let book: ShelfBook
      if (selected.kind === 'portrait') {
        const response = await getStudentPortraitSnapshot(selected.id)
        if (!response.success || response.data?.snapshot_id !== selected.id || !response.data.portrait) throw Error('unavailable')
        book = snapshotBook(response.data)
      } else {
        const response = await getReportDetail(selected.id)
        if (!response || response.id !== selected.id) throw Error('unavailable')
        book = { ...response, source: 'career_report' }
      }
      if (valid(id, account) && epoch === selectionEpoch) detail.book = book
    } catch (error) {
      if (valid(id, account) && epoch === selectionEpoch) {
        const status = (error as { status?: number })?.status
        detail.error = [403, 404, 409].includes(status || 0)
          ? '这份报告已不可用或来源有变化，请返回书架查看当前资料。'
          : '暂时无法打开这份报告，请重试。'
      }
    } finally {
      if (valid(id, account) && epoch === selectionEpoch) detail.loading = false
    }
  }
  function paginate(kind: ShelfKind, page: number) {
    const shelf = shelves[kind]
    if (shelf.loading || page < 1 || page > Math.max(1, Math.ceil(shelf.total / shelf.limit))) return
    shelf.page = page; void load(kind)
  }
  function capacity(kind: ShelfKind, count: number) {
    const shelf = shelves[kind], limit = Math.min(50, Math.max(1, count))
    if (shelf.limit === limit) return
    shelf.limit = limit; shelf.page = 1; void load(kind)
  }
  function open(book: ReportRecord) {
    if (!enabled || !alive || !owner()) return
    const query = { ...route.query }; delete query.report_id; delete query.snapshot_id
    query[book.type === 'portrait' ? 'snapshot_id' : 'report_id'] = book.id
    return router.push({ name: 'student-my-reports', query })
  }
  function close() {
    const query = { ...route.query }; delete query.report_id; delete query.snapshot_id
    ++selectionEpoch; detail.book = null; detail.loading = false; detail.error = ''
    return router.replace({ name: 'student-my-reports', query })
  }
  watch(owner, () => {
    ++accountEpoch; ++selectionEpoch
    for (const kind of ['portrait', 'career'] as const) {
      ++listEpoch[kind]; Object.assign(shelves[kind], { books: [], total: 0, page: 1, loading: false, error: '' })
      if (enabled && owner()) void load(kind)
    }
    detail.book = null; detail.error = ''; detail.loading = false
    if (enabled && owner()) void readSelection()
  }, { immediate: true, flush: 'sync' })
  watch(() => [route.query.report_id, route.query.snapshot_id], () => { void readSelection() }, { flush: 'sync' })
  onBeforeUnmount(() => { alive = false; ++accountEpoch; ++selectionEpoch })
  return { shelves, detail, selection, overlayBook, load, readSelection, paginate, capacity, open, close }
}
