import axios from 'axios'
import type { Project, Task, TaskStatus, EisenhowerQuadrant } from '../types'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

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

export const deleteTask = async (id: string): Promise<void> => {
  await api.delete(`/tasks/${id}`)
}
