/**
 * useSprints / useSprintBoard / useStartSprint / useCompleteSprint
 *
 * Sprint 5B — Hooks para gestão de sprints.
 *
 * Leis respeitadas:
 * - velocity calculado pelo backend — nunca no frontend
 * - ActivityLog gerado pelo backend (start/complete)
 * - ConformityEngine aplicado no backend para name e goal
 * - Board de sprint reutiliza o mesmo padrão de useTasks
 * - CORS mantido via proxy Vite / main.py
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../services/api'
import type { Sprint, SprintBoard, SprintCloseResult, Task } from '../types'
import { toArr } from '../utils/array'

// ── API helpers ───────────────────────────────────────────────────────────────

async function fetchSprints(projectId: string): Promise<Sprint[]> {
  const { data } = await api.get<Sprint[]>(`/sprints/project/${projectId}`)
  return data
}

async function createSprint(payload: {
  project_id: string
  name: string
  goal?: string
  start_date?: string
  end_date?: string
  type?: string
  recurrence_unit?: string
  recurrence_interval?: number
  auto_create?: boolean
}): Promise<Sprint> {
  const { data } = await api.post<Sprint>('/sprints/', payload)
  return data
}

async function closeSprint(id: string): Promise<SprintCloseResult> {
  const { data } = await api.post<SprintCloseResult>(`/sprints/${id}/close`)
  return data
}

async function fetchSprintSeries(id: string): Promise<Sprint[]> {
  const { data } = await api.get<Sprint[]>(`/sprints/${id}/series`)
  return data
}

async function updateSprint(
  id: string,
  payload: Partial<Pick<Sprint, 'name' | 'goal' | 'start_date' | 'end_date' | 'status' | 'recurrence_unit' | 'recurrence_interval' | 'auto_create'>>,
): Promise<Sprint> {
  const { data } = await api.patch<Sprint>(`/sprints/${id}`, payload)
  return data
}

async function deleteSprint(id: string): Promise<void> {
  await api.delete(`/sprints/${id}`)
}

async function startSprint(id: string): Promise<Sprint> {
  const { data } = await api.post<Sprint>(`/sprints/${id}/start`)
  return data
}

async function completeSprint(id: string): Promise<Sprint> {
  const { data } = await api.post<Sprint>(`/sprints/${id}/complete`)
  return data
}

async function addTaskToSprint(sprintId: string, taskId: string): Promise<void> {
  await api.post(`/sprints/${sprintId}/tasks`, { task_id: taskId })
}

async function removeTaskFromSprint(sprintId: string, taskId: string): Promise<void> {
  await api.delete(`/sprints/${sprintId}/tasks/${taskId}`)
}

async function fetchSprintBoard(sprintId: string): Promise<SprintBoard> {
  const { data } = await api.get<SprintBoard>(`/sprints/${sprintId}/board`)
  // O backend retorna tasks como dicts — garantir tipo correto
  return data as SprintBoard
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

export function useSprints(projectId: string | null) {
  return useQuery<Sprint[]>({
    queryKey: ['sprints', projectId],
    queryFn:  () => fetchSprints(projectId!),
    enabled:  !!projectId,
    select:   (data) => toArr<Sprint>(data),
  })
}

export function useSprintBoard(sprintId: string | null) {
  const query = useQuery<SprintBoard>({
    queryKey: ['sprint-board', sprintId],
    queryFn:  () => fetchSprintBoard(sprintId!),
    enabled:  !!sprintId,
  })
  // Expõe tasks tipadas como Task[] para o Board.tsx
  const tasks: Task[] = toArr<Task>(query.data?.tasks)
  return { ...query, tasks }
}

export function useCreateSprint() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createSprint,
    onSuccess: (_data, vars) =>
      qc.invalidateQueries({ queryKey: ['sprints', vars.project_id] }),
  })
}

export function useUpdateSprint() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...payload }: { id: string } & Parameters<typeof updateSprint>[1]) =>
      updateSprint(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sprints'] }),
  })
}

export function useDeleteSprint() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteSprint(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sprints'] }),
  })
}

export function useStartSprint() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => startSprint(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sprints'] })
      qc.invalidateQueries({ queryKey: ['activity'] })
    },
  })
}

export function useCompleteSprint() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => completeSprint(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sprints'] })
      qc.invalidateQueries({ queryKey: ['activity'] })
      qc.invalidateQueries({ queryKey: ['sprint-board'] })
    },
  })
}

export function useAddTaskToSprint() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ sprintId, taskId }: { sprintId: string; taskId: string }) =>
      addTaskToSprint(sprintId, taskId),
    onSuccess: (_data, vars) =>
      qc.invalidateQueries({ queryKey: ['sprint-board', vars.sprintId] }),
  })
}

export function useRemoveTaskFromSprint() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ sprintId, taskId }: { sprintId: string; taskId: string }) =>
      removeTaskFromSprint(sprintId, taskId),
    onSuccess: (_data, vars) =>
      qc.invalidateQueries({ queryKey: ['sprint-board', vars.sprintId] }),
  })
}

// ── Sprint 7: close + series ──────────────────────────────────────────────────

export function useCloseSprint() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => closeSprint(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sprints'] })
      qc.invalidateQueries({ queryKey: ['sprint-board'] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
      qc.invalidateQueries({ queryKey: ['activity'] })
    },
  })
}

export function useSprintSeries(sprintId: string | null) {
  return useQuery<Sprint[]>({
    queryKey: ['sprint-series', sprintId],
    queryFn: () => fetchSprintSeries(sprintId!),
    enabled: !!sprintId,
    select: (data) => toArr<Sprint>(data),
  })
}

// ── Utilitário: sprint ativo (status = active) ────────────────────────────────
export function getActiveSprint(sprints: Sprint[] | null | undefined): Sprint | null {
  return toArr<Sprint>(sprints).find(s => s.status === 'active') ?? null
}

// ── Utilitário: formatação de período ────────────────────────────────────────
export function sprintPeriod(sprint: Sprint): string {
  const fmt = (iso: string | null | undefined) => {
    if (!iso) return '?'
    return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit',
    })
  }
  if (!sprint.start_date && !sprint.end_date) return 'Datas não definidas'
  return `${fmt(sprint.start_date)} → ${fmt(sprint.end_date)}`
}
