export type ProjectStatus = 'active' | 'paused' | 'done' | 'archived'
export type TaskStatus = 'backlog' | 'in_progress' | 'done'
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
}

export const QUADRANT_LABELS: Record<EisenhowerQuadrant, string> = {
  q1: 'Q1',
  q2: 'Q2',
  q3: 'Q3',
  q4: 'Q4',
}

export const STATUS_COLUMNS: { id: TaskStatus; label: string; color: string }[] = [
  { id: 'backlog',     label: 'Backlog',      color: '#4a4a6a' },
  { id: 'in_progress', label: 'Em andamento', color: '#7c6df0' },
  { id: 'done',        label: 'Concluído',    color: '#5eead4' },
]
