/**
 * SheetWizard — importação de planilha / CSV em 2 etapas.
 *
 * Etapa 1: validar mapeamento de colunas (Groq → usuário corrige)
 *   - Campos com baixa confiança ou null → badge âmbar + input para valor padrão
 * Etapa 2: ReviewTaskList com amostra completa + seleção de projeto
 *   - Criar novo projeto inline com useDebouncedConform('name')
 *
 * Leis respeitadas:
 * - wizard_mode = full (campos editáveis antes de confirmar)
 * - Nenhum dado ao banco antes do confirm final
 * - Nome do projeto inline passa por useDebouncedConform (ConformityEngine)
 * - defaults propagados ao backend para células vazias
 */
import { useState } from 'react'
import { isAxiosError } from 'axios'
import { api } from '../../services/api'
import type { SheetParseResult, SheetMapping, SheetTask, ReviewTask } from '../../types'
import type { FieldType } from '../../hooks/useDebouncedConform'
import { ReviewTaskList } from './ReviewTaskList'
import { useDebouncedConform } from '../../hooks/useDebouncedConform'
import { toArr } from '../../utils/array'

const FIELD_LABELS: Record<keyof SheetMapping, string> = {
  title:       'Título (obrigatório)',
  description: 'Descrição',
  quadrant:    'Quadrante',
  status:      'Status',
  due_date:    'Prazo',
  assignee:    'Responsável',
}

const FIELD_KEYS = Object.keys(FIELD_LABELS) as (keyof SheetMapping)[]

const FIELD_DEFAULTS: Record<keyof SheetMapping, string> = {
  title:       '',
  description: '',
  quadrant:    'q2',
  status:      'backlog',
  due_date:    '',
  assignee:    '',
}

function confidenceColor(c: number): string {
  if (c >= 0.75) return '#5eead4'
  if (c >= 0.5)  return '#f59e0b'
  return '#f43f5e'
}

function confidenceLabel(c: number): string {
  if (c >= 0.75) return 'alta'
  if (c >= 0.5)  return 'média'
  return 'baixa'
}

/** Converte SheetTask → ReviewTask (wizard local) */
function sheetToReview(st: SheetTask, i: number): ReviewTask {
  return {
    id: crypto.randomUUID(),
    title: st.title,
    description: st.description ?? undefined,
    quadrant: st.quadrant || 'q2',
    status: st.status || 'backlog',
    due_date: st.due_date?.iso ?? undefined,
    assignee_hint: st.assignee_hint ?? undefined,
    is_discarded: false,
    is_expanded: i < 3,
    is_subtask: false,
  }
}

// ── Componente criar projeto inline ───────────────────────────────────────────

interface InlineCreateProps {
  onCreated: (project: { id: string; name: string }) => void
  onCancel: () => void
}

function InlineCreateProject({ onCreated, onCancel }: InlineCreateProps) {
  const nameConform = useDebouncedConform('name', 600)
  const [creating, setCreating] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const effectiveName =
    nameConform.fieldState.status === 'corrected'
      ? (nameConform.fieldState.conformed as string)
      : nameConform.fieldState.raw

  async function handleCreate() {
    const name = effectiveName.trim()
    if (!name) return
    setCreating(true)
    setErr(null)
    try {
      const { data } = await api.post<{ id: string; name: string }>('/projects/', { name })
      onCreated({ id: data.id, name: data.name })
    } catch (e) {
      setErr(isAxiosError(e) ? (e.response?.data?.detail ?? 'Erro ao criar projeto') : 'Erro ao criar projeto')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="sw-inline-create">
      <div className="sw-inline-create-row">
        <input
          className="cw-input sw-inline-input"
          placeholder="Nome do novo projeto…"
          autoFocus
          {...nameConform.bind}
          onKeyDown={e => {
            if (e.key === 'Enter') void handleCreate()
            if (e.key === 'Escape') onCancel()
          }}
        />
        <button
          className="cw-confirm sw-inline-btn"
          disabled={!effectiveName.trim() || creating}
          onClick={() => void handleCreate()}
        >
          {creating ? '…' : 'Criar e usar'}
        </button>
        <button className="cw-cancel sw-inline-btn-sm" onClick={onCancel}>Cancelar</button>
      </div>
      {nameConform.fieldState.status === 'corrected' && (
        <div className="sw-inline-correction">→ {nameConform.fieldState.conformed as string}</div>
      )}
      {err && <div className="sw-warn sw-err">{err}</div>}
    </div>
  )
}

// ── DefaultFieldInput — input com useDebouncedConform (modo wizard) ───────────
// Usado nos campos de "valor padrão" da Etapa 1.
// Modo wizard: sugestão visível, usuário aceita ou edita antes de confirmar.

interface DefaultFieldInputProps {
  field: keyof SheetMapping
  placeholder: string
  onChange: (val: string) => void
}

function DefaultFieldInput({ field, placeholder, onChange }: DefaultFieldInputProps) {
  const fieldType = (
    field === 'description' ? 'description' : 'name'
  ) as FieldType

  const conform = useDebouncedConform(fieldType, 600)

  return (
    <div className="sw-default-field-wrap">
      <input
        className="sw-default-input"
        placeholder={placeholder}
        value={conform.fieldState.raw}
        onChange={e => {
          conform.bind.onChange(e)
          onChange(e.target.value)
        }}
        onBlur={conform.bind.onBlur}
      />
      {conform.fieldState.status === 'corrected' && (
        <div className="sw-inline-correction">
          → {conform.fieldState.conformed as string}
          <button
            className="sw-apply-btn"
            onClick={() => {
              const v = conform.fieldState.conformed as string
              // Sincroniza raw no hook e notifica o pai
              conform.reset(v)
              onChange(v)
            }}
          >
            aplicar
          </button>
        </div>
      )}
    </div>
  )
}

// ── Etapa 1 — validar mapeamento ──────────────────────────────────────────────

interface Step1Props {
  data: SheetParseResult
  mapping: SheetMapping
  defaults: Record<string, string>
  confidence: number
  onChange: (m: SheetMapping) => void
  onDefaultsChange: (d: Record<string, string>) => void
  onNext: () => void
  onCancel: () => void
}

function Step1({ data, mapping, defaults, confidence, onChange, onDefaultsChange, onNext, onCancel }: Step1Props) {
  const headers = toArr<string>(data.headers)
  const notes = data.notes ?? ''
  const sample_tasks = toArr<SheetTask>(data.sample_tasks)

  function setField(field: keyof SheetMapping, val: string) {
    onChange({ ...mapping, [field]: val === '' ? null : val })
  }

  function setDefault(field: keyof SheetMapping, val: string) {
    onDefaultsChange({ ...defaults, [field]: val })
  }

  const hasDuplicates = (): boolean => {
    const used = Object.values(mapping ?? {}).filter(Boolean) as string[]
    return new Set(used).size < used.length
  }

  const titleMissing = !mapping.title
  const lowConfidence = confidence < 0.70

  return (
    <div className="sw-step">
      <div className="sw-step-head">
        <span className="sw-step-badge">1 de 2</span>
        <h3 className="sw-step-title">Validar mapeamento de colunas</h3>
        <p className="sw-step-sub">
          O agente identificou como cada coluna corresponde aos campos do OrchFlow.
          Corrija se necessário.
        </p>
      </div>

      <div className="sw-confidence-row">
        <span className="sw-conf-label">Confiança do mapeamento:</span>
        <span className="sw-conf-value" style={{ color: confidenceColor(confidence) }}>
          {Math.round(confidence * 100)}% — {confidenceLabel(confidence)}
        </span>
      </div>
      {notes && <div className="sw-notes">📝 {notes}</div>}
      {lowConfidence && (
        <div className="sw-warn">
          ⚠ Confiança baixa — revise o mapeamento e defina valores padrão para campos não mapeados.
        </div>
      )}

      <table className="sw-map-table">
        <thead>
          <tr>
            <th>Campo OrchFlow</th>
            <th>Coluna da planilha</th>
            <th>Valor padrão (células vazias)</th>
          </tr>
        </thead>
        <tbody>
          {FIELD_KEYS.map(field => {
            const isMissing = !mapping[field]
            const showDefault = isMissing || lowConfidence
            return (
              <tr key={field} className={field === 'title' && titleMissing ? 'sw-row-error' : ''}>
                <td className="sw-field-name">{FIELD_LABELS[field]}</td>
                <td>
                  <div className="sw-field-cell">
                    <select
                      className={`sw-col-select${field === 'title' && titleMissing ? ' sw-select-error' : ''}`}
                      value={mapping[field] ?? ''}
                      onChange={e => setField(field, e.target.value)}
                    >
                      <option value="">— ignorar —</option>
                      {headers.map(h => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                    {isMissing && (
                      <span className="sw-low-conf-badge">⚠ não mapeado</span>
                    )}
                    {!isMissing && lowConfidence && (
                      <span className="sw-low-conf-badge sw-low-conf-warn">baixa confiança</span>
                    )}
                  </div>
                </td>
                <td>
                  {showDefault && field !== 'title' && (
                    <DefaultFieldInput
                      field={field}
                      placeholder={FIELD_DEFAULTS[field] || 'padrão…'}
                      onChange={val => setDefault(field, val)}
                    />
                  )}
                  {field === 'title' && (
                    <span className="sw-required-note">obrigatório — sem padrão</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {hasDuplicates() && (
        <div className="sw-warn">⚠ Duas colunas mapeadas para o mesmo campo — corrija antes de continuar.</div>
      )}
      {titleMissing && (
        <div className="sw-warn">⚠ Campo "Título" é obrigatório.</div>
      )}

      {/* Mini-preview das primeiras linhas */}
      {sample_tasks.length > 0 && (
        <div className="sw-preview-mini">
          <div className="sw-preview-label">Preview (primeiras {Math.min(sample_tasks.length, 8)} linhas)</div>
          <table className="sw-preview-table">
            <thead>
              <tr><th>Título</th><th>Quadrante</th><th>Status</th><th>Prazo</th><th>Resp.</th></tr>
            </thead>
            <tbody>
              {sample_tasks.slice(0, 8).map((t, i) => (
                <tr key={i}>
                  <td>{t.title}</td>
                  <td>{t.quadrant}</td>
                  <td>{t.status}</td>
                  <td>{t.due_date?.display ?? '—'}</td>
                  <td>{t.assignee_hint ?? '—'}</td>
                </tr>
              ))}
              {sample_tasks.length > 8 && (
                <tr>
                  <td colSpan={5} className="sw-more-rows">
                    … e mais {sample_tasks.length - 8} linhas na próxima etapa
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="sw-footer">
        <button type="button" className="cw-cancel" onClick={onCancel}>Cancelar</button>
        <button
          type="button"
          className="cw-confirm"
          onClick={onNext}
          disabled={titleMissing || hasDuplicates()}
        >
          Próximo →
        </button>
      </div>
    </div>
  )
}

// ── Etapa 2 — revisar tasks + confirmar ────────────────────────────────────────

interface Step2Props {
  data: SheetParseResult
  mapping: SheetMapping
  defaults: Record<string, string>
  reviewTasks: ReviewTask[]
  onReviewChange: (tasks: ReviewTask[]) => void
  projectId: string
  extraProjects: { id: string; name: string }[]
  projects: { id: string; name: string }[]
  onProjectChange: (id: string) => void
  onProjectCreated: (p: { id: string; name: string }) => void
  onBack: () => void
  onConfirm: () => void
  loading: boolean
  error: string | null
}

const NEW_PROJECT_SENTINEL = '__new__'

function Step2({
  data, mapping, defaults, reviewTasks, onReviewChange,
  projectId, extraProjects, projects, onProjectChange, onProjectCreated,
  onBack, onConfirm, loading, error,
}: Step2Props) {
  const [showCreate, setShowCreate] = useState(false)
  const allProjects = [
    ...toArr<{ id: string; name: string }>(extraProjects),
    ...toArr<{ id: string; name: string }>(projects),
  ]
  const activeTasks = reviewTasks.filter(t => !t.is_discarded)

  function handleSelectChange(val: string) {
    if (val === NEW_PROJECT_SENTINEL) {
      setShowCreate(true)
    } else {
      setShowCreate(false)
      onProjectChange(val)
    }
  }

  function handleProjectCreated(p: { id: string; name: string }) {
    onProjectCreated(p)
    onProjectChange(p.id)
    setShowCreate(false)
  }

  return (
    <div className="sw-step">
      <div className="sw-step-head">
        <span className="sw-step-badge">2 de 2</span>
        <h3 className="sw-step-title">Revisar tasks e confirmar</h3>
        <p className="sw-step-sub">
          Amostra de {toArr<SheetTask>(data.sample_tasks).length} tasks.
          Total a importar: <strong>{data.total_rows}</strong> linhas ({data.format.toUpperCase()}).
        </p>
      </div>

      {/* Seleção / criação de projeto */}
      <div className="sw-project-group">
        <label className="sw-project-label">
          <span>Projeto de destino</span>
          <select
            className="cw-select"
            value={showCreate ? NEW_PROJECT_SENTINEL : projectId}
            onChange={e => handleSelectChange(e.target.value)}
          >
            <option value="">— selecionar projeto —</option>
            <option value={NEW_PROJECT_SENTINEL}>+ Criar novo projeto</option>
            {allProjects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>

        {showCreate && (
          <InlineCreateProject
            onCreated={handleProjectCreated}
            onCancel={() => { setShowCreate(false); onProjectChange('') }}
          />
        )}
      </div>

      {/* Resumo */}
      <div className="sw-summary">
        <span className="sw-summary-n">{data.total_rows}</span>
        <span className="sw-summary-label">linhas a importar</span>
        <span className="sw-summary-fmt">({data.format.toUpperCase()})</span>
        {reviewTasks.filter(t => t.is_discarded).length > 0 && (
          <span className="sw-summary-disc">
            · {reviewTasks.filter(t => t.is_discarded).length} descartadas da amostra
          </span>
        )}
        {Object.keys(defaults ?? {}).some(k => (defaults ?? {})[k]) && (
          <span className="sw-summary-def" title={JSON.stringify(defaults)}>
            · {Object.values(defaults ?? {}).filter(Boolean).length} padrões aplicados
          </span>
        )}
      </div>

      {/* ReviewTaskList — amostra completa */}
      <ReviewTaskList
        tasks={reviewTasks}
        onChange={onReviewChange}
        readonlyNote="🔍 Preview da importação. O import processa todas as linhas originais com o mapeamento e valores padrão definidos."
      />

      {error && <div className="sw-warn sw-err">{error}</div>}

      <div className="sw-footer">
        <button type="button" className="cw-cancel" onClick={onBack}>← Voltar</button>
        <button
          type="button"
          className="cw-confirm"
          onClick={onConfirm}
          disabled={!projectId || loading || activeTasks.length === 0}
        >
          {loading
            ? 'Importando…'
            : `Confirmar importação (${data.total_rows} linhas)`}
        </button>
      </div>
    </div>
  )
}

// ── SheetWizard (orquestrador) ─────────────────────────────────────────────────

interface Props {
  data: SheetParseResult
  projects: { id: string; name: string }[]
  loading: boolean
  error: string | null
  onConfirm: (projectId: string, mapping: SheetMapping, defaults?: Record<string, string>) => void
  onCancel: () => void
}

export function SheetWizard({ data, projects: projectsProp, loading, error, onConfirm, onCancel }: Props) {
  const projects = toArr<{ id: string; name: string }>(projectsProp)
  const [step, setStep] = useState<1 | 2>(1)
  const [mapping, setMapping] = useState<SheetMapping>({ ...(data.mapping ?? {}) })
  const [defaults, setDefaults] = useState<Record<string, string>>({})
  const [projectId, setProjectId] = useState<string>(projects[0]?.id ?? '')
  const [extraProjects, setExtraProjects] = useState<{ id: string; name: string }[]>([])
  const [reviewTasks, setReviewTasks] = useState<ReviewTask[]>(() =>
    toArr<SheetTask>(data.sample_tasks).map(sheetToReview)
  )

  function handleProjectCreated(p: { id: string; name: string }) {
    setExtraProjects(prev => [p, ...prev.filter(x => x.id !== p.id)])
  }

  return (
    <div className="contract-wizard-overlay">
      <div className="contract-wizard sw-wizard">
        <div className="cw-header">
          <h2 className="cw-title">Importar planilha</h2>
          <p className="cw-sub">
            {data.total_rows} linhas detectadas · {data.format.toUpperCase()} ·
            Nenhum dado é salvo até você confirmar.
          </p>
        </div>

        {step === 1 && (
          <Step1
            data={data}
            mapping={mapping}
            defaults={defaults}
            confidence={data.confidence}
            onChange={setMapping}
            onDefaultsChange={setDefaults}
            onNext={() => setStep(2)}
            onCancel={onCancel}
          />
        )}
        {step === 2 && (
          <Step2
            data={data}
            mapping={mapping}
            defaults={defaults}
            reviewTasks={reviewTasks}
            onReviewChange={setReviewTasks}
            projectId={projectId}
            extraProjects={extraProjects}
            projects={projects}
            onProjectChange={setProjectId}
            onProjectCreated={handleProjectCreated}
            onBack={() => setStep(1)}
            onConfirm={() => onConfirm(projectId, mapping, defaults)}
            loading={loading}
            error={error}
          />
        )}
      </div>
    </div>
  )
}
