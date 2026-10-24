import { computed, onScopeDispose, reactive, ref } from 'vue'
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
  let epoch = 0
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
    opts?: { studentId?: string; sessionId?: string | null; taskContextVersion?:()=>number;
      onUploaded?:(meta:AgentFileMeta)=>void|Promise<void> },
  ) {
    const files = Array.from(fileList)
    const started = epoch
    for (const file of files) {
      if (disposed || epoch !== started) return
      const id = `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      const row = reactive<ChatAttachment>({
        id,
        name: file.name,
        size: file.size,
        mime: file.type || 'application/octet-stream',
        status: 'reading',
        excerpt: '',
      })
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
          taskContextVersion: opts?.taskContextVersion?.(),
        })
        if (disposed || epoch !== started || !attachments.value.includes(row)) return
        await opts?.onUploaded?.(meta)
        if (disposed || epoch !== started || !attachments.value.includes(row)) return
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

  /**
   * Move only the files accepted by this send out of the composer draft.
   * This is local UI state only: uploaded files and session/task references
   * remain persisted and available to the sent message.
   */
  function takeAttachmentsByFileIds(fileIds: string[]): ChatAttachment[] {
    const selected = new Set(fileIds.filter(Boolean))
    if (!selected.size) return []
    const taken = attachments.value.filter(row => row.fileId && selected.has(row.fileId))
    if (taken.length) {
      const takenIds = new Set(taken.map(row => row.id))
      attachments.value = attachments.value.filter(row => !takenIds.has(row.id))
    }
    return taken
  }

  /** Restore a failed send's local draft without replacing newer selections. */
  function restoreTakenAttachments(rows: ChatAttachment[]) {
    if (!rows.length) return
    const currentIds = new Set(attachments.value.map(row => row.id))
    const currentFiles = new Set(attachments.value.map(row => row.fileId).filter((id): id is string => !!id))
    const missing = rows.filter(row => !currentIds.has(row.id) && (!row.fileId || !currentFiles.has(row.fileId)))
    if (missing.length) attachments.value = [...attachments.value, ...missing]
  }

  function clearAttachments() {
    epoch++
    attachments.value = []
  }

  async function restoreFiles(refs:{file_id:string;name?:string}[]) {
    const selected = new Set(refs.map(r=>r.file_id))
    attachments.value = attachments.value.filter(r=>!!r.fileId && selected.has(r.fileId))
    const started = epoch
    await Promise.all(refs.map(async ref=>{
      const existing=attachments.value.find(r=>r.fileId===ref.file_id)
      if (existing && existing.status!=='error') return
      const row = existing || reactive<ChatAttachment>({id:'restored_'+ref.file_id,fileId:ref.file_id,
        name:ref.name||'附件',size:0,mime:'application/octet-stream',status:'reading',excerpt:''})
      if(!existing)attachments.value.push(row)
      row.status='reading';row.error=undefined
      try {
        const meta = await getAgentFile(ref.file_id)
        if (disposed || epoch !== started || !attachments.value.includes(row)) return
        if (!meta || meta.file_id !== ref.file_id) throw Error('附件状态无法核对，请重新读取任务')
        row.name=meta.filename||row.name;row.size=meta.size_bytes||0;row.mime=meta.mime_type||row.mime
        row.excerpt=(meta.excerpt||'').slice(0,EXCERPT_CHARS)
        if(meta.status==='ready') row.status='ready'
        else if(meta.status==='queued'||meta.status==='ingesting') void followIngest(row,ref.file_id)
        else {row.status='error';row.error=meta.error||'附件解析未完成，请重试或移除后重新上传'}
      } catch(error) {
        if(disposed || epoch !== started || !attachments.value.includes(row)) return
        row.status='error';row.error=error instanceof Error?error.message:'附件读取失败'
      }
    }))
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
    takeAttachmentsByFileIds,
    restoreTakenAttachments,
    clearAttachments,
    restoreFiles,
    buildContextBlock,
    readyFileIds,
    readyCount,
  }
}
