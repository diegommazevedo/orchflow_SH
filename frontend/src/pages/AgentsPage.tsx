/**
 * AgentsPage — Painel de agentes, memória semântica e dicionário pessoal.
 *
 * Seção 1: Status dos agentes ativos (estático)
 * Seção 2: Memória semântica — GET /api/agent/memory/stats/default
 * Seção 3: Dicionário pessoal — GET /api/agent/profile/default
 *          Remover entrada → PATCH /api/agent/profile/default
 * Seção 4: Produtividade — GET /api/focus/productivity/default (Sprint 5C)
 *
 * Leis respeitadas:
 * - GET apenas (exceto remoção de dict, que é PATCH sem banco direto)
 * - PATCH respeita ConformityEngine no backend
 * - Zero escrita em banco diretamente
 * - CORS não afetado
 * - PRODUCTIVITY_LOG.md gerado no servidor — apenas exibido aqui
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../services/api'
import type { ProductivitySnapshot } from '../types'
import { toArr } from '../utils/array'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface MemoryStats {
  memory_count: number
  top_actions: Record<string, number>
  total_hits: number
  trust_level: string
  personal_dict_size: number
}

interface UserProfile {
  user_id: string
  personal_dict: Record<string, string>
  confidence_threshold: number
  trust_level: string
  memory_count: number
  is_public: boolean
}

// ── Agentes estáticos ─────────────────────────────────────────────────────────

interface AgentInfo {
  id: string
  name: string
  description: string
  icon: string
  checkUrl?: string
}

const STATIC_AGENTS: AgentInfo[] = [
  {
    id: 'orchestrator',
    name: 'Agente OrchFlow',
    description: 'Interpreta comandos, gerencia tarefas e executa operações via chat ou voz.',
    icon: '⬡',
    checkUrl: '/agent/profile/default',
  },
  {
    id: 'voice',
    name: 'Agente de Voz (Whisper)',
    description: 'Transcreve áudio em tempo real usando Groq Whisper large-v3-turbo.',
    icon: '🎤',
  },
  {
    id: 'import',
    name: 'Agente de Importação',
    description: 'Extrai projetos e tarefas de contratos PDF, planilhas XLSX e CSV via Groq.',
    icon: '📎',
    checkUrl: '/upload/detect',
  },
]

// ── Hooks ──────────────────────────────────────────────────────────────────────

function useMemoryStats() {
  return useQuery<MemoryStats>({
    queryKey: ['memory-stats'],
    queryFn: async () => {
      const { data } = await api.get('/agent/memory/stats/default')
      return data
    },
    refetchInterval: 30_000,
  })
}

function useProfile() {
  return useQuery<UserProfile>({
    queryKey: ['agent-profile'],
    queryFn: async () => {
      const { data } = await api.get('/agent/profile/default')
      return data
    },
  })
}

// ── Seção 1: Agentes ──────────────────────────────────────────────────────────

function AgentCard({ agent }: { agent: AgentInfo }) {
  const ping = useQuery({
    queryKey: ['agent-ping', agent.id],
    queryFn: async () => {
      if (!agent.checkUrl) return { ok: true }
      await api.get(agent.checkUrl!)
      return { ok: true }
    },
    retry: 1,
    refetchInterval: 60_000,
    enabled: !!agent.checkUrl,
  })

  const online = !agent.checkUrl || ping.isSuccess

  return (
    <div className="ag-card">
      <div className="ag-card-icon">{agent.icon}</div>
      <div className="ag-card-info">
        <div className="ag-card-name">{agent.name}</div>
        <div className="ag-card-desc">{agent.description}</div>
      </div>
      <span className={`ag-status-badge${online ? ' ag-online' : ' ag-offline'}`}>
        {online ? '● online' : '● offline'}
      </span>
    </div>
  )
}

// ── Seção 2: Memória semântica ─────────────────────────────────────────────────

function MemorySection({ stats }: { stats: MemoryStats }) {
  const totalRequests = stats.total_hits + stats.memory_count
  const savingPct = totalRequests > 0
    ? Math.round((stats.total_hits / totalRequests) * 100)
    : 0

  const topActions = Object.entries(stats.top_actions ?? {})
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6)

  if (stats.memory_count === 0) {
    return (
      <div className="ag-section">
        <h3 className="ag-section-title">Memória Semântica</h3>
        <div className="empty-state" style={{ minHeight: 120 }}>
          <div className="empty-icon" style={{ fontSize: 28 }}>🧠</div>
          <div className="empty-title">Nenhuma memória ainda</div>
          <div className="empty-sub">Use o chat — o agente aprende com cada comando e melhora a velocidade de resposta</div>
        </div>
      </div>
    )
  }

  return (
    <div className="ag-section">
      <h3 className="ag-section-title">Memória Semântica</h3>

      <div className="ag-mem-stats">
        <div className="ag-mem-stat">
          <span className="ag-mem-val">{stats.memory_count}</span>
          <span className="ag-mem-key">memórias</span>
        </div>
        <div className="ag-mem-stat">
          <span className="ag-mem-val">{stats.total_hits}</span>
          <span className="ag-mem-key">cache hits</span>
        </div>
        <div className="ag-mem-stat">
          <span className="ag-mem-val" style={{ color: '#5eead4' }}>{savingPct}%</span>
          <span className="ag-mem-key">economia tokens</span>
        </div>
        <div className="ag-mem-stat">
          <span className="ag-mem-val">{stats.trust_level}</span>
          <span className="ag-mem-key">nível de confiança</span>
        </div>
      </div>

      <div className="ag-progress-wrap">
        <div className="ag-progress-label">
          Resolução local <span>{savingPct}%</span>
        </div>
        <div className="ag-progress-bar">
          <div className="ag-progress-fill" style={{ width: `${savingPct}%` }} />
        </div>
        <div className="ag-progress-hint">
          Meta: 90% após período de uso
        </div>
      </div>

      {topActions.length > 0 && (
        <div className="ag-top-actions">
          <div className="ag-sub-title">Top ações</div>
          <div className="ag-action-list">
            {topActions.map(([action, count]) => (
              <div key={action} className="ag-action-item">
                <span className="ag-action-name">{action}</span>
                <span className="ag-action-count">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Seção 3: Dicionário pessoal ───────────────────────────────────────────────

function DictSection({ profile }: { profile: UserProfile }) {
  const qc = useQueryClient()
  const entries = Object.entries(profile.personal_dict ?? {})

  const removeEntry = useMutation({
    mutationFn: async (key: string) => {
      await api.patch(`/agent/profile/${profile.user_id}`, {
        personal_dict_remove: [key],
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent-profile'] })
    },
  })

  return (
    <div className="ag-section">
      <h3 className="ag-section-title">
        Dicionário Pessoal
        <span className="ag-section-count">{entries.length}</span>
      </h3>

      {entries.length === 0 ? (
        <div className="empty-state" style={{ minHeight: 100 }}>
          <div className="empty-icon" style={{ fontSize: 24 }}>📖</div>
          <div className="empty-title">Nenhuma abreviação ainda</div>
          <div className="empty-sub">Ao usar o chat, o agente aprende seus padrões automaticamente</div>
        </div>
      ) : (
        <div className="ag-dict-list">
          {entries.map(([pattern, expansion]) => (
            <div key={pattern} className="ag-dict-item">
              <span className="ag-dict-pattern">{pattern}</span>
              <span className="ag-dict-arrow">→</span>
              <span className="ag-dict-expansion">{expansion}</span>
              <button
                className="ag-dict-remove"
                title="Remover"
                disabled={removeEntry.isPending}
                onClick={() => removeEntry.mutate(pattern)}
              >×</button>
            </div>
          ))}
        </div>
      )}

      <div className="ag-profile-meta">
        <span>Confiança: {Math.round(profile.confidence_threshold * 100)}%</span>
        <span>Perfil: {profile.is_public ? 'público' : 'privado'}</span>
      </div>
    </div>
  )
}

// ── Hook de produtividade ─────────────────────────────────────────────────────

function useProductivity(userId = 'default') {
  return useQuery({
    queryKey: ['productivity', userId],
    queryFn: async () => {
      const res = await api.get(`/focus/productivity/${userId}`)
      return res.data as { snapshots: ProductivitySnapshot[]; log_md: string }
    },
    staleTime: 60_000,
  })
}

// ── Helpers de formatação ─────────────────────────────────────────────────────

function fmtMinutes(m: number): string {
  const h = Math.floor(m / 60)
  const min = m % 60
  if (h > 0 && min > 0) return `${h}h ${min}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}

function moodLabel(avg: number | null | undefined): string {
  if (avg === null || avg === undefined) return '—'
  if (avg < 0.5) return '😤 bloqueado'
  if (avg < 1.5) return '😐 ok'
  return '🔥 no flow'
}

// ── Seção de Produtividade ────────────────────────────────────────────────────

function ProductivitySection() {
  const { data, isLoading } = useProductivity()
  const [showLog, setShowLog] = useState(false)

  if (isLoading) {
    return <div className="ag-section ag-loading">Carregando produtividade…</div>
  }

  const snaps  = toArr<ProductivitySnapshot>(data?.snapshots)
  const logMd  = data?.log_md ?? ''

  // Últimos 7 dias
  const last7  = snaps.slice(0, 7)
  const totalFocus7   = last7.reduce((s, x) => s + (x.focus_minutes || 0), 0)
  const totalTasks7   = last7.reduce((s, x) => s + (x.tasks_completed || 0), 0)
  const moodScores    = last7.filter(x => x.mood_avg != null).map(x => x.mood_avg as number)
  const avgMood       = moodScores.length ? moodScores.reduce((a, b) => a + b, 0) / moodScores.length : null
  const bestDay       = [...last7].sort((a, b) => (b.focus_minutes || 0) - (a.focus_minutes || 0))[0]

  return (
    <div className="ag-section">
      <h3 className="ag-section-title">Produtividade (7 dias)</h3>

      {snaps.length === 0 ? (
        <div className="empty-state" style={{ minHeight: 80 }}>
          <div className="empty-icon" style={{ fontSize: 24 }}>⚡</div>
          <div className="empty-title">Nenhuma sessão registrada</div>
          <div className="empty-sub">Use o widget ⚡ para iniciar uma sessão de hiperfoco</div>
        </div>
      ) : (
        <>
          <div className="ag-prod-cards">
            <div className="ag-prod-card">
              <span className="ag-prod-value">{fmtMinutes(totalFocus7)}</span>
              <span className="ag-prod-label">Total foco (7d)</span>
            </div>
            <div className="ag-prod-card">
              <span className="ag-prod-value">{totalTasks7}</span>
              <span className="ag-prod-label">Tasks concluídas</span>
            </div>
            <div className="ag-prod-card">
              <span className="ag-prod-value">{moodLabel(avgMood)}</span>
              <span className="ag-prod-label">Mood predominante</span>
            </div>
            {bestDay && (
              <div className="ag-prod-card">
                <span className="ag-prod-value">{fmtMinutes(bestDay.focus_minutes)}</span>
                <span className="ag-prod-label">Melhor dia ({bestDay.date})</span>
              </div>
            )}
          </div>

          {/* Minigráfico de barras dos últimos 7 dias */}
          <div className="ag-prod-bars">
            {last7.slice().reverse().map(snap => {
              const maxMin = Math.max(...last7.map(s => s.focus_minutes || 1), 1)
              const pct = Math.round(((snap.focus_minutes || 0) / maxMin) * 100)
              return (
                <div key={snap.date} className="ag-prod-bar-wrap" title={`${snap.date}: ${fmtMinutes(snap.focus_minutes)}`}>
                  <div className="ag-prod-bar" style={{ height: `${Math.max(pct, 2)}%` }} />
                  <span className="ag-prod-bar-label">
                    {new Date(snap.date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}
                  </span>
                </div>
              )
            })}
          </div>

          <button className="ag-prod-log-btn" onClick={() => setShowLog(true)}>
            📋 Ver log completo
          </button>
        </>
      )}

      {/* Modal com PRODUCTIVITY_LOG.md */}
      {showLog && (
        <div className="ag-log-overlay" onClick={() => setShowLog(false)}>
          <div className="ag-log-modal" onClick={e => e.stopPropagation()}>
            <div className="ag-log-header">
              <span>Log de Produtividade</span>
              <button className="fw-close-btn" onClick={() => setShowLog(false)}>×</button>
            </div>
            <pre className="ag-log-content">{logMd || 'Nenhum dado ainda.'}</pre>
          </div>
        </div>
      )}
    </div>
  )
}

// ── AgentsPage ────────────────────────────────────────────────────────────────

export function AgentsPage() {
  const memStats = useMemoryStats()
  const profileQ = useProfile()

  return (
    <div className="ag-wrapper">
      <div className="ag-page-header">
        <h2 className="ag-page-title">Painel de Agentes</h2>
        <p className="ag-page-sub">
          Agentes OrchFlow · Groq llama-3.3-70b-versatile · Whisper large-v3-turbo
        </p>
      </div>

      {/* Seção 1 — Agentes */}
      <div className="ag-section">
        <h3 className="ag-section-title">Agentes Ativos</h3>
        <div className="ag-agents-list">
          {STATIC_AGENTS.map(a => <AgentCard key={a.id} agent={a} />)}
        </div>
      </div>

      {/* Seção 2 — Memória */}
      {memStats.isLoading ? (
        <div className="ag-section ag-loading">Carregando estatísticas…</div>
      ) : memStats.data ? (
        <MemorySection stats={memStats.data} />
      ) : (
        <div className="ag-section ag-loading">Nenhuma estatística disponível</div>
      )}

      {/* Seção 3 — Dicionário */}
      {profileQ.isLoading ? (
        <div className="ag-section ag-loading">Carregando perfil…</div>
      ) : profileQ.data ? (
        <DictSection profile={profileQ.data} />
      ) : null}

      {/* Seção 4 — Produtividade (Sprint 5C) */}
      <ProductivitySection />
    </div>
  )
}
