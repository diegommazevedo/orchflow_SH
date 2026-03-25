/**
 * useComments / useActivityFeed
 *
 * Sprint 5A — Hooks para comentários por task e feed de atividade.
 *
 * Leis respeitadas:
 * - Zero wizard para comentários (risco LOW, reversível)
 * - ActivityLog é só leitura no frontend — gerado pelo backend
 * - ConformityEngine aplicado no backend (POST /api/comments/task/{id})
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import type { Comment, ActivityLog, ActivityAction } from '../types'

// ── API helpers ───────────────────────────────────────────────────────────────

async function fetchComments(taskId: string): Promise<Comment[]> {
  const { data } = await axios.get<Comment[]>(`/api/comments/task/${taskId}`)
  return data
}

async function postComment(
  taskId: string,
  body: string,
  mentions: string[] = [],
): Promise<Comment> {
  const { data } = await axios.post<Comment>(`/api/comments/task/${taskId}`, {
    body,
    mentions,
    user_id: 'default',
  })
  return data
}

async function softDeleteComment(commentId: string): Promise<void> {
  await axios.delete(`/api/comments/${commentId}`)
}

async function fetchActivity(
  entityType: string,
  entityId: string,
): Promise<ActivityLog[]> {
  const { data } = await axios.get<ActivityLog[]>(
    `/api/activity/entity/${entityType}/${entityId}`,
  )
  return data
}

// ── useComments ───────────────────────────────────────────────────────────────

export function useComments(taskId: string | null) {
  const qc = useQueryClient()

  const query = useQuery<Comment[]>({
    queryKey: ['comments', taskId],
    queryFn:  () => fetchComments(taskId!),
    enabled:  !!taskId,
  })

  const addComment = useMutation({
    mutationFn: ({ body, mentions }: { body: string; mentions?: string[] }) =>
      postComment(taskId!, body, mentions ?? []),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['comments', taskId] }),
  })

  const deleteComment = useMutation({
    mutationFn: (commentId: string) => softDeleteComment(commentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['comments', taskId] }),
  })

  return {
    comments:      query.data ?? [],
    isLoading:     query.isLoading,
    addComment:    (body: string, mentions?: string[]) =>
      addComment.mutateAsync({ body, mentions }),
    deleteComment: (id: string) => deleteComment.mutateAsync(id),
    isSending:     addComment.isPending,
  }
}

// ── useActivityFeed ───────────────────────────────────────────────────────────

export function useActivityFeed(
  entityType: string | null,
  entityId: string | null,
) {
  const query = useQuery<ActivityLog[]>({
    queryKey: ['activity', entityType, entityId],
    queryFn:  () => fetchActivity(entityType!, entityId!),
    enabled:  !!(entityType && entityId),
    refetchInterval: 15_000,   // atualiza a cada 15s
  })

  return {
    logs:      query.data ?? [],
    isLoading: query.isLoading,
  }
}

// ── Utilitário: tempo relativo (reutilizado pelos componentes) ────────────────

export function relativeTime(isoString: string): string {
  const then = new Date(isoString).getTime()
  const now  = Date.now()
  const diff = now - then                     // ms

  if (diff < 0)         return 'agora'
  if (diff < 60_000)    return `há ${Math.floor(diff / 1_000)}s`
  if (diff < 3_600_000) return `há ${Math.floor(diff / 60_000)}min`
  if (diff < 86_400_000) return `há ${Math.floor(diff / 3_600_000)}h`

  const d = new Date(isoString)
  const today     = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  if (d.toDateString() === today.toDateString())     return 'hoje'
  if (d.toDateString() === yesterday.toDateString()) return 'ontem'
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

// ── Utilitário: ícone por ação ────────────────────────────────────────────────

export const ACTION_ICONS: Record<ActivityAction, string> = {
  created:            '✦',
  moved:              '→',
  updated:            '✎',
  commented:          '💬',
  deleted:              '×',
  assigned:             '👤',
  due_changed:          '📅',
  quadrant_changed:   '◈',
}

export const ACTION_LABELS: Record<ActivityAction, (meta: Record<string, unknown>) => string> = {
  created:            ()  => 'criada',
  moved:              (m) => `movida de ${m.from} para ${m.to}`,
  updated:            (m) => `campos atualizados: ${(m.changed_fields as string[] ?? []).join(', ')}`,
  commented:          ()  => 'comentário adicionado',
  deleted:            (m) => `removida${m.title ? `: "${m.title}"` : ''}`,
  assigned:           (m) => `atribuída a ${m.assignee ?? '?'}`,
  due_changed:        (m) => `prazo alterado para ${m.due_date ?? '?'}`,
  quadrant_changed:   (m) => `quadrante ${m.from ?? '?'} → ${m.to ?? '?'}`,
}
