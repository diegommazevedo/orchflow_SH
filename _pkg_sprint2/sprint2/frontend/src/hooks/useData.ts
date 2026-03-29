import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getProjects, createProject, deleteProject,
  getTasks, createTask, updateTaskStatus, addTaskTime, deleteTask
} from '../services/api'
import type { EisenhowerQuadrant, TaskStatus } from '../types'

// ── PROJECTS ──────────────────────────────────────────
export function useProjects() {
  return useQuery({ queryKey: ['projects'], queryFn: getProjects })
}

export function useCreateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ name, description }: { name: string; description?: string }) =>
      createProject(name, description),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })
}

export function useDeleteProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteProject(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })
}

// ── TASKS ─────────────────────────────────────────────
export function useTasks(projectId?: string) {
  return useQuery({
    queryKey: ['tasks', projectId],
    queryFn: () => getTasks(projectId),
    enabled: !!projectId,
  })
}

export function useCreateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: {
      title: string
      description?: string
      project_id: string
      quadrant?: EisenhowerQuadrant
    }) => createTask(payload),
    onSuccess: (_data, vars) =>
      qc.invalidateQueries({ queryKey: ['tasks', vars.project_id] }),
  })
}

export function useUpdateTaskStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: TaskStatus }) =>
      updateTaskStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  })
}

export function useAddTaskTime() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, minutes }: { id: string; minutes: number }) =>
      addTaskTime(id, minutes),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  })
}

export function useDeleteTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteTask(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  })
}
