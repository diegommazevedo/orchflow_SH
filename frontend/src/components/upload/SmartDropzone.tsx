/**
 * SmartDropzone — área unificada de drag-and-drop inteligente.
 *
 * Fluxo:
 *   1. Arquivo recebido → POST /api/upload/detect (magic bytes, zero banco)
 *   2. Badge de detecção animado mostra o tipo
 *   3. Rota para o wizard correto e chama o callback com os dados parseados
 *
 * Leis respeitadas:
 * - SmartDropzone só detecta e roteia — ZERO banco durante detecção
 * - Wizards são obrigatórios antes de qualquer confirm
 * - Callbacks recebem dados parseados, não arquivos brutos
 */
import { useState, useRef, useCallback, DragEvent, ChangeEvent } from 'react'
import axios from 'axios'
import type { ContractParseResult, SheetParseResult } from '../../types'

// ── Tipos ─────────────────────────────────────────────────────────────────────

type FileType = 'contract_pdf' | 'sheet' | 'image' | 'audio' | 'document' | 'unknown'

interface DetectResult {
  file_type: FileType
  confidence: number
  suggested_action: string
  metadata: Record<string, unknown>
}

type Phase = 'idle' | 'detecting' | 'processing' | 'error'

interface Detection {
  type: FileType
  label: string
  icon: string
  hint: string
  confidence: number
}

interface Props {
  onContractResult: (data: ContractParseResult) => void
  onSheetResult:    (data: SheetParseResult) => void
  onAudioTranscript: (text: string) => void
  projectId?:       string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TYPE_INFO: Record<FileType, { icon: string; label: string }> = {
  contract_pdf: { icon: '📄', label: 'Contrato PDF' },
  sheet:        { icon: '📊', label: 'Planilha' },
  audio:        { icon: '🎤', label: 'Áudio' },
  image:        { icon: '🖼️', label: 'Imagem' },
  document:     { icon: '📝', label: 'Documento' },
  unknown:      { icon: '❓', label: 'Formato não reconhecido' },
}

function getHint(type: FileType, filename: string, metadata: Record<string, unknown>): string {
  const rows = metadata.total_rows ? ` · ${metadata.total_rows} linhas detectadas` : ''
  switch (type) {
    case 'contract_pdf': return 'extraindo projeto e backlog…'
    case 'sheet':        return `mapeando colunas${rows}…`
    case 'audio':        return 'transcrevendo…'
    case 'image':        return 'análise de imagem (em breve)'
    case 'document':     return 'documento detectado'
    default:             return filename
  }
}

// ── SmartDropzone ─────────────────────────────────────────────────────────────

export function SmartDropzone({ onContractResult, onSheetResult, onAudioTranscript, projectId }: Props) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [detection, setDetection] = useState<Detection | null>(null)
  const [errMsg, setErrMsg] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const processFile = useCallback(async (file: File) => {
    setPhase('detecting')
    setDetection(null)
    setErrMsg(null)

    try {
      // ── 1. Detectar tipo ─────────────────────────────────────────────────
      const fd1 = new FormData()
      fd1.append('file', file)
      const { data: detect } = await axios.post<DetectResult>('/api/upload/detect', fd1)

      const info = TYPE_INFO[detect.file_type] ?? TYPE_INFO.unknown
      setDetection({
        type: detect.file_type,
        label: info.label,
        icon: info.icon,
        hint: getHint(detect.file_type, file.name, detect.metadata),
        confidence: detect.confidence,
      })

      setPhase('processing')

      // ── 2. Rotear para o processamento correto ────────────────────────────
      const fd2 = new FormData()

      switch (detect.file_type) {
        case 'contract_pdf': {
          fd2.append('file', file)
          const { data } = await axios.post<ContractParseResult>('/api/upload/contract', fd2)
          onContractResult(data)
          break
        }
        case 'sheet': {
          fd2.append('file', file)
          const { data } = await axios.post<SheetParseResult>('/api/upload/sheet', fd2)
          onSheetResult(data)
          break
        }
        case 'audio': {
          fd2.append('audio', file)
          const { data } = await axios.post<{ text: string }>('/api/voice/transcribe', fd2)
          onAudioTranscript(data.text)
          break
        }
        case 'image': {
          setErrMsg('🖼️ Importação de imagens disponível em breve.')
          setPhase('error')
          return
        }
        case 'document': {
          setErrMsg('📝 Importação de documentos Word disponível em breve.')
          setPhase('error')
          return
        }
        default: {
          setErrMsg(`❓ Formato não reconhecido: ${file.name}`)
          setPhase('error')
          return
        }
      }

      setPhase('idle')
      setDetection(null)
    } catch (e) {
      const msg = axios.isAxiosError(e)
        ? (e.response?.data?.detail ?? e.message)
        : 'Falha ao processar arquivo.'
      setErrMsg(String(msg))
      setPhase('error')
    }
  }, [onContractResult, onSheetResult, onAudioTranscript])

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) void processFile(file)
  }

  function onFileInput(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) void processFile(file)
  }

  const busy = phase === 'detecting' || phase === 'processing'

  return (
    <div
      className={`smart-dropzone${dragOver ? ' sd-dragover' : ''}${busy ? ' sd-busy' : ''}`}
      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      onClick={() => !busy && fileInputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && !busy && fileInputRef.current?.click()}
      aria-label="Área de upload de arquivos"
    >
      <input
        ref={fileInputRef}
        type="file"
        style={{ display: 'none' }}
        accept=".pdf,.xlsx,.xls,.csv,.docx,.jpg,.jpeg,.png,.mp3,.wav,.webm,.m4a"
        onChange={onFileInput}
      />

      {/* Borda SVG animada */}
      <svg aria-hidden="true" className="sd-border-svg">
        <rect
          width="100%" height="100%" rx="12" ry="12"
          strokeWidth="1.5" fill="none"
          className="sd-border-rect"
        />
      </svg>

      {/* Ícone central */}
      {!detection && phase === 'idle' && (
        <div className="sd-idle">
          <div className="sd-icon-wrap">
            <span className="sd-icon">⬆</span>
          </div>
          <div className="sd-main-text">Arraste qualquer arquivo</div>
          <div className="sd-sub-text">PDF · Planilha · Imagem · Áudio · Documento</div>
          <div className="sd-ext-list">.pdf .xlsx .csv .docx .jpg .png .mp3 .wav</div>
        </div>
      )}

      {/* Badge de detecção */}
      {detection && (
        <div className="sd-detection-badge">
          <span className="sd-det-icon">{detection.icon}</span>
          <div className="sd-det-info">
            <div className="sd-det-label">{detection.label}</div>
            <div className="sd-det-hint">{detection.hint}</div>
          </div>
          {phase === 'detecting' && (
            <span className="sd-spinner" aria-label="detectando" />
          )}
          {phase === 'processing' && (
            <span className="sd-spinner sd-spinner-processing" aria-label="processando" />
          )}
        </div>
      )}

      {/* Estado de detecção sem badge ainda */}
      {phase === 'detecting' && !detection && (
        <div className="sd-idle">
          <span className="sd-spinner sd-spinner-lg" />
          <div className="sd-main-text">Identificando arquivo…</div>
        </div>
      )}

      {/* Erro */}
      {phase === 'error' && (
        <div className="sd-error-state">
          <div className="sd-err-msg">{errMsg}</div>
          <button
            className="sd-retry-btn"
            onClick={e => { e.stopPropagation(); setPhase('idle'); setErrMsg(null); setDetection(null) }}
          >
            Tentar novamente
          </button>
        </div>
      )}
    </div>
  )
}
