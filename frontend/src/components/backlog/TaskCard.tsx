/**
 * TaskCard — card individual no Kanban.
 *
 * Refinamentos visuais:
 * - Avatar círculo 20px no canto (iniciais do assignee)
 * - Overdue: border-left 2px #f43f5e no card inteiro
 * - Blocked: ícone ⛔ no Q-pill + opacity 0.75
 * - Animações: card-new (slide-in) / card-bounced (micro-bounce)
 * - Q-pill com borda sólida
 *
 * Leis respeitadas:
 * - delete_task = HIGH → wizard obrigatório (mini-modal inline)
 * - Zero escrita sem confirmação
 */
import { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Task } from '../../types'
import { useDeleteTask } from '../../hooks/useData'

const Q_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  q1: { bg: '#f43f5e15', color: '#f43f5e', border: '#f43f5e40' },
  q2: { bg: '#f59e0b15', color: '#f59e0b', border: '#f59e0b40' },
  q3: { bg: '#48cae415', color: '#48cae4', border: '#48cae440' },
  q4: { bg: '#44445518', color: '#666688', border: '#44445540' },
}

function calcDueGap(iso: string | null | undefined) {
  if (!iso) return null
  const due = new Date(iso + 'T12:00:00')
  if (isNaN(due.getTime())) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  due.setHours(0, 0, 0, 0)
  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000)
  const display = new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR')
  let gap: string, color: string
  if (days < 0)        { gap = `venceu há ${Math.abs(days)}d`; color = '#f43f5e' }
  else if (days === 0) { gap = 'hoje';   color = '#f59e0b' }
  else if (days === 1) { gap = 'amanhã'; color = '#f59e0b' }
  else                 { gap = `em ${days}d`;  color = 'var(--muted)' }
  return { display, gap, color, overdue: days < 0 }
}

function extractInitials(title: string): string | null {
  const match = title.match(/^\[([^\]]+)\]/)
  if (!match) return null
  return match[1].trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')
}

interface Props {
  task: Task
  overlay?: boolean
  onOpenDetail?: (task: Task) => void
  isNew?: boolean
  isBounced?: boolean
}

export function TaskCard({ task, overlay, onOpenDetail, isNew, isBounced }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id })

  const deleteTask = useDeleteTask()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const q        = Q_STYLE[task.quadrant] ?? Q_STYLE.q2
  const due      = calcDueGap(task.due_date_iso)
  const initials = extractInitials(task.title)
  const isBlocked  = task.status === 'blocked'
  const isOverdue  = !isBlocked && due?.overdue === true

  const hours = Math.floor(task.time_spent_minutes / 60)
  const mins  = task.time_spent_minutes % 60
  const timeLabel = task.time_spent_minutes > 0
    ? hours > 0 ? `${hours}h ${mins}m` : `${mins}m`
    : null

  // Classe de animação (só uma por vez)
  let animClass = ''
  if (isNew)     animClass = ' card-new'
  else if (isBounced) animClass = ' card-bounced'

  const cardClass = [
    'task-card',
    overlay    ? 'overlay' : '',
    isBlocked  ? 'task-card-blocked' : '',
    isOverdue  ? 'task-card-overdue' : '',
    animClass,
  ].filter(Boolean).join(' ')

  const style = {
    transform:  CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} className={cardClass}>
      <div className="task-card-top">
        <span className="drag-handle" {...attributes} {...listeners} title="Arrastar">⠿</span>

        {/* Q-pill com borda sólida — blocked mostra ⛔ */}
        <span
          className="q-pill"
          style={{
            background: q.bg,
            color: q.color,
            border: `1px solid ${q.border}`,
          }}
        >
          {isBlocked ? '⛔ ' : ''}{task.quadrant.toUpperCase()}
        </span>

        <span className="task-id">#{task.id.slice(0, 6)}</span>

        {/* Avatar assignee — canto superior direito */}
        {initials && (
          <span className="task-avatar" title={`Responsável: ${initials}`}>
            {initials}
          </span>
        )}

        {/* Delete wizard inline — HIGH risk */}
        {confirmDelete ? (
          <div className="delete-confirm">
            <span className="dc-label">Remover?</span>
            <button
              className="dc-confirm"
              onClick={e => { e.stopPropagation(); deleteTask.mutate(task.id) }}
            >✓</button>
            <button
              className="dc-cancel"
              onClick={e => { e.stopPropagation(); setConfirmDelete(false) }}
            >✕</button>
          </div>
        ) : (
          <button
            className="delete-btn"
            onClick={e => { e.stopPropagation(); setConfirmDelete(true) }}
            title="Remover"
          >×</button>
        )}
      </div>

      {/* Corpo clicável → painel de detalhe */}
      <div
        className="task-body"
        onClick={() => !confirmDelete && onOpenDetail?.(task)}
        style={{ cursor: onOpenDetail ? 'pointer' : 'default' }}
      >
        <div className="task-title">{task.title}</div>
        {task.description && <div className="task-desc">{task.description}</div>}

        <div className="task-meta">
          {timeLabel && <span className="task-time">⏱ {timeLabel}</span>}
          {due && (
            <span className="task-due" style={{ color: due.color }}>
              📅 {due.display} · {due.gap}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
