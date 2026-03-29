import { useState } from 'react'
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  type DragStartEvent, type DragEndEvent
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import type { Task, TaskStatus } from '../../types'
import { STATUS_COLUMNS } from '../../types'
import { TaskCard } from './TaskCard'
import { useUpdateTaskStatus, useCreateTask } from '../../hooks/useData'

interface Props {
  tasks: Task[]
  projectId: string
}

function DroppableColumn({
  id, label, color, tasks
}: { id: TaskStatus; label: string; color: string; tasks: Task[] }) {
  const { setNodeRef, isOver } = useDroppable({ id })

  return (
    <div
      ref={setNodeRef}
      className="column"
      style={{ background: isOver ? 'rgba(124,109,240,0.04)' : undefined }}
    >
      <div className="col-header">
        <div className="col-dot" style={{ background: color }} />
        <div className="col-name">{label}</div>
        <div className="col-count">{tasks.length} {tasks.length === 1 ? 'item' : 'itens'}</div>
      </div>

      <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
        {tasks.map(task => <TaskCard key={task.id} task={task} />)}
      </SortableContext>
    </div>
  )
}

export function Board({ tasks, projectId }: Props) {
  const [activeTask, setActiveTask] = useState<Task | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [adding, setAdding] = useState(false)

  const updateStatus = useUpdateTaskStatus()
  const createTask = useCreateTask()

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

    // over pode ser uma coluna ou outro card — resolvemos o status alvo
    const colIds = STATUS_COLUMNS.map(c => c.id as string)
    let targetStatus: TaskStatus | null = null

    if (colIds.includes(String(over.id))) {
      targetStatus = over.id as TaskStatus
    } else {
      // over é um card — pega o status da coluna desse card
      const overTask = tasks.find(t => t.id === over.id)
      if (overTask) targetStatus = overTask.status
    }

    if (targetStatus && targetStatus !== task.status) {
      updateStatus.mutate({ id: task.id, status: targetStatus })
    }
  }

  function handleAddTask(e: React.FormEvent) {
    e.preventDefault()
    if (!newTitle.trim()) return
    createTask.mutate({ title: newTitle.trim(), project_id: projectId, quadrant: 'q2' })
    setNewTitle('')
    setAdding(false)
  }

  const byStatus = (s: TaskStatus) => tasks.filter(t => t.status === s)

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="board">
        {STATUS_COLUMNS.map(col => (
          <DroppableColumn
            key={col.id}
            id={col.id}
            label={col.label}
            color={col.color}
            tasks={byStatus(col.id)}
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
    </DndContext>
  )
}
