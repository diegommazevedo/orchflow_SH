import { api } from './api'
import type { RoiSummary, RoiTimeline } from '../types'

export const getRoiSummary = async (projectId?: string | null): Promise<RoiSummary> => {
  const params = projectId ? { project_id: projectId } : {}
  const { data } = await api.get<RoiSummary>('/roi/summary', { params })
  return data
}

export const getRoiTimeline = async (
  days = 30,
  projectId?: string | null
): Promise<RoiTimeline> => {
  const params: Record<string, unknown> = { days }
  if (projectId) params.project_id = projectId
  const { data } = await api.get<RoiTimeline>('/roi/timeline', { params })
  return data
}
