import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Task } from '../../types'
import { useDeleteTask } from '../../hooks/useData'

const Q_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  q1: { bg: '#f43f5e15', color: '#f43f5e', border: '#f43f5e25' },
  q2: { bg: '#f59e0b15', color: '#f59e0b', border: '#f59e0b25' },
  q3: { bg: '#48cae415', color: '#48cae4', border: '#48cae425' },
  q4: { bg: '#44445518', color: '#666688', border: '#44445525' },
}

interface Props {
  task: Task
  overlay?: boolean
}

export function TaskCard({ task, overlay }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id })

  const deleteTask = useDeleteTask()
  const q = Q_STYLE[task.quadrant] ?? Q_STYLE.q2

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  const hours = Math.floor(task.time_spent_minutes / 60)
  const mins = task.time_spent_minutes % 60
  const timeLabel = task.time_spent_minutes > 0
    ? hours > 0 ? `${hours}h ${mins}m` : `${mins}m`
    : null

  return (
    <div ref={setNodeRef} style={style} className={`task-card${overlay ? ' overlay' : ''}`}>
      <div className="task-card-top">
        {/* drag handle */}
        <span className="drag-handle" {...attributes} {...listeners} title="Arrastar">⠿</span>
        <span className="q-pill" style={{ background: q.bg, color: q.color, border: `1px solid ${q.border}` }}>
          {task.quadrant.toUpperCase()}
        </span>
        <span className="task-id">#{task.id.slice(0, 6)}</span>
        <button
          className="delete-btn"
          onClick={() => deleteTask.mutate(task.id)}
          title="Remover"
        >×</button>
      </div>
      <div className="task-title">{task.title}</div>
      {task.description && <div className="task-desc">{task.description}</div>}
      <div className="task-meta">
        {timeLabel && <span className="task-time">⏱ {timeLabel}</span>}
      </div>
    </div>
  )
}
