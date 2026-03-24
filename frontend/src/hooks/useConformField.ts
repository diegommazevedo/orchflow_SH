/**
 * useConformField — hook de conformidade para campos de formulário.
 *
 * DOIS MODOS (via options.mode):
 *
 * 'silent' (default) — origens diretas (formulário, TaskDetailPanel)
 *   - Processa em background após onBlur
 *   - Auto-aplica: atualiza bind.value com o valor conformado
 *   - Exibe ✓ (showCheck) por ~2s após auto-correção
 *   - Erro na API → mantém valor original, fluxo nunca bloqueado
 *   - NUNCA exibe sugestão abaixo do campo
 *   - NUNCA requer clique do usuário
 *
 * 'wizard' — origens complexas (ReviewTaskList, Wizards)
 *   - Comportamento anterior: raw inalterado, conformed exposto para revisão
 *   - Usuário aceita ou edita antes de confirmar
 *   - Erro → status 'error' (visível, não bloqueante)
 *
 * Leis respeitadas:
 *   - ConformityEngine chamado em toda entrada
 *   - Erro nunca bloqueia o usuário (especialmente no modo silent)
 *   - CORS: 5173, 5174, 5175, 5180
 */
import { useState, useCallback, useRef } from 'react'
import axios from 'axios'

export type FieldType = 'title' | 'name' | 'description' | 'due_date' | 'currency'

export interface ConformOptions {
  /** Modo de conformidade. Default: 'silent' */
  mode?: 'silent' | 'wizard'
  /** Delay do debounce externo (usado por useDebouncedConform). Não afeta este hook. */
  delay?: number
  /** Contexto extra passado ao endpoint /api/agent/conform-field */
  context?: Record<string, any>
}

interface ConformedResult {
  original: string
  conformed: any
}

export interface FieldState {
  raw: string
  conformed: any
  status: 'idle' | 'conforming' | 'ok' | 'corrected' | 'error'
}

export interface UseConformFieldReturn {
  fieldState: FieldState
  bind: {
    value: string
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void
    onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => void
  }
  /** Chama o ConformityEngine para o valor informado */
  conform: (value: string) => void
  /**
   * Redefine o estado do campo (ex: ao trocar de tarefa no TaskDetailPanel).
   * Cancela o timer de showCheck e volta para 'idle'.
   */
  reset: (value: string) => void
  /**
   * Modo silent: true por ~2.3s quando o campo foi auto-corrigido.
   * Usado para exibir o indicador ✓ discreto.
   * Sempre false no modo wizard.
   */
  showCheck: boolean
}

const CHECK_DURATION_MS = 2300

export function useConformField(
  fieldType: FieldType,
  options?: ConformOptions,
): UseConformFieldReturn {
  const mode    = options?.mode    ?? 'silent'
  const context = options?.context ?? {}

  const [fieldState, setFieldState] = useState<FieldState>({
    raw: '', conformed: null, status: 'idle',
  })
  const [showCheck, setShowCheck] = useState(false)
  const checkTimer = useRef<ReturnType<typeof setTimeout>>()

  // ── reset ───────────────────────────────────────────────────────────────────
  const reset = useCallback((value: string) => {
    clearTimeout(checkTimer.current)
    setShowCheck(false)
    setFieldState({ raw: value, conformed: null, status: 'idle' })
  }, [])

  // ── conform ─────────────────────────────────────────────────────────────────
  const conform = useCallback(async (value: string) => {
    if (!value.trim()) return
    setFieldState(prev => ({ ...prev, status: 'conforming' }))

    try {
      const { data } = await axios.post<ConformedResult>('/api/agent/conform-field', {
        field_type: fieldType,
        value,
        context,
      })

      const corrected = String(data.conformed) !== value

      if (mode === 'silent') {
        // Auto-aplica: raw recebe o valor conformado
        const applied = corrected ? String(data.conformed) : value
        setFieldState({ raw: applied, conformed: data.conformed, status: corrected ? 'corrected' : 'ok' })

        if (corrected) {
          clearTimeout(checkTimer.current)
          setShowCheck(true)
          checkTimer.current = setTimeout(() => setShowCheck(false), CHECK_DURATION_MS)
        }
      } else {
        // wizard: raw permanece inalterado; conformed fica disponível para revisão
        setFieldState({ raw: value, conformed: data.conformed, status: corrected ? 'corrected' : 'ok' })
      }
    } catch {
      if (mode === 'silent') {
        // Erro silencioso: volta para idle, fluxo nunca bloqueado
        setFieldState(prev => ({ ...prev, status: 'idle' }))
      } else {
        setFieldState(prev => ({ ...prev, status: 'error' }))
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldType, mode, JSON.stringify(context)])

  // ── bind ─────────────────────────────────────────────────────────────────────
  const bind = {
    value:    fieldState.raw,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setFieldState(prev => ({ ...prev, raw: e.target.value, status: 'idle' })),
    onBlur:   (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      conform(e.target.value),
  }

  return { fieldState, bind, conform, reset, showCheck }
}
