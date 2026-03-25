/**
 * ImportPage — página de import/upload com SmartDropzone centralizado.
 *
 * Fluxo:
 *   SmartDropzone detecta e faz upload → resultado aciona wizard correto →
 *   usuário revisa → confirm → dados persistidos via API.
 *
 * Histórico dos últimos 5 imports armazenado em localStorage.
 *
 * Leis respeitadas:
 * - Wizards obrigatórios antes de qualquer confirm
 * - SmartDropzone não persiste nada durante detecção
 * - Todos os dados passam pelo ConformityEngine no backend antes de ir ao banco
 */
import { useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { SmartDropzone } from '../components/upload/SmartDropzone'
import { ContractWizard } from '../components/upload/ContractWizard'
import { SheetWizard } from '../components/upload/SheetWizard'
import { useProjects } from '../hooks/useData'
import { confirmContractImport } from '../services/api'
import { confirmSheetImport } from '../services/sheetApi'
import type { ContractParseResult, SheetParseResult, SheetMapping } from '../types'

// ── Histórico ─────────────────────────────────────────────────────────────────

interface HistoryItem {
  id: string
  type: 'contract_pdf' | 'sheet' | 'audio' | 'other'
  label: string
  date: string
  tasks_created?: number
  project_name?: string
}

const HISTORY_KEY = 'orchflow_import_history'
const HISTORY_MAX = 5

function loadHistory(): HistoryItem[] {
  try {
    const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') as unknown
    return Array.isArray(raw) ? (raw as HistoryItem[]) : []
  } catch {
    return []
  }
}

function pushHistory(item: Omit<HistoryItem, 'id'>) {
  const prev = loadHistory()
  const next: HistoryItem[] = [
    { ...item, id: crypto.randomUUID() },
    ...prev,
  ].slice(0, HISTORY_MAX)
  localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
}

const TYPE_ICONS: Record<HistoryItem['type'], string> = {
  contract_pdf: '📄',
  sheet:        '📊',
  audio:        '🎤',
  other:        '📁',
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  onBack: () => void
  onProjectCreated: (projectId: string) => void
}

// ── ImportPage ────────────────────────────────────────────────────────────────

export function ImportPage({ onBack, onProjectCreated }: Props) {
  const qc = useQueryClient()
  const { data: projectsRaw } = useProjects()
  const projects = projectsRaw ?? []

  const [contractData, setContractData] = useState<ContractParseResult | null>(null)
  const [sheetData, setSheetData] = useState<SheetParseResult | null>(null)
  const [contractLoading, setContractLoading] = useState(false)
  const [sheetLoading, setSheetLoading] = useState(false)
  const [contractError, setContractError] = useState<string | null>(null)
  const [sheetError, setSheetError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [history, setHistory] = useState<HistoryItem[]>(() => loadHistory())

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 4000)
  }

  function refreshHistory() {
    setHistory(loadHistory())
  }

  // ── ContractWizard confirm ────────────────────────────────────────────────
  async function handleContractConfirm(data: ContractParseResult) {
    setContractLoading(true)
    setContractError(null)
    try {
      const res = await confirmContractImport({ ...data, user_id: 'default' })
      showToast(`✓ Projeto "${data.project.name}" criado com ${res.tasks_created} tarefas.`)
      qc.invalidateQueries({ queryKey: ['tasks'] })
      qc.invalidateQueries({ queryKey: ['projects'] })
      pushHistory({
        type: 'contract_pdf',
        label: data.project.name,
        date: new Date().toISOString(),
        tasks_created: res.tasks_created,
        project_name: data.project.name,
      })
      refreshHistory()
      setContractData(null)
      setTimeout(() => onProjectCreated(res.project_id), 400)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro ao confirmar contrato.'
      setContractError(msg)
    } finally {
      setContractLoading(false)
    }
  }

  // ── SheetWizard confirm ───────────────────────────────────────────────────
  async function handleSheetConfirm(
    projectId: string,
    mapping: SheetMapping,
    defaults?: Record<string, string>
  ) {
    if (!sheetData) return
    setSheetLoading(true)
    setSheetError(null)
    try {
      const res = await confirmSheetImport({
        file_id: sheetData.file_id,
        project_id: projectId,
        mapping,
        defaults,
        user_id: 'default',
      })
      if (res.tasks_created === 0) {
        setSheetError('Nenhuma tarefa foi criada. Verifique o mapeamento e os valores padrão.')
      } else {
        const skippedMsg = res.tasks_skipped > 0 ? `, ${res.tasks_skipped} ignoradas` : ''
        showToast(`✓ ${res.tasks_created} tarefas criadas${skippedMsg}.`)
        qc.invalidateQueries({ queryKey: ['tasks'] })
        qc.invalidateQueries({ queryKey: ['projects'] })
        const proj = [...projects].find(p => p.id === projectId)
        pushHistory({
          type: 'sheet',
          label: sheetData.format.toUpperCase(),
          date: new Date().toISOString(),
          tasks_created: res.tasks_created,
          project_name: proj?.name,
        })
        refreshHistory()
        setSheetData(null)
        setTimeout(() => onProjectCreated(projectId), 400)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro ao importar planilha.'
      setSheetError(msg)
    } finally {
      setSheetLoading(false)
    }
  }

  // Fecha wizards ao pressionar Esc
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setContractData(null)
        setSheetData(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const wizardActive = !!contractData || !!sheetData

  return (
    <div className="import-page">
      {/* wizards */}
      {contractData && (
        <ContractWizard
          data={contractData}
          onConfirm={handleContractConfirm}
          onCancel={() => { setContractData(null); setContractError(null) }}
        />
      )}
      {sheetData && (
        <SheetWizard
          data={sheetData}
          projects={projects}
          loading={sheetLoading}
          error={sheetError}
          onConfirm={handleSheetConfirm}
          onCancel={() => { setSheetData(null); setSheetError(null) }}
        />
      )}

      {/* toast */}
      {toast && <div className="import-toast">{toast}</div>}

      <div className="import-page-head">
        <button type="button" className="import-back" onClick={onBack}>← voltar</button>
        <h1 className="import-title">Import / Upload</h1>
        <p className="import-sub">
          Arraste qualquer arquivo — o agente detecta e abre o wizard correto.
        </p>
      </div>

      {/* SmartDropzone */}
      {!wizardActive && (
        <div className="import-dropzone-wrap">
          <SmartDropzone
            onContractResult={data => setContractData(data)}
            onSheetResult={data => setSheetData(data)}
            onAudioTranscript={text => {
              showToast('🎤 Transcrição recebida — use o chat para processar.')
              pushHistory({ type: 'audio', label: 'Áudio transcrito', date: new Date().toISOString() })
              refreshHistory()
              navigator.clipboard?.writeText(text).catch(() => undefined)
            }}
          />
        </div>
      )}

      {contractError && !contractData && (
        <div className="import-err">{contractError}</div>
      )}

      {/* Histórico de imports */}
      {history.length > 0 && (
        <div className="import-history">
          <h3 className="import-history-title">Histórico recente</h3>
          <ul className="import-history-list">
            {history.map(h => (
              <li key={h.id} className="import-history-item">
                <span className="import-hist-icon">{TYPE_ICONS[h.type]}</span>
                <div className="import-hist-info">
                  <span className="import-hist-label">{h.label}</span>
                  {h.project_name && (
                    <span className="import-hist-proj"> → {h.project_name}</span>
                  )}
                  {h.tasks_created !== undefined && (
                    <span className="import-hist-count"> · {h.tasks_created} tasks</span>
                  )}
                </div>
                <span className="import-hist-date">
                  {new Date(h.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
