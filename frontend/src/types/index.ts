export type ProjectStatus = 'active' | 'paused' | 'done' | 'archived'
export type TaskStatus = 'backlog' | 'in_progress' | 'blocked' | 'done'
export type EisenhowerQuadrant = 'q1' | 'q2' | 'q3' | 'q4'

export interface Project {
  id: string
  name: string
  description?: string
  status: ProjectStatus
}

export interface Task {
  id: string
  title: string
  description?: string
  status: TaskStatus
  quadrant: EisenhowerQuadrant
  time_spent_minutes: number
  project_id: string
  due_date_iso?: string | null
  assignee_id?: string | null
  deleted_at?: string | null
  deleted_by?: string | null
}

/** Task na lixeira (soft delete) — resposta de GET /tasks/trash/{project_id} */
export interface TrashTaskItem {
  id: string
  title: string
  status: TaskStatus
  quadrant: EisenhowerQuadrant
  project_id: string
  deleted_at: string
  deleted_by?: string | null
}

export const QUADRANT_LABELS: Record<EisenhowerQuadrant, string> = {
  q1: 'Q1',
  q2: 'Q2',
  q3: 'Q3',
  q4: 'Q4',
}

/** Sprint 4 — Dashboard ROI */
export interface RoiQuadrantStat {
  minutes: number
  hours: number
  pct: number
  label: string
}

export interface RoiProjectStat {
  project_id: string
  name: string
  minutes: number
  tasks_total: number
  tasks_done: number
}

export interface RoiDueItem {
  task_id: string
  title: string
  due_date: string
  days: number
  quadrant: EisenhowerQuadrant
}

export interface RoiSummary {
  total_time_minutes: number
  total_time_hours: number
  tasks_total: number
  tasks_by_status: Record<string, number>
  time_by_quadrant: Record<EisenhowerQuadrant, RoiQuadrantStat>
  focus_score: number
  focus_score_pct: number
  focus_label: string
  focus_color: 'green' | 'amber' | 'red'
  time_by_project: RoiProjectStat[]
  overdue: RoiDueItem[]
  approaching: RoiDueItem[]
  velocity: { done_this_week: number; done_this_month: number }
}

export interface RoiTimelineDay {
  date: string
  tasks_created: number
  tasks_done: number
  minutes: number
}

export interface RoiTimeline {
  days: RoiTimelineDay[]
  period_days: number
}

export const STATUS_COLUMNS: { id: TaskStatus; label: string; color: string }[] = [
  { id: 'backlog',     label: 'Backlog',      color: '#4a4a6a' },
  { id: 'in_progress', label: 'Em andamento', color: '#7c6df0' },
  { id: 'blocked',     label: 'Impedimento',  color: '#f43f5e' },
  { id: 'done',        label: 'Concluído',    color: '#5eead4' },
]

/** Sprint 3F — importação de planilha / CSV */
export interface SheetMapping {
  title:       string | null
  description: string | null
  quadrant:    string | null
  status:      string | null
  due_date:    string | null
  assignee:    string | null
}

export interface SheetTask {
  title:        string
  description?: string | null
  quadrant:     string
  status:       string
  due_date?:    { iso: string; display: string; gap: string; overdue: boolean } | null
  assignee_hint?: string | null
}

export interface SheetParseResult {
  file_id:     string
  headers:     string[]
  mapping:     SheetMapping
  confidence:  number
  notes:       string
  sample_tasks: SheetTask[]
  total_rows:  number
  format:      'xlsx' | 'csv'
}

/** Wizard de revisão (ContractWizard + SheetWizard) — existe APENAS no frontend, nunca vai direto ao banco */
export interface ReviewTask {
  id: string                     // uuid local gerado no wizard
  title: string
  description?: string
  quadrant: string
  status: string
  due_date?: string              // ISO 8601 "2026-03-23" ou vazio
  assignee_hint?: string
  source_clause?: string         // referência de origem (contrato)
  review_notes?: string          // notas do backlog_reviewer
  suggested_subtasks?: string[]  // sugestões do agente (antes de virar cards)
  dependencies?: string[]        // ids de outros ReviewTask (local)
  is_discarded: boolean          // marcado como descartado (não some da lista)
  is_expanded: boolean           // estado de expand/collapse do card
  is_subtask?: boolean           // criado via Decompor — indentação visual
}

/** Sprint 3E — importação de contrato PDF */
export interface ContractProjectDraft {
  name: string
  client?: string | null
  start_date?: string | null
  end_date?: string | null
  description?: string | null
}

export interface ContractTask {
  title: string
  description?: string | null
  quadrant: EisenhowerQuadrant | string
  due_date?: string | null
  assignee_hint?: string | null
  source_clause?: string | null
  review_notes?: string | null
  suggested_subtasks?: string[]
  quadrant_rationale?: string | null
}

export interface ContractParseResult {
  project: ContractProjectDraft
  tasks: ContractTask[]
}

/** Sprint 5B — Sprint como entidade real */
export type SprintStatus = 'planning' | 'active' | 'completed' | 'cancelled'

export interface Sprint {
  id: string
  project_id: string
  name: string
  goal?: string | null
  status: SprintStatus
  start_date?: string | null   // ISO 8601
  end_date?: string | null     // ISO 8601
  velocity: number             // tasks done ao completar (calculado pelo backend)
  created_at: string
  updated_at: string
}

export interface SprintTask {
  sprint_id: string
  task_id: string
  added_at: string
}

/** Board de sprint retornado por GET /api/sprints/{id}/board */
export interface SprintBoard {
  sprint_id: string
  tasks: Task[]
  total: number
  done: number
  columns: { status: string; label: string; task_count: number }[]
}

/** Sprint 5A — Comentários por task */
export interface Comment {
  id: string
  task_id: string
  user_id: string
  body: string
  mentions: string[]
  created_at: string    // ISO 8601 datetime
  updated_at?: string | null
}

/** Sprint 5A — Log de atividade (append-only, gerado pelo backend) */
export type ActivityAction =
  | 'created'
  | 'moved'
  | 'updated'
  | 'commented'
  | 'deleted'
  | 'restored'
  | 'assigned'
  | 'due_changed'
  | 'quadrant_changed'

export interface ActivityLog {
  id: string
  entity_type: string     // "task" | "project"
  entity_id: string
  user_id: string
  action: ActivityAction
  metadata: Record<string, unknown>
  created_at: string      // ISO 8601 datetime
}

/** Sprint 5C — Hiperfoco */
export type FocusMood = 'blocked' | 'ok' | 'flow'

export interface FocusSession {
  session_id: string
  user_id: string
  task_id?: string | null
  sprint_id?: string | null
  started_at: string        // ISO 8601
  ended_at?: string | null
  duration_minutes?: number | null
  mood?: FocusMood | null
  notes?: string | null
  is_pomodoro: boolean
  pomodoro_minutes: number
}

export interface ProductivitySnapshot {
  id: string
  user_id: string
  date: string              // ISO date "2026-03-24"
  focus_minutes: number
  tasks_completed: number
  tasks_moved: number
  mood_avg?: number | null
  velocity_delta?: number | null
  notes?: string | null
}

/** Sprint 6A — Dashboard ROI */
export interface DailyFocus {
  date: string              // "2026-03-24"
  minutes: number
  mood?: FocusMood | null
}

export interface ProjectRoi {
  id: string
  name: string
  total_minutes: number
  tasks_total: number
  tasks_done: number
  tasks_by_quadrant: Record<EisenhowerQuadrant, number>
  completion_rate: number
  overdue_count: number
}

export interface RoiSummaryData {
  total_focus_minutes: number
  total_focus_minutes_week: number
  tasks_completed_total: number
  tasks_completed_week: number
  focus_score: number         // % tempo Q1+Q2
  most_active_project: string | null
  current_streak_days: number
}

export interface RoiData {
  summary: RoiSummaryData
  projects: ProjectRoi[]
  quadrant_distribution: Record<EisenhowerQuadrant, number>
  daily_focus: DailyFocus[]
}

export interface HeatmapDay {
  date: string
  minutes: number
  tasks_completed: number
  mood: FocusMood | null
}

/** Config persistida no localStorage para o widget de foco */
export interface FocusConfig {
  sessionId: string | null
  taskId: string | null
  startedAt: number | null   // Date.now()
  isPaused: boolean
  pausedAt: number | null    // Date.now() quando pausou
  totalPausedMs: number      // acúmulo de milissegundos pausados
  isPomodoro: boolean
  pomodoroMinutes: number
}
