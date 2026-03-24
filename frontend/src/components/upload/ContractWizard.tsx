/**
 * ContractWizard — revisão de contrato PDF antes da importação
 *
 * Leis respeitadas:
 * - wizard_mode = full (risco MEDIUM de create_project)
 * - ReviewTask existe só aqui — nada vai ao banco antes do confirm
 * - Todos os campos editáveis passam por useConformField no ReviewTaskList
 * - Confirm envia apenas tasks com is_discarded === false
 */
import { useState } from 'react'
import type { ContractParseResult, ContractTask, EisenhowerQuadrant, ReviewTask } from '../../types'
import { ReviewTaskList } from './ReviewTaskList'

function gapHint(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso.includes('T') ? iso : `${iso}T12:00:00`)
  if (Number.isNaN(d.getTime())) return ''
  const t = new Date()
  t.setHours(0, 0, 0, 0)
  d.setHours(0, 0, 0, 0)
  const diff = Math.round((d.getTime() - t.getTime()) / 86400000)
  if (diff === 0) return '· hoje'
  if (diff === 1) return '· amanhã'
  if (diff > 1) return `· em ${diff} dias`
  return `· há ${Math.abs(diff)} dias`
}

/** Converte ContractTask → ReviewTask (enriquece com id local) */
function contractToReview(ct: ContractTask): ReviewTask {
  return {
    id: crypto.randomUUID(),
    title: ct.title,
    description: ct.description ?? undefined,
    quadrant: ct.quadrant || 'q2',
    status: 'backlog',
    due_date: ct.due_date ?? undefined,
    assignee_hint: ct.assignee_hint ?? undefined,
    source_clause: ct.source_clause ?? undefined,
    review_notes: ct.review_notes ?? undefined,
    suggested_subtasks: ct.suggested_subtasks ?? [],
    is_discarded: false,
    is_expanded: false,
    is_subtask: false,
  }
}

/** Converte ReviewTask → ContractTask para envio ao confirm */
function reviewToContract(rt: ReviewTask): ContractTask {
  return {
    title: rt.title,
    description: rt.description ?? null,
    quadrant: rt.quadrant as EisenhowerQuadrant,
    due_date: rt.due_date ?? null,
    assignee_hint: rt.assignee_hint ?? null,
    source_clause: rt.source_clause ?? null,
    review_notes: '',
    suggested_subtasks: [],
  }
}

interface Props {
  data: ContractParseResult
  onConfirm: (data: ContractParseResult) => void
  onCancel: () => void
}

export function ContractWizard({ data, onConfirm, onCancel }: Props) {
  const [project, setProject] = useState({ ...data.project })
  const [reviewTasks, setReviewTasks] = useState<ReviewTask[]>(() =>
    data.tasks.map(contractToReview)
  )

  const activeTasks = reviewTasks.filter(t => !t.is_discarded)

  function handleConfirm() {
    const tasks = activeTasks.map(reviewToContract)
    onConfirm({ project, tasks })
  }

  return (
    <div className="contract-wizard-overlay">
      <div className="contract-wizard">
        <div className="cw-header">
          <h2 className="cw-title">Revisar importação do contrato</h2>
          <p className="cw-sub">
            Ajuste os campos antes de confirmar — nada é salvo até você clicar em Confirmar.
            Tasks descartadas não serão criadas.
          </p>
        </div>

        {/* ── Seção do projeto ─────────────────────────────────────────────── */}
        <section className="cw-section">
          <div className="cw-label">Projeto</div>
          <div className="cw-grid">
            <label className="cw-field">
              <span>Nome</span>
              <input
                className="cw-input"
                value={project.name || ''}
                onChange={e => setProject(p => ({ ...p, name: e.target.value }))}
              />
            </label>
            <label className="cw-field">
              <span>Cliente</span>
              <input
                className="cw-input"
                value={project.client ?? ''}
                onChange={e => setProject(p => ({ ...p, client: e.target.value || null }))}
              />
            </label>
            <label className="cw-field">
              <span>Início</span>
              <input
                type="date"
                className="cw-input"
                value={(project.start_date || '').slice(0, 10)}
                onChange={e => setProject(p => ({ ...p, start_date: e.target.value || null }))}
              />
            </label>
            <label className="cw-field">
              <span>Fim</span>
              <input
                type="date"
                className="cw-input"
                value={(project.end_date || '').slice(0, 10)}
                onChange={e => setProject(p => ({ ...p, end_date: e.target.value || null }))}
              />
              <span className="cw-gap">{gapHint(project.end_date)}</span>
            </label>
          </div>
          <label className="cw-field cw-field-full">
            <span>Resumo / objeto</span>
            <textarea
              className="cw-textarea"
              rows={3}
              value={project.description ?? ''}
              onChange={e => setProject(p => ({ ...p, description: e.target.value }))}
            />
          </label>
        </section>

        {/* ── Backlog completo ─────────────────────────────────────────────── */}
        <section className="cw-section cw-section-tasks">
          <div className="cw-label">
            Backlog ({activeTasks.length} tasks ativas de {reviewTasks.length} extraídas)
          </div>
          <ReviewTaskList tasks={reviewTasks} onChange={setReviewTasks} />
        </section>

        {/* ── Footer ───────────────────────────────────────────────────────── */}
        <div className="cw-footer">
          <button type="button" className="cw-cancel" onClick={onCancel}>Cancelar</button>
          <button
            type="button"
            className="cw-confirm"
            onClick={handleConfirm}
            disabled={!project.name?.trim() || activeTasks.length === 0}
          >
            Confirmar ({activeTasks.length} tasks)
          </button>
        </div>
      </div>
    </div>
  )
}
