/**
 * ReviewTaskList — componente de revisão pré-confirmação
 *
 * Leis respeitadas:
 * - ReviewTask existe só no wizard — NUNCA vai ao banco diretamente
 * - Campos editados passam por useConformField (debounce 600ms + onBlur imediato)
 * - Nenhum dado ao banco antes do confirm final
 */
import { useState, useRef, useEffect } from 'react'
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { ReviewTask } from '../../types'
import { useConformField } from '../../hooks/useConformField'
import { toArr } from '../../utils/array'

// ── helpers ───────────────────────────────────────────────────────────────────

const Q_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  q1: { bg: '#f43f5e15', color: '#f43f5e', border: '#f43f5e25' },
  q2: { bg: '#f59e0b15', color: '#f59e0b', border: '#f59e0b25' },
  q3: { bg: '#48cae415', color: '#48cae4', border: '#48cae425' },
  q4: { bg: '#44445518', color: '#666688', border: '#44445525' },
}

const Q_OPTS = [
  { value: 'q1', label: 'Q1 — Urgente + Importante' },
  { value: 'q2', label: 'Q2 — Importante' },
  { value: 'q3', label: 'Q3 — Urgente' },
  { value: 'q4', label: 'Q4 — Descarta' },
]

const STATUS_OPTS = [
  { value: 'backlog',     label: 'Backlog' },
  { value: 'in_progress', label: 'Em andamento' },
  { value: 'blocked',     label: 'Impedimento' },
  { value: 'done',        label: 'Concluído' },
]

function calcDueGap(iso?: string) {
  if (!iso) return null
  const due = new Date(iso + 'T12:00:00')
  if (isNaN(due.getTime())) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  due.setHours(0, 0, 0, 0)
  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000)
  const display = new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR')
  let gap: string, color: string
  if (days < 0)       { gap = `venceu há ${Math.abs(days)}d`; color = '#f43f5e' }
  else if (days === 0) { gap = 'hoje'; color = '#f59e0b' }
  else if (days === 1) { gap = 'amanhã'; color = '#f59e0b' }
  else                 { gap = `em ${days}d`; color = 'var(--muted)' }
  return { display, gap, color }
}

function makeTask(override: Partial<ReviewTask> = {}): ReviewTask {
  return {
    id: crypto.randomUUID(),
    title: 'Nova tarefa',
    description: '',
    quadrant: 'q2',
    status: 'backlog',
    is_discarded: false,
    is_expanded: true,
    is_subtask: false,
    ...override,
  }
}

// ── ReviewTaskCard ─────────────────────────────────────────────────────────────

interface CardProps {
  task: ReviewTask
  allTasks: ReviewTask[]
  onUpdate: (patch: Partial<ReviewTask>) => void
  onDiscard: () => void
  onRestore?: () => void
  onSubdivide: (newTasks: ReviewTask[]) => void
  isDragOverlay?: boolean
}

function ReviewTaskCard({ task, allTasks, onUpdate, onDiscard, onRestore, onSubdivide, isDragOverlay }: CardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id, disabled: task.is_discarded })

  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description ?? '')
  const [dueDate, setDueDate] = useState(task.due_date ?? '')
  const [assignee, setAssignee] = useState(task.assignee_hint ?? '')
  const [showDecompose, setShowDecompose] = useState(false)
  const [newSubtask, setNewSubtask] = useState('')
  const [showLinkDep, setShowLinkDep] = useState(false)

  // Modo wizard: usuário está em revisão ativa — sugestão visível e facultativa
  const titleConform    = useConformField('title',       { mode: 'wizard' })
  const descConform     = useConformField('description', { mode: 'wizard' })
  const assigneeConform = useConformField('name',        { mode: 'wizard' })
  const titleTimer    = useRef<ReturnType<typeof setTimeout>>()
  const descTimer     = useRef<ReturnType<typeof setTimeout>>()
  const assigneeTimer = useRef<ReturnType<typeof setTimeout>>()

  // Sync fields when task.id changes (e.g., parent resets)
  useEffect(() => {
    setTitle(task.title)
    setDescription(task.description ?? '')
    setDueDate(task.due_date ?? '')
    setAssignee(task.assignee_hint ?? '')
  }, [task.id])

  const q = Q_STYLE[task.quadrant] ?? Q_STYLE.q2
  const due = calcDueGap(task.due_date)

  const cardStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  }

  // ── Discarded card ──────────────────────────────────────────────────────────
  if (task.is_discarded) {
    return (
      <div className={`rtl-card rtl-card-discarded${task.is_subtask ? ' rtl-card-subtask' : ''}`}>
        <div className="rtl-card-header">
          <span className="rtl-q-pill rtl-q-muted">{task.quadrant.toUpperCase()}</span>
          <span className="rtl-title-discarded">{task.title}</span>
          {onRestore && (
            <button className="rtl-restore-btn" onClick={onRestore}>recuperar</button>
          )}
        </div>
      </div>
    )
  }

  // ── Active card ─────────────────────────────────────────────────────────────
  return (
    <div
      ref={setNodeRef}
      style={cardStyle}
      className={`rtl-card${task.is_subtask ? ' rtl-card-subtask' : ''}${isDragging || isDragOverlay ? ' rtl-card-dragging' : ''}`}
    >
      {/* Header — sempre visível */}
      <div className="rtl-card-header">
        <span className="rtl-drag-handle" {...attributes} {...listeners} title="Arrastar">⠿</span>
        <span className="rtl-q-pill" style={{ background: q.bg, color: q.color, border: `1px solid ${q.border}` }}>
          {task.quadrant.toUpperCase()}
        </span>
        <span className="rtl-header-title">{title}</span>
        <button className="rtl-discard-btn" onClick={onDiscard} title="Descartar">×</button>
        <button
          className={`rtl-expand-btn${task.is_expanded ? ' rtl-expand-open' : ''}`}
          onClick={() => onUpdate({ is_expanded: !task.is_expanded })}
          title={task.is_expanded ? 'Colapsar' : 'Expandir'}
        >
          {task.is_expanded ? '▲' : '▼'}
        </button>
      </div>

      {/* Sumário — sempre visível */}
      <div className="rtl-summary">
        <span className="rtl-sum-badge">{STATUS_OPTS.find(s => s.value === task.status)?.label ?? task.status}</span>
        {assignee && <span className="rtl-sum-assignee">@{assignee}</span>}
        {due && (
          <span className="rtl-sum-due" style={{ color: due.color }}>
            {due.display} · {due.gap}
          </span>
        )}
        {toArr<string>(task.dependencies).length > 0 && (
          <span className="rtl-dep-count">🔗 {toArr<string>(task.dependencies).length} dep.</span>
        )}
      </div>

      {/* Badges de dependência */}
      {toArr<string>(task.dependencies).length > 0 && (
        <div className="rtl-dep-badges">
          {toArr<string>(task.dependencies).map(depId => {
            const dep = allTasks.find(t => t.id === depId)
            return dep ? (
              <span key={depId} className="rtl-dep-badge">
                depende de: {dep.title.length > 35 ? dep.title.slice(0, 35) + '…' : dep.title}
                <button
                  className="rtl-dep-remove"
                  onClick={() => onUpdate({ dependencies: toArr<string>(task.dependencies).filter(d => d !== depId) })}
                >×</button>
              </span>
            ) : null
          })}
        </div>
      )}

      {/* Corpo expansível */}
      <div className={`rtl-card-body${task.is_expanded ? ' rtl-card-body-open' : ''}`}>
        {task.is_expanded && (
          <div className="rtl-card-fields">

            {/* Título */}
            <div className="rtl-field">
              <label className="rtl-field-label">Título</label>
              <input
                className="rtl-input"
                value={title}
                onChange={e => {
                  setTitle(e.target.value)
                  onUpdate({ title: e.target.value })
                  clearTimeout(titleTimer.current)
                  titleTimer.current = setTimeout(() => titleConform.conform(e.target.value), 600)
                }}
                onBlur={() => {
                  clearTimeout(titleTimer.current)
                  titleConform.conform(title)
                }}
              />
              {titleConform.fieldState.status === 'corrected' && (
                <div className="rtl-correction">
                  → {titleConform.fieldState.conformed as string}
                  <button
                    className="rtl-apply-btn"
                    onClick={() => {
                      const v = titleConform.fieldState.conformed as string
                      setTitle(v)
                      onUpdate({ title: v })
                    }}
                  >aplicar</button>
                </div>
              )}
            </div>

            {/* Descrição */}
            <div className="rtl-field">
              <label className="rtl-field-label">Descrição</label>
              <textarea
                className="rtl-textarea"
                rows={2}
                value={description}
                onChange={e => {
                  setDescription(e.target.value)
                  onUpdate({ description: e.target.value })
                  clearTimeout(descTimer.current)
                  descTimer.current = setTimeout(() => descConform.conform(e.target.value), 600)
                }}
                onBlur={() => {
                  clearTimeout(descTimer.current)
                  descConform.conform(description)
                }}
              />
              {descConform.fieldState.status === 'corrected' && (
                <div className="rtl-correction">
                  → {descConform.fieldState.conformed as string}
                  <button
                    className="rtl-apply-btn"
                    onClick={() => {
                      const v = descConform.fieldState.conformed as string
                      setDescription(v)
                      onUpdate({ description: v })
                    }}
                  >aplicar</button>
                </div>
              )}
            </div>

            {/* Quadrante + Status */}
            <div className="rtl-row">
              <div className="rtl-field rtl-field-half">
                <label className="rtl-field-label">Quadrante</label>
                <select
                  className="rtl-select"
                  value={task.quadrant}
                  onChange={e => onUpdate({ quadrant: e.target.value })}
                >
                  {Q_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="rtl-field rtl-field-half">
                <label className="rtl-field-label">Status</label>
                <select
                  className="rtl-select"
                  value={task.status}
                  onChange={e => onUpdate({ status: e.target.value })}
                >
                  {STATUS_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>

            {/* Prazo + Responsável */}
            <div className="rtl-row">
              <div className="rtl-field rtl-field-half">
                <label className="rtl-field-label">Prazo</label>
                <input
                  type="date"
                  className="rtl-input"
                  value={dueDate}
                  onChange={e => {
                    setDueDate(e.target.value)
                    onUpdate({ due_date: e.target.value || undefined })
                  }}
                />
              </div>
              <div className="rtl-field rtl-field-half">
                <label className="rtl-field-label">Responsável</label>
                <input
                  className="rtl-input"
                  placeholder="Nome (hint)"
                  value={assignee}
                  onChange={e => {
                    setAssignee(e.target.value)
                    onUpdate({ assignee_hint: e.target.value || undefined })
                    clearTimeout(assigneeTimer.current)
                    assigneeTimer.current = setTimeout(() => assigneeConform.conform(e.target.value), 600)
                  }}
                  onBlur={() => {
                    clearTimeout(assigneeTimer.current)
                    assigneeConform.conform(assignee)
                  }}
                />
                {assigneeConform.fieldState.status === 'corrected' && (
                  <div className="rtl-correction">
                    → {assigneeConform.fieldState.conformed as string}
                    <button
                      className="rtl-apply-btn"
                      onClick={() => {
                        const v = assigneeConform.fieldState.conformed as string
                        setAssignee(v)
                        onUpdate({ assignee_hint: v })
                      }}
                    >aplicar</button>
                  </div>
                )}
              </div>
            </div>

            {/* Notas do agente */}
            {task.review_notes && (
              <div className="rtl-notes">⚠ {task.review_notes}</div>
            )}

            {/* Cláusula de origem */}
            {task.source_clause && (
              <div className="rtl-source">Cláusula: {task.source_clause}</div>
            )}

            {/* Subtasks sugeridas pelo agente */}
            {toArr<string>(task.suggested_subtasks).length > 0 && (
              <div className="rtl-suggested">
                <div className="rtl-field-label">Subtarefas sugeridas ({toArr<string>(task.suggested_subtasks).length})</div>
                <ul className="rtl-sub-list">
                  {toArr<string>(task.suggested_subtasks).map((s, i) => (
                    <li key={i} className="rtl-sub-item">
                      <span className="rtl-sub-text">{s}</span>
                      <button
                        className="rtl-add-sub-btn"
                        onClick={() => {
                          onSubdivide([makeTask({
                            title: s,
                            description: `Subtarefa de: ${task.title}`,
                            quadrant: task.quadrant,
                            status: task.status,
                            due_date: task.due_date,
                            assignee_hint: task.assignee_hint,
                            is_expanded: false,
                            is_subtask: true,
                          })])
                          // Remove suggestion from list
                          onUpdate({ suggested_subtasks: toArr<string>(task.suggested_subtasks).filter((_, j) => j !== i) })
                        }}
                      >+ criar card</button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Ações do card */}
            <div className="rtl-actions-row">
              {/* Decompor */}
              {!showDecompose ? (
                <button className="rtl-action-btn" onClick={() => setShowDecompose(true)}>
                  ✂ Decompor
                </button>
              ) : (
                <div className="rtl-decompose-form">
                  <input
                    className="rtl-input rtl-input-inline"
                    placeholder="Título da subtarefa…"
                    value={newSubtask}
                    autoFocus
                    onChange={e => setNewSubtask(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && newSubtask.trim()) {
                        onSubdivide([makeTask({
                          title: newSubtask.trim(),
                          description: `Subtarefa de: ${task.title}`,
                          quadrant: task.quadrant,
                          status: task.status,
                          due_date: task.due_date,
                          assignee_hint: task.assignee_hint,
                          is_expanded: false,
                          is_subtask: true,
                        })])
                        setNewSubtask('')
                      }
                      if (e.key === 'Escape') { setNewSubtask(''); setShowDecompose(false) }
                    }}
                  />
                  <button
                    className="btn-confirm-sm"
                    disabled={!newSubtask.trim()}
                    onClick={() => {
                      if (!newSubtask.trim()) return
                      onSubdivide([makeTask({
                        title: newSubtask.trim(),
                        description: `Subtarefa de: ${task.title}`,
                        quadrant: task.quadrant,
                        status: task.status,
                        due_date: task.due_date,
                        assignee_hint: task.assignee_hint,
                        is_expanded: false,
                        is_subtask: true,
                      })])
                      setNewSubtask('')
                      setShowDecompose(false)
                    }}
                  >+</button>
                  <button className="btn-cancel-sm" onClick={() => { setNewSubtask(''); setShowDecompose(false) }}>×</button>
                </div>
              )}

              {/* Vincular dependência */}
              {!showLinkDep ? (
                <button className="rtl-action-btn" onClick={() => setShowLinkDep(true)}>
                  🔗 Vincular
                </button>
              ) : (
                <div className="rtl-link-form">
                  <select
                    className="rtl-select"
                    defaultValue=""
                    onChange={e => {
                      const depId = e.target.value
                      if (depId) {
                        const current = toArr<string>(task.dependencies)
                        if (!current.includes(depId)) {
                          onUpdate({ dependencies: [...current, depId] })
                        }
                      }
                      setShowLinkDep(false)
                    }}
                  >
                    <option value="">— selecionar tarefa —</option>
                    {allTasks
                      .filter(t => t.id !== task.id && !toArr<string>(task.dependencies).includes(t.id))
                      .map(t => (
                        <option key={t.id} value={t.id}>
                          {t.title.length > 55 ? t.title.slice(0, 55) + '…' : t.title}
                        </option>
                      ))}
                  </select>
                  <button className="btn-cancel-sm" onClick={() => setShowLinkDep(false)}>×</button>
                </div>
              )}

              <button className="rtl-action-btn rtl-action-discard" onClick={onDiscard}>
                🗑 Descartar
              </button>
            </div>

          </div>
        )}
      </div>
    </div>
  )
}

// ── ReviewTaskList ─────────────────────────────────────────────────────────────

type FilterType = 'all' | 'q1' | 'q2' | 'q3' | 'q4' | 'discarded'

const FILTER_LABELS: Record<FilterType, string> = {
  all: 'Todas',
  q1: 'Q1', q2: 'Q2', q3: 'Q3', q4: 'Q4',
  discarded: 'Descartadas',
}

interface Props {
  tasks: ReviewTask[]
  onChange: (tasks: ReviewTask[]) => void
  readonlyNote?: string
}

export function ReviewTaskList({ tasks: tasksProp, onChange, readonlyNote }: Props) {
  const tasks = toArr<ReviewTask>(tasksProp)
  const [filter, setFilter] = useState<FilterType>('all')
  const [activeId, setActiveId] = useState<string | null>(null)

  const activeTasks    = tasks.filter(t => !t.is_discarded)
  const discardedTasks = tasks.filter(t => t.is_discarded)
  const subtaskCount   = tasks.filter(t => t.is_subtask && !t.is_discarded).length

  const filteredActive: ReviewTask[] =
    filter === 'all'       ? activeTasks :
    filter === 'discarded' ? discardedTasks :
    activeTasks.filter(t => t.quadrant === filter)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  // ── mutations ──────────────────────────────────────────────────────────────

  function updateTask(id: string, patch: Partial<ReviewTask>) {
    onChange(tasks.map(t => t.id === id ? { ...t, ...patch } : t))
  }

  function discardTask(id: string) {
    onChange(tasks.map(t => t.id === id ? { ...t, is_discarded: true, is_expanded: false } : t))
  }

  function restoreTask(id: string) {
    onChange(tasks.map(t => t.id === id ? { ...t, is_discarded: false } : t))
  }

  function subdivideTask(id: string, newTasks: ReviewTask[]) {
    const idx = tasks.findIndex(t => t.id === id)
    if (idx === -1) return
    const next = [...tasks]
    next.splice(idx + 1, 0, ...newTasks)
    onChange(next)
  }

  function addTask() {
    onChange([makeTask({ is_expanded: true }), ...tasks])
  }

  function expandAll() {
    onChange(tasks.map(t => ({ ...t, is_expanded: !t.is_discarded })))
  }

  function collapseAll() {
    onChange(tasks.map(t => ({ ...t, is_expanded: false })))
  }

  function discardAllQ4() {
    onChange(tasks.map(t =>
      t.quadrant === 'q4' && !t.is_discarded
        ? { ...t, is_discarded: true, is_expanded: false }
        : t
    ))
  }

  // ── DnD ───────────────────────────────────────────────────────────────────

  function onDragStart({ active }: { active: { id: string | number } }) {
    setActiveId(String(active.id))
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null)
    if (!over || active.id === over.id) return
    const from = activeTasks.findIndex(t => t.id === active.id)
    const to   = activeTasks.findIndex(t => t.id === over.id)
    if (from === -1 || to === -1) return
    const reordered = arrayMove(activeTasks, from, to)
    onChange([...reordered, ...discardedTasks])
  }

  const overlayTask = activeId ? tasks.find(t => t.id === activeId) ?? null : null

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="rtl-wrapper">

      {/* nota de somente leitura (SheetWizard) */}
      {readonlyNote && (
        <div className="rtl-readonly-note">{readonlyNote}</div>
      )}

      {/* Toolbar */}
      <div className="rtl-toolbar">
        <div className="rtl-stats">
          <span className="rtl-stat-n">{activeTasks.length}</span>
          <span className="rtl-stat-label">tasks</span>
          {discardedTasks.length > 0 && (
            <span className="rtl-stat-discarded">· {discardedTasks.length} descartadas</span>
          )}
          {subtaskCount > 0 && (
            <span className="rtl-stat-sub">· {subtaskCount} subtasks</span>
          )}
        </div>

        <div className="rtl-toolbar-actions">
          <button className="rtl-tb-btn" onClick={addTask}>+ Nova task</button>
          <button className="rtl-tb-btn" onClick={expandAll}>Expandir todas</button>
          <button className="rtl-tb-btn" onClick={collapseAll}>Colapsar todas</button>
          <button className="rtl-tb-btn rtl-tb-btn-warn" onClick={discardAllQ4}>Descartar Q4</button>
        </div>
      </div>

      {/* Filtros pill */}
      <div className="rtl-filters">
        {(Object.keys(FILTER_LABELS) as FilterType[]).map(f => (
          <button
            key={f}
            className={`rtl-filter-pill${filter === f ? ' rtl-filter-active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {FILTER_LABELS[f]}
            {f === 'discarded' && discardedTasks.length > 0 && (
              <span className="rtl-filter-count">{discardedTasks.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Cards ativos com DnD */}
      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <SortableContext
          items={filteredActive.map(t => t.id)}
          strategy={verticalListSortingStrategy}
        >
          {filteredActive.map(task => (
            <ReviewTaskCard
              key={task.id}
              task={task}
              allTasks={activeTasks}
              onUpdate={patch => updateTask(task.id, patch)}
              onDiscard={() => discardTask(task.id)}
              onRestore={() => restoreTask(task.id)}
              onSubdivide={newTasks => subdivideTask(task.id, newTasks)}
            />
          ))}
        </SortableContext>

        <DragOverlay>
          {overlayTask && (
            <ReviewTaskCard
              task={overlayTask}
              allTasks={activeTasks}
              onUpdate={() => {}}
              onDiscard={() => {}}
              onSubdivide={() => {}}
              isDragOverlay
            />
          )}
        </DragOverlay>
      </DndContext>

      {/* Cards descartados — fora do DnD context */}
      {filter !== 'discarded' && discardedTasks.length > 0 && (
        <div className="rtl-discarded-section">
          <div className="rtl-discarded-header">
            Descartadas ({discardedTasks.length})
          </div>
          {discardedTasks.map(task => (
            <ReviewTaskCard
              key={task.id}
              task={task}
              allTasks={activeTasks}
              onUpdate={patch => updateTask(task.id, patch)}
              onDiscard={() => discardTask(task.id)}
              onRestore={() => restoreTask(task.id)}
              onSubdivide={newTasks => subdivideTask(task.id, newTasks)}
            />
          ))}
        </div>
      )}

      {/* Placeholder vazio */}
      {filteredActive.length === 0 && discardedTasks.length === 0 && (
        <div className="rtl-empty">Nenhuma task. Clique em "+ Nova task" para adicionar.</div>
      )}
      {filteredActive.length === 0 && filter !== 'all' && filter !== 'discarded' && (
        <div className="rtl-empty">Nenhuma task com esse filtro.</div>
      )}
    </div>
  )
}
