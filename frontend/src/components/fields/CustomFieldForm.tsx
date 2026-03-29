/**
 * V2 — Criar campo customizado (modal / painel).
 * Leis: name/label conformados no backend; preview local simples.
 */
import { useState } from 'react'
import type { FieldTypeV2 } from '../../types'
import { useCreateCustomField } from '../../hooks/useV2'

const TYPES: { id: FieldTypeV2; label: string }[] = [
  { id: 'text', label: 'Texto' },
  { id: 'textarea', label: 'Texto longo' },
  { id: 'number', label: 'Número' },
  { id: 'date', label: 'Data' },
  { id: 'select', label: 'Lista' },
  { id: 'multiselect', label: 'Múltipla escolha' },
  { id: 'boolean', label: 'Sim/Não' },
  { id: 'currency', label: 'Moeda' },
  { id: 'url', label: 'URL' },
  { id: 'user', label: 'Pessoa' },
]

interface Props {
  projectId: string
  onClose: () => void
  onCreated?: () => void
}

export function CustomFieldForm({ projectId, onClose, onCreated }: Props) {
  const createF = useCreateCustomField()
  const [name, setName]       = useState('')
  const [label, setLabel]     = useState('')
  const [fieldType, setFieldType] = useState<FieldTypeV2>('text')
  const [required, setRequired] = useState(false)
  const [optInput, setOptInput] = useState('')
  const [options, setOptions]   = useState<string[]>([])

  function addOption() {
    const t = optInput.trim()
    if (!t) return
    setOptions(o => [...o, t])
    setOptInput('')
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !label.trim()) return
    createF.mutate(
      {
        project_id: projectId,
        entity_type: 'task',
        name: name.trim(),
        label: label.trim(),
        field_type: fieldType,
        required,
        options: fieldType === 'select' || fieldType === 'multiselect' ? options : [],
        order: 0,
      },
      { onSuccess: () => { onCreated?.(); onClose() } },
    )
  }

  return (
    <form className="cfform" onSubmit={submit}>
      <h3 className="cfform-title">Novo campo customizado</h3>
      <div className="cfform-row">
        <label>Nome interno</label>
        <input className="cf-input" value={name} onChange={e => setName(e.target.value)} placeholder="ex: cliente" />
      </div>
      <div className="cfform-row">
        <label>Label</label>
        <input className="cf-input" value={label} onChange={e => setLabel(e.target.value)} placeholder="exibido na UI" />
      </div>
      <div className="cfform-row">
        <label>Tipo</label>
        <select className="cf-input" value={fieldType} onChange={e => setFieldType(e.target.value as FieldTypeV2)}>
          {TYPES.map(t => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
      </div>
      {(fieldType === 'select' || fieldType === 'multiselect') && (
        <div className="cfform-row">
          <label>Opções</label>
          <div className="cfform-opts">
            <input
              className="cf-input"
              value={optInput}
              onChange={e => setOptInput(e.target.value)}
              placeholder="valor"
            />
            <button type="button" className="btn-confirm-sm" onClick={addOption}>+</button>
          </div>
          <ul className="cfform-optlist">
            {options.map(o => (
              <li key={o}>{o} <button type="button" className="btn-cancel-sm" onClick={() => setOptions(x => x.filter(y => y !== o))}>×</button></li>
            ))}
          </ul>
        </div>
      )}
      <label className="cf-bool">
        <input type="checkbox" checked={required} onChange={e => setRequired(e.target.checked)} />
        <span>Obrigatório</span>
      </label>
      <div className="cfform-preview">
        <span className="cfform-preview-label">Preview</span>
        <div className="cfform-preview-box">{label || '—'} ({fieldType})</div>
      </div>
      <div className="cfform-actions">
        <button type="button" className="btn-cancel-sm" onClick={onClose}>Cancelar</button>
        <button type="submit" className="btn-confirm-sm" disabled={createF.isPending}>Criar</button>
      </div>
    </form>
  )
}
