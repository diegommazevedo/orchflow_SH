/**
 * SprintPage — Vista de sprint ativo do projeto.
 *
 * Layout:
 *   Header: nome | meta | datas | status badge | progress | velocity | ações
 *   Área principal: Board.tsx com tasks do sprint (via useSprintBoard)
 *   Painel lateral: lista de sprints + histórico
 *
 * Leis respeitadas:
 * - Board.tsx reutilizado — tasks filtradas via useSprintBoard
 * - velocity exibido vem do backend (sprint.velocity)
 * - start/complete geram ActivityLog no backend (via useStartSprint / useCompleteSprint)
 * - ConformityEngine aplicado no backend para name e goal
 * - CORS mantido
 */
import { useState } from 'react'
import type { Sprint } from '../types'
import { Board, BoardSkeleton } from '../components/backlog/Board'
import { SprintCard } from '../components/sprint/SprintCard'
import {
  useSprints,
  useSprintBoard,
  useCreateSprint,
  useStartSprint,
  useCompleteSprint,
  sprintPeriod,
  getActiveSprint,
} from '../hooks/useSprints'

const STATUS_BADGE: Record<Sprint['status'], { label: string; color: string }> = {
  planning:  { label: 'Planejamento', color: '#7c6df0' },
  active:    { label: '● Ativo',      color: '#5eead4' },
  completed: { label: '✓ Concluído',  color: '#48cae4' },
  cancelled: { label: 'Cancelado',    color: '#666688' },
}

interface Props {
  projectId: string | null
  /** Sprint selecionado pelo usuário na sidebar (ou null = sprint ativo do projeto) */
  activeSprint?: Sprint | null
  onSelectSprint?: (sprint: Sprint) => void
}

// ── Modal de novo sprint ──────────────────────────────────────────────────────
function NewSprintModal({
  projectId,
  onClose,
}: {
  projectId: string
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [goal, setGoal] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate]     = useState('')
  const create = useCreateSprint()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    await create.mutateAsync({
      project_id: projectId,
      name: name.trim(),
      goal: goal.trim() || undefined,
      start_date: startDate || undefined,
      end_date:   endDate || undefined,
    })
    onClose()
  }

  return (
    <div className="sp-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="sp-modal">
        <div className="sp-modal-header">
          <h3>Novo Sprint</h3>
          <button className="sp-modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit} className="sp-modal-body">
          <label className="sp-field-label">Nome *</label>
          <input
            autoFocus
            className="tdp-input"
            placeholder="Sprint 1, MVP Alpha…"
            value={name}
            onChange={e => setName(e.target.value)}
            required
          />
          <label className="sp-field-label">Meta</label>
          <textarea
            className="tdp-textarea"
            rows={2}
            placeholder="O que queremos entregar neste sprint?"
            value={goal}
            onChange={e => setGoal(e.target.value)}
          />
          <div className="sp-dates-row">
            <div className="sp-date-field">
              <label className="sp-field-label">Início</label>
              <input type="date" className="tdp-input" value={startDate}
                     onChange={e => setStartDate(e.target.value)} />
            </div>
            <div className="sp-date-field">
              <label className="sp-field-label">Fim</label>
              <input type="date" className="tdp-input" value={endDate}
                     onChange={e => setEndDate(e.target.value)} />
            </div>
          </div>
          <div className="sp-modal-footer">
            <button type="button" className="btn-cancel-sm" onClick={onClose}>Cancelar</button>
            <button
              type="submit"
              className="tdp-save-btn"
              disabled={create.isPending || !name.trim()}
            >
              {create.isPending ? 'Criando…' : 'Criar sprint'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── SprintPage principal ──────────────────────────────────────────────────────
export function SprintPage({ projectId, activeSprint: propSprint, onSelectSprint }: Props) {
  const [showNewSprint, setShowNewSprint] = useState(false)

  const { data: sprintsRaw, isLoading: loadingSprints } = useSprints(projectId)
  const sprints = sprintsRaw ?? []

  // Sprint a exibir: prop override ou sprint ativo do projeto
  const displaySprint: Sprint | null = propSprint
    ?? getActiveSprint(sprints)
    ?? sprints[0]
    ?? null

  const { tasks, isLoading: loadingBoard } = useSprintBoard(displaySprint?.id ?? null)

  const startSprint    = useStartSprint()
  const completeSprint = useCompleteSprint()

  if (!projectId) {
    return (
      <div className="empty-state">
        <div className="empty-icon">◷</div>
        <div className="empty-title">Selecione um projeto</div>
        <div className="empty-sub">ou crie um novo na sidebar</div>
      </div>
    )
  }

  // ── Métricas do sprint atual ───────────────────────────────────────────────
  const totalTasks = tasks.length
  const doneTasks  = tasks.filter(t => t.status === 'done').length
  const pct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0

  const durationLabel = (() => {
    if (!displaySprint?.start_date) return null
    const start = new Date(displaySprint.start_date + 'T12:00:00')
    const ref   = displaySprint.end_date
      ? new Date(displaySprint.end_date + 'T12:00:00')
      : new Date()
    const days = Math.round((ref.getTime() - start.getTime()) / 86_400_000)
    return days >= 0 ? `${days} dias` : null
  })()

  const badge = displaySprint ? STATUS_BADGE[displaySprint.status] : null

  return (
    <div className="sp-wrapper">
      {/* ── Painel principal ─────────────────────────────────────── */}
      <div className="sp-main">
        {displaySprint ? (
          <>
            {/* Header do sprint */}
            <div className="sp-header">
              <div className="sp-header-top">
                <div className="sp-title-group">
                  <h2 className="sp-title">{displaySprint.name}</h2>
                  {badge && (
                    <span
                      className="sp-status-badge"
                      style={{ color: badge.color, borderColor: badge.color + '40' }}
                    >
                      {badge.label}
                    </span>
                  )}
                </div>

                {/* Ações */}
                <div className="sp-actions">
                  {displaySprint.status === 'planning' && (
                    <button
                      className="sp-btn sp-btn-start"
                      onClick={() => startSprint.mutate(displaySprint.id)}
                      disabled={startSprint.isPending}
                    >
                      {startSprint.isPending ? '…' : '▶ Iniciar'}
                    </button>
                  )}
                  {displaySprint.status === 'active' && (
                    <button
                      className="sp-btn sp-btn-complete"
                      onClick={() => completeSprint.mutate(displaySprint.id)}
                      disabled={completeSprint.isPending}
                    >
                      {completeSprint.isPending ? '…' : '✓ Concluir'}
                    </button>
                  )}
                  <button
                    className="sp-btn sp-btn-new"
                    onClick={() => setShowNewSprint(true)}
                  >
                    + Sprint
                  </button>
                </div>
              </div>

              {displaySprint.goal && (
                <div className="sp-goal">{displaySprint.goal}</div>
              )}

              {/* Período + métricas */}
              <div className="sp-meta-row">
                <span className="sp-meta-item">📅 {sprintPeriod(displaySprint)}</span>
                {durationLabel && <span className="sp-meta-item">⏱ {durationLabel}</span>}
                {displaySprint.status === 'completed' && displaySprint.velocity > 0 && (
                  <span className="sp-meta-item sp-velocity">⚡ {displaySprint.velocity} tasks entregues</span>
                )}
              </div>

              {/* Barra de progresso */}
              {totalTasks > 0 && (
                <div className="sp-progress-section">
                  <div className="sp-progress-track">
                    <div
                      className="sp-progress-fill"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="sp-progress-text">
                    {doneTasks}/{totalTasks} concluídas · {pct}%
                  </span>
                </div>
              )}
            </div>

            {/* Board filtrado pelo sprint */}
            <div className="sp-board-wrap">
              {loadingBoard ? (
                <BoardSkeleton />
              ) : tasks.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">📋</div>
                  <div className="empty-title">Sprint sem tasks</div>
                  <div className="empty-sub">
                    Adicione tasks ao sprint a partir do backlog ou crie novas via chat
                  </div>
                </div>
              ) : (
                <Board
                  tasks={tasks}
                  projectId={projectId}
                />
              )}
            </div>
          </>
        ) : (
          <div className="empty-state">
            {loadingSprints ? (
              <>
                <div className="empty-icon">◷</div>
                <div className="empty-title">Carregando sprints…</div>
              </>
            ) : (
              <>
                <div className="empty-icon">◷</div>
                <div className="empty-title">Nenhum sprint ainda</div>
                <div className="empty-sub">Crie o primeiro sprint para organizar seu backlog em ciclos</div>
                <button className="empty-action-btn" onClick={() => setShowNewSprint(true)}>
                  + Criar primeiro sprint
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Painel lateral: lista de sprints ─────────────────────── */}
      <div className="sp-sidebar">
        <div className="sp-sidebar-header">
          <span className="sp-sidebar-title">Sprints</span>
          <button
            className="sp-sidebar-add"
            onClick={() => setShowNewSprint(true)}
            title="Novo sprint"
          >+</button>
        </div>

        {loadingSprints ? (
          [1, 2].map(n => (
            <div key={n} className="skeleton skeleton-card" style={{ margin: '4px 0' }}>
              <div className="skeleton skeleton-line skeleton-line-w2" style={{ height: 10 }} />
            </div>
          ))
        ) : sprints.length === 0 ? (
          <div className="sp-sidebar-empty">Sem sprints</div>
        ) : (
          sprints.map(s => (
            <SprintCard
              key={s.id}
              sprint={s}
              active={s.id === displaySprint?.id}
              onSelect={id => {
                const found = sprints.find(sp => sp.id === id)
                if (found) onSelectSprint?.(found)
              }}
            />
          ))
        )}
      </div>

      {/* Modal novo sprint */}
      {showNewSprint && (
        <NewSprintModal
          projectId={projectId}
          onClose={() => setShowNewSprint(false)}
        />
      )}
    </div>
  )
}
