/**
 * SprintCard — card de sprint para lista e histórico.
 *
 * Exibe: nome | status badge | período | velocity
 * Barra de progresso baseada em tasks done / total (via sprintBoard, se disponível)
 * Clicável → callback onSelect(sprint.id)
 *
 * Leis respeitadas:
 * - velocity exibido vem do backend (campo `sprint.velocity`)
 * - Zero chamadas ao banco neste componente
 */
import type { Sprint } from '../../types'
import { sprintPeriod } from '../../hooks/useSprints'

const STATUS_CONFIG: Record<Sprint['status'], { label: string; color: string }> = {
  planning:  { label: 'Planejamento', color: '#7c6df0' },
  active:    { label: 'Ativo',        color: '#5eead4' },
  completed: { label: 'Concluído',    color: '#48cae4' },
  cancelled: { label: 'Cancelado',    color: '#666688' },
}

interface Props {
  sprint: Sprint
  /** total de tasks no sprint (do board) */
  totalTasks?: number
  /** tasks done no sprint (do board) */
  doneTasks?: number
  active?: boolean
  onSelect?: (id: string) => void
}

export function SprintCard({ sprint, totalTasks, doneTasks, active, onSelect }: Props) {
  const cfg = STATUS_CONFIG[sprint.status]
  const period = sprintPeriod(sprint)
  const pct = totalTasks && totalTasks > 0
    ? Math.round(((doneTasks ?? 0) / totalTasks) * 100)
    : 0

  return (
    <div
      className={`sc-card${active ? ' sc-card-active' : ''}`}
      onClick={() => onSelect?.(sprint.id)}
      role={onSelect ? 'button' : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onKeyDown={e => { if (e.key === 'Enter') onSelect?.(sprint.id) }}
    >
      {/* Header */}
      <div className="sc-header">
        <span className="sc-name">{sprint.name}</span>
        <span className="sc-badge" style={{ color: cfg.color, borderColor: cfg.color + '40' }}>
          {cfg.label}
        </span>
      </div>

      {/* Meta / goal */}
      {sprint.goal && (
        <div className="sc-goal">{sprint.goal}</div>
      )}

      {/* Período */}
      <div className="sc-period">{period}</div>

      {/* Barra de progresso */}
      {totalTasks !== undefined && totalTasks > 0 && (
        <div className="sc-progress-wrap">
          <div className="sc-progress-bar">
            <div
              className="sc-progress-fill"
              style={{
                width: `${pct}%`,
                background: sprint.status === 'completed' ? '#5eead4' : '#7c6df0',
              }}
            />
          </div>
          <span className="sc-progress-label">
            {doneTasks ?? 0}/{totalTasks} tasks · {pct}%
          </span>
        </div>
      )}

      {/* Velocity (sprints concluídos) */}
      {sprint.status === 'completed' && sprint.velocity > 0 && (
        <div className="sc-velocity">
          ⚡ {sprint.velocity} tasks entregues
        </div>
      )}
    </div>
  )
}
