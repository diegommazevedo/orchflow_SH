/**
 * TaskCard — card individual no Kanban.
 *
 * Sprint 9 additions:
 * - Fluxo 1: Botão ⚡ Sprint no hover → dropdown de sprints ativos
 * - Seleção via checkbox (Fluxo 2): visible on hover ou quando qualquer task selecionada
 *
 * Leis respeitadas:
 * - delete_task = HIGH → wizard obrigatório (mini-modal inline)
 * - Zero escrita sem confirmação
 */
import { useState, useEffect, useRef } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Task, Sprint } from '../../types'
import { useDeleteTask } from '../../hooks/useData'
import { nameToColor, initialsFromName, extractAssigneeFromTitle } from '../../utils/avatar'

const Q_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  q1: { bg: '#f43f5e15', color: '#f43f5e', border: '#f43f5e40' },
  q2: { bg: '#f59e0b15', color: '#f59e0b', border: '#f59e0b40' },
  q3: { bg: '#48cae415', color: '#48cae4', border: '#48cae440' },
  q4: { bg: '#44445518', color: '#666688', border: '#44445540' },
}

const TYPE_BADGE: Record<string, { label: string; color: string }> = {
  standard:   { label: 'Sprint',       color: '#666688' },
  recorrente: { label: '↻ Recorrente', color: '#48cae4' },
  encaixe:    { label: '⚡ Encaixe',   color: '#facc15' },
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

function assigneeDisplayName(task: Task): string | null {
  const n = task.assignee_name?.trim()
  if (n) return n
  return extractAssigneeFromTitle(task.title)
}

interface Props {
  task: Task
  overlay?: boolean
  onOpenDetail?: (task: Task) => void
  isNew?: boolean
  isBounced?: boolean
  // Sprint 9: selection (Fluxo 2)
  isSelected?: boolean
  anySelected?: boolean
  onToggleSelect?: (taskId: string, shiftKey: boolean) => void
  // Sprint 9: sprint assignment (Fluxo 1)
  activeSprints?: Sprint[]
  onAssignSprint?: (taskId: string, sprintId: string | null) => void
}

export function TaskCard({
  task, overlay, onOpenDetail, isNew, isBounced,
  isSelected, anySelected, onToggleSelect,
  activeSprints = [], onAssignSprint,
}: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id })

  const deleteTask = useDeleteTask()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showSprintDrop, setShowSprintDrop] = useState(false)
  const sprintDropRef = useRef<HTMLDivElement>(null)

  const q        = Q_STYLE[task.quadrant] ?? Q_STYLE.q2
  const due      = calcDueGap(task.due_date_iso)
  const assigneeName = assigneeDisplayName(task)
  const isBlocked  = task.status === 'blocked'
  const isOverdue  = !isBlocked && due?.overdue === true

  const hours = Math.floor(task.time_spent_minutes / 60)
  const mins  = task.time_spent_minutes % 60
  const timeLabel = task.time_spent_minutes > 0
    ? hours > 0 ? `${hours}h ${mins}m` : `${mins}m`
    : null

  // Close sprint dropdown on outside click or ESC
  useEffect(() => {
    if (!showSprintDrop) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setShowSprintDrop(false) }
    function onClickOut(e: MouseEvent) {
      if (sprintDropRef.current && !sprintDropRef.current.contains(e.target as Node)) {
        setShowSprintDrop(false)
      }
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClickOut)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClickOut)
    }
  }, [showSprintDrop])

  let animClass = ''
  if (isNew)     animClass = ' card-new'
  else if (isBounced) animClass = ' card-bounced'

  const cardClass = [
    'task-card',
    overlay    ? 'overlay' : '',
    isBlocked  ? 'task-card-blocked' : '',
    isOverdue  ? 'task-card-overdue' : '',
    isSelected ? 'task-card-selected' : '',
    animClass,
  ].filter(Boolean).join(' ')

  const style = {
    transform:  CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  const currentSprint = task.sprint_id
    ? activeSprints.find(s => s.id === task.sprint_id) ?? null
    : null

  return (
    <div ref={setNodeRef} style={style} className={cardClass}>
      <div className="task-card-top">
        {/* Checkbox Fluxo 2 */}
        {!overlay && onToggleSelect && (
          <input
            type="checkbox"
            className={`task-select-checkbox${anySelected ? ' task-select-checkbox-visible' : ''}`}
            checked={!!isSelected}
            onChange={() => {/* handled by click */}}
            onClick={e => {
              e.stopPropagation()
              onToggleSelect(task.id, e.shiftKey)
            }}
            title="Selecionar tarefa"
          />
        )}

        <span className="drag-handle" {...attributes} {...listeners} title="Arrastar">⠿</span>

        {/* Q-pill */}
        <span
          className="q-pill"
          style={{ background: q.bg, color: q.color, border: `1px solid ${q.border}` }}
        >
          {isBlocked ? '⛔ ' : ''}{task.quadrant.toUpperCase()}
        </span>

        <span className="task-id">#{task.id.slice(0, 6)}</span>

        {/* Avatar */}
        {assigneeName && (
          <span
            className="task-avatar"
            style={{ background: nameToColor(assigneeName) }}
            title={assigneeName}
          >
            {initialsFromName(assigneeName)}
          </span>
        )}

        {/* Delete wizard */}
        {confirmDelete ? (
          <div className="delete-confirm">
            <span className="dc-label">Remover?</span>
            <button className="dc-confirm" onClick={e => { e.stopPropagation(); deleteTask.mutate(task.id) }}>✓</button>
            <button className="dc-cancel" onClick={e => { e.stopPropagation(); setConfirmDelete(false) }}>✕</button>
          </div>
        ) : (
          <button
            className="delete-btn"
            onClick={e => { e.stopPropagation(); setConfirmDelete(true) }}
            title="Remover"
          >×</button>
        )}
      </div>

      {/* Sprint button — Fluxo 1 */}
      {!overlay && onAssignSprint && (
        <div className="task-sprint-row" ref={sprintDropRef}>
          <button
            className="sprint-assign-btn"
            onClick={e => { e.stopPropagation(); setShowSprintDrop(v => !v) }}
            title="Mover para sprint"
          >
            ⚡ {currentSprint ? currentSprint.name : 'Sprint'}
          </button>

          {showSprintDrop && (
            <div className="sprint-assign-dropdown">
              {currentSprint && (
                <button
                  className="sprint-assign-item sprint-assign-remove"
                  onClick={e => {
                    e.stopPropagation()
                    onAssignSprint(task.id, null)
                    setShowSprintDrop(false)
                  }}
                >
                  ✕ Remover do sprint
                </button>
              )}
              {activeSprints.length === 0 && (
                <span className="sprint-assign-empty">Nenhum sprint ativo</span>
              )}
              {activeSprints.map(s => {
                const badge = TYPE_BADGE[s.type] ?? TYPE_BADGE.standard
                const isCurrent = s.id === task.sprint_id
                return (
                  <button
                    key={s.id}
                    className={`sprint-assign-item${isCurrent ? ' sprint-assign-item-current' : ''}`}
                    onClick={e => {
                      e.stopPropagation()
                      if (!isCurrent) onAssignSprint(task.id, s.id)
                      setShowSprintDrop(false)
                    }}
                    disabled={isCurrent}
                  >
                    <span className="sprint-assign-badge" style={{ color: badge.color }}>
                      {badge.label}
                    </span>
                    <span className="sprint-assign-name">{s.name}</span>
                    {isCurrent && <span className="sprint-assign-check">✓</span>}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Corpo */}
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
          {task.is_recurring && (
            <span className="task-recurring-icon" title="Repetir em próximos sprints">↻</span>
          )}
          {(task.subtask_count ?? 0) > 0 && (
            <span
              className="task-subtask-badge"
              style={{
                color: task.completed_subtask_count === task.subtask_count
                  ? '#5eead4'
                  : (task.completed_subtask_count ?? 0) > 0 ? '#facc15' : '#666688',
              }}
            >
              ◻ {task.completed_subtask_count ?? 0}/{task.subtask_count}
            </span>
          )}
          {currentSprint && (
            <span className="task-sprint-badge" title={`Sprint: ${currentSprint.name}`}>
              ⚡ {currentSprint.name}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
