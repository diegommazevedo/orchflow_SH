/**
 * TaskDetailPanel — painel lateral de detalhe e edição de tarefa.
 *
 * Conformidade: MODO SILENT em todos os campos de texto.
 *   - Sistema processa em background após onBlur
 *   - bind.value auto-atualizado com valor conformado
 *   - Indicador ✓ discreto aparece por ~2s após auto-correção
 *   - NENHUMA sugestão visível abaixo dos campos
 *   - Fluxo nunca bloqueado
 *
 * Leis respeitadas:
 *   - delete_task = HIGH → wizard sempre (confirmação inline obrigatória)
 *   - Todos os campos passam por useConformField (mode: silent) antes do save
 *   - PATCH /api/tasks/{id} via useUpdateTask (ConformityEngine no backend)
 */
import { useMemo, useState, useEffect } from 'react'
import type { Task } from '../../types'
import { STATUS_COLUMNS } from '../../types'
import { useUpdateTask, useDeleteTask } from '../../hooks/useData'
import { useKanbanColumns } from '../../hooks/useV2'
import { useConformField } from '../../hooks/useConformField'
import { ActivityFeed } from './ActivityFeed'
import { TaskComments } from './TaskComments'
import { SubtaskList } from './SubtaskList'
import { CustomFieldForm } from '../fields/CustomFieldForm'
import { TaskCustomFields } from '../fields/TaskCustomFields'

interface Props {
  task: Task
  onClose: () => void
  onDeleted: () => void
}

function timeLabel(mins: number): string {
  if (mins === 0) return '0 min'
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h}h ${m > 0 ? `${m}m` : ''}`.trim() : `${m}m`
}

function dueDateColor(iso: string): string {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const due = new Date(iso + 'T12:00:00'); due.setHours(0, 0, 0, 0)
  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000)
  if (days < 0) return '#f43f5e'
  if (days <= 1) return '#f59e0b'
  return 'var(--muted)'
}

export function TaskDetailPanel({ task, onClose, onDeleted }: Props) {
  const updateTask = useUpdateTask()
  const deleteTask = useDeleteTask()

  // Campos de texto: modo silent — conformidade automática, sem hints visuais
  const titleConform = useConformField('title', { mode: 'silent' })
  const descConform  = useConformField('description', { mode: 'silent' })

  // Campos sem conform (selects, date, number)
  const [quadrant, setQuadrant]           = useState<Task['quadrant']>(task.quadrant)
  const [status, setStatus]               = useState<Task['status']>(task.status)
  const [dueDate, setDueDate]             = useState(task.due_date_iso ?? '')
  const [minutesToAdd, setMinutesToAdd]   = useState('')
  const [showAddTime, setShowAddTime]     = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showCfForm, setShowCfForm]     = useState(false)

  const { data: kcols = [] } = useKanbanColumns(task.project_id)
  const statusOptions = useMemo(() => {
    if (kcols.length)
      return [...kcols].sort((a, b) => a.order - b.order).map(c => ({ id: c.slug, label: c.name }))
    return STATUS_COLUMNS.map(c => ({ id: c.id, label: c.label }))
  }, [kcols])

  // Resync quando a tarefa mudar (ex: atualização externa via react-query)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    titleConform.reset(task.title)
    descConform.reset(task.description ?? '')
    setQuadrant(task.quadrant)
    setStatus(task.status)
    setDueDate(task.due_date_iso ?? '')
    setShowDeleteConfirm(false)
    setShowAddTime(false)
  }, [task.id])

  async function handleSave() {
    await updateTask.mutateAsync({
      id:          task.id,
      title:       titleConform.bind.value,
      description: descConform.bind.value,
      quadrant,
      status,
      due_date_iso: dueDate || null,
    })
    onClose()
  }

  function handleDelete() {
    deleteTask.mutate(task.id)
    onDeleted()
    onClose()
  }

  async function handleAddTime() {
    const mins = parseInt(minutesToAdd, 10)
    if (isNaN(mins) || mins <= 0) return
    await updateTask.mutateAsync({ id: task.id, add_minutes: mins })
    setMinutesToAdd('')
    setShowAddTime(false)
  }

  const truncTitle = task.title.length > 40
    ? task.title.slice(0, 40) + '…'
    : task.title

  return (
    <>
      <div className="tdp-backdrop" onClick={onClose} />
      <div className="task-detail-panel" role="dialog" aria-label="Detalhes da tarefa">

        {/* Header */}
        <div className="tdp-header">
          <span className="tdp-label">Detalhes da Tarefa</span>
          <button className="tdp-close" onClick={onClose} title="Fechar">✕</button>
        </div>

        <div className="tdp-body">

          {/* Título — modo silent: ✓ discreto após auto-correção */}
          <div className="tdp-field tdp-field-relative">
            <label className="tdp-field-label">Título</label>
            <input
              className="tdp-input"
              placeholder="Título da tarefa"
              {...titleConform.bind}
            />
            {titleConform.showCheck && (
              <span className="conform-check" aria-hidden>✓</span>
            )}
          </div>

          {/* Descrição — modo silent */}
          <div className="tdp-field tdp-field-relative">
            <label className="tdp-field-label">Descrição</label>
            <textarea
              className="tdp-textarea"
              rows={3}
              placeholder="Descreva a tarefa…"
              {...descConform.bind}
            />
            {descConform.showCheck && (
              <span className="conform-check conform-check-ta" aria-hidden>✓</span>
            )}
          </div>

          {/* Quadrante + Status */}
          <div className="tdp-row">
            <div className="tdp-field tdp-field-half">
              <label className="tdp-field-label">Quadrante</label>
              <select
                className="tdp-select"
                value={quadrant}
                onChange={e => setQuadrant(e.target.value as Task['quadrant'])}
              >
                <option value="q1">Q1 — Urgente e importante</option>
                <option value="q2">Q2 — Importante, não urgente</option>
                <option value="q3">Q3 — Urgente, não importante</option>
                <option value="q4">Q4 — Baixo impacto</option>
              </select>
            </div>
            <div className="tdp-field tdp-field-half">
              <label className="tdp-field-label">Status</label>
              <select
                className="tdp-select"
                value={status}
                onChange={e => setStatus(e.target.value as Task['status'])}
              >
                {statusOptions.map(c => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Prazo */}
          <div className="tdp-field">
            <label className="tdp-field-label">Prazo</label>
            <input
              type="date"
              className="tdp-input"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              style={dueDate ? { color: dueDateColor(dueDate) } : undefined}
            />
          </div>

          {/* Tempo gasto */}
          <div className="tdp-field">
            <label className="tdp-field-label">Tempo gasto</label>
            <div className="tdp-time-row">
              <span className="tdp-time-display">⏱ {timeLabel(task.time_spent_minutes)}</span>
              {!showAddTime && (
                <button className="tdp-add-time-btn" onClick={() => setShowAddTime(true)}>
                  + adicionar tempo
                </button>
              )}
            </div>
            {showAddTime && (
              <div className="tdp-time-entry">
                <input
                  type="number"
                  className="tdp-input tdp-input-sm"
                  placeholder="minutos"
                  min="1"
                  value={minutesToAdd}
                  onChange={e => setMinutesToAdd(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddTime()}
                />
                <button className="btn-confirm-sm" onClick={handleAddTime}>ok</button>
                <button className="btn-cancel-sm" onClick={() => { setShowAddTime(false); setMinutesToAdd('') }}>×</button>
              </div>
            )}
          </div>

        </div>

        <div className="tdp-section tdp-cf">
          <div className="tdp-cf-head">
            <span className="tdp-field-label">Campos extras</span>
            <button type="button" className="btn-cancel-sm" onClick={() => setShowCfForm(true)}>+ campo</button>
          </div>
          <TaskCustomFields taskId={task.id} projectId={task.project_id} disabled={updateTask.isPending} />
        </div>

        {/* Seção — Subtarefas (Sprint 6) */}
        {!task.parent_task_id && (
          <>
            <div className="tdp-divider" aria-hidden />
            <div className="tdp-section">
              <SubtaskList taskId={task.id} projectId={task.project_id} />
            </div>
          </>
        )}

        {/* Separador visual */}
        <div className="tdp-divider" aria-hidden />

        {/* Seção — Atividade (colapsável, feed compacto) */}
        <div className="tdp-section">
          <ActivityFeed entityType="task" entityId={task.id} />
        </div>

        {/* Separador visual */}
        <div className="tdp-divider" aria-hidden />

        {/* Seção — Comentários */}
        <div className="tdp-section">
          <TaskComments taskId={task.id} />
        </div>

        {/* Footer */}
        <div className="tdp-footer">
          {showDeleteConfirm ? (
            <div className="tdp-del-confirm">
              <span className="tdp-del-label">Remover "{truncTitle}"?</span>
              <button className="btn-danger-sm" onClick={handleDelete}>Confirmar</button>
              <button className="btn-cancel-sm" onClick={() => setShowDeleteConfirm(false)}>Cancelar</button>
            </div>
          ) : (
            <>
              <button className="tdp-del-btn" onClick={() => setShowDeleteConfirm(true)}>
                Remover
              </button>
              <div style={{ flex: 1 }} />
              <button className="tdp-close-btn" onClick={onClose}>Fechar</button>
              <button
                className="tdp-save-btn"
                onClick={handleSave}
                disabled={updateTask.isPending}
              >
                {updateTask.isPending ? 'Salvando…' : 'Salvar'}
              </button>
            </>
          )}
        </div>
      </div>

      {showCfForm && (
        <div className="tdp-cf-modal">
          <div className="tdp-cf-modal-inner">
            <CustomFieldForm
              projectId={task.project_id}
              onClose={() => setShowCfForm(false)}
            />
          </div>
        </div>
      )}
    </>
  )
}
