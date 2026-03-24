import axios from 'axios'
import type { RoiSummary, RoiTimeline } from '../types'

export const getRoiSummary = async (projectId?: string | null): Promise<RoiSummary> => {
  const params = projectId ? { project_id: projectId } : {}
  const { data } = await axios.get<RoiSummary>('/api/roi/summary', { params })
  return data
}

export const getRoiTimeline = async (
  days = 30,
  projectId?: string | null
): Promise<RoiTimeline> => {
  const params: Record<string, unknown> = { days }
  if (projectId) params.project_id = projectId
  const { data } = await axios.get<RoiTimeline>('/api/roi/timeline', { params })
  return data
}
