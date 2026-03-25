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
import axios from 'axios'
import type { Project, Task, TaskStatus, EisenhowerQuadrant, ContractParseResult } from '../types'

const TOKEN_KEY = 'orchflow-token'

// Em produção VITE_API_URL é a URL raiz do Railway (sem /api no final)
export const API_ROOT = (import.meta.env.VITE_API_URL as string | undefined) ?? ''

const api = axios.create({
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

// ── Interceptor de response: 401 → logout automático ─────────────────────────
api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401 && localStorage.getItem(TOKEN_KEY)) {
      localStorage.removeItem(TOKEN_KEY)
      delete axios.defaults.headers.common['Authorization']
      window.dispatchEvent(new Event('orchflow:logout'))
    }
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

// ── UPLOAD CONTRATO (Sprint 3E) ─────────────────────────
export const uploadContractPdf = async (file: File): Promise<ContractParseResult> => {
  const fd = new FormData()
  fd.append('file', file)
  const { data } = await axios.post<ContractParseResult>('/api/upload/contract', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export const confirmContractImport = async (payload: {
  project: ContractParseResult['project']
  tasks: ContractParseResult['tasks']
  user_id?: string
}): Promise<{ project_id: string; tasks_created: number; message: string }> => {
  const { data } = await axios.post('/api/upload/contract/confirm', {
    project: payload.project,
    tasks: payload.tasks,
    user_id: payload.user_id ?? 'default',
  })
  return data
}
