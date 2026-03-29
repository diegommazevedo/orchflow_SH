import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getProjects, createProject, updateProject, cloneProject, deleteProject,
  getTasks, createTask, updateTaskStatus, addTaskTime, deleteTask, updateTask,
  getTrashTasks, restoreTask, purgeTaskPermanent,
  getSubtasks, createSubtask,
} from '../services/api'
import type { EisenhowerQuadrant, Task, TaskStatus, Project, TrashTaskItem } from '../types'
import { toArr } from '../utils/array'

// ── PROJECTS ──────────────────────────────────────────
export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: getProjects,
    select: (data) => toArr<Project>(data),
  })
}

export function useCreateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ name, description }: { name: string; description?: string }) =>
      createProject(name, description),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })
}

export function useUpdateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; description?: string }) =>
      updateProject(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })
}

export function useCloneProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => cloneProject(id),
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
    select: (data) => toArr<Task>(data),
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

export function useUpdateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...payload }: { id: string } & Parameters<typeof updateTask>[1]) =>
      updateTask(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  })
}

export function useDeleteTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteTask(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] })
      qc.invalidateQueries({ queryKey: ['trash'] })
    },
  })
}

export function useTrashTasks(projectId: string | null) {
  return useQuery({
    queryKey: ['trash', projectId],
    queryFn: () => getTrashTasks(projectId!),
    enabled: !!projectId,
    select: (data) => toArr<TrashTaskItem>(data),
  })
}

export function useRestoreTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => restoreTask(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] })
      qc.invalidateQueries({ queryKey: ['trash'] })
    },
  })
}

export function usePurgeTaskPermanent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => purgeTaskPermanent(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] })
      qc.invalidateQueries({ queryKey: ['trash'] })
    },
  })
}

// ── SUBTASKS ─────────────────────────────────────────
export function useSubtasks(taskId: string | null) {
  return useQuery({
    queryKey: ['subtasks', taskId],
    queryFn: () => getSubtasks(taskId!),
    enabled: !!taskId,
    select: (data) => toArr<Task>(data),
  })
}

export function useCreateSubtask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: { parentTaskId: string; title: string; project_id: string; description?: string }) =>
      createSubtask(payload.parentTaskId, { title: payload.title, project_id: payload.project_id, description: payload.description }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['subtasks', vars.parentTaskId] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}
