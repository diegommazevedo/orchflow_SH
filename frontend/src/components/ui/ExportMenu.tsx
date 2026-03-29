/**
 * ExportMenu — Dropdown de exportação reutilizável.
 *
 * Leis respeitadas:
 * - Exportação é somente leitura — zero escrita no banco
 * - Nenhum wizard necessário (dados já confirmados)
 * - CORS mantido (requests para /api/export/*)
 */
import { useState, useRef, useEffect } from 'react'
import { friendlyHttpStatus, getApiAuthHeaders } from '../../services/api'

interface Props {
  projectId: string
  projectName: string
}

interface ExportOption {
  id: string
  icon: string
  label: string
  url: (id: string) => string
  filename: (name: string) => string
  mime: string
}

const OPTIONS: ExportOption[] = [
  {
    id: 'backlog-xlsx',
    icon: '📊',
    label: 'Backlog → Excel',
    url: (id) => `/api/export/backlog/${id}?format=xlsx`,
    filename: (n) => `backlog_${n}.xlsx`,
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  },
  {
    id: 'backlog-pdf',
    icon: '📄',
    label: 'Backlog → PDF',
    url: (id) => `/api/export/backlog/${id}?format=pdf`,
    filename: (n) => `backlog_${n}.pdf`,
    mime: 'application/pdf',
  },
  {
    id: 'summary-pdf',
    icon: '📋',
    label: 'Resumo do projeto → PDF',
    url: (id) => `/api/export/project/${id}/summary?format=pdf`,
    filename: (n) => `summary_${n}.pdf`,
    mime: 'application/pdf',
  },
  {
    id: 'time-xlsx',
    icon: '⏱',
    label: 'Relatório de tempo → Excel',
    url: (id) => `/api/export/time/${id}?format=xlsx`,
    filename: (n) => `time_${n}.xlsx`,
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  },
]

function safeName(raw: string): string {
  return raw.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 30)
}

export function ExportMenu({ projectId, projectName }: Props) {
  const [open, setOpen]       = useState(false)
  const [loading, setLoading] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  // Fecha ao clicar fora
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  async function handleExport(opt: ExportOption) {
    if (loading) return
    setLoading(opt.id)
    setOpen(false)

    try {
      const res = await fetch(opt.url(projectId), { headers: getApiAuthHeaders() })
      if (!res.ok) {
        const msg = friendlyHttpStatus(res.status)
        window.dispatchEvent(new CustomEvent('orchflow:api-error', { detail: { message: msg } }))
        return
      }

      const blob = await res.blob()
      const objUrl = URL.createObjectURL(new Blob([blob], { type: opt.mime }))
      const anchor = document.createElement('a')
      anchor.href     = objUrl
      anchor.download = opt.filename(safeName(projectName))
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      setTimeout(() => URL.revokeObjectURL(objUrl), 1500)
    } catch {
      window.dispatchEvent(
        new CustomEvent('orchflow:api-error', {
          detail: { message: 'Não foi possível baixar o arquivo. Tente novamente.' },
        }),
      )
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="export-menu" ref={ref}>
      <button
        className={`export-trigger${loading ? ' export-loading' : ''}`}
        onClick={() => setOpen(o => !o)}
        disabled={!!loading}
        title="Exportar dados do projeto"
      >
        {loading ? (
          <span className="export-spinner" />
        ) : (
          <span className="export-trigger-arrow">↓</span>
        )}
        Exportar
      </button>

      {open && (
        <div className="export-dropdown">
          {OPTIONS.map(opt => (
            <button
              key={opt.id}
              className="export-option"
              onClick={() => handleExport(opt)}
            >
              <span className="export-opt-icon">{opt.icon}</span>
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
