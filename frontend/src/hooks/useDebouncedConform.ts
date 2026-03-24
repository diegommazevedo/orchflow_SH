/**
 * useDebouncedConform — wrapper de useConformField com debounce no onChange.
 *
 * Sempre usa mode='wizard' (contexto: wizards de import/review onde o usuário
 * está em revisão ativa — faz sentido mostrar a sugestão).
 *
 * onChange → debounce delay ms → chama conform()
 * onBlur   → chama conform() imediato (cancela debounce pendente)
 *
 * Leis respeitadas:
 *   - Campos passam por ConformityEngine antes de ir ao banco
 *   - mode='wizard': sugestão visível, usuário aceita ou edita
 *   - onBlur garante que o valor seja conformado antes de submeter
 */
import { useRef } from 'react'
import { useConformField } from './useConformField'
import type { FieldType, FieldState } from './useConformField'

export type { FieldType, FieldState }

interface UseDebouncedConformReturn {
  fieldState: FieldState
  bind: {
    value: string
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void
    onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => void
  }
  conform: (value: string) => void
  reset: (value: string) => void
}

export function useDebouncedConform(
  fieldType: FieldType,
  delay = 600,
  context?: Record<string, any>
): UseDebouncedConformReturn {
  // Wizard mode: usuário está em revisão ativa — sugestão deve ser visível
  const base = useConformField(fieldType, { mode: 'wizard', context })
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  const bind = {
    value: base.fieldState.raw,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      base.bind.onChange(e)
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => base.conform(e.target.value), delay)
    },
    onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      clearTimeout(timerRef.current)
      base.conform(e.target.value)
    },
  }

  return { fieldState: base.fieldState, bind, conform: base.conform, reset: base.reset }
}
