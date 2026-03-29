/**
 * ActivityFeed — atividade da entidade (task / project) no painel de detalhe.
 *
 * - GET /api/activity/entity/{type}/{id} (user_name quando UUID resolve no banco)
 * - Seção colapsável "▸ Atividade", até 10 itens + "ver mais"
 * - Avatar/iniciais, frase em PT, tempo relativo
 */
import { useState } from 'react'
import type { ActivityLog } from '../../types'
import { useActivityFeed, relativeTime, ACTION_LABELS } from '../../hooks/useComments'
import { toArr } from '../../utils/array'
import { nameToColor, initialsFromName } from '../../utils/avatar'

interface Props {
  entityType: string
  entityId: string
}

/** Rótulo curto da ação para o contexto da task (português). */
function activityMessageForTask(log: ActivityLog): string {
  const m = log.metadata
  const a = log.action as string

  if (a === 'status_changed' || a === 'moved') {
    const to = typeof m?.to === 'string' ? m.to : '?'
    return `moveu para ${to}`
  }

  switch (log.action) {
    case 'created':
      return 'criou esta tarefa'
    case 'updated':
      return 'atualizou'
    case 'commented':
      return 'comentou'
    case 'deleted':
      return 'arquivou'
    case 'restored':
      return 'restaurou'
    case 'template_applied': {
      const n = m?.template_name ?? m?.template_slug
      return typeof n === 'string' && n.trim() ? `aplicou template ${n.trim()}` : 'aplicou template'
    }
    case 'schema_agent_applied':
      return 'aplicou sugestões de schema'
    default:
      return ACTION_LABELS[log.action]?.(m) ?? a
  }
}

function actorDisplay(log: ActivityLog): string {
  const n = log.user_name?.trim()
  if (n) return n
  if (log.user_id === 'default') return 'Sistema'
  return 'Usuário'
}

function actorSeed(log: ActivityLog): string {
  return log.user_name?.trim() || log.user_id
}

const PREVIEW_LIMIT = 10

function ActivityEntry({ log }: { log: ActivityLog }) {
  const name = actorDisplay(log)
  const seed = actorSeed(log)
  const msg  = activityMessageForTask(log)
  const time = relativeTime(log.created_at)

  return (
    <div className="af-entry">
      <span
        className="af-user-avatar"
        style={{ background: nameToColor(seed) }}
        title={name}
      >
        {initialsFromName(name)}
      </span>
      <div className="af-entry-body">
        <div className="af-entry-text">
          <strong className="af-actor">{name}</strong>
          <span className="af-action-msg">{msg}</span>
        </div>
        <span className="af-time">{time}</span>
      </div>
    </div>
  )
}

export function ActivityFeed({ entityType, entityId }: Props) {
  const { logs: logsRaw, isLoading } = useActivityFeed(entityType, entityId)
  const logs = toArr<ActivityLog>(logsRaw)
  const [expanded, setExpanded] = useState(false)
  const [showAll, setShowAll]     = useState(false)

  const visible = showAll ? logs : logs.slice(0, PREVIEW_LIMIT)
  const hasMore = logs.length > PREVIEW_LIMIT

  return (
    <div className="af-wrapper">
      <button
        type="button"
        className="af-toggle"
        onClick={() => setExpanded(e => !e)}
        aria-expanded={expanded}
      >
        <span className="af-toggle-icon">{expanded ? '▼' : '▸'}</span>
        Atividade
        {logs.length > 0 && <span className="af-count">{logs.length}</span>}
      </button>

      {expanded && (
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
              {hasMore && !showAll && (
                <button
                  type="button"
                  className="af-more-link"
                  onClick={() => setShowAll(true)}
                >
                  ver mais ({logs.length - PREVIEW_LIMIT})
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
