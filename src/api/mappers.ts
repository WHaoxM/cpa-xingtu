import type { ReportRecord, SavedJob, TargetRole, TargetRoleMarket } from '@/types'

type Dict = Record<string, unknown>

function asRecord(v: unknown): Dict {
  return v && typeof v === 'object' ? (v as Dict) : {}
}

function asString(v: unknown, fallback = ''): string {
  return v == null ? fallback : String(v)
}

function asNumber(v: unknown, fallback = 0): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function asDateOnly(value: unknown): string {
  const raw = asString(value).trim()
  if (!raw) return ''
  if (/^\d{4}-\d{2}-\d{2}(?:$|[T ])/.test(raw)) return raw.slice(0, 10)
  // Flask serializes MySQL datetimes as RFC 1123, not always ISO 8601.
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10)
}

function asStringArray(v: unknown): string[] {
    if (typeof v === 'string') {
      const trimmed = v.trim()
      if (trimmed.startsWith('[')) {
        try {
          const parsed: unknown = JSON.parse(trimmed)
          if (Array.isArray(parsed)) {
            return parsed.map(item => typeof item === 'string'
              ? item
              : String(asRecord(item).name ?? '')).filter(Boolean)
          }
        } catch {
          // Keep the legacy scalar representation below.
        }
      }
    }
  if (Array.isArray(v)) return v.map(item => typeof item === 'string'
    ? item
    : String(asRecord(item).name ?? '')).filter(Boolean)
  if (typeof v === 'string') {
    try {
      const parsed = JSON.parse(v)
      if (Array.isArray(parsed)) return parsed.map(String)
    } catch {
      /* ignore */
    }
    return v ? [v] : []
  }
  return []
}

/** Backend saved-jobs row → FE SavedJob */
export function mapSavedJob(row: unknown): SavedJob {
  const r = asRecord(row)
  const publication = asRecord(r.publication)
  const snapshot = r.publication_snapshot
  return {
    id: asString(r.job_id ?? r.id),
    savedJobId: r.saved_job_id == null ? asString(r.id) : asString(r.saved_job_id),
    jobTitle: asString(r.job_title ?? r.jobTitle),
    company: asString(r.company),
    industry: asString(r.industry),
    salary: asString(r.salary),
    location: asString(r.location),
    matchScore: asNumber(r.match_score ?? r.matchScore),
    requiredSkills: asStringArray(r.required_skills ?? r.requiredSkills),
    savedAt: asDateOnly(r.saved_at ?? r.savedAt),
    notes: r.notes == null ? undefined : asString(r.notes),
    role: r.role == null ? undefined : asString(r.role),
    jobPortraitId: r.job_portrait_id == null
      ? (publication.job_portrait_id == null ? undefined : asString(publication.job_portrait_id))
      : asString(r.job_portrait_id),
    publicationVersion: r.publication_version == null
      ? (publication.publication_version == null ? undefined : asString(publication.publication_version))
      : asString(r.publication_version),
    publicationStatus: r.publication_status == null ? undefined : asString(r.publication_status),
    contentSha256: r.content_sha256 == null
      ? (publication.content_sha256 == null ? undefined : asString(publication.content_sha256))
      : asString(r.content_sha256),
    vacancyValidity: r.vacancy_validity == null ? undefined : asString(r.vacancy_validity),
    publicationSnapshot: snapshot && typeof snapshot === 'object' ? snapshot as Record<string, unknown> : null,
  }
}

export function toSavedJobBody(job: SavedJob, userId: string): Record<string, unknown> {
  return {
    job_id: job.id,
    user_id: userId,
    job_title: job.jobTitle,
    company: job.company,
    industry: job.industry,
    salary: job.salary,
    location: job.location,
    match_score: job.matchScore,
    required_skills: job.requiredSkills,
    notes: job.notes,
  }
}

/** Backend target-roles row → FE TargetRole */
export function mapTargetRole(row: unknown): TargetRole {
  const r = asRecord(row)
  return {
    role: asString(r.role_name ?? r.role),
    savedAt: asString(r.created_at ?? r.savedAt).slice(0, 10) || new Date().toISOString().slice(0, 10),
  }
}

export function mapTargetRoleMarket(row: unknown, fallbackRole: string): TargetRoleMarket | null {
  if (row == null) return null
  const r = asRecord(row)
  return {
    role: asString(r.role ?? r.role_name, fallbackRole),
    salaryRange: asString(r.salaryRange ?? r.salary_range, '—'),
    medianSalary: asNumber(r.medianSalary ?? r.median_salary),
    demandLevel: asString(r.demandLevel ?? r.demand_level, '暂无数据'),
    hotCities: asStringArray(r.hotCities ?? r.hot_cities),
    industries: asStringArray(r.industries),
    skillTags: asStringArray(r.skillTags ?? r.skill_tags),
    sampleJobs: asStringArray(r.sampleJobs ?? r.sample_jobs),
    trendNote: asString(r.trendNote ?? r.trend_note),
    referenceMatch: asNumber(r.referenceMatch ?? r.reference_match ?? r.demandCount ?? r.demand_count),
  }
}

/** Merge sparse API market into a full FE card (fill empty arrays/notes from fallback). */
export function mergeTargetRoleMarket(
  primary: TargetRoleMarket | null,
  fallback: TargetRoleMarket,
): TargetRoleMarket {
  if (!primary) return fallback
  return {
    role: primary.role || fallback.role,
    salaryRange: primary.salaryRange && primary.salaryRange !== '—' ? primary.salaryRange : fallback.salaryRange,
    medianSalary: primary.medianSalary || fallback.medianSalary,
    demandLevel:
      primary.demandLevel && primary.demandLevel !== '暂无数据'
        ? primary.demandLevel
        : fallback.demandLevel,
    hotCities: primary.hotCities.length ? primary.hotCities : fallback.hotCities,
    industries: primary.industries.length ? primary.industries : fallback.industries,
    skillTags: primary.skillTags.length ? primary.skillTags : fallback.skillTags,
    sampleJobs: primary.sampleJobs.length ? primary.sampleJobs : fallback.sampleJobs,
    trendNote: primary.trendNote || fallback.trendNote,
    referenceMatch: primary.referenceMatch || fallback.referenceMatch,
  }
}

/** Backend report list/detail → FE ReportRecord */
export function mapReportRecord(row: unknown): ReportRecord {
  const r = asRecord(row)
  const id = asString(r.report_id ?? r.id)
  const created = asString(r.created_at ?? r.createdAt)
  const typeRaw = asString(r.type, 'career')
  const type: ReportRecord['type'] = typeRaw === 'portrait' ? 'portrait' : 'career'
  const reportJson =
    r.report_json && typeof r.report_json === 'object'
      ? (r.report_json as Record<string, unknown>)
      : null
  // Keep the actual HTTP envelope alongside its domain snapshot: newer
  // evidence reports are sparse and must not lose status, chapters, source
  // metadata or the published position name while adapting for the UI.
  const snapshot = {
    ...(r.snapshot && typeof r.snapshot === 'object' ? r.snapshot as Record<string, unknown> : {}),
    ...(r.chapters !== undefined ? { chapters: r.chapters } : {}),
    ...(r.job_portrait_id !== undefined ? { job_portrait_id: r.job_portrait_id } : {}),
    ...(r.position_name !== undefined ? { position_name: r.position_name } : {}),
    ...(r.status !== undefined ? { status: r.status } : {}),
    ...(r.student_name !== undefined ? { student_name: r.student_name } : {}),
    ...(reportJson ? { report_json: reportJson, ...reportJson } : {}),
  }
  return {
    id,
    type,
    createdAt: asDateOnly(created),
    title: asString(r.title, id),
    snapshot,
  }
}
