/**
 * useAITokens.ts — Sprint 7.5: AI Token Manager
 *
 * Hooks para carteira, uso e motores de IA.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  creditAIWallet,
  getAIEngines,
  getAIUsage,
  getAIWallet,
  setAIWalletAlert,
} from '../services/api'
import type { AIEngine, AIUsageSummary, AIWallet } from '../types'

// ── Chaves de cache ───────────────────────────────────────────────────────────

const WALLET_KEY = ['ai', 'wallet'] as const
const USAGE_KEY  = (days: number) => ['ai', 'usage', days] as const
const ENGINES_KEY = ['ai', 'engines'] as const

// ── useAIWallet ───────────────────────────────────────────────────────────────

export function useAIWallet() {
  const qc = useQueryClient()

  const { data: wallet, isLoading: loading } = useQuery<AIWallet>({
    queryKey: WALLET_KEY,
    queryFn: getAIWallet,
    staleTime: 60_000,
  })

  const creditMutation = useMutation({
    mutationFn: ({ amount, description }: { amount: number; description: string }) =>
      creditAIWallet(amount, description),
    onSuccess: () => qc.invalidateQueries({ queryKey: WALLET_KEY }),
  })

  const alertMutation = useMutation({
    mutationFn: (threshold: number | null) => setAIWalletAlert(threshold),
    onSuccess: () => qc.invalidateQueries({ queryKey: WALLET_KEY }),
  })

  return {
    wallet,
    loading,
    creditWallet: (amount: number, description: string) =>
      creditMutation.mutate({ amount, description }),
    setAlert: (threshold: number | null) => alertMutation.mutate(threshold),
    isCreditPending: creditMutation.isPending,
    isAlertPending: alertMutation.isPending,
  }
}

// ── useAIUsage ────────────────────────────────────────────────────────────────

export function useAIUsage(days = 30) {
  const { data: summary, isLoading: loading } = useQuery<AIUsageSummary>({
    queryKey: USAGE_KEY(days),
    queryFn: () => getAIUsage({ days }),
    staleTime: 120_000,
  })

  return {
    summary,
    logs: summary?.logs ?? [],
    loading,
  }
}

// ── useAIEngines ──────────────────────────────────────────────────────────────

export function useAIEngines() {
  const { data: engines, isLoading: loading } = useQuery<AIEngine[]>({
    queryKey: ENGINES_KEY,
    queryFn: getAIEngines,
    staleTime: 300_000, // 5 min — motores mudam raramente
  })

  return {
    engines: engines ?? [],
    loading,
  }
}
