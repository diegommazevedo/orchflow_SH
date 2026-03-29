/**
 * SprintPanel — Sprint 7: Criação + fechamento + exibição por tipo.
 *
 * Tipos: standard (cinza), recorrente (azul ↻), encaixe (amarelo ⚡)
 * Modal de criação com seletor de tipo
 * Wizard de confirmação para fechar sprint (MEDIUM)
 */
import { useState } from 'react'
import type { Sprint, SprintType, RecurrenceUnit, SprintCloseResult } from '../../types'
import { useCreateSprint, useCloseSprint } from '../../hooks/useSprints'

// ── Badges by type ──────────────────────────────────────────────────────────

const TYPE_BADGE: Record<SprintType, { label: string; color: string; bg: string }> = {
  standard:   { label: 'Sprint',        color: '#666688', bg: '#66668818' },
  recorrente: { label: '↻ Recorrente', color: '#48cae4', bg: '#48cae418' },
  encaixe:    { label: '⚡ Encaixe',    color: '#facc15', bg: '#facc1518' },
}

const RECURRENCE_LABELS: Record<RecurrenceUnit, string> = {
  daily:   'dia(s)',
  weekly:  'semana(s)',
  monthly: 'mês(es)',
}

interface Props {
  sprint: Sprint
  projectId: string
  /** Total tasks in sprint (from board) */
  totalTasks?: number
  doneTasks?: number
  onClosed?: (result: SprintCloseResult) => void
}

export function SprintPanel({ sprint, projectId, totalTasks = 0, doneTasks = 0, onClosed }: Props) {
  const [showCloseWizard, setShowCloseWizard] = useState(false)
  const closeSprint = useCloseSprint()

  const badge = TYPE_BADGE[sprint.type] ?? TYPE_BADGE.standard
  const incompleteTasks = totalTasks - doneTasks

  function handleClose() {
    closeSprint.mutate(sprint.id, {
      onSuccess: (result) => {
        setShowCloseWizard(false)
        onClosed?.(result)
      },
    })
  }

  return (
    <div className="sp-panel">
      {/* Header */}
      <div className="sp-header">
        <span className="sp-badge" style={{ color: badge.color, background: badge.bg }}>
          {badge.label}
        </span>
        <h3 className="sp-name">{sprint.name}</h3>
      </div>

      {/* Info by type */}
      <div className="sp-info">
        {sprint.type === 'recorrente' && (
          <>
            <div className="sp-info-row">
              <span className="sp-info-label">Cadência</span>
              <span className="sp-info-value">
                A cada {sprint.recurrence_interval ?? 1} {RECURRENCE_LABELS[sprint.recurrence_unit ?? 'weekly']}
              </span>
            </div>
            <div className="sp-info-row">
              <span className="sp-info-label">Série</span>
              <span className="sp-info-value">#{sprint.sequence_number}</span>
            </div>
            <div className="sp-info-row">
              <span className="sp-info-label">Auto-criar</span>
              <span className="sp-info-value">{sprint.auto_create ? '✓ Sim' : '✗ Não'}</span>
            </div>
          </>
        )}
        {sprint.start_date && (
          <div className="sp-info-row">
            <span className="sp-info-label">Início</span>
            <span className="sp-info-value">{sprint.start_date}</span>
          </div>
        )}
        {sprint.end_date && (
          <div className="sp-info-row">
            <span className="sp-info-label">Fim</span>
            <span className="sp-info-value">{sprint.end_date}</span>
          </div>
        )}
      </div>

      {/* Close button */}
      {sprint.status === 'active' && (
        <button className="sp-close-btn" onClick={() => setShowCloseWizard(true)}>
          Fechar sprint
        </button>
      )}

      {/* Close wizard (MEDIUM confirmation) */}
      {showCloseWizard && (
        <div className="ps-overlay" onClick={() => setShowCloseWizard(false)}>
          <div className="ps-modal" onClick={e => e.stopPropagation()}>
            <div className="ps-modal-title">Fechar sprint</div>
            <p className="ps-modal-text">
              {incompleteTasks > 0
                ? `${incompleteTasks} tarefa${incompleteTasks > 1 ? 's' : ''} não concluída${incompleteTasks > 1 ? 's' : ''} será${incompleteTasks > 1 ? 'ão' : ''} movida${incompleteTasks > 1 ? 's' : ''} para o backlog.`
                : 'Todas as tarefas foram concluídas.'}
            </p>
            {sprint.type === 'recorrente' && sprint.auto_create && (
              <p className="ps-modal-text" style={{ color: '#48cae4' }}>
                ↻ O próximo sprint será criado automaticamente.
              </p>
            )}
            <div className="ps-modal-actions">
              <button className="ps-modal-btn ps-modal-btn-cancel" onClick={() => setShowCloseWizard(false)}>
                Cancelar
              </button>
              <button
                className="ps-modal-btn ps-modal-btn-confirm"
                onClick={handleClose}
                disabled={closeSprint.isPending}
              >
                {closeSprint.isPending ? 'Fechando…' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


// ── Sprint Create Modal ──────────────────────────────────────────────────────

interface CreateProps {
  projectId: string
  onCreated?: (sprint: Sprint) => void
  onCancel: () => void
}

const TYPE_OPTIONS: { value: SprintType; label: string; desc: string }[] = [
  { value: 'standard',   label: 'Sprint padrão',  desc: 'Ciclo normal com início e fim definidos' },
  { value: 'recorrente', label: '↻ Recorrente',   desc: 'Cadência fixa, auto-criação ao fechar' },
  { value: 'encaixe',    label: '⚡ Encaixe',      desc: 'Demanda espontânea, sem cadência' },
]

export function SprintCreateModal({ projectId, onCreated, onCancel }: CreateProps) {
  const [name, setName] = useState('')
  const [type, setType] = useState<SprintType>('standard')
  const [unit, setUnit] = useState<RecurrenceUnit>('weekly')
  const [interval, setInterval] = useState(1)
  const [autoCreate, setAutoCreate] = useState(true)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const createSprint = useCreateSprint()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    createSprint.mutate(
      {
        project_id: projectId,
        name: name.trim(),
        type,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        recurrence_unit: type === 'recorrente' ? unit : undefined,
        recurrence_interval: type === 'recorrente' ? interval : undefined,
        auto_create: type === 'recorrente' ? autoCreate : false,
      },
      {
        onSuccess: (sprint) => {
          onCreated?.(sprint)
        },
      },
    )
  }

  return (
    <div className="ps-overlay" onClick={onCancel}>
      <form className="ps-modal" onClick={e => e.stopPropagation()} onSubmit={handleSubmit}>
        <div className="ps-modal-title">Novo sprint</div>

        <label className="ps-modal-label">
          Nome
          <input className="ps-modal-input" value={name} onChange={e => setName(e.target.value)} autoFocus required />
        </label>

        {/* Type selector */}
        <div className="sp-type-selector">
          {TYPE_OPTIONS.map(opt => (
            <div
              key={opt.value}
              className={`sp-type-option${type === opt.value ? ' sp-type-active' : ''}`}
              onClick={() => setType(opt.value)}
            >
              <span className="sp-type-label">{opt.label}</span>
              <span className="sp-type-desc">{opt.desc}</span>
            </div>
          ))}
        </div>

        {/* Recurrence fields */}
        {type === 'recorrente' && (
          <div className="sp-recurrence-fields">
            <div className="sp-recurrence-row">
              <label className="ps-modal-label">
                A cada
                <input
                  type="number" min={1} className="ps-modal-input"
                  value={interval} onChange={e => setInterval(Number(e.target.value) || 1)}
                  style={{ width: 60 }}
                />
              </label>
              <label className="ps-modal-label">
                Unidade
                <select className="ps-modal-input" value={unit} onChange={e => setUnit(e.target.value as RecurrenceUnit)}>
                  <option value="daily">Dia(s)</option>
                  <option value="weekly">Semana(s)</option>
                  <option value="monthly">Mês(es)</option>
                </select>
              </label>
            </div>
            <label className="sp-toggle-label">
              <input type="checkbox" checked={autoCreate} onChange={e => setAutoCreate(e.target.checked)} />
              Auto-criar próximo sprint ao fechar
            </label>
          </div>
        )}

        {/* Dates */}
        <div className="sp-recurrence-row">
          <label className="ps-modal-label">
            Início
            <input type="date" className="ps-modal-input" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </label>
          <label className="ps-modal-label">
            Fim
            <input type="date" className="ps-modal-input" value={endDate} onChange={e => setEndDate(e.target.value)} />
          </label>
        </div>

        <div className="ps-modal-actions">
          <button type="button" className="ps-modal-btn ps-modal-btn-cancel" onClick={onCancel}>Cancelar</button>
          <button type="submit" className="ps-modal-btn ps-modal-btn-confirm" disabled={createSprint.isPending}>
            {createSprint.isPending ? 'Criando…' : 'Criar sprint'}
          </button>
        </div>
      </form>
    </div>
  )
}
