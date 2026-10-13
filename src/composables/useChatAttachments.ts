import { computed, onScopeDispose, ref } from 'vue'
import { getApiMode } from '@/api/config'
import { getAgentFile, getAgentFileEvents, uploadAgentFile, type AgentFileMeta } from '@/api/agentMedia'

export type ChatAttachmentStatus = 'reading' | 'ready' | 'error'

export type ChatAttachment = {
  id: string
  name: string
  size: number
  mime: string
  status: ChatAttachmentStatus
  excerpt: string
  /** Claude/Qoder file_id — never ship fullText in chat message */
  fileId?: string
  error?: string
}

const TEXT_EXTS = new Set(['txt', 'md', 'markdown', 'json', 'csv', 'log', 'yml', 'yaml'])
const PARSE_EXTS = new Set(['pdf', 'docx', 'doc', 'png', 'jpg', 'jpeg', 'bmp', 'webp', 'tiff'])
const EXCERPT_CHARS = 280

function extOf(name: string): string {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i + 1).toLowerCase() : ''
}

/**
 * Composer attachments: upload → file_id → mount on session.
 * Anti-pattern removed: dumping fullText into message string.
 */
export function useChatAttachments() {
  const attachments = ref<ChatAttachment[]>([])
  const busy = computed(() => attachments.value.some(a => a.status === 'reading'))
  let disposed = false
  onScopeDispose(() => { disposed = true })

  async function followIngest(row: ChatAttachment, fileId: string) {
    let cursor = 0
    let failures = 0
    while (!disposed && attachments.value.includes(row) && row.status === 'reading') {
      try {
        const replay = await getAgentFileEvents(fileId, cursor)
        cursor = replay.cursor
        failures = 0
        const state = replay.snapshot.status
        if (state === 'ready' || state === 'failed') {
          const meta = await getAgentFile(fileId)
          if (!meta) throw new Error('无法核验文件最终状态')
          if (!attachments.value.includes(row) || disposed) return
          if (meta.status === 'ready') {
            row.excerpt = (meta.excerpt || meta.filename || row.name).slice(0, EXCERPT_CHARS)
            row.status = 'ready'
            return
          }
          if (meta.status === 'failed') {
            row.error = meta.error || '文件解析失败，原文件已保留'
            row.status = 'error'
            return
          }
        }
        if (replay.has_more) continue
      } catch (error) {
        failures += 1
        if (failures >= 3) {
          row.error = error instanceof Error ? `状态同步失败：${error.message}` : '状态同步失败，请稍后重试'
          row.status = 'error' // UI sync failure, not a server-side ingest result.
          return
        }
      }
      await new Promise(resolve => setTimeout(resolve, 1500))
    }
  }

  async function addFiles(
    fileList: FileList | File[],
    opts?: { studentId?: string; sessionId?: string | null },
  ) {
    const files = Array.from(fileList)
    for (const file of files) {
      const id = `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      const row: ChatAttachment = {
        id,
        name: file.name,
        size: file.size,
        mime: file.type || 'application/octet-stream',
        status: 'reading',
        excerpt: '',
      }
      attachments.value.push(row)
      try {
        const ext = extOf(file.name)
        if (!TEXT_EXTS.has(ext) && !PARSE_EXTS.has(ext) && !file.type.startsWith('text/')) {
          throw new Error(`不支持的文件类型：.${ext || 'unknown'}`)
        }

        if (getApiMode() === 'mock') {
          row.fileId = `mock_${id}`
          row.excerpt = `【演示】已接收「${file.name}」（${Math.round(file.size / 1024)} KB），http 模式将走 Files 入库。`
          row.status = 'ready'
          continue
        }

        const meta: AgentFileMeta = await uploadAgentFile(file, {
          studentId: opts?.studentId,
          sessionId: opts?.sessionId || undefined,
        })
        // Claude: file_id is assigned even if ingest fails — keep id for diagnostics
        row.fileId = meta.file_id
        if (meta.status === 'failed') {
          row.status = 'error'
          row.error = meta.error || '文件已入库但文本解析失败，请换 PDF/DOCX/TXT'
          row.excerpt = (meta.excerpt || '').slice(0, EXCERPT_CHARS)
          continue
        }
        if (meta.status === 'ingesting' || meta.status === 'queued') {
          // Follow persisted transitions; never substitute a timer for completion.
          void followIngest(row, meta.file_id)
          continue
        }
        if (meta.status !== 'ready') {
          row.status = 'error'
          row.error = `未知文件状态: ${meta.status || 'empty'}`
          continue
        }
        row.excerpt = (meta.excerpt || meta.filename || file.name).slice(0, EXCERPT_CHARS)
        row.status = 'ready'
      } catch (e) {
        row.status = 'error'
        row.error = e instanceof Error ? e.message : '附件上传失败'
      }
    }
  }

  function removeAttachment(id: string) {
    attachments.value = attachments.value.filter(a => a.id !== id)
  }

  function clearAttachments() {
    attachments.value = []
  }

  /** @deprecated full-text prefix — do not use; kept empty for safety */
  function buildContextBlock(): string {
    return ''
  }

  function readyFileIds(): string[] {
    return attachments.value
      .filter(a => a.status === 'ready' && a.fileId)
      .map(a => a.fileId!)
  }

  function readyCount(): number {
    return attachments.value.filter(a => a.status === 'ready').length
  }

  return {
    attachments,
    busy,
    addFiles,
    removeAttachment,
    clearAttachments,
    buildContextBlock,
    readyFileIds,
    readyCount,
  }
}
