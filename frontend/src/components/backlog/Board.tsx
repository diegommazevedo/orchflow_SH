/**
 * Board — Kanban: colunas dinâmicas (V2) via GET /kanban/{project}; fallback STATUS_COLUMNS.
 *
 * Leis respeitadas:
 * - delete_task = HIGH → wizard obrigatório (no TaskCard)
 * - status = slug da coluna
 */
import { useState, useRef, useMemo } from 'react'
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  type DragStartEvent, type DragEndEvent
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import type { Task, TaskStatus, KanbanColumn } from '../../types'
import { TaskCard } from './TaskCard'
import { TaskDetailPanel } from './TaskDetailPanel'
import { useUpdateTaskStatus, useCreateTask } from '../../hooks/useData'
import { useKanbanColumns } from '../../hooks/useV2'
import { ExportMenu } from '../ui/ExportMenu'
import { KanbanSettings } from '../kanban/KanbanSettings'
import { FieldDefinitionPanel } from '../fields/FieldDefinitionPanel'
import { toArr } from '../../utils/array'

interface Props {
  tasks: Task[]
  projectId: string
  projectName?: string
  onAddTask?: () => void
}

// ── Skeleton do board (usado em App.tsx enquanto carrega) ─────────────────────
const SKELETON_COL_KEYS = ['c0', 'c1', 'c2', 'c3'] as const

export function BoardSkeleton() {
  return (
    <div className="board board-skeleton" aria-busy="true" aria-label="Carregando board…">
      {SKELETON_COL_KEYS.map(key => (
        <div key={key} className="board-skeleton-col">
          <div className="skeleton skeleton-line board-skeleton-col-head" />
          {[1, 2, 3].map(n => (
            <div key={n} className="skeleton-card">
              <div className="skeleton skeleton-line skeleton-line-w3" style={{ height: 9 }} />
              <div className="skeleton skeleton-line skeleton-line-w1" />
              <div className="skeleton skeleton-line skeleton-line-w2" />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

// ── Coluna droppable ──────────────────────────────────────────────────────────
function DroppableColumn({
  id, label, color, tasks, onOpenDetail, newTaskId, bouncedId
}: {
  id: string
  label: string
  color: string
  tasks: Task[]
  onOpenDetail: (task: Task) => void
  newTaskId: string | null
  bouncedId: string | null
}) {
  const { setNodeRef, isOver } = useDroppable({ id })
  const isBlocked = id === 'blocked'

  return (
    <div
      ref={setNodeRef}
      className={`column${isBlocked ? ' column-blocked' : ''}`}
      style={{ background: isOver ? 'rgba(124,109,240,0.04)' : undefined }}
    >
      <div className="col-header" style={isBlocked ? { borderBottomColor: '#f43f5e40' } : undefined}>
        <div className="col-dot" style={{ background: color }} />
        <div className="col-name" style={isBlocked ? { color: '#f43f5e' } : undefined}>{label}</div>
        <div className="col-count">{tasks.length} {tasks.length === 1 ? 'item' : 'itens'}</div>
      </div>

      <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
        {tasks.map(task => (
          <TaskCard
            key={task.id}
            task={task}
            onOpenDetail={onOpenDetail}
            isNew={task.id === newTaskId}
            isBounced={task.id === bouncedId}
          />
        ))}
      </SortableContext>
    </div>
  )
}

// ── Board principal ───────────────────────────────────────────────────────────
export function Board({ tasks: tasksProp, projectId, projectName = '', onAddTask }: Props) {
  const tasks = toArr<Task>(tasksProp)
  const { data: kanbanApi, isLoading: kanbanLoading, isError: kanbanError } = useKanbanColumns(projectId)
  const [activeTask, setActiveTask]   = useState<Task | null>(null)
  const [detailTask, setDetailTask]   = useState<Task | null>(null)
  const [newTitle, setNewTitle]       = useState('')
  const [adding, setAdding]           = useState(false)
  const [newTaskId, setNewTaskId]     = useState<string | null>(null)
  const [bouncedId, setBouncedId]     = useState<string | null>(null)
  const [showKanbanSet, setShowKanbanSet] = useState(false)
  const [showFieldDef, setShowFieldDef] = useState(false)
  const newTaskTimer  = useRef<ReturnType<typeof setTimeout>>()
  const bounceTimer   = useRef<ReturnType<typeof setTimeout>>()

  const updateStatus = useUpdateTaskStatus()
  const createTask   = useCreateTask()

  const boardColumns = useMemo(() => {
    const kb = toArr<KanbanColumn>(kanbanApi)
    return [...kb]
      .sort((a, b) => a.order - b.order)
      .map(c => ({ slug: c.slug, label: c.name, color: c.color }))
  }, [kanbanApi])

  const slugSet = useMemo(() => new Set(boardColumns.map(c => c.slug)), [boardColumns])
  const defaultSlug = useMemo(() => {
    const kb = toArr<KanbanColumn>(kanbanApi)
    const d = kb.find(x => x.is_default)
    return d?.slug ?? boardColumns[0]?.slug ?? ''
  }, [kanbanApi, boardColumns])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  function onDragStart({ active }: DragStartEvent) {
    const task = tasks.find(t => t.id === active.id)
    if (task) setActiveTask(task)
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    setActiveTask(null)
    if (!over) return

    const task = tasks.find(t => t.id === active.id)
    if (!task) return

    const colIds = boardColumns.map(c => c.slug)
    let targetStatus: TaskStatus | null = null

    if (colIds.includes(String(over.id))) {
      targetStatus = String(over.id)
    } else {
      const overTask = tasks.find(t => t.id === over.id)
      if (overTask) targetStatus = overTask.status
    }

    if (targetStatus && targetStatus !== task.status) {
      updateStatus.mutate({ id: task.id, status: targetStatus })
      // Micro-bounce no card ao soltar em nova coluna
      clearTimeout(bounceTimer.current)
      setBouncedId(task.id)
      bounceTimer.current = setTimeout(() => setBouncedId(null), 250)
    }
  }

  function handleAddTask(e: React.FormEvent) {
    e.preventDefault()
    if (!newTitle.trim()) return
    createTask.mutate(
      { title: newTitle.trim(), project_id: projectId, quadrant: 'q2' },
      {
        onSuccess: (created) => {
          // Slide-in animation na task nova
          clearTimeout(newTaskTimer.current)
          setNewTaskId(created.id)
          newTaskTimer.current = setTimeout(() => setNewTaskId(null), 400)
        },
      }
    )
    setNewTitle('')
    setAdding(false)
  }

  // Sincroniza painel de detalhe com dados ao vivo
  const liveDetailTask = detailTask
    ? tasks.find(t => t.id === detailTask.id) ?? detailTask
    : null

  const bySlug = (slug: string) =>
    tasks.filter(t => {
      if (t.status === slug) return true
      if (defaultSlug && !slugSet.has(t.status) && slug === defaultSlug) return true
      return false
    })

  if (kanbanLoading) {
    return <BoardSkeleton />
  }

  if (kanbanError || boardColumns.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-title">Colunas do board indisponíveis</div>
        <p className="empty-sub">Não foi possível carregar o Kanban deste projeto. Atualize a página ou tente de novo.</p>
      </div>
    )
  }

  // Empty state quando não há tasks no projeto
  if (tasks.length === 0) {
    return (
      <div className="empty-state">
        {projectName && (
          <div className="board-bar" style={{ marginBottom: 12 }}>
            <ExportMenu projectId={projectId} projectName={projectName} />
            <button type="button" className="board-settings-btn" onClick={() => setShowKanbanSet(true)}>Colunas</button>
            <button type="button" className="board-settings-btn" onClick={() => setShowFieldDef(true)}>Campos</button>
          </div>
        )}
        <div className="empty-icon">📋</div>
        <div className="empty-title">Nenhuma tarefa ainda</div>
        <div className="empty-sub">
          Crie via chat, arraste do backlog ou importe um contrato / planilha
        </div>
        <button
          className="empty-action-btn"
          onClick={() => { setAdding(true); onAddTask?.() }}
        >
          + Nova tarefa
        </button>
        {adding && (
          <form onSubmit={handleAddTask} className="add-form" style={{ marginTop: 12 }}>
            <input
              autoFocus
              className="add-input"
              placeholder="Título da tarefa..."
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
            />
            <div className="add-form-btns">
              <button type="submit" className="btn-confirm-sm">Criar</button>
              <button type="button" className="btn-cancel-sm" onClick={() => setAdding(false)}>Cancelar</button>
            </div>
          </form>
        )}
        {showKanbanSet && (
          <KanbanSettings projectId={projectId} onClose={() => setShowKanbanSet(false)} />
        )}
        {showFieldDef && (
          <FieldDefinitionPanel projectId={projectId} onClose={() => setShowFieldDef(false)} />
        )}
      </div>
    )
  }

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      {projectName && (
        <div className="board-bar">
          <ExportMenu projectId={projectId} projectName={projectName} />
          <button type="button" className="board-settings-btn" onClick={() => setShowKanbanSet(true)}>
            Colunas
          </button>
          <button type="button" className="board-settings-btn" onClick={() => setShowFieldDef(true)}>
            Campos
          </button>
        </div>
      )}
      <div className="board">
        {boardColumns.map(col => (
          <DroppableColumn
            key={col.slug}
            id={col.slug}
            label={col.label}
            color={col.color}
            tasks={bySlug(col.slug)}
            onOpenDetail={setDetailTask}
            newTaskId={newTaskId}
            bouncedId={bouncedId}
          />
        ))}

        {/* Coluna de adicionar tarefa */}
        <div className="column column-add">
          {adding ? (
            <form onSubmit={handleAddTask} className="add-form">
              <input
                autoFocus
                className="add-input"
                placeholder="Título da tarefa..."
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
              />
              <div className="add-form-btns">
                <button type="submit" className="btn-confirm-sm">Criar</button>
                <button type="button" className="btn-cancel-sm" onClick={() => setAdding(false)}>Cancelar</button>
              </div>
            </form>
          ) : (
            <button className="add-card" onClick={() => setAdding(true)}>
              + nova tarefa
            </button>
          )}
        </div>
      </div>

      <DragOverlay>
        {activeTask ? <TaskCard task={activeTask} overlay /> : null}
      </DragOverlay>

      {liveDetailTask && (
        <TaskDetailPanel
          task={liveDetailTask}
          onClose={() => setDetailTask(null)}
          onDeleted={() => setDetailTask(null)}
        />
      )}

      {showKanbanSet && (
        <KanbanSettings projectId={projectId} onClose={() => setShowKanbanSet(false)} />
      )}

      {showFieldDef && (
        <FieldDefinitionPanel projectId={projectId} onClose={() => setShowFieldDef(false)} />
      )}
    </DndContext>
  )
}
