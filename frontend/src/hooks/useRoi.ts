import { useQuery } from '@tanstack/react-query'
import { getRoiSummary, getRoiTimeline } from '../services/roiApi'

export function useRoiSummary(projectId?: string | null) {
  return useQuery({
    queryKey: ['roi-summary', projectId ?? 'all'],
    queryFn: () => getRoiSummary(projectId),
    staleTime: 30_000,
  })
}

export function useRoiTimeline(days = 30, projectId?: string | null) {
  return useQuery({
    queryKey: ['roi-timeline', days, projectId ?? 'all'],
    queryFn: () => getRoiTimeline(days, projectId),
    staleTime: 30_000,
  })
}
