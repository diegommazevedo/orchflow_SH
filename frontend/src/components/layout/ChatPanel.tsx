import { useState, useRef, useEffect } from 'react'
import axios from 'axios'
import { useQueryClient } from '@tanstack/react-query'
import { useVoiceInput } from '../../hooks/useVoiceInput'
import { SmartDropzone } from '../upload/SmartDropzone'
import { ContractWizard } from '../upload/ContractWizard'
import { SheetWizard } from '../upload/SheetWizard'
import { confirmContractImport } from '../../services/api'
import { confirmSheetImport } from '../../services/sheetApi'
import type { ContractParseResult, SheetParseResult, SheetMapping } from '../../types'
import { useProjects } from '../../hooks/useData'

// ── Tipos ──────────────────────────────────────────────────
interface IntentParams {
  title?: string
  description?: string
  quadrant?: string
  status?: string
  task_name_hint?: string
  due_date?: string
  assignee_hint?: string
}

interface Intent {
  action: string
  confidence: number
  params: IntentParams
  missing_fields: string[]
  human_summary: string
  inference_notes: string
  raw_message: string
  normalized_message: string
  wizard_mode: 'silent' | 'compact' | 'full' | 'block'
  conformed_title?: string
  conformed_due_date?: { iso: string; display: string; gap: string; overdue: boolean } | null
  from_memory?: boolean
}

type WizardState = 'pending' | 'confirmed' | 'cancelled' | 'executing'

interface Msg {
  role: 'user' | 'agent'
  text?: string
  intent?: Intent
  wizardState?: WizardState
  isVoice?: boolean
  createdAt?: number
}

// ── Constantes ─────────────────────────────────────────────
const ACTION_LABELS: Record<string, string> = {
  create_task: '+ tarefa', update_task_status: '→ mover',
  delete_task: '× remover', list_tasks: '≡ listar',
  create_project: '+ projeto', list_projects: '≡ projetos',
  unknown: '? desconhecido',
}

const STATUS_OPTIONS = [
  { value: 'backlog', label: 'Backlog' },
  { value: 'in_progress', label: 'Em andamento' },
  { value: 'done', label: 'Concluído' },
]

const QUADRANT_OPTIONS = [
  { value: 'q1', label: 'Q1 — Urgente + Importante' },
  { value: 'q2', label: 'Q2 — Importante' },
  { value: 'q3', label: 'Q3 — Urgente' },
  { value: 'q4', label: 'Q4 — Descarta' },
]

const confColor = (c: number) => c >= 0.85 ? '#5eead4' : c >= 0.6 ? '#f59e0b' : '#f43f5e'

// ── Campo editável inline ──────────────────────────────────
function Field({ label, value, sub, onChange, type = 'text', options }: {
  label: string; value: string; sub?: string
  onChange: (v: string) => void
  type?: 'text' | 'select'
  options?: { value: string; label: string }[]
}) {
  const [editing, setEditing] = useState(false)
  return (
    <div className="wp-field" onClick={() => type === 'text' && setEditing(true)}>
      <span className="wp-key">{label}</span>
      <div className="wp-val-wrap">
        {type === 'select' && options ? (
          <select className="wp-select" value={value} onChange={e => onChange(e.target.value)}>
            {(options ?? []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ) : editing ? (
          <input autoFocus className="wp-input" value={value}
                 onChange={e => onChange(e.target.value)}
                 onBlur={() => setEditing(false)}
                 onKeyDown={e => e.key === 'Enter' && setEditing(false)} />
        ) : (
          <span className="wp-val">{value || <em style={{ color: 'var(--muted)' }}>—</em>}</span>
        )}
        {sub && <span className="wp-sub">{sub}</span>}
      </div>
    </div>
  )
}

// ── Wizard Card ────────────────────────────────────────────
function WizardCard({ intent: init, state, onConfirm, onCancel }: {
  intent: Intent; state: WizardState
  onConfirm: (i: Intent) => void; onCancel: () => void
}) {
  const [intent, setIntent] = useState(init)
  const done = state === 'confirmed' || state === 'cancelled'
  const mode = intent.wizard_mode
  const isDestructive = intent.action.includes('delete')

  function up(key: keyof IntentParams, v: string) {
    setIntent(p => ({ ...p, params: { ...p.params, [key]: v } }))
  }

  const displayTitle = intent.conformed_title || intent.params.title || ''
  const dueDate      = intent.conformed_due_date

  return (
    <div className={`wizard-card wm-${mode} ws-${state}`}>
      <div className="wp-header">
        <span className="wp-action">{ACTION_LABELS[intent.action] ?? intent.action}</span>
        {intent.from_memory && <span className="wp-memory-badge">⚡ memória</span>}
        <span className="wp-confidence" style={{ color: confColor(intent.confidence) }}>
          {Math.round(intent.confidence * 100)}%
        </span>
        {state === 'confirmed' && <span className="wp-badge wp-done">✓ feito</span>}
        {state === 'cancelled' && <span className="wp-badge wp-cancelled">✗ cancelado</span>}
        {state === 'executing' && <span className="wp-badge wp-executing">⏳</span>}
      </div>

      <div className="wp-summary">{intent.human_summary}</div>

      {intent.inference_notes && !done && (
        <div className="wp-inference">⟳ {intent.inference_notes}</div>
      )}

      {(mode === 'full' || mode === 'block') && !done && (
        <div className="wp-fields">
          {displayTitle && (
            <Field label="título" value={displayTitle}
                   onChange={v => setIntent(p => ({ ...p, conformed_title: v, params: { ...p.params, title: v } }))} />
          )}
          {intent.params.assignee_hint && (
            <Field label="responsável" value={intent.params.assignee_hint}
                   onChange={v => up('assignee_hint', v)} />
          )}
          {intent.params.task_name_hint && !displayTitle && (
            <Field label="tarefa" value={intent.params.task_name_hint}
                   onChange={v => up('task_name_hint', v)} />
          )}
          {intent.params.status !== undefined && (
            <Field label="status" value={intent.params.status || 'backlog'}
                   onChange={v => up('status', v)} type="select" options={STATUS_OPTIONS} />
          )}
          {intent.params.quadrant !== undefined && (
            <Field label="quadrante" value={intent.params.quadrant || 'q2'}
                   onChange={v => up('quadrant', v)} type="select" options={QUADRANT_OPTIONS} />
          )}
          {dueDate && (
            <Field label="prazo" value={dueDate.display}
                   sub={dueDate.overdue ? `⚠ ${dueDate.gap}` : dueDate.gap}
                   onChange={v => up('due_date', v)} />
          )}
          {(intent.missing_fields ?? []).length > 0 && (
            <div className="wp-missing">⚠ faltando: {(intent.missing_fields ?? []).join(', ')}</div>
          )}
        </div>
      )}

      {mode === 'compact' && !done && (
        <div className="wp-compact-val">
          {displayTitle || intent.params.task_name_hint || intent.human_summary}
          {dueDate && <span className="wp-sub" style={{ marginLeft: 8 }}>{dueDate.gap}</span>}
          {intent.params.assignee_hint && (
            <span className="wp-assignee-pill">@{intent.params.assignee_hint}</span>
          )}
        </div>
      )}

      {!done && mode !== 'block' && intent.action !== 'unknown' && (
        <div className="wp-btns">
          <button className={`wp-confirm${isDestructive ? ' wp-confirm-danger' : ''}`}
                  onClick={() => onConfirm(intent)}>
            {mode === 'compact' ? '✓' : '✓ Confirmar'}
          </button>
          <button className="wp-cancel" onClick={onCancel}>
            {mode === 'compact' ? '✗' : '✗ Cancelar'}
          </button>
        </div>
      )}
      {mode === 'block' && !done && (
        <div className="wp-block-msg">⛔ Operação crítica — requer aprovação do admin.</div>
      )}
      {intent.action === 'unknown' && !done && (
        <div className="wp-unknown">Não entendi. Tente reformular.</div>
      )}
    </div>
  )
}

// ── Toast ──────────────────────────────────────────────────
function ToastContainer({ toasts }: { toasts: string[] }) {
  return (
    <div className="toast-container">
      {toasts.map((t, i) => <div key={i} className="toast-silent">{t}</div>)}
    </div>
  )
}

// ── Botão de voz ───────────────────────────────────────────
function VoiceButton({ onTranscript, disabled }: {
  onTranscript: (text: string) => void
  disabled: boolean
}) {
  const { state, transcript, error, startRecording, stopRecording, reset, isSupported } = useVoiceInput()

  useEffect(() => {
    if (state === 'done' && transcript) {
      onTranscript(transcript)
      reset()
    }
  }, [state, transcript, onTranscript, reset])

  useEffect(() => {
    if (error) {
      console.warn('[voice]', error)
    }
  }, [error])

  if (!isSupported) return null

  const isRecording     = state === 'recording'
  const isTranscribing  = state === 'transcribing'

  return (
    <button
      type="button"
      className={`voice-btn${isRecording ? ' voice-recording' : ''}${isTranscribing ? ' voice-transcribing' : ''}`}
      onClick={isRecording ? stopRecording : startRecording}
      disabled={disabled || isTranscribing}
      title={isRecording ? 'Parar gravação' : 'Gravar voz'}
    >
      {isTranscribing ? '…' : isRecording ? '⏹' : '🎤'}
    </button>
  )
}

// ── ChatPanel principal ────────────────────────────────────
export function ChatPanel({
  projectId,
  onProjectCreated,
}: {
  projectId: string | null
  onProjectCreated?: (projectId: string) => void
}) {
  const [messages, setMessages] = useState<Msg[]>([{
    role: 'agent',
    text: 'Pronto. Texto ou voz — manda o comando.\n\n"mete task urgente pro zé revisar o schema hj"\n"joga o schema pra wip"\n"lista as task"',
  }])
  const [input, setInput]   = useState('')
  const [loading, setLoading] = useState(false)
  const [toasts, setToasts]   = useState<string[]>([])
  const [showDropzone, setShowDropzone] = useState(false)
  const [contractData, setContractData] = useState<ContractParseResult | null>(null)
  const [sheetData, setSheetData]       = useState<SheetParseResult | null>(null)
  const [contractLoading, setContractLoading] = useState(false)
  const [sheetLoading, setSheetLoading] = useState(false)
  const [sheetError, setSheetError]     = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const qc = useQueryClient()
  const { data: projects = [] } = useProjects()

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Fechar modal SmartDropzone com Esc
  useEffect(() => {
    if (!showDropzone) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setShowDropzone(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showDropzone])

  function addMsg(msg: Msg) {
    setMessages(p => [...p, { ...msg, createdAt: Date.now() }])
  }

  function formatTime(ts?: number): string {
    if (!ts) return ''
    const d = new Date(ts)
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  }

  function formatDateSep(ts?: number): string {
    if (!ts) return ''
    const d = new Date(ts)
    return d.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })
  }

  function isSameDay(a?: number, b?: number): boolean {
    if (!a || !b) return true
    return new Date(a).toDateString() === new Date(b).toDateString()
  }

  function showToast(text: string) {
    setToasts(p => [...p, text])
    setTimeout(() => setToasts(p => p.slice(1)), 3000)
  }

  function setWizState(idx: number, s: WizardState) {
    setMessages(p => p.map((m, i) => i === idx ? { ...m, wizardState: s } : m))
  }

  async function sendMessage(text: string, isVoice = false) {
    if (!text.trim() || loading) return

    if (!projectId) {
      addMsg({ role: 'agent', text: 'Seleciona um projeto primeiro.' })
      return
    }

    setInput('')
    addMsg({ role: 'user', text, isVoice })
    setLoading(true)

    try {
      const { data } = await axios.post<Intent>('/api/agent/interpret', {
        message: text, project_id: projectId, user_id: 'default',
      })

      if (data.wizard_mode === 'silent' && projectId) {
        const { data: result } = await axios.post('/api/agent/execute', {
          intent: data, project_id: projectId, user_id: 'default',
        })
        showToast(result.message)
        qc.invalidateQueries({ queryKey: ['tasks'] })
        qc.invalidateQueries({ queryKey: ['projects'] })
      } else {
        addMsg({ role: 'agent', intent: data, wizardState: 'pending' })
      }
    } catch {
      addMsg({ role: 'agent', text: '⚠ Erro ao conectar com o agente.' })
    } finally {
      setLoading(false)
    }
  }

  function handleVoiceTranscript(text: string) {
    setInput(text)
    void sendMessage(text, true)
  }

  function handleAudioTranscript(text: string) {
    showToast('🎤 Transcrição recebida — enviando para o agente…')
    setShowDropzone(false)
    setInput(text)
    void sendMessage(text, true)
  }

  async function handleContractConfirm(data: ContractParseResult) {
    setContractLoading(true)
    try {
      const res = await confirmContractImport({ ...data, user_id: 'default' })
      showToast(res.message)
      qc.invalidateQueries({ queryKey: ['tasks'] })
      qc.invalidateQueries({ queryKey: ['projects'] })
      onProjectCreated?.(res.project_id)
      setContractData(null)
    } catch {
      showToast('⚠ Erro ao confirmar contrato.')
    } finally {
      setContractLoading(false)
    }
  }

  async function handleSheetConfirm(pid: string, mapping: SheetMapping, defaults?: Record<string, string>): Promise<void> {
    if (!sheetData) return
    setSheetLoading(true)
    setSheetError(null)
    try {
      const res = await confirmSheetImport({
        file_id: sheetData.file_id,
        project_id: pid,
        mapping,
        defaults,
        user_id: 'default',
      })
      showToast(res.message)
      qc.invalidateQueries({ queryKey: ['tasks'] })
      qc.invalidateQueries({ queryKey: ['projects'] })
      setSheetData(null)
    } catch {
      setSheetError('Erro ao importar planilha.')
    } finally {
      setSheetLoading(false)
    }
  }

  async function handleConfirm(idx: number, intent: Intent) {
    if (!projectId) return
    setWizState(idx, 'executing')
    try {
      const { data } = await axios.post('/api/agent/execute', {
        intent, project_id: projectId, user_id: 'default',
      })
      setWizState(idx, 'confirmed')
      addMsg({ role: 'agent', text: data.message })
      qc.invalidateQueries({ queryKey: ['tasks'] })
      qc.invalidateQueries({ queryKey: ['projects'] })
    } catch {
      setWizState(idx, 'pending')
      addMsg({ role: 'agent', text: '⚠ Erro ao executar.' })
    }
  }

  return (
    <div className="chat-panel">
      {/* Modal SmartDropzone */}
      {showDropzone && (
        <div className="sd-modal-overlay" onClick={e => e.target === e.currentTarget && setShowDropzone(false)}>
          <div className="sd-modal-inner">
            <button
              className="sd-modal-close"
              onClick={() => setShowDropzone(false)}
              aria-label="Fechar"
            >×</button>
            <SmartDropzone
              onContractResult={data => { setContractData(data); setShowDropzone(false) }}
              onSheetResult={data => { setSheetData(data); setShowDropzone(false) }}
              onAudioTranscript={text => { handleAudioTranscript(text); setShowDropzone(false) }}
              projectId={projectId ?? undefined}
            />
          </div>
        </div>
      )}

      {/* Wizards */}
      {contractData && (
        <ContractWizard
          data={contractData}
          onConfirm={handleContractConfirm}
          onCancel={() => setContractData(null)}
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
      <ToastContainer toasts={toasts} />

      <div className="chat-header">
        <span style={{ fontSize: 16 }}>⬡</span>
        <div className="chat-title">Agente OrchFlow</div>
        <div className="chat-status">
          <div className={`status-dot${loading ? ' status-thinking' : ''}`} />
          {loading ? 'interpretando...' : 'online'}
        </div>
      </div>

      <div className="chat-messages">
        {messages.map((m, i) => {
          const prevMsg = messages[i - 1]
          const showDateSep = m.createdAt && !isSameDay(prevMsg?.createdAt, m.createdAt)
          return (
            <div key={i}>
              {showDateSep && (
                <div className="chat-date-sep">{formatDateSep(m.createdAt)}</div>
              )}
              <div className={`msg msg-${m.role}`}>
                <div className="msg-sender">
                  {m.role === 'user'
                    ? <>você {m.isVoice && <span className="voice-tag">🎤</span>} //</>
                    : '// agente'}
                </div>
                {m.text && <div className="msg-bubble" style={{ whiteSpace: 'pre-line' }}>{m.text}</div>}
                {m.intent && (
                  <WizardCard intent={m.intent} state={m.wizardState ?? 'pending'}
                              onConfirm={i2 => handleConfirm(i, i2)}
                              onCancel={() => setWizState(i, 'cancelled')} />
                )}
                {m.createdAt && (
                  <span className="msg-timestamp">{formatTime(m.createdAt)}</span>
                )}
              </div>
            </div>
          )
        })}

        {/* Typing dots enquanto agente interpreta */}
        {loading && (
          <div className="msg msg-agent">
            <div className="msg-sender">// agente</div>
            <div className="typing-dots">
              <div className="typing-dot" />
              <div className="typing-dot" />
              <div className="typing-dot" />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="chat-input-area">
        <div className="chat-input-wrap">
          <button
            type="button"
            className="attach-btn"
            onClick={() => setShowDropzone(true)}
            disabled={loading || contractLoading || sheetLoading}
            title="Anexar arquivo (PDF, planilha, áudio, imagem…)"
          >
            📎
          </button>
          <VoiceButton onTranscript={handleVoiceTranscript} disabled={loading} />
          <textarea
            className="chat-input"
            placeholder={projectId ? 'texto ou 🎤 voz...' : 'seleciona um projeto...'}
            rows={1} value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                sendMessage(input)
              }
            }}
            disabled={loading}
          />
          <button type="button" className="send-btn" onClick={() => sendMessage(input)} disabled={loading}>
            {loading ? '…' : '↑'}
          </button>
        </div>
        {/* Contador de chars quando > 200 */}
        {input.length > 200 && (
          <div className={`chat-char-count${input.length > 400 ? ' chat-char-danger' : input.length > 300 ? ' chat-char-warn' : ''}`}>
            {input.length} chars
          </div>
        )}
        <div className="chat-hint">enter envia · 🎤 clica e fala · shift+enter nova linha</div>
      </div>
    </div>
  )
}
