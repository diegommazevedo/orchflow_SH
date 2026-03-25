import { useState, useRef, useCallback } from 'react'
import api from '../services/api'

type VoiceState = 'idle' | 'recording' | 'transcribing' | 'done' | 'error'

interface UseVoiceInputReturn {
  state: VoiceState
  transcript: string
  error: string | null
  startRecording: () => Promise<void>
  stopRecording: () => void
  reset: () => void
  isSupported: boolean
}

/**
 * useVoiceInput
 *
 * Grava áudio via MediaRecorder (browser nativo).
 * Envia para /api/voice/transcribe (Groq Whisper).
 * Retorna texto transcrito pronto para o chat.
 *
 * Uso:
 *   const { state, transcript, startRecording, stopRecording } = useVoiceInput()
 */
export function useVoiceInput(): UseVoiceInputReturn {
  const [state, setState]         = useState<VoiceState>('idle')
  const [transcript, setTranscript] = useState('')
  const [error, setError]         = useState<string | null>(null)

  const mediaRecorder = useRef<MediaRecorder | null>(null)
  const audioChunks   = useRef<Blob[]>([])
  const streamRef     = useRef<MediaStream | null>(null)

  const isSupported = typeof window !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    !!window.MediaRecorder

  const reset = useCallback(() => {
    setState('idle')
    setTranscript('')
    setError(null)
    audioChunks.current = []
  }, [])

  const startRecording = useCallback(async () => {
    if (!isSupported) {
      setError('Seu browser não suporta gravação de áudio.')
      return
    }

    try {
      reset()
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      // prefere webm/opus — melhor suporte cross-browser
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : ''

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      mediaRecorder.current = recorder
      audioChunks.current   = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.current.push(e.data)
      }

      recorder.onstop = async () => {
        // para o stream de microfone
        streamRef.current?.getTracks().forEach(t => t.stop())

        setState('transcribing')

        const blob     = new Blob(audioChunks.current, { type: mimeType || 'audio/webm' })
        const formData = new FormData()
        formData.append('audio', blob, 'recording.webm')
        formData.append('language', 'pt')

        try {
          const { data } = await api.post('/voice/transcribe', formData, {
            headers: { 'Content-Type': undefined },
          })
          setTranscript(data.text)
          setState('done')
        } catch (err: unknown) {
          const ax = err as { response?: { data?: { detail?: string | string[] } } }
          const d = ax.response?.data?.detail
          const msg = Array.isArray(d) ? d.join(', ') : (d || 'Erro na transcrição.')
          setError(msg)
          setState('error')
        }
      }

      recorder.start(250) // coleta chunks a cada 250ms
      setState('recording')

    } catch (err: unknown) {
      const e = err as { name?: string }
      if (e.name === 'NotAllowedError') {
        setError('Permissão de microfone negada.')
      } else {
        setError('Não foi possível acessar o microfone.')
      }
      setState('error')
    }
  }, [isSupported, reset])

  const stopRecording = useCallback(() => {
    if (mediaRecorder.current?.state === 'recording') {
      mediaRecorder.current.stop()
    }
  }, [])

  return {
    state,
    transcript,
    error,
    startRecording,
    stopRecording,
    reset,
    isSupported,
  }
}
