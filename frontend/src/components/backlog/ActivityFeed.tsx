/**
 * ActivityFeed — feed compacto de atividade de uma entidade.
 *
 * Layout por entrada:
 *   [ícone ação] [descrição legível] · [tempo relativo]
 *
 * Exemplos:
 *   → movida de backlog para Em andamento · há 5min
 *   💬 comentário adicionado · há 1h
 *   ✦ criada · ontem
 *
 * Colapsável para não ocupar espaço desnecessário.
 *
 * Leis respeitadas:
 * - Somente leitura — ActivityLog é gerado pelo backend
 * - Zero chamadas ao banco durante render
 * - refetchInterval 15s para manter o feed atualizado
 */
import { useState } from 'react'
import type { ActivityLog } from '../../types'
import { useActivityFeed, relativeTime, ACTION_ICONS, ACTION_LABELS } from '../../hooks/useComments'
import { toArr } from '../../utils/array'

interface Props {
  entityType: string
  entityId: string
}

function ActivityEntry({ log }: { log: ActivityLog }) {
  const icon  = ACTION_ICONS[log.action] ?? '·'
  const label = ACTION_LABELS[log.action]?.(log.metadata) ?? log.action
  const time  = relativeTime(log.created_at)

  return (
    <div className="af-entry">
      <span className={`af-icon af-icon-${log.action}`} aria-hidden>{icon}</span>
      <span className="af-label">{label}</span>
      <span className="af-sep">·</span>
      <span className="af-time">{time}</span>
    </div>
  )
}

export function ActivityFeed({ entityType, entityId }: Props) {
  const { logs: logsRaw, isLoading } = useActivityFeed(entityType, entityId)
  const logs = toArr<ActivityLog>(logsRaw)
  const [collapsed, setCollapsed]  = useState(false)

  const visible = collapsed ? [] : logs.slice(0, 15)

  return (
    <div className="af-wrapper">
      <button
        className="af-toggle"
        onClick={() => setCollapsed(c => !c)}
        aria-expanded={!collapsed}
      >
        <span className="af-toggle-icon">{collapsed ? '▶' : '▼'}</span>
        Atividade
        {logs.length > 0 && <span className="af-count">{logs.length}</span>}
      </button>

      {!collapsed && (
        <div className="af-list">
          {isLoading ? (
            <div className="af-loading">
              <div className="skeleton skeleton-line skeleton-line-w1" style={{ height: 10, marginBottom: 6 }} />
              <div className="skeleton skeleton-line skeleton-line-w2" style={{ height: 10 }} />
            </div>
          ) : logs.length === 0 ? (
            <div className="af-empty">Nenhuma atividade registrada ainda.</div>
          ) : (
            <>
              {visible.map(log => (
                <ActivityEntry key={log.id} log={log} />
              ))}
              {logs.length > 15 && (
                <div className="af-more">+ {logs.length - 15} entradas anteriores</div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
