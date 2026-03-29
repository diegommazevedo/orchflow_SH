/**
 * MatrixPage — Vista Eisenhower 2×2 com DnD entre quadrantes e select inline.
 *
 * Leis respeitadas:
 * - PATCH /api/tasks/{id} com quadrant — dados passam pelo backend (ConformityEngine quando title/desc no body)
 * - ActivityLog quadrant_changed gerado no backend ao mudar quadrante
 * - Invalidação react-query ['tasks'] após PATCH (useUpdateTask)
 * - CORS inalterado
 */
import { useState, useCallback, type CSSProperties } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  useDraggable,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { useTasks, useUpdateTask } from '../hooks/useData'
import { TaskDetailPanel } from '../components/backlog/TaskDetailPanel'
import type { Task, EisenhowerQuadrant } from '../types'
import { toArr } from '../utils/array'

interface Props {
  activeProjectId: string | null
}

const QUADRANT_META: Record<EisenhowerQuadrant, {
  label: string
  sub: string
  color: string
  bg: string
}> = {
  q1: { label: 'Q1 — Urgente + Importante', sub: 'Fazer agora',    color: '#f43f5e', bg: '#f43f5e0e' },
  q2: { label: 'Q2 — Importante',           sub: 'Planejar',       color: '#f59e0b', bg: '#f59e0b0e' },
  q3: { label: 'Q3 — Urgente',              sub: 'Delegar',        color: '#48cae4', bg: '#48cae40e' },
  q4: { label: 'Q4 — Descarta',             sub: 'Eliminar',       color: '#666688', bg: '#66668808' },
}

const QUADRANT_ORDER: EisenhowerQuadrant[] = ['q1', 'q2', 'q3', 'q4']

const DROP_IDS = ['q1', 'q2', 'q3', 'q4'] as const

function isQuadrantId(id: string): id is EisenhowerQuadrant {
  return (DROP_IDS as readonly string[]).includes(id)
}

function calcDueGap(iso?: string | null) {
  if (!iso) return null
  const due = new Date(iso + 'T12:00:00')
  if (isNaN(due.getTime())) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  due.setHours(0, 0, 0, 0)
  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000)
  let color: string
  if (days < 0)        color = '#f43f5e'
  else if (days <= 1)  color = '#f59e0b'
  else                 color = 'var(--muted)'
  const gap = days < 0 ? `há ${Math.abs(days)}d` : days === 0 ? 'hoje' : days === 1 ? 'amanhã' : `em ${days}d`
  return { display: new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR'), gap, color }
}

function resolveDropQuadrant(overId: string, allTasks: Task[]): EisenhowerQuadrant | null {
  if (isQuadrantId(overId)) return overId
  const t = allTasks.find(x => x.id === overId)
  if (t && isQuadrantId(String(t.quadrant))) return t.quadrant as EisenhowerQuadrant
  return null
}

function MatrixTaskCard({
  task,
  onOpenTask,
  onQuadrantChange,
  patchPending,
}: {
  task: Task
  onOpenTask: () => void
  onQuadrantChange: (id: string, q: EisenhowerQuadrant) => void
  patchPending: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id })
  const style: CSSProperties = transform
    ? { transform: CSS.Translate.toString(transform) }
    : {}

  const due = calcDueGap(task.due_date_iso)
  const q = (isQuadrantId(String(task.quadrant)) ? task.quadrant : 'q2') as EisenhowerQuadrant
  const qMeta = QUADRANT_META[q]

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`mx-card${isDragging ? ' mx-card-dragging' : ''}`}
    >
      <div className="mx-card-row">
        <button
          type="button"
          className="mx-card-drag-h"
          {...listeners}
          {...attributes}
          aria-label="Arrastar para outro quadrante"
        >
          ⋮⋮
        </button>
        <div
          className="mx-card-title mx-card-title-click"
          role="button"
          tabIndex={0}
          onClick={onOpenTask}
          onKeyDown={e => e.key === 'Enter' && onOpenTask()}
        >
          {task.title}
        </div>
      </div>
      <div className="mx-card-meta">
        <select
          className="mx-card-q-select"
          style={{ borderColor: qMeta.color, color: qMeta.color }}
          value={q}
          disabled={patchPending}
          onClick={e => e.stopPropagation()}
          onPointerDown={e => e.stopPropagation()}
          onChange={e => onQuadrantChange(task.id, e.target.value as EisenhowerQuadrant)}
        >
          {QUADRANT_ORDER.map(opt => (
            <option key={opt} value={opt}>{opt.toUpperCase()}</option>
          ))}
        </select>
        <span className={`mx-status mx-status-${task.status}`}>{task.status.replace('_', ' ')}</span>
        {due && (
          <span className="mx-due" style={{ color: due.color }}>{due.display} · {due.gap}</span>
        )}
      </div>
    </div>
  )
}

function MatrixCardOverlay({ task }: { task: Task }) {
  return (
    <div className="mx-card mx-card-overlay">
      <div className="mx-card-title">{task.title}</div>
    </div>
  )
}

function QuadrantCell({
  quadrant,
  tasks,
  onOpenTask,
  onQuadrantChange,
  patchPending,
}: {
  quadrant: EisenhowerQuadrant
  tasks: Task[]
  onOpenTask: (t: Task) => void
  onQuadrantChange: (id: string, q: EisenhowerQuadrant) => void
  patchPending: boolean
}) {
  const { setNodeRef, isOver } = useDroppable({ id: quadrant })
  const meta = QUADRANT_META[quadrant]

  return (
    <div className="mx-cell" style={{ '--q-color': meta.color, '--q-bg': meta.bg } as CSSProperties}>
      <div className="mx-cell-header" style={{ borderColor: meta.color }}>
        <span className="mx-q-label" style={{ color: meta.color }}>{meta.label}</span>
        <span className="mx-q-sub">{meta.sub}</span>
        <span className="mx-q-count" style={{ background: meta.color + '22', color: meta.color }}>
          {tasks.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={`mx-cell-body${isOver ? ' mx-cell-body-over' : ''}`}
      >
        {tasks.length === 0 ? (
          <div className="mx-empty">Arraste cards aqui ou use o select no card</div>
        ) : (
          tasks.map(t => (
            <MatrixTaskCard
              key={t.id}
              task={t}
              onOpenTask={() => onOpenTask(t)}
              onQuadrantChange={onQuadrantChange}
              patchPending={patchPending}
            />
          ))
        )}
      </div>
    </div>
  )
}

export function MatrixPage({ activeProjectId }: Props) {
  const { data: tasksRaw, isLoading } = useTasks(activeProjectId ?? undefined)
  const tasks = toArr<Task>(tasksRaw)
  const updateTask = useUpdateTask()
  const patchPending = updateTask.isPending
  const [detailTask, setDetailTask] = useState<Task | null>(null)
  const [activeTask, setActiveTask] = useState<Task | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  )

  const patchQuadrant = useCallback((id: string, q: EisenhowerQuadrant) => {
    const t = tasks.find(x => x.id === id)
    if (!t || t.quadrant === q) return
    updateTask.mutate({ id, quadrant: q })
  }, [tasks, updateTask])

  const onDragStart = useCallback(({ active }: DragStartEvent) => {
    const t = tasks.find(x => x.id === String(active.id))
    setActiveTask(t ?? null)
  }, [tasks])

  const onDragEnd = useCallback(({ active, over }: DragEndEvent) => {
    setActiveTask(null)
    if (!over) return
    const targetQ = resolveDropQuadrant(String(over.id), tasks)
    if (!targetQ) return
    const tid = String(active.id)
    const task = tasks.find(x => x.id === tid)
    if (!task || task.quadrant === targetQ) return
    updateTask.mutate({ id: tid, quadrant: targetQ })
  }, [tasks, updateTask])

  if (!activeProjectId) {
    return (
      <div className="page-empty-state">
        <div className="empty-icon">◈</div>
        <div className="empty-title">Selecione um projeto para ver a matriz</div>
        <div className="empty-sub">A matriz Eisenhower organiza suas tasks por urgência e importância</div>
      </div>
    )
  }

  if (isLoading) return <div className="loading-state">Carregando matrix…</div>

  if (tasks.length === 0) {
    return (
      <div className="page-empty-state">
        <div className="empty-icon">◈</div>
        <div className="empty-title">Nenhuma tarefa classificada ainda</div>
        <div className="empty-sub">Mova tarefas do board para a matriz ou crie novas via chat</div>
      </div>
    )
  }

  const byQuadrant = (q: EisenhowerQuadrant) => tasks.filter(t => t.quadrant === q)

  return (
    <div className="mx-wrapper">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <div className="mx-grid">
          {QUADRANT_ORDER.map(q => (
            <QuadrantCell
              key={q}
              quadrant={q}
              tasks={byQuadrant(q)}
              onOpenTask={setDetailTask}
              onQuadrantChange={patchQuadrant}
              patchPending={patchPending}
            />
          ))}
        </div>
        <DragOverlay dropAnimation={null}>
          {activeTask ? <MatrixCardOverlay task={activeTask} /> : null}
        </DragOverlay>
      </DndContext>

      {detailTask && (
        <TaskDetailPanel
          task={detailTask}
          onClose={() => setDetailTask(null)}
          onDeleted={() => setDetailTask(null)}
        />
      )}
    </div>
  )
}
