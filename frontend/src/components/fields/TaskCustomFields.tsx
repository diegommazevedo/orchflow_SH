/**
 * Frente 2 — valores de custom fields na task; upsert em onBlur (sem submit dedicado).
 * Lei: backend conforma com conform_custom_field_value; UI mostra conformed_value após refetch.
 */
import { useEffect, useMemo, useState } from 'react'
import type { CustomField } from '../../types'
import { useFieldDefinitions, useTaskFieldValues, useUpsertTaskFieldValue } from '../../hooks/useV2'
import { CustomFieldRenderer } from './CustomFieldRenderer'

interface Props {
  taskId: string
  projectId: string
  disabled?: boolean
}

export function TaskCustomFields({ taskId, projectId, disabled }: Props) {
  const { data: fields = [] } = useFieldDefinitions(projectId)
  const { data: tvals = [] } = useTaskFieldValues(taskId)
  const upsert = useUpsertTaskFieldValue()

  const taskFields = useMemo(
    () =>
      fields.filter(
        f =>
          f.entity_type === 'task' &&
          (f.project_id === projectId || f.project_id == null),
      ),
    [fields, projectId],
  )

  const [draft, setDraft] = useState<Record<string, unknown>>({})
  const [checks, setChecks] = useState<Record<string, boolean>>({})

  useEffect(() => {
    const m: Record<string, unknown> = {}
    for (const row of tvals) {
      m[row.field_id] = row.conformed_value
    }
    for (const f of taskFields) {
      if (!Object.prototype.hasOwnProperty.call(m, f.id)) m[f.id] = undefined
    }
    setDraft(m)
  }, [taskId, tvals, taskFields])

  function commitField(fieldId: string, val: unknown) {
    upsert.mutate(
      { taskId, field_id: fieldId, raw_value: val },
      {
        onSuccess: () => {
          setChecks(c => ({ ...c, [fieldId]: true }))
          window.setTimeout(() => setChecks(c => ({ ...c, [fieldId]: false })), 2000)
        },
      },
    )
  }

  function emptyRequired(f: CustomField, val: unknown): boolean {
    if (!f.required) return false
    if (val == null || val === '') return true
    if (Array.isArray(val) && val.length === 0) return true
    return false
  }

  if (taskFields.length === 0) return null

  return (
    <div className="tcf-root">
      <div className="tdp-field-label" style={{ marginBottom: 8 }}>Campos do projeto</div>
      {taskFields.map(f => (
        <div
          key={f.id}
          className={`tcf-wrap${emptyRequired(f, draft[f.id]) ? ' tcf-required' : ''}`}
          onBlur={e => {
            if (disabled) return
            const rt = e.relatedTarget as Node | null
            if (rt && e.currentTarget.contains(rt)) return
            commitField(f.id, draft[f.id])
          }}
        >
          <div className="tcf-field-rel">
            <CustomFieldRenderer
              field={f}
              value={draft[f.id]}
              onChange={v => setDraft(d => ({ ...d, [f.id]: v }))}
              disabled={disabled || upsert.isPending}
            />
            {checks[f.id] ? (
              <span className="conform-check" style={{ position: 'absolute', right: 4, top: 24 }} aria-hidden>✓</span>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  )
}
