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
import type { Project, Task, TaskStatus, EisenhowerQuadrant, ContractParseResult, TrashTaskItem } from '../types'

const TOKEN_KEY = 'orchflow-token'

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
  const token = localStorage.getItem(TOKEN_KEY)
  return token ? { Authorization: `Bearer ${token}` } : {}
}

// Em produção VITE_API_URL é a URL raiz do Railway (sem /api no final)
export const API_ROOT = (import.meta.env.VITE_API_URL as string | undefined) ?? ''

export const api = axios.create({
  baseURL: API_ROOT ? `${API_ROOT}/api` : '/api',
  headers: { 'Content-Type': 'application/json' },
})

// ── Interceptor de request: injeta Bearer token ───────────────────────────────
api.interceptors.request.use(config => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) {
    config.headers = config.headers ?? {}
    config.headers['Authorization'] = `Bearer ${token}`
  }
  return config
})

// ── Interceptor de response: 401 → logout + toast amigável em erros ───────────
api.interceptors.response.use(
  res => res,
  err => {
    if (axios.isAxiosError(err) && err.code === 'ERR_CANCELED') {
      return Promise.reject(err)
    }
    if (err.response?.status === 401 && localStorage.getItem(TOKEN_KEY)) {
      localStorage.removeItem(TOKEN_KEY)
      delete axios.defaults.headers.common['Authorization']
      window.dispatchEvent(new Event('orchflow:logout'))
    }
    const msg = friendlyAxiosMessage(err)
    window.dispatchEvent(new CustomEvent('orchflow:api-error', { detail: { message: msg } }))
    return Promise.reject(err)
  },
)

// ── PROJECTS ──────────────────────────────────────────
export const getProjects = async (): Promise<Project[]> => {
  const { data } = await api.get('/projects/')
  return data
}

export const createProject = async (name: string, description?: string): Promise<Project> => {
  const { data } = await api.post('/projects/', { name, description })
  return data
}

export const deleteProject = async (id: string): Promise<void> => {
  await api.delete(`/projects/${id}`)
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
  }
): Promise<Task> => {
  const { data } = await api.patch(`/tasks/${id}`, payload)
  return data
}

export const deleteTask = async (id: string): Promise<void> => {
  await api.delete(`/tasks/${id}`)
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
