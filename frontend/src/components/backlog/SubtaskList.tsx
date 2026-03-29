/**
 * SubtaskList — Sprint 6
 *
 * Mostra subtarefas de uma tarefa pai com:
 * - Header "Subtarefas (X/Y)"
 * - Barra de progresso
 * - Lista com checkbox, título, delete
 * - Campo inline para criar subtarefa
 */
import { useState, useRef } from 'react'
import { useSubtasks, useCreateSubtask, useUpdateTaskStatus, useDeleteTask } from '../../hooks/useData'
import { useKanbanColumns } from '../../hooks/useV2'
import type { Task, KanbanColumn } from '../../types'

interface Props {
  taskId: string
  projectId: string
}

export function SubtaskList({ taskId, projectId }: Props) {
  const { data: subtasks = [], isLoading } = useSubtasks(taskId)
  const createSubtask = useCreateSubtask()
  const updateStatus = useUpdateTaskStatus()
  const deleteTask = useDeleteTask()
  const { data: columns = [] } = useKanbanColumns(projectId)

  const [newTitle, setNewTitle] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const doneSlug = columns.find(c => c.is_done)?.slug ?? 'done'
  const defaultSlug = columns.find(c => c.is_default)?.slug ?? columns[0]?.slug ?? 'backlog'

  const completed = subtasks.filter(s => {
    const col = columns.find(c => c.slug === s.status)
    return col?.is_done
  }).length
  const total = subtasks.length
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newTitle.trim()) return
    createSubtask.mutate({
      parentTaskId: taskId,
      title: newTitle.trim(),
      project_id: projectId,
    })
    setNewTitle('')
    inputRef.current?.focus()
  }

  function toggleDone(sub: Task) {
    const col = columns.find(c => c.slug === sub.status)
    const isDone = col?.is_done
    updateStatus.mutate({
      id: sub.id,
      status: isDone ? defaultSlug : doneSlug,
    })
  }

  function handleDelete(sub: Task) {
    deleteTask.mutate(sub.id)
  }

  return (
    <div className="subtask-list">
      {/* Header */}
      <div className="subtask-header">
        <span className="subtask-title">Subtarefas ({completed}/{total})</span>
      </div>

      {/* Progress bar */}
      {total > 0 && (
        <div className="subtask-progress-bar">
          <div
            className="subtask-progress-fill"
            style={{
              width: `${pct}%`,
              background: pct === 100 ? '#5eead4' : pct > 0 ? '#facc15' : 'transparent',
            }}
          />
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="subtask-loading">carregando…</div>
      ) : (
        <div className="subtask-items">
          {subtasks.map(sub => {
            const col = columns.find(c => c.slug === sub.status)
            const isDone = col?.is_done ?? false
            return (
              <div key={sub.id} className={`subtask-item${isDone ? ' subtask-done' : ''}`}>
                <input
                  type="checkbox"
                  className="subtask-checkbox"
                  checked={isDone}
                  onChange={() => toggleDone(sub)}
                />
                <span className="subtask-item-title">{sub.title}</span>
                <button
                  className="subtask-delete-btn"
                  title="Excluir subtarefa"
                  onClick={() => handleDelete(sub)}
                >
                  ×
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Inline create */}
      <form className="subtask-add-form" onSubmit={handleCreate}>
        <input
          ref={inputRef}
          className="subtask-add-input"
          placeholder="+ Adicionar subtarefa"
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Escape') {
              setNewTitle('')
              inputRef.current?.blur()
            }
          }}
        />
      </form>
    </div>
  )
}
