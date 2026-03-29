/**
 * ErrorToast — mensagens HTTP amigáveis (V1.5).
 * Escuta `orchflow:api-error` com detail.message; cada toast auto-fecha em 5s.
 */
import { useEffect, useState, useCallback, useRef } from 'react'

const DURATION_MS = 5000

type ToastItem = { id: number; text: string }

export function ErrorToastHost() {
  const [items, setItems] = useState<ToastItem[]>([])
  const nextId = useRef(0)

  const push = useCallback((message: string) => {
    const id = ++nextId.current
    setItems(prev => [...prev, { id, text: message }])
    window.setTimeout(() => {
      setItems(prev => prev.filter(t => t.id !== id))
    }, DURATION_MS)
  }, [])

  useEffect(() => {
    function onApiError(e: Event) {
      const ce = e as CustomEvent<{ message?: string }>
      const msg = ce.detail?.message?.trim()
      if (msg) push(msg)
    }
    window.addEventListener('orchflow:api-error', onApiError)
    return () => window.removeEventListener('orchflow:api-error', onApiError)
  }, [push])

  if (items.length === 0) return null

  return (
    <div className="error-toast-stack" aria-live="polite">
      {items.map(t => (
        <div key={t.id} className="error-toast">
          <span className="error-toast-icon" aria-hidden>⚠</span>
          <span className="error-toast-text">{t.text}</span>
        </div>
      ))}
    </div>
  )
}
