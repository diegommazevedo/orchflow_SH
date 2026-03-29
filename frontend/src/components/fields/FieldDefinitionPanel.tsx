/**
 * Frente 2 — definir campos customizados do projeto (lista + criar + remover).
 */
import { useState } from 'react'
import {
  useFieldDefinitions,
  useCreateFieldDefinition,
  useDeleteFieldDefinition,
} from '../../hooks/useV2'
import type { FieldTypeV2 } from '../../types'

const TYPE_OPTS: FieldTypeV2[] = [
  'text',
  'textarea',
  'number',
  'date',
  'select',
  'multiselect',
  'boolean',
  'url',
  'currency',
  'user',
]

interface Props {
  projectId: string
  onClose: () => void
}

export function FieldDefinitionPanel({ projectId, onClose }: Props) {
  const { data: list = [], isLoading, refetch } = useFieldDefinitions(projectId)
  const createF = useCreateFieldDefinition()
  const delF = useDeleteFieldDefinition()

  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [label, setLabel] = useState('')
  const [fieldType, setFieldType] = useState<string>('text')
  const [required, setRequired] = useState(false)
  const [optInput, setOptInput] = useState('')
  const [options, setOptions] = useState<string[]>([])

  const taskScoped = list.filter(
    f => f.entity_type === 'task' && (f.project_id === projectId || f.project_id == null),
  )

  function addOption() {
    const t = optInput.trim()
    if (!t) return
    setOptions(o => [...o, t])
    setOptInput('')
  }

  return (
    <div className="fdp-overlay" role="dialog" aria-modal>
      <div className="fdp-card">
        <div className="fdp-head">
          <h3>Campos customizados</h3>
          <button type="button" className="ks-x" onClick={onClose} aria-label="Fechar">×</button>
        </div>
        {isLoading ? <p className="ks-muted">Carregando…</p> : (
          <ul className="fdp-list">
            {taskScoped.map(f => (
              <li key={f.id} className="fdp-row">
                <span className="fdp-name">{f.label}</span>
                <span className="fdp-badge">{f.field_type}</span>
                {f.required ? <span className="fdp-req">obrigatório</span> : null}
                <button
                  type="button"
                  className="fdp-del"
                  onClick={() => {
                    if (window.confirm(`Remover o campo "${f.label}"? Os valores nas tarefas serão apagados.`)) {
                      delF.mutate(
                        { projectId, fieldId: f.id },
                        { onSuccess: () => refetch() },
                      )
                    }
                  }}
                >
                  remover
                </button>
              </li>
            ))}
          </ul>
        )}

        {!open ? (
          <button type="button" className="btn-confirm-sm" onClick={() => setOpen(true)}>+ Campo</button>
        ) : (
          <form
            className="fdp-form"
            onSubmit={e => {
              e.preventDefault()
              if (!name.trim() || !label.trim()) return
              createF.mutate(
                {
                  projectId,
                  name: name.trim(),
                  label: label.trim(),
                  field_type: fieldType,
                  required,
                  options: fieldType === 'select' || fieldType === 'multiselect' ? options : [],
                  order: taskScoped.length,
                  entity_type: 'task',
                },
                {
                  onSuccess: () => {
                    setOpen(false)
                    setName('')
                    setLabel('')
                    setFieldType('text')
                    setRequired(false)
                    setOptions([])
                    refetch()
                  },
                },
              )
            }}
          >
            <input className="cf-input" placeholder="name (slug)" value={name} onChange={e => setName(e.target.value)} />
            <input className="cf-input" placeholder="Rótulo" value={label} onChange={e => setLabel(e.target.value)} />
            <select className="cf-input" value={fieldType} onChange={e => setFieldType(e.target.value)}>
              {TYPE_OPTS.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <label className="fdp-toggle">
              <input type="checkbox" checked={required} onChange={e => setRequired(e.target.checked)} />
              obrigatório
            </label>
            {(fieldType === 'select' || fieldType === 'multiselect') && (
              <div className="fdp-opts">
                <div className="fdp-opt-row">
                  <input
                    className="cf-input"
                    placeholder="opção"
                    value={optInput}
                    onChange={e => setOptInput(e.target.value)}
                  />
                  <button type="button" className="btn-cancel-sm" onClick={addOption}>add</button>
                </div>
                <div className="fdp-opt-tags">{options.join(' · ')}</div>
              </div>
            )}
            <div className="fdp-btns">
              <button type="submit" className="btn-confirm-sm" disabled={createF.isPending}>Criar</button>
              <button type="button" className="btn-cancel-sm" onClick={() => setOpen(false)}>Cancelar</button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
