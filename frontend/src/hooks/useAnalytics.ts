/**
 * hooks/useAnalytics.ts
 *
 * Sprint 6A — Hooks de dados para o Dashboard ROI.
 *
 * Leis respeitadas:
 *   - Somente leitura (GET) — zero mutações
 *   - staleTime 5min — evita re-fetches desnecessários
 *   - CORS: proxy Vite /api → 127.0.0.1:8010
 */
import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import type { RoiData, HeatmapDay } from '../types'

const STALE = 5 * 60 * 1000   // 5 minutos

export function useRoiData(userId = 'default') {
  return useQuery<RoiData>({
    queryKey: ['analytics-roi', userId],
    queryFn:  async () => {
      const res = await axios.get(`/api/analytics/roi/${userId}`)
      return res.data as RoiData
    },
    staleTime: STALE,
  })
}

export function useHeatmap(userId = 'default') {
  return useQuery<HeatmapDay[]>({
    queryKey: ['analytics-heatmap', userId],
    queryFn:  async () => {
      const res = await axios.get(`/api/analytics/heatmap/${userId}`)
      return (res.data ?? []) as HeatmapDay[]
    },
    staleTime: STALE,
  })
}
