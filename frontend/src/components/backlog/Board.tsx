/**
 * Board — Kanban com suporte a sprint assignment (Sprint 9).
 *
 * Fluxo 1: Botão ⚡ Sprint por card → dropdown → PATCH sprint_id
 * Fluxo 2: Seleção múltipla (checkbox + shift+click) → bulk action bar
 * Fluxo 3: Drag-and-drop para zonas de sprint / backlog
 *
 * Leis respeitadas:
 * - delete_task = HIGH → wizard obrigatório (no TaskCard)
 * - status = slug da coluna
 */
import { useState, useRef, useMemo, useCallback } from 'react'
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  useDroppable,
  type DragStartEvent, type DragEndEvent
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useQueryClient } from '@tanstack/react-query'
import type { Task, TaskStatus, KanbanColumn, Sprint } from '../../types'
import { TaskCard } from './TaskCard'
import { TaskDetailPanel } from './TaskDetailPanel'
import { useUpdateTaskStatus, useCreateTask } from '../../hooks/useData'
import { useKanbanColumns } from '../../hooks/useV2'
import { useSprints } from '../../hooks/useSprints'
import { ExportMenu } from '../ui/ExportMenu'
import { KanbanSettings } from '../kanban/KanbanSettings'
import { FieldDefinitionPanel } from '../fields/FieldDefinitionPanel'
import { toArr } from '../../utils/array'
import { assignTaskToSprint, assignTasksToSprint } from '../../services/api'

interface Props {
  tasks: Task[]
  projectId: string
  projectName?: string
  onAddTask?: () => void
}

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

// ── Sprint Drop Zone (Fluxo 3) ───────────────────────────────────────────────
function SprintDropZone({ sprint, isDragging }: { sprint: Sprint; isDragging: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: `sprint-zone-${sprint.id}` })
  if (!isDragging) return null
  return (
    <div
      ref={setNodeRef}
      className={`sprint-drop-zone${isOver ? ' sprint-drop-zone-over' : ''}`}
      title={`Soltar para adicionar ao sprint ${sprint.name}`}
    >
      ⚡ {sprint.name}
    </div>
  )
}

function BacklogDropZone({ isDragging }: { isDragging: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'backlog-zone' })
  if (!isDragging) return null
  return (
    <div
      ref={setNodeRef}
      className={`sprint-drop-zone sprint-drop-zone-backlog${isOver ? ' sprint-drop-zone-over' : ''}`}
      title="Soltar para remover do sprint"
    >
      ← Backlog
    </div>
  )
}

// ── Coluna droppable ─────────────────────────────────────────────────────────
function DroppableColumn({
  id, label, color, tasks, onOpenDetail, newTaskId, bouncedId,
  selectedIds, anySelected, onToggleSelect,
  activeSprints, onAssignSprint,
}: {
  id: string
  label: string
  color: string
  tasks: Task[]
  onOpenDetail: (task: Task) => void
  newTaskId: string | null
  bouncedId: string | null
  selectedIds: Set<string>
  anySelected: boolean
  onToggleSelect: (taskId: string, shiftKey: boolean) => void
  activeSprints: Sprint[]
  onAssignSprint: (taskId: string, sprintId: string | null) => void
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
            isSelected={selectedIds.has(task.id)}
            anySelected={anySelected}
            onToggleSelect={onToggleSelect}
            activeSprints={activeSprints}
            onAssignSprint={onAssignSprint}
          />
        ))}
      </SortableContext>
    </div>
  )
}

// ── Board principal ──────────────────────────────────────────────────────────
export function Board({ tasks: tasksProp, projectId, projectName = '', onAddTask }: Props) {
  const tasks = toArr<Task>(tasksProp)
  const qc = useQueryClient()

  const { data: kanbanApi, isLoading: kanbanLoading, isError: kanbanError } = useKanbanColumns(projectId)
  const { data: sprintsRaw } = useSprints(projectId)
  const activeSprints = useMemo(
    () => toArr<Sprint>(sprintsRaw).filter(s => s.status === 'active'),
    [sprintsRaw],
  )

  const [activeTask, setActiveTask]     = useState<Task | null>(null)
  const [detailTask, setDetailTask]     = useState<Task | null>(null)
  const [newTitle, setNewTitle]         = useState('')
  const [adding, setAdding]             = useState(false)
  const [newTaskId, setNewTaskId]       = useState<string | null>(null)
  const [bouncedId, setBouncedId]       = useState<string | null>(null)
  const [showKanbanSet, setShowKanbanSet] = useState(false)
  const [showFieldDef, setShowFieldDef]   = useState(false)

  // Fluxo 2: seleção múltipla
  const [selectedIds, setSelectedIds]   = useState<Set<string>>(new Set())
  const [lastSelectedIdx, setLastSelectedIdx] = useState<number | null>(null)
  const [bulkLoading, setBulkLoading]   = useState(false)

  // Mini-toast do board
  const [toast, setToast]               = useState<string | null>(null)
  const toastTimer                      = useRef<ReturnType<typeof setTimeout>>()

  const newTaskTimer  = useRef<ReturnType<typeof setTimeout>>()
  const bounceTimer   = useRef<ReturnType<typeof setTimeout>>()

  const updateStatus = useUpdateTaskStatus()
  const createTask   = useCreateTask()

  const boardColumns = useMemo(() => {
    const kb = toArr<KanbanColumn>(kanbanApi)
    return [...kb].sort((a, b) => a.order - b.order).map(c => ({ slug: c.slug, label: c.name, color: c.color }))
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

  function showBoardToast(msg: string) {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3000)
  }

  function onDragStart({ active }: DragStartEvent) {
    const task = tasks.find(t => t.id === active.id)
    if (task) setActiveTask(task)
  }

  async function onDragEnd({ active, over }: DragEndEvent) {
    setActiveTask(null)
    if (!over) return

    const task = tasks.find(t => t.id === active.id)
    if (!task) return

    const overId = String(over.id)

    // ── Fluxo 3: sprint drop zones ────────────────────────────────────────
    if (overId.startsWith('sprint-zone-')) {
      const sprintId = overId.replace('sprint-zone-', '')
      const sprint = activeSprints.find(s => s.id === sprintId)
      if (sprint && task.sprint_id !== sprintId) {
        try {
          await assignTaskToSprint(task.id, sprintId)
          qc.invalidateQueries({ queryKey: ['tasks'] })
          qc.invalidateQueries({ queryKey: ['sprint-board', sprintId] })
          showBoardToast(`⚡ "${task.title.slice(0, 30)}" → ${sprint.name}`)
        } catch { /* api error event dispatched by interceptor */ }
      }
      return
    }

    if (overId === 'backlog-zone') {
      if (task.sprint_id) {
        try {
          await assignTaskToSprint(task.id, null)
          qc.invalidateQueries({ queryKey: ['tasks'] })
          showBoardToast(`← "${task.title.slice(0, 30)}" movida para o Backlog`)
        } catch { /* handled */ }
      }
      return
    }

    // ── Status drop (existing logic) ─────────────────────────────────────
    const colIds = boardColumns.map(c => c.slug)
    let targetStatus: TaskStatus | null = null
    if (colIds.includes(overId)) {
      targetStatus = overId
    } else {
      const overTask = tasks.find(t => t.id === over.id)
      if (overTask) targetStatus = overTask.status
    }

    if (targetStatus && targetStatus !== task.status) {
      updateStatus.mutate({ id: task.id, status: targetStatus })
      clearTimeout(bounceTimer.current)
      setBouncedId(task.id)
      bounceTimer.current = setTimeout(() => setBouncedId(null), 250)
    }
  }

  // ── Fluxo 1: assign single task to sprint ───────────────────────────────
  const handleAssignSprint = useCallback(async (taskId: string, sprintId: string | null) => {
    const sprint = sprintId ? activeSprints.find(s => s.id === sprintId) : null
    try {
      await assignTaskToSprint(taskId, sprintId)
      qc.invalidateQueries({ queryKey: ['tasks'] })
      if (sprintId) qc.invalidateQueries({ queryKey: ['sprint-board', sprintId] })
      const task = tasks.find(t => t.id === taskId)
      const name = task?.title.slice(0, 30) ?? 'Tarefa'
      showBoardToast(sprintId
        ? `⚡ "${name}" movida para ${sprint?.name ?? 'sprint'}`
        : `← "${name}" removida do sprint`)
    } catch { /* handled by interceptor */ }
  }, [activeSprints, qc, tasks])

  // ── Fluxo 2: toggle select ──────────────────────────────────────────────
  const handleToggleSelect = useCallback((taskId: string, shiftKey: boolean) => {
    const allIds = tasks.map(t => t.id)
    const idx = allIds.indexOf(taskId)

    setSelectedIds(prev => {
      const next = new Set(prev)
      if (shiftKey && lastSelectedIdx !== null) {
        // Range selection
        const lo = Math.min(lastSelectedIdx, idx)
        const hi = Math.max(lastSelectedIdx, idx)
        const addRange = !prev.has(taskId)
        for (let i = lo; i <= hi; i++) {
          if (addRange) next.add(allIds[i])
          else next.delete(allIds[i])
        }
      } else {
        if (next.has(taskId)) next.delete(taskId)
        else next.add(taskId)
      }
      return next
    })
    setLastSelectedIdx(idx)
  }, [tasks, lastSelectedIdx])

  // ── Fluxo 2: bulk assign ────────────────────────────────────────────────
  async function handleBulkAssign(sprintId: string | null) {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    const sprint = sprintId ? activeSprints.find(s => s.id === sprintId) : null
    setBulkLoading(true)
    try {
      await assignTasksToSprint(ids, sprintId)
      qc.invalidateQueries({ queryKey: ['tasks'] })
      if (sprintId) qc.invalidateQueries({ queryKey: ['sprint-board', sprintId] })
      showBoardToast(sprintId
        ? `⚡ ${ids.length} tarefa(s) → ${sprint?.name ?? 'sprint'}`
        : `← ${ids.length} tarefa(s) removidas do sprint`)
      setSelectedIds(new Set())
    } catch { /* handled */ }
    finally { setBulkLoading(false) }
  }

  function handleAddTask(e: React.FormEvent) {
    e.preventDefault()
    if (!newTitle.trim()) return
    createTask.mutate(
      { title: newTitle.trim(), project_id: projectId, quadrant: 'q2' },
      {
        onSuccess: (created) => {
          clearTimeout(newTaskTimer.current)
          setNewTaskId(created.id)
          newTaskTimer.current = setTimeout(() => setNewTaskId(null), 400)
        },
      }
    )
    setNewTitle('')
    setAdding(false)
  }

  const liveDetailTask = detailTask
    ? tasks.find(t => t.id === detailTask.id) ?? detailTask
    : null

  const bySlug = (slug: string) =>
    tasks.filter(t => {
      if (t.status === slug) return true
      if (defaultSlug && !slugSet.has(t.status) && slug === defaultSlug) return true
      return false
    })

  const anySelected = selectedIds.size > 0

  if (kanbanLoading) return <BoardSkeleton />

  if (kanbanError || boardColumns.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-title">Colunas do board indisponíveis</div>
        <p className="empty-sub">Não foi possível carregar o Kanban deste projeto. Atualize a página ou tente de novo.</p>
      </div>
    )
  }

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
        <div className="empty-sub">Crie via chat, arraste do backlog ou importe um contrato / planilha</div>
        <button className="empty-action-btn" onClick={() => { setAdding(true); onAddTask?.() }}>+ Nova tarefa</button>
        {adding && (
          <form onSubmit={handleAddTask} className="add-form" style={{ marginTop: 12 }}>
            <input autoFocus className="add-input" placeholder="Título da tarefa..." value={newTitle} onChange={e => setNewTitle(e.target.value)} />
            <div className="add-form-btns">
              <button type="submit" className="btn-confirm-sm">Criar</button>
              <button type="button" className="btn-cancel-sm" onClick={() => setAdding(false)}>Cancelar</button>
            </div>
          </form>
        )}
        {showKanbanSet && <KanbanSettings projectId={projectId} onClose={() => setShowKanbanSet(false)} />}
        {showFieldDef && <FieldDefinitionPanel projectId={projectId} onClose={() => setShowFieldDef(false)} />}
      </div>
    )
  }

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      {/* Mini-toast do board */}
      {toast && <div className="board-toast">{toast}</div>}

      {/* Fluxo 2: Bulk action bar */}
      {anySelected && (
        <div className="bulk-action-bar">
          <span className="bulk-count">{selectedIds.size} tarefa{selectedIds.size !== 1 ? 's' : ''} selecionada{selectedIds.size !== 1 ? 's' : ''}</span>
          <div className="bulk-actions">
            {activeSprints.length > 0 && (
              <select
                className="bulk-sprint-select"
                disabled={bulkLoading}
                defaultValue=""
                onChange={e => { if (e.target.value) handleBulkAssign(e.target.value) }}
              >
                <option value="" disabled>Mover para sprint…</option>
                {activeSprints.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            )}
            <button
              className="bulk-btn bulk-btn-remove"
              disabled={bulkLoading}
              onClick={() => handleBulkAssign(null)}
            >
              {bulkLoading ? '…' : '✕ Remover do sprint'}
            </button>
            <button
              className="bulk-btn bulk-btn-cancel"
              onClick={() => setSelectedIds(new Set())}
            >
              ✕ Cancelar
            </button>
          </div>
        </div>
      )}

      {projectName && (
        <div className="board-bar">
          <ExportMenu projectId={projectId} projectName={projectName} />
          <button type="button" className="board-settings-btn" onClick={() => setShowKanbanSet(true)}>Colunas</button>
          <button type="button" className="board-settings-btn" onClick={() => setShowFieldDef(true)}>Campos</button>
        </div>
      )}

      {/* Fluxo 3: Sprint drop zones (visible only during drag) */}
      {activeSprints.length > 0 && (
        <div className="sprint-drop-zones">
          <BacklogDropZone isDragging={!!activeTask} />
          {activeSprints.map(s => (
            <SprintDropZone key={s.id} sprint={s} isDragging={!!activeTask} />
          ))}
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
            selectedIds={selectedIds}
            anySelected={anySelected}
            onToggleSelect={handleToggleSelect}
            activeSprints={activeSprints}
            onAssignSprint={handleAssignSprint}
          />
        ))}

        <div className="column column-add">
          {adding ? (
            <form onSubmit={handleAddTask} className="add-form">
              <input autoFocus className="add-input" placeholder="Título da tarefa..." value={newTitle} onChange={e => setNewTitle(e.target.value)} />
              <div className="add-form-btns">
                <button type="submit" className="btn-confirm-sm">Criar</button>
                <button type="button" className="btn-cancel-sm" onClick={() => setAdding(false)}>Cancelar</button>
              </div>
            </form>
          ) : (
            <button className="add-card" onClick={() => setAdding(true)}>+ nova tarefa</button>
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

      {showKanbanSet && <KanbanSettings projectId={projectId} onClose={() => setShowKanbanSet(false)} />}
      {showFieldDef && <FieldDefinitionPanel projectId={projectId} onClose={() => setShowFieldDef(false)} />}
    </DndContext>
  )
}
