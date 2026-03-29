/**
 * services/api.ts — Sprint 6B + Deploy
 *
 * Em desenvolvimento: Vite proxy redireciona /api → http://127.0.0.1:8010
 * Em produção (Vercel): VITE_API_URL aponta para o Railway backend.
 *
 * VITE_API_URL = "https://orchflow-production.railway.app"
 * → baseURL = "https://orchflow-production.railway.app/api"
 *
 * Interceptors:
 *   - Request: injeta Bearer token do localStorage
 *   - Response: 401 → limpa token + dispara evento de logout
 */
import axios, { AxiosError } from 'axios'
import type {
  Project,
  Task,
  TaskStatus,
  EisenhowerQuadrant,
  ContractParseResult,
  TrashTaskItem,
  KanbanColumn,
  CustomField,
  CustomFieldValue,
  VerticalTemplate,
  SchemaAnalysisResult,
  SchemaApplyRequest,
  SchemaApplyResult,
  TaskFieldValueRow,
  ApplyTemplateResult,
  AuthTokens,
  AuthUser,
  Workspace,
  WorkspaceMember,
  OrgVocabulary,
  AIWallet,
  AIUsageSummary,
  AIEngine,
  Sprint,
} from '../types'

const TOKEN_KEY = 'orchflow-token'
const WORKSPACE_KEY = 'orchflow-workspace-id'

// ── Module-level token singleton ──────────────────────────────────────────────
// O token vive em memória (não exposto via window.localStorage no hot-path).
// AuthContext popula via setApiAccessToken() após login/checkAuth.
let _accessToken: string | null = null

export function setApiAccessToken(token: string | null): void {
  _accessToken = token
}

export function getApiAccessToken(): string | null {
  return _accessToken
}

/** Mensagens amigáveis por status HTTP (V1.5) — não expor stack nem texto técnico cru. */
export const HTTP_FRIENDLY: Record<number, string> = {
  400: 'Dados inválidos. Verifique os campos.',
  401: 'Sessão expirada. Faça login novamente.',
  403: 'Sem permissão para esta ação.',
  404: 'Item não encontrado.',
  405: 'Operação não permitida.',
  422: 'Dados incompletos. Verifique o formulário.',
  429: 'Muitas requisições. Aguarde um momento.',
  500: 'Erro interno. Tente novamente.',
  502: 'Serviço temporariamente indisponível.',
  503: 'Sistema em manutenção.',
}

export function friendlyHttpStatus(status: number): string {
  return HTTP_FRIENDLY[status] ?? 'Falha na requisição. Tente novamente.'
}

function friendlyAxiosMessage(err: unknown): string {
  if (!axios.isAxiosError(err)) {
    return 'Não foi possível conectar. Verifique sua rede.'
  }
  const ax = err as AxiosError
  const st = ax.response?.status
  if (st != null) return friendlyHttpStatus(st)
  return friendlyHttpStatus(502)
}

/** Headers Authorization para fetch paralelo ao client `api` (ex.: export). */
export function getApiAuthHeaders(): HeadersInit {
  const token = _accessToken  // só memória
  const ws = localStorage.getItem(WORKSPACE_KEY)
  return token
    ? {
        Authorization: `Bearer ${token}`,
        ...(ws ? { 'X-Workspace-Id': ws } : {}),
      }
    : {}
}

// Em produção VITE_API_URL é a URL raiz do Railway (sem /api no final)
export const API_ROOT = (import.meta.env.VITE_API_URL as string | undefined) ?? ''

export const api = axios.create({
  baseURL: API_ROOT ? `${API_ROOT}/api` : '/api',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,  // send httpOnly cookies (refresh_token)
})

// ── Interceptor de request: injeta Bearer token (só memória, sem localStorage) ─
api.interceptors.request.use(config => {
  const token = _accessToken  // apenas singleton em memória
  const ws = localStorage.getItem(WORKSPACE_KEY)
  if (token) {
    config.headers = config.headers ?? {}
    config.headers['Authorization'] = `Bearer ${token}`
    if (ws) config.headers['X-Workspace-Id'] = ws
  }
  return config
})

// ── Interceptor de response: 401 → logout + toast amigável em erros ───────────
let _refreshPromise: Promise<string | null> | null = null

async function _tryRefreshAccessToken(): Promise<string | null> {
  // refresh_token is sent automatically via httpOnly cookie
  const workspaceId = localStorage.getItem(WORKSPACE_KEY)
  if (!workspaceId) return null
  try {
    const { data } = await api.post<{ access_token: string }>('/auth/refresh', {
      workspace_id: workspaceId,
    })
    _accessToken = data.access_token
    localStorage.setItem(TOKEN_KEY, data.access_token)
    return data.access_token
  } catch {
    return null
  }
}

api.interceptors.response.use(
  res => res,
  async err => {
    if (axios.isAxiosError(err) && err.code === 'ERR_CANCELED') {
      return Promise.reject(err)
    }
    const original = err.config
    // Tenta refresh em qualquer 401 — cookie httpOnly é enviado automaticamente
    // Guard: nunca tentar refresh se a própria requisição de refresh falhou (evita deadlock)
    if (
      err.response?.status === 401 &&
      !original?._retried &&
      !(original?.url ?? '').includes('/auth/refresh')
    ) {
      if (!_refreshPromise) _refreshPromise = _tryRefreshAccessToken()
      const nextToken = await _refreshPromise
      _refreshPromise = null
      if (nextToken && original) {
        original._retried = true
        original.headers = original.headers ?? {}
        original.headers['Authorization'] = `Bearer ${nextToken}`
        return api.request(original)
      }
      // Refresh falhou → sessão encerrada
      _accessToken = null
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(WORKSPACE_KEY)
      window.dispatchEvent(new Event('orchflow:logout'))
    }
    const msg = friendlyAxiosMessage(err)
    window.dispatchEvent(new CustomEvent('orchflow:api-error', { detail: { message: msg } }))
    return Promise.reject(err)
  },
)

// ── AUTH / WORKSPACES ─────────────────────────────────────────────────────────
export const register = async (data: {
  name: string
  email: string
  password: string
}): Promise<AuthTokens & { user: AuthUser }> => {
  const { data: out } = await api.post<AuthTokens & { user: AuthUser }>('/auth/register', data)
  return out
}

export const login = async (email: string, password: string): Promise<AuthTokens & { user: AuthUser }> => {
  const { data } = await api.post<AuthTokens & { user: AuthUser }>('/auth/login', { email, password })
  return data
}

export const loginOAuth = (provider: 'google' | 'github'): void => {
  const root = API_ROOT ? `${API_ROOT}/api` : '/api'
  window.location.href = `${root}/auth/${provider}`
}

export const refreshTokenApi = async (workspaceId: string): Promise<{ access_token: string }> => {
  // refresh_token sent automatically via httpOnly cookie
  const { data } = await api.post<{ access_token: string }>('/auth/refresh', {
    workspace_id: workspaceId,
  })
  return data
}

export const logoutApi = async (): Promise<void> => {
  // refresh_token sent automatically via httpOnly cookie
  await api.post('/auth/logout')
}

export const getMe = async (): Promise<AuthUser> => {
  const { data } = await api.get<AuthUser>('/auth/me')
  return data
}

export const getMyWorkspaces = async (): Promise<Workspace[]> => {
  const { data } = await api.get<Workspace[]>('/workspaces/mine')
  return data
}

export const getWorkspace = async (workspaceId: string): Promise<Workspace> => {
  const { data } = await api.get<Workspace>(`/workspaces/${workspaceId}`)
  return data
}

export const updateWorkspace = async (
  workspaceId: string,
  data: Partial<Pick<Workspace, 'name' | 'legal_name' | 'vertical' | 'mission' | 'logo_url' | 'primary_color' | 'timezone' | 'locale' | 'industry' | 'size_range'>>,
): Promise<Workspace> => {
  const { data: out } = await api.patch<Workspace>(`/workspaces/${workspaceId}`, data)
  return out
}

export const getVocabulary = async (workspaceId: string): Promise<OrgVocabulary> => {
  const { data } = await api.get<OrgVocabulary>(`/workspaces/${workspaceId}/vocabulary`)
  return data
}

export const updateVocabulary = async (
  workspaceId: string,
  data: Partial<OrgVocabulary>,
): Promise<OrgVocabulary> => {
  const { data: out } = await api.patch<OrgVocabulary>(`/workspaces/${workspaceId}/vocabulary`, data)
  return out
}

export const completeOnboarding = async (workspaceId: string): Promise<Workspace> => {
  const { data } = await api.post<Workspace>(`/workspaces/${workspaceId}/onboarding/complete`)
  return data
}

export const advanceOnboarding = async (
  workspaceId: string,
  step: number,
  data: Record<string, unknown>,
): Promise<Workspace> => {
  const { data: out } = await api.post<Workspace>(`/workspaces/${workspaceId}/onboarding/advance`, { step, data })
  return out
}

export const resetOnboarding = async (workspaceId: string): Promise<Workspace> => {
  const { data } = await api.post<Workspace>(`/workspaces/${workspaceId}/onboarding/reset`)
  return data
}

export const createWorkspace = async (name: string): Promise<Workspace> => {
  const { data } = await api.post<Workspace>('/workspaces', { name })
  return data
}

export const inviteMember = async (workspaceId: string, email: string, role: 'admin' | 'member'): Promise<void> => {
  await api.post(`/workspaces/${workspaceId}/invite`, { email, role })
}

export const acceptInvite = async (workspaceId: string, token: string): Promise<void> => {
  await api.post(`/workspaces/${workspaceId}/accept-invite`, { token })
}

export const listMembers = async (workspaceId: string): Promise<WorkspaceMember[]> => {
  const { data } = await api.get<WorkspaceMember[]>(`/workspaces/${workspaceId}/members`)
  return data
}

// ── PROJECTS ──────────────────────────────────────────
export const getProjects = async (): Promise<Project[]> => {
  const { data } = await api.get('/projects/')
  return data
}

export const createProject = async (name: string, description?: string): Promise<Project> => {
  const { data } = await api.post('/projects/', { name, description })
  return data
}

export const updateProject = async (
  id: string,
  data: { name?: string; description?: string },
): Promise<Project> => {
  const { data: out } = await api.patch<Project>(`/projects/${id}`, data)
  return out
}

export const cloneProject = async (projectId: string): Promise<Project> => {
  const { data } = await api.post<Project>(`/projects/${projectId}/clone`)
  return data
}

export const deleteProject = async (id: string): Promise<void> => {
  await api.delete(`/projects/${id}`)
}

// ── SUBTASKS ──────────────────────────────────────────
export const getSubtasks = async (taskId: string): Promise<Task[]> => {
  const { data } = await api.get<Task[]>(`/tasks/${taskId}/subtasks`)
  return data
}

export const createSubtask = async (
  parentTaskId: string,
  payload: { title: string; project_id: string; description?: string },
): Promise<Task> => {
  const { data } = await api.post<Task>('/tasks/', {
    ...payload,
    parent_task_id: parentTaskId,
  })
  return data
}

// ── TASKS ─────────────────────────────────────────────
export const getTasks = async (projectId?: string): Promise<Task[]> => {
  const params = projectId ? { project_id: projectId } : {}
  const { data } = await api.get('/tasks/', { params })
  return data
}

export const createTask = async (payload: {
  title: string
  description?: string
  project_id: string
  quadrant?: EisenhowerQuadrant
}): Promise<Task> => {
  const { data } = await api.post('/tasks/', payload)
  return data
}

export const updateTaskStatus = async (id: string, status: TaskStatus): Promise<void> => {
  await api.patch(`/tasks/${id}/status`, { status })
}

export const addTaskTime = async (id: string, minutes: number): Promise<{ time_spent_minutes: number }> => {
  const { data } = await api.patch(`/tasks/${id}/time`, { minutes })
  return data
}

export const updateTask = async (
  id: string,
  payload: {
    title?: string
    description?: string
    quadrant?: EisenhowerQuadrant
    status?: TaskStatus
    due_date_iso?: string | null
    assignee_hint?: string | null
    add_minutes?: number
    is_recurring?: boolean
    sprint_id?: string | null
  }
): Promise<Task> => {
  const { data } = await api.patch(`/tasks/${id}`, payload)
  return data
}

export const deleteTask = async (id: string): Promise<void> => {
  await api.delete(`/tasks/${id}`)
}

// ── SPRINT TASK ASSIGNMENT — Sprint 9 ─────────────────────────────────────

/** GET /sprints/project/{projectId} filtered to active sprints */
export const getActiveSprints = async (projectId: string): Promise<Sprint[]> => {
  const { data } = await api.get<Sprint[]>(`/sprints/project/${projectId}`)
  return (data as Sprint[]).filter(s => s.status === 'active')
}

/** PATCH /tasks/{taskId} with sprint_id (null = remove from sprint) */
export const assignTaskToSprint = async (
  taskId: string,
  sprintId: string | null,
): Promise<Task> => {
  const { data } = await api.patch<Task>(`/tasks/${taskId}`, { sprint_id: sprintId })
  return data
}

/** Parallel PATCH for multiple tasks */
export const assignTasksToSprint = async (
  taskIds: string[],
  sprintId: string | null,
): Promise<void> => {
  await Promise.all(taskIds.map(id => assignTaskToSprint(id, sprintId)))
}

export const getTrashTasks = async (projectId: string): Promise<TrashTaskItem[]> => {
  const { data } = await api.get<TrashTaskItem[]>(`/tasks/trash/${projectId}`)
  return data
}

export const restoreTask = async (id: string): Promise<Task> => {
  const { data } = await api.post<Task>(`/tasks/${id}/restore`)
  return data
}

export const purgeTaskPermanent = async (id: string): Promise<void> => {
  await api.delete(`/tasks/${id}/permanent`)
}

// ── V2 — Kanban / campos / templates / schema agent ───────
export const getKanbanColumns = async (projectId: string): Promise<KanbanColumn[]> => {
  const { data } = await api.get<KanbanColumn[]>(`/kanban/${projectId}`)
  return data
}

export const createKanbanColumn = async (
  projectId: string,
  body: {
    name: string
    slug: string
    color?: string
    order?: number
    is_default?: boolean
    is_done?: boolean
  },
): Promise<KanbanColumn> => {
  const { data } = await api.post<KanbanColumn>(`/kanban/${projectId}/columns`, body)
  return data
}

export const patchKanbanColumn = async (
  columnId: string,
  body: Partial<{
    name: string
    slug: string
    color: string
    order: number
    is_default: boolean
    is_done: boolean
  }>,
): Promise<KanbanColumn> => {
  const { data } = await api.patch<KanbanColumn>(`/kanban/columns/${columnId}`, body)
  return data
}

export const deleteKanbanColumn = async (columnId: string): Promise<void> => {
  await api.delete(`/kanban/columns/${columnId}`)
}

export const reorderKanbanColumns = async (items: { id: string; order: number }[]): Promise<void> => {
  await api.post('/kanban/columns/reorder', { items })
}

export const getCustomFields = async (projectId: string): Promise<CustomField[]> => {
  const { data } = await api.get<CustomField[]>(`/fields/project/${projectId}`)
  return data
}

export const createCustomField = async (body: {
  project_id?: string | null
  entity_type?: string
  name: string
  label: string
  field_type: string
  required?: boolean
  options?: string[]
  order?: number
}): Promise<CustomField> => {
  const { data } = await api.post<CustomField>('/fields/', body)
  return data
}

export const deleteCustomField = async (fieldId: string): Promise<void> => {
  await api.delete(`/fields/${fieldId}`)
}

export const getCustomFieldValues = async (
  entityType: string,
  entityId: string,
): Promise<CustomFieldValue[]> => {
  const { data } = await api.get<CustomFieldValue[]>(`/fields/values/${entityType}/${entityId}`)
  return data
}

export const upsertCustomFieldValue = async (body: {
  field_id: string
  entity_id: string
  entity_type?: string
  value: unknown
}): Promise<CustomFieldValue> => {
  const { data } = await api.post<CustomFieldValue>('/fields/values/', body)
  return data
}

/** Frente 2 — rotas /api/projects/... e /api/tasks/... */
export const getFieldDefinitions = async (projectId: string): Promise<CustomField[]> => {
  const { data } = await api.get<CustomField[]>(`/projects/${projectId}/fields`)
  return data
}

export const createFieldDefinition = async (
  projectId: string,
  body: {
    name: string
    label: string
    field_type: string
    required?: boolean
    options?: string[]
    order?: number
    entity_type?: string
  },
): Promise<CustomField> => {
  const { data } = await api.post<CustomField>(`/projects/${projectId}/fields`, body)
  return data
}

export const updateFieldDefinition = async (
  projectId: string,
  fieldId: string,
  patch: { label?: string; required?: boolean; options?: string[]; order?: number },
): Promise<CustomField> => {
  const { data } = await api.patch<CustomField>(`/projects/${projectId}/fields/${fieldId}`, patch)
  return data
}

export const deleteFieldDefinition = async (projectId: string, fieldId: string): Promise<void> => {
  await api.delete(`/projects/${projectId}/fields/${fieldId}`)
}

export const getFieldValues = async (taskId: string): Promise<TaskFieldValueRow[]> => {
  const { data } = await api.get<TaskFieldValueRow[]>(`/tasks/${taskId}/field-values`)
  return data
}

export const upsertFieldValue = async (
  taskId: string,
  body: { field_id: string; raw_value: unknown },
): Promise<TaskFieldValueRow> => {
  const { data } = await api.post<TaskFieldValueRow>(`/tasks/${taskId}/field-values`, body)
  return data
}

export const listVerticalTemplates = async (): Promise<VerticalTemplate[]> => {
  const { data } = await api.get<VerticalTemplate[]>('/templates/')
  return data
}

export const getVerticalTemplate = async (slug: string): Promise<VerticalTemplate> => {
  const { data } = await api.get<VerticalTemplate>(`/templates/${slug}`)
  return data
}

export const getTemplateById = async (templateId: string): Promise<VerticalTemplate> => {
  const { data } = await api.get<VerticalTemplate>(`/templates/by-id/${templateId}`)
  return data
}

/** Preferir — POST /api/projects/{id}/apply-template (sem header Deprecation). */
export const applyProjectTemplate = async (
  projectId: string,
  templateId: string,
): Promise<ApplyTemplateResult> => {
  const { data } = await api.post<ApplyTemplateResult>(`/projects/${projectId}/apply-template`, {
    template_id: templateId,
  })
  return data
}

/** Legado: resposta agora ApplyTemplateResult; headers Deprecation + Sunset no backend. */
export const applyVerticalTemplate = async (
  slug: string,
  projectId: string,
): Promise<ApplyTemplateResult> => {
  const { data } = await api.post<ApplyTemplateResult>(`/templates/${slug}/apply/${projectId}`)
  return data
}

export const analyzeSchema = async (projectId: string): Promise<SchemaAnalysisResult> => {
  const { data } = await api.get<SchemaAnalysisResult>(`/projects/${projectId}/schema-analysis`)
  return data
}

export const applySchema = async (
  projectId: string,
  request: SchemaApplyRequest,
): Promise<SchemaApplyResult> => {
  const { data } = await api.post<SchemaApplyResult>(`/projects/${projectId}/schema-apply`, request)
  return data
}

export const getSchemaVerticalSuggestion = async (
  projectId: string,
): Promise<{ suggested_slug: string }> => {
  const { data } = await api.get<{ suggested_slug: string }>(`/schema-agent/vertical/${projectId}`)
  return data
}

// ── UPLOAD CONTRATO (Sprint 3E) ─────────────────────────
export const uploadContractPdf = async (file: File): Promise<ContractParseResult> => {
  const fd = new FormData()
  fd.append('file', file)
  const { data } = await api.post<ContractParseResult>('/upload/contract', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export const confirmContractImport = async (payload: {
  project: ContractParseResult['project']
  tasks: ContractParseResult['tasks']
  user_id?: string
}): Promise<{ project_id: string; tasks_created: number; message: string }> => {
  const { data } = await api.post('/upload/contract/confirm', {
    project: payload.project,
    tasks: payload.tasks,
    user_id: payload.user_id ?? 'default',
  })
  return data
}

// ── AI Token Manager — Sprint 7.5 ─────────────────────────────────────────

export const getAIWallet = async (): Promise<AIWallet> => {
  const { data } = await api.get<AIWallet>('/ai/wallet')
  return data
}

export const getAIUsage = async (params?: {
  days?: number
  agent?: string
  engine?: string
}): Promise<AIUsageSummary> => {
  const { data } = await api.get<AIUsageSummary>('/ai/usage', { params })
  return data
}

export const getAIEngines = async (): Promise<AIEngine[]> => {
  const { data } = await api.get<AIEngine[]>('/ai/engines')
  return data
}

export const creditAIWallet = async (
  amount_usd: number,
  description: string,
): Promise<AIWallet> => {
  const { data } = await api.post<AIWallet>('/ai/wallet/credit', { amount_usd, description })
  return data
}

export const setAIWalletAlert = async (threshold_usd: number | null): Promise<AIWallet> => {
  const { data } = await api.patch<AIWallet>('/ai/wallet/alert', { threshold_usd })
  return data
}
