export type ProjectStatus = 'active' | 'paused' | 'done' | 'archived'
/** V2: slug da coluna Kanban (ex.: backlog, in_progress, done ou custom) */
export type TaskStatus = string
export type EisenhowerQuadrant = 'q1' | 'q2' | 'q3' | 'q4'

export interface Project {
  id: string
  name: string
  description?: string
  status: ProjectStatus
}

export interface AuthUser {
  id: string
  name: string
  email: string
  avatar_url?: string
  nickname?: string | null
  role?: string
}

/** Sprint 8: vocabulário customizado da organização */
export interface OrgVocabulary {
  term_project: string
  term_task:    string
  term_sprint:  string
  term_backlog: string
  term_member:  string
  term_client:  string
}

export interface Workspace {
  id:   string
  name: string
  slug: string
  // Sprint 8: identidade organizacional
  legal_name?:           string | null
  vertical?:             string | null
  mission?:              string | null
  logo_url?:             string | null
  primary_color?:        string | null
  timezone?:             string | null
  locale?:               string | null
  industry?:             string | null
  size_range?:           string | null
  onboarding_completed:  boolean
  onboarding_step:       number
  vocabulary?:           OrgVocabulary | null
}

export interface WorkspaceMember {
  user_id: string
  name?: string
  email?: string
  role: 'admin' | 'member'
  avatar_url?: string
}

export interface AuthTokens {
  access_token: string
  token_type: string
  // refresh_token is now httpOnly cookie — not in response body
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
  /** Nome do responsável quando o backend expuser; senão deriva do título `[Nome]`. */
  assignee_name?: string | null
  deleted_at?: string | null
  deleted_by?: string | null
  /** Sprint 6: Subtarefas */
  parent_task_id?: string | null
  subtask_count?: number
  completed_subtask_count?: number
  subtasks?: Task[]
  /** Sprint 7: Recorrência */
  is_recurring?: boolean
  recurring_template_id?: string | null
  /** Sprint 9: sprint atual da task (null = backlog) */
  sprint_id?: string | null
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

/** Fallback quando GET /kanban ainda não retornou ou falhou (V2) */
export const STATUS_COLUMNS: { id: string; label: string; color: string }[] = [
  { id: 'backlog',     label: 'Backlog',      color: '#4a4a6a' },
  { id: 'in_progress', label: 'Em andamento', color: '#7c6df0' },
  { id: 'blocked',     label: 'Impedimento',  color: '#f43f5e' },
  { id: 'done',        label: 'Concluído',    color: '#5eead4' },
]

export type FieldTypeV2 =
  | 'text' | 'textarea' | 'number' | 'date' | 'select' | 'multiselect'
  | 'user' | 'boolean' | 'currency' | 'url'

export interface KanbanColumn {
  id: string
  project_id: string
  name: string
  slug: string
  color: string
  order: number
  is_default: boolean
  is_done: boolean
  created_at: string
}

export interface CustomField {
  id: string
  project_id: string | null
  entity_type: string
  name: string
  label: string
  field_type: FieldTypeV2 | string
  required: boolean
  options: string[]
  order: number
  created_at: string
}

export interface CustomFieldValue {
  id: string
  field_id: string
  entity_id: string
  entity_type: string
  value: unknown
  created_at: string
  updated_at: string
  conformed_at?: string | null
  conformed_value?: unknown
}

/** Frente 2 — resposta de GET/POST /api/tasks/{id}/field-values */
export type CustomFieldTypeF2 =
  | 'text' | 'number' | 'date' | 'select' | 'multiselect' | 'boolean' | 'url'

export type CustomFieldDefinition = CustomField

export interface TaskFieldValueRow {
  field_id: string
  slug: string
  field_type: string
  conformed_value: unknown
  conformed_at: string | null
}

/** Colunas/campos como retornados pela API (JSONB) */
export interface TemplateKanbanColumnPreview {
  name: string
  slug: string
  order?: number
  is_done?: boolean
  color?: string
  is_default?: boolean
}

export interface TemplateCustomFieldPreview {
  name?: string
  label?: string
  field_type?: string
  required?: boolean
  options?: string[]
  order?: number
}

export interface VerticalTemplate {
  id: string
  name: string
  slug: string
  description?: string | null
  vertical?: string | null
  is_public: boolean
  created_at: string
  custom_fields?: TemplateCustomFieldPreview[]
  kanban_columns?: TemplateKanbanColumnPreview[]
  agent_configs?: Record<string, unknown>
  /** Alias Frente 3 — mesmo que kanban_columns */
  columns?: TemplateKanbanColumnPreview[]
}

export interface ApplyTemplateResult {
  columns_added: number
  fields_added: number
  skipped: string[]
}

export interface SchemaSuggestion {
  id: string
  type: 'add_column' | 'remove_column' | 'add_field' | 'remove_field' | 'reorder_columns'
  title: string
  rationale: string
  payload: Record<string, any>
  confidence: number
  risk: 'LOW' | 'MEDIUM' | 'HIGH'
}

export interface SchemaAnalysisResult {
  project_id: string
  suggestions: SchemaSuggestion[]
  analyzed_at: string
}

export interface SchemaApplyRequest {
  accepted_ids: string[]
  all_suggestions: SchemaSuggestion[]
}

export interface SchemaApplyResult {
  applied: number
  skipped_due_to_law: number
  errors: string[]
}

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

export type SprintType = 'standard' | 'recorrente' | 'encaixe'
export type RecurrenceUnit = 'daily' | 'weekly' | 'monthly'

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
  // Sprint 7
  type: SprintType
  recurrence_unit?: RecurrenceUnit | null
  recurrence_interval?: number | null
  auto_create: boolean
  parent_sprint_id?: string | null
  sequence_number: number
}

export interface SprintCloseResult {
  closed_sprint_id: string
  tasks_moved_to_backlog: number
  next_sprint?: Sprint | null
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
  | 'template_applied'
  | 'schema_agent_applied'
  | 'field_created'
  | 'field_deleted'

export interface ActivityLog {
  id: string
  entity_type: string     // "task" | "project"
  entity_id: string
  user_id: string
  action: ActivityAction
  metadata: Record<string, unknown>
  created_at: string      // ISO 8601 datetime
  /** Preenchido pelo GET /activity/entity/… quando o usuário existe no banco. */
  user_name?: string | null
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

// ── Sprint 7.5 — AI Token Manager ────────────────────────────────────────────

export interface AIEngine {
  id: string
  name: string
  slug: string
  provider: string
  model_id: string
  cost_per_1k_input_tokens: number
  cost_per_1k_output_tokens: number
  capabilities: string[]
  is_active: boolean
}

export interface AIWallet {
  id: string
  workspace_id: string
  balance_usd: number
  total_spent_usd: number
  alert_threshold_usd?: number
}

export interface AIUsageLog {
  id: string
  engine_id: string
  engine_slug: string
  engine_name: string
  agent_name?: string | null
  task_id?: string | null
  input_tokens: number
  output_tokens: number
  cost_usd: number
  context?: string | null
  created_at: string
}

export interface AIUsageSummary {
  total_cost_usd: number
  total_calls: number
  by_engine: { engine: string; cost: number; calls: number }[]
  by_agent:  { agent: string;  cost: number; calls: number }[]
  by_day:    { date: string;   cost: number; calls: number }[]
  logs: AIUsageLog[]
}
