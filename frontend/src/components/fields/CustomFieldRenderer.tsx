/**
 * V2 — Renderiza valor de CustomField por field_type.
 * Leis: valores já conformados no backend ao salvar; UI só coleta e envia.
 */
import { useEffect, useState } from 'react'
import type { CustomField } from '../../types'

function unwrapStored(raw: unknown): unknown {
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && 'v' in (raw as object))
    return (raw as { v: unknown }).v
  return raw
}

interface Props {
  field: CustomField
  value: unknown
  onChange: (v: unknown) => void
  disabled?: boolean
}

export function CustomFieldRenderer({ field, value, onChange, disabled }: Props) {
  const inner = unwrapStored(value)
  const [local, setLocal] = useState(inner)

  useEffect(() => {
    setLocal(unwrapStored(value))
  }, [value, field.id])

  const ft = field.field_type

  if (ft === 'boolean') {
    const checked = Boolean(local)
    return (
      <label className="cf-bool">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={e => onChange(e.target.checked)}
        />
        <span>{field.label}{field.required ? ' *' : ''}</span>
      </label>
    )
  }

  if (ft === 'textarea') {
    return (
      <div className="cf-field">
        <label className="cf-label">{field.label}{field.required ? ' *' : ''}</label>
        <textarea
          className="cf-input"
          rows={3}
          disabled={disabled}
          value={local == null ? '' : String(local)}
          onChange={e => {
            setLocal(e.target.value)
            onChange(e.target.value)
          }}
        />
      </div>
    )
  }

  if (ft === 'number') {
    return (
      <div className="cf-field">
        <label className="cf-label">{field.label}{field.required ? ' *' : ''}</label>
        <input
          type="number"
          className="cf-input"
          disabled={disabled}
          value={local == null ? '' : Number(local)}
          onChange={e => {
            const n = e.target.value === '' ? null : Number(e.target.value)
            setLocal(n)
            onChange(n)
          }}
        />
      </div>
    )
  }

  if (ft === 'date') {
    const iso = local ? String(local).slice(0, 10) : ''
    return (
      <div className="cf-field">
        <label className="cf-label">{field.label}{field.required ? ' *' : ''}</label>
        <input
          type="date"
          className="cf-input"
          disabled={disabled}
          value={iso}
          onChange={e => onChange(e.target.value || null)}
        />
      </div>
    )
  }

  if (ft === 'select') {
    const opts = toArr(field.options)
    return (
      <div className="cf-field">
        <label className="cf-label">{field.label}{field.required ? ' *' : ''}</label>
        <select
          className="cf-input"
          disabled={disabled}
          value={local == null ? '' : String(local)}
          onChange={e => onChange(e.target.value)}
        >
          <option value="">—</option>
          {opts.map(o => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      </div>
    )
  }

  if (ft === 'multiselect') {
    const opts = toArr(field.options)
    const sel = Array.isArray(local) ? local.map(String) : []
    return (
      <div className="cf-field">
        <div className="cf-label">{field.label}{field.required ? ' *' : ''}</div>
        <div className="cf-checkboxes">
          {opts.map(o => (
            <label key={o} className="cf-bool">
              <input
                type="checkbox"
                disabled={disabled}
                checked={sel.includes(o)}
                onChange={e => {
                  const next = e.target.checked ? [...sel, o] : sel.filter(x => x !== o)
                  onChange(next)
                }}
              />
              <span>{o}</span>
            </label>
          ))}
        </div>
      </div>
    )
  }

  if (ft === 'currency' || ft === 'url' || ft === 'user' || ft === 'text') {
    return (
      <div className="cf-field">
        <label className="cf-label">{field.label}{field.required ? ' *' : ''}</label>
        <input
          type={ft === 'url' ? 'url' : 'text'}
          className="cf-input"
          disabled={disabled}
          value={local == null ? '' : String(local)}
          onChange={e => {
            setLocal(e.target.value)
            onChange(e.target.value)
          }}
        />
        {ft === 'url' && typeof local === 'string' && local.startsWith('http') ? (
          <a className="cf-link" href={local} target="_blank" rel="noopener noreferrer">abrir</a>
        ) : null}
      </div>
    )
  }

  return (
    <div className="cf-field">
      <label className="cf-label">{field.label}</label>
      <input
        className="cf-input"
        disabled={disabled}
        value={local == null ? '' : String(local)}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  )
}

function toArr(v: unknown): string[] {
  return Array.isArray(v) ? v.map(String) : []
}
