/**
 * TaskComments — seção de comentários dentro do TaskDetailPanel.
 *
 * Funcionalidades:
 * - Lista de comentários com avatar (iniciais), body, timestamp relativo
 * - Menções @nome destacadas em cor accent
 * - Input de novo comentário (Ctrl+Enter envia)
 * - Ao digitar @ → dropdown com sugestões de nomes (lista estática extraída dos cards)
 * - Soft-delete via × no hover do próprio comentário
 *
 * Leis respeitadas:
 * - body enviado ao backend que aplica ConformityEngine (conform_description)
 * - Zero wizard para comentários (risco LOW, reversível)
 * - ActivityLog gerado pelo backend ao salvar comentário
 * - Menções extraídas no backend também (regex @\w+)
 */
import { useState, useRef, useCallback } from 'react'
import { useComments, relativeTime } from '../../hooks/useComments'
import type { Comment } from '../../types'
import { toArr } from '../../utils/array'

// Nomes extraídos dinamicamente das iniciais dos cards (lista estática por ora)
const DEFAULT_MENTION_HINTS = ['zé', 'maria', 'ana', 'pedro', 'lucas', 'default']

interface Props {
  taskId: string
}

// ── Highlight de menções no texto ─────────────────────────────────────────────
function BodyWithMentions({ body }: { body: string }) {
  const parts = body.split(/(@\w+)/g)
  return (
    <span>
      {parts.map((part, i) =>
        part.startsWith('@') ? (
          <span key={i} className="tc-mention">{part}</span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </span>
  )
}

// ── Card individual de comentário ─────────────────────────────────────────────
function CommentCard({
  comment,
  onDelete,
}: {
  comment: Comment
  onDelete: (id: string) => void
}) {
  const [hovered, setHovered] = useState(false)
  const initials = comment.user_id === 'default'
    ? 'VC'
    : comment.user_id.slice(0, 2).toUpperCase()

  return (
    <div
      className="tc-comment"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="tc-avatar" aria-hidden>{initials}</div>
      <div className="tc-content">
        <div className="tc-meta">
          <span className="tc-author">{comment.user_id === 'default' ? 'Você' : comment.user_id}</span>
          <span className="tc-time">{relativeTime(comment.created_at)}</span>
          {hovered && (
            <button
              className="tc-delete-btn"
              onClick={() => onDelete(comment.id)}
              title="Remover comentário"
              aria-label="Remover comentário"
            >
              ×
            </button>
          )}
        </div>
        <div className="tc-body">
          <BodyWithMentions body={comment.body} />
        </div>
      </div>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────
export function TaskComments({ taskId }: Props) {
  const { comments: commentsRaw, isLoading, addComment, deleteComment, isSending } = useComments(taskId)
  const comments = toArr<Comment>(commentsRaw)

  const [draft, setDraft]           = useState('')
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionStart, setMentionStart] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Detecta @ e controla o dropdown de menções
  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setDraft(val)

    const cursor = e.target.selectionStart
    // busca @ mais próximo antes do cursor
    const beforeCursor = val.slice(0, cursor)
    const atMatch = beforeCursor.match(/@(\w*)$/)
    if (atMatch) {
      setMentionQuery(atMatch[1].toLowerCase())
      setMentionStart(cursor - atMatch[0].length)
    } else {
      setMentionQuery(null)
    }
  }, [])

  // Aplica menção selecionada no dropdown
  function applyMention(name: string) {
    const before = draft.slice(0, mentionStart)
    const after  = draft.slice(textareaRef.current?.selectionStart ?? mentionStart + 1 + (mentionQuery?.length ?? 0))
    setDraft(`${before}@${name} ${after}`)
    setMentionQuery(null)
    textareaRef.current?.focus()
  }

  // Extrai menções do draft para enviar ao backend (já extrai lá também, mas por precaução)
  function extractMentions(text: string): string[] {
    return [...new Set([...text.matchAll(/@(\w+)/g)].map(m => m[1]))]
  }

  async function handleSubmit() {
    const trimmed = draft.trim()
    if (!trimmed || isSending) return
    await addComment(trimmed, extractMentions(trimmed))
    setDraft('')
    setMentionQuery(null)
  }

  const mentionSuggestions = mentionQuery !== null
    ? DEFAULT_MENTION_HINTS.filter(n => n.includes(mentionQuery) && n !== mentionQuery)
    : []

  return (
    <div className="tc-wrapper">
      <div className="tc-header">
        💬 Comentários
        {comments.length > 0 && <span className="tc-count">{comments.length}</span>}
      </div>

      {/* Lista de comentários */}
      <div className="tc-list">
        {isLoading ? (
          <div className="tc-loading">
            <div className="skeleton skeleton-line skeleton-line-w1" style={{ height: 10, marginBottom: 6 }} />
            <div className="skeleton skeleton-line skeleton-line-w2" style={{ height: 10 }} />
          </div>
        ) : comments.length === 0 ? (
          <div className="tc-empty">Ainda sem comentários. Seja o primeiro.</div>
        ) : (
          comments.map(c => (
            <CommentCard key={c.id} comment={c} onDelete={deleteComment} />
          ))
        )}
      </div>

      {/* Input de novo comentário */}
      <div className="tc-input-wrap">
        <div className="tc-input-inner">
          <textarea
            ref={textareaRef}
            className="tc-input"
            placeholder="Adicionar comentário… use @ para mencionar"
            rows={2}
            value={draft}
            onChange={handleChange}
            onKeyDown={e => {
              if (e.key === 'Enter' && e.ctrlKey) {
                e.preventDefault()
                void handleSubmit()
              }
              if (e.key === 'Escape') {
                setMentionQuery(null)
              }
            }}
            disabled={isSending}
          />

          {/* Dropdown de menções */}
          {mentionSuggestions.length > 0 && (
            <div className="tc-mention-dropdown" role="listbox">
              {mentionSuggestions.map(name => (
                <button
                  key={name}
                  className="tc-mention-option"
                  onMouseDown={e => { e.preventDefault(); applyMention(name) }}
                  role="option"
                >
                  @{name}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          className="tc-send-btn"
          onClick={handleSubmit}
          disabled={!draft.trim() || isSending}
          title="Enviar (Ctrl+Enter)"
        >
          {isSending ? '…' : '↑'}
        </button>
      </div>
      <div className="tc-hint">Ctrl+Enter envia · @ para mencionar</div>
    </div>
  )
}
