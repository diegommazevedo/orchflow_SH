/**
 * hooks/useFocus.ts
 *
 * Sprint 5C — Estado do timer de hiperfoco com persistência em localStorage.
 *
 * Leis respeitadas:
 *   - FocusSession persiste no banco via POST /start e POST /end
 *   - Timer no frontend é apenas display — fonte da verdade é started_at no banco
 *   - Estado sobrevive a reload via localStorage
 *   - notes conformado no backend (modo silent — ConformityEngine no router)
 *   - ActivityLog gerado pelo backend no /end
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../services/api'
import type { FocusMood, FocusConfig } from '../types'
const LS_KEY = 'orchflow-focus-session'

const EMPTY_CONFIG: FocusConfig = {
  sessionId:    null,
  taskId:       null,
  startedAt:    null,
  isPaused:     false,
  pausedAt:     null,
  totalPausedMs: 0,
  isPomodoro:   false,
  pomodoroMinutes: 25,
}

// ── Persistência localStorage ─────────────────────────────────────────────────

function loadConfig(): FocusConfig {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return { ...EMPTY_CONFIG }
    return { ...EMPTY_CONFIG, ...JSON.parse(raw) }
  } catch {
    return { ...EMPTY_CONFIG }
  }
}

function saveConfig(cfg: FocusConfig) {
  localStorage.setItem(LS_KEY, JSON.stringify(cfg))
}

function clearConfig() {
  localStorage.removeItem(LS_KEY)
}

// ── Hook principal ────────────────────────────────────────────────────────────

export function useFocus() {
  const [config, setConfigState] = useState<FocusConfig>(loadConfig)
  const [tick, setTick] = useState(0)          // força re-render a cada segundo
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const setConfig = useCallback((next: FocusConfig) => {
    setConfigState(next)
    saveConfig(next)
  }, [])

  // ── Timer: re-render a cada segundo quando sessão ativa ─────────────────
  useEffect(() => {
    if (config.sessionId && !config.isPaused) {
      intervalRef.current = setInterval(() => setTick(t => t + 1), 1000)
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [config.sessionId, config.isPaused])

  // ── Elapsed real em segundos (desconta pausas) ────────────────────────────
  const getElapsed = useCallback((): number => {
    if (!config.startedAt) return 0
    const base = config.isPaused && config.pausedAt
      ? config.pausedAt - config.startedAt - config.totalPausedMs
      : Date.now()   - config.startedAt - config.totalPausedMs
    return Math.max(0, Math.floor(base / 1000))
  }, [config, tick]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Segundos restantes no Pomodoro ────────────────────────────────────────
  const getRemainingPomodoro = useCallback((): number => {
    const total = config.pomodoroMinutes * 60
    return Math.max(0, total - getElapsed())
  }, [config.pomodoroMinutes, getElapsed])

  // ── Formata mm:ss ─────────────────────────────────────────────────────────
  const formatTime = useCallback((seconds: number): string => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }, [])

  // ── Iniciar sessão ────────────────────────────────────────────────────────
  const startSession = useCallback(async (
    taskId: string | null,
    opts: { isPomodoro?: boolean; pomodoroMinutes?: number; sprintId?: string } = {}
  ) => {
    const body: Record<string, unknown> = {
      user_id: 'default',
      is_pomodoro: opts.isPomodoro ?? false,
      pomodoro_minutes: opts.pomodoroMinutes ?? 25,
    }
    if (taskId)        body.task_id   = taskId
    if (opts.sprintId) body.sprint_id = opts.sprintId

    const res = await api.post('/focus/start', body)
    const { session_id, started_at } = res.data

    // Usa started_at do banco como referência absoluta
    const startedAtMs = new Date(started_at).getTime()

    setConfig({
      sessionId:      session_id,
      taskId:         taskId,
      startedAt:      startedAtMs,
      isPaused:       false,
      pausedAt:       null,
      totalPausedMs:  0,
      isPomodoro:     opts.isPomodoro ?? false,
      pomodoroMinutes: opts.pomodoroMinutes ?? 25,
    })

    // Solicita permissão de notificação para Pomodoro
    if (opts.isPomodoro && 'Notification' in window) {
      Notification.requestPermission().catch(() => {})
    }

    return session_id as string
  }, [setConfig])

  // ── Pausar sessão ─────────────────────────────────────────────────────────
  const pauseSession = useCallback(() => {
    if (!config.sessionId || config.isPaused) return
    setConfig({ ...config, isPaused: true, pausedAt: Date.now() })
  }, [config, setConfig])

  // ── Retomar sessão ────────────────────────────────────────────────────────
  const resumeSession = useCallback(() => {
    if (!config.sessionId || !config.isPaused || !config.pausedAt) return
    const addedPause = Date.now() - config.pausedAt
    setConfig({
      ...config,
      isPaused:      false,
      pausedAt:      null,
      totalPausedMs: config.totalPausedMs + addedPause,
    })
  }, [config, setConfig])

  // ── Encerrar sessão ───────────────────────────────────────────────────────
  const endSession = useCallback(async (mood: FocusMood | null, notes: string | null) => {
    if (!config.sessionId) return null

    const body: Record<string, unknown> = {}
    if (mood)  body.mood  = mood
    if (notes) body.notes = notes  // conformado no backend (modo silent)

    const res = await api.post(`/focus/${config.sessionId}/end`, body)
    clearConfig()
    setConfigState({ ...EMPTY_CONFIG })
    return res.data as { duration_minutes: number; ended_at: string }
  }, [config.sessionId])

  // ── Abandonar sessão (sem salvar mood) ────────────────────────────────────
  const abandonSession = useCallback(() => {
    clearConfig()
    setConfigState({ ...EMPTY_CONFIG })
  }, [])

  const isActive   = !!config.sessionId
  const elapsed    = getElapsed()
  const remaining  = config.isPomodoro ? getRemainingPomodoro() : null
  const progress   = config.isPomodoro
    ? 1 - (getRemainingPomodoro() / (config.pomodoroMinutes * 60))
    : 0

  return {
    config,
    isActive,
    elapsed,
    remaining,
    progress,             // 0.0 – 1.0, para SVG circular
    formatTime,
    startSession,
    pauseSession,
    resumeSession,
    endSession,
    abandonSession,
  }
}

// ── Fetch de histórico / produtividade ────────────────────────────────────────

export async function fetchProductivity(userId = 'default') {
  const res = await api.get(`/focus/productivity/${userId}`)
  return res.data as {
    snapshots: import('../types').ProductivitySnapshot[]
    log_md: string
  }
}
