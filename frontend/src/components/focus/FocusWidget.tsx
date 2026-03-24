/**
 * components/focus/FocusWidget.tsx
 *
 * Sprint 5C — Widget flutuante de hiperfoco.
 * Posição: fixed, bottom 80px, right 24px
 *
 * Estados:
 *   INATIVO     → botão ⚡ com tooltip
 *   CONFIGURANDO → mini-painel slide-up com seleção de task e modo
 *   ATIVO       → timer (Pomodoro regressivo ou Livre progressivo)
 *   CHECK-IN    → modal pós-sessão para registrar mood e notas
 *
 * Leis respeitadas:
 *   - POST /start e POST /end → banco (FocusSession persiste no servidor)
 *   - Timer é só display — fonte da verdade é started_at no banco
 *   - notes conformado no backend (modo silent)
 *   - ActivityLog gerado no backend no /end
 *   - ConformityEngine aplicado em notes no router
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import type { Task, FocusMood } from '../../types'
import { useFocus } from '../../hooks/useFocus'

// ── Helpers ───────────────────────────────────────────────────────────────────

const MOOD_OPTIONS: { value: FocusMood; emoji: string; label: string }[] = [
  { value: 'blocked', emoji: '😤', label: 'Travado'  },
  { value: 'ok',      emoji: '😐', label: 'Ok'       },
  { value: 'flow',    emoji: '🔥', label: 'No flow'  },
]

// Raio do círculo SVG de progresso
const R = 38
const CIRC = 2 * Math.PI * R  // ≈ 238.76

function fmtMinutes(m: number): string {
  const h = Math.floor(m / 60)
  const min = m % 60
  if (h > 0) return `${h}h ${min}m`
  return `${m}m`
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  tasks: Task[]           // tasks do projeto ativo (para o select)
  projectId?: string | null
}

// ── Widget ────────────────────────────────────────────────────────────────────

export function FocusWidget({ tasks, projectId }: Props) {
  const focus = useFocus()

  // Estados de UI locais
  type Phase = 'idle' | 'config' | 'active' | 'checkin'
  const [phase, setPhase] = useState<Phase>(() =>
    focus.isActive ? 'active' : 'idle'
  )
  const [selectedTask,    setSelectedTask]    = useState<string>('')
  const [modePomodoro,    setModePomodoro]    = useState(true)
  const [pomodoroMinutes, setPomodoroMinutes] = useState(25)
  const [isEnding,        setIsEnding]        = useState(false)
  const [savedDuration,   setSavedDuration]   = useState<number | null>(null)

  // Check-in
  const [checkinMood,   setCheckinMood]  = useState<FocusMood | null>(null)
  const [checkinNotes,  setCheckinNotes] = useState('')

  // Toast "ainda em foco?" para modo livre
  const [showStillFocus, setShowStillFocus] = useState(false)
  const stillFocusTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Notificação de Pomodoro concluído
  const pomDoneRef = useRef(false)

  // Sincroniza fase com estado do hook ao montar
  useEffect(() => {
    if (focus.isActive && phase === 'idle') setPhase('active')
  }, [focus.isActive]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Pomodoro — detecta 0 ────────────────────────────────────────────────
  useEffect(() => {
    if (
      phase === 'active' &&
      focus.config.isPomodoro &&
      focus.remaining !== null &&
      focus.remaining <= 0 &&
      !pomDoneRef.current
    ) {
      pomDoneRef.current = true
      // Notificação browser
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Pomodoro concluído! 🍅', {
          body: 'Ótimo foco. Como foi?',
          icon: '/favicon.ico',
        })
      }
      setPhase('checkin')
    }
  }, [phase, focus.config.isPomodoro, focus.remaining])

  // ── Modo livre — toast "ainda em foco?" a cada 45min ────────────────────
  useEffect(() => {
    if (phase !== 'active' || focus.config.isPomodoro) return

    const checkIdle = () => {
      if (focus.elapsed > 0 && focus.elapsed % (45 * 60) < 2) {
        setShowStillFocus(true)
      }
    }
    const id = setInterval(checkIdle, 60_000)
    return () => clearInterval(id)
  }, [phase, focus.config.isPomodoro, focus.elapsed])

  // Limpa timer "still focus" ao mudar de fase
  useEffect(() => {
    if (phase !== 'active') {
      setShowStillFocus(false)
      if (stillFocusTimer.current) clearTimeout(stillFocusTimer.current)
    }
  }, [phase])

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleStart = useCallback(async () => {
    try {
      await focus.startSession(selectedTask || null, {
        isPomodoro: modePomodoro,
        pomodoroMinutes,
      })
      pomDoneRef.current = false
      setPhase('active')
    } catch {
      // erro silencioso — usuário tenta de novo
    }
  }, [focus, selectedTask, modePomodoro, pomodoroMinutes])

  const handlePauseResume = useCallback(() => {
    if (focus.config.isPaused) focus.resumeSession()
    else focus.pauseSession()
  }, [focus])

  const handleStop = useCallback(() => {
    setPhase('checkin')
  }, [])

  const handleCheckinSave = useCallback(async () => {
    setIsEnding(true)
    try {
      const result = await focus.endSession(checkinMood, checkinNotes || null)
      setSavedDuration(result?.duration_minutes ?? null)
    } finally {
      setIsEnding(false)
      setCheckinMood(null)
      setCheckinNotes('')
      setPhase('idle')
    }
  }, [focus, checkinMood, checkinNotes])

  const handleProlongar = useCallback(async () => {
    // Encerra sessão atual e inicia nova com mais 25min
    const result = await focus.endSession(null, null)
    setSavedDuration(result?.duration_minutes ?? null)
    pomDoneRef.current = false
    await focus.startSession(focus.config.taskId, {
      isPomodoro:      true,
      pomodoroMinutes: 25,
    })
    setPhase('active')
  }, [focus])

  // ── In-progress tasks para o select ────────────────────────────────────────
  const inProgressTasks = tasks.filter(t => t.status === 'in_progress' || t.status === 'backlog')

  // ── Task name ──────────────────────────────────────────────────────────────
  const activeTaskName = focus.config.taskId
    ? (tasks.find(t => t.id === focus.config.taskId)?.title ?? 'Tarefa')
    : 'Sessão livre'

  // ── Renderização por fase ──────────────────────────────────────────────────

  // ── IDLE ──────────────────────────────────────────────────────────────────
  if (phase === 'idle') {
    return (
      <div className="fw-idle" title="Iniciar hiperfoco">
        <button
          className="fw-idle-btn"
          onClick={() => setPhase('config')}
          aria-label="Iniciar hiperfoco"
        >
          <span className="fw-idle-icon">⚡</span>
          <span className="fw-idle-label">Hiperfoco</span>
        </button>
        {savedDuration !== null && (
          <div className="fw-toast fw-toast-done" onAnimationEnd={() => setSavedDuration(null)}>
            ✓ {fmtMinutes(savedDuration)} registrados
          </div>
        )}
      </div>
    )
  }

  // ── CONFIG ────────────────────────────────────────────────────────────────
  if (phase === 'config') {
    return (
      <div className="fw-config fw-panel">
        <div className="fw-panel-header">
          <span className="fw-panel-title">Hiperfoco</span>
          <button className="fw-close-btn" onClick={() => setPhase('idle')}>×</button>
        </div>

        <label className="fw-label">Foco em:</label>
        <select
          className="fw-select"
          value={selectedTask}
          onChange={e => setSelectedTask(e.target.value)}
        >
          <option value="">— sessão livre —</option>
          {inProgressTasks.map(t => (
            <option key={t.id} value={t.id}>
              {t.title.length > 40 ? t.title.slice(0, 38) + '…' : t.title}
            </option>
          ))}
        </select>

        <label className="fw-label">Modo:</label>
        <div className="fw-mode-row">
          <button
            className={`fw-mode-btn ${modePomodoro ? 'fw-mode-active' : ''}`}
            onClick={() => setModePomodoro(true)}
          >
            🍅 Pomodoro
          </button>
          <button
            className={`fw-mode-btn ${!modePomodoro ? 'fw-mode-active' : ''}`}
            onClick={() => setModePomodoro(false)}
          >
            ⏱ Livre
          </button>
        </div>

        {modePomodoro && (
          <div className="fw-pomo-dur">
            <label className="fw-label">Duração:</label>
            <div className="fw-pomo-presets">
              {[15, 25, 45, 60].map(m => (
                <button
                  key={m}
                  className={`fw-preset-btn ${pomodoroMinutes === m ? 'fw-preset-active' : ''}`}
                  onClick={() => setPomodoroMinutes(m)}
                >
                  {m}m
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          className="fw-start-btn"
          onClick={handleStart}
          disabled={!projectId}
        >
          ▶ Iniciar
        </button>
        {!projectId && (
          <p className="fw-hint">Selecione um projeto primeiro</p>
        )}
      </div>
    )
  }

  // ── ACTIVE ────────────────────────────────────────────────────────────────
  if (phase === 'active') {
    const isPomo   = focus.config.isPomodoro
    const isPaused = focus.config.isPaused
    const displaySeconds = isPomo ? (focus.remaining ?? 0) : focus.elapsed
    const dashOffset = isPomo
      ? CIRC * (1 - focus.progress)
      : 0  // livre não usa círculo

    return (
      <div className="fw-active fw-panel">
        {/* Toast "ainda em foco?" */}
        {showStillFocus && (
          <div className="fw-still-focus">
            Ainda em foco?{' '}
            <button onClick={() => setShowStillFocus(false)}>Sim</button>{' '}
            <button onClick={handleStop}>Pausar</button>
          </div>
        )}

        <div className="fw-task-name">{activeTaskName}</div>

        {isPomo ? (
          /* Pomodoro — timer circular SVG */
          <div className="fw-circle-wrap">
            <svg className="fw-circle-svg" viewBox="0 0 100 100">
              {/* Track */}
              <circle
                cx="50" cy="50" r={R}
                stroke="var(--border2)" strokeWidth="6"
                fill="none"
              />
              {/* Progress */}
              <circle
                cx="50" cy="50" r={R}
                stroke="var(--accent)" strokeWidth="6"
                fill="none"
                strokeLinecap="round"
                strokeDasharray={`${CIRC}`}
                strokeDashoffset={`${dashOffset}`}
                transform="rotate(-90 50 50)"
                style={{ transition: 'stroke-dashoffset 1s linear', willChange: 'stroke-dashoffset' }}
              />
            </svg>
            <div className="fw-timer">{focus.formatTime(displaySeconds)}</div>
          </div>
        ) : (
          /* Livre — timer progressivo simples */
          <div className="fw-timer-free">
            {focus.formatTime(displaySeconds)}
          </div>
        )}

        <div className="fw-mode-badge">
          {isPomo ? `🍅 ${focus.config.pomodoroMinutes}min` : '⏱ Livre'}
          {isPaused && <span className="fw-paused-badge"> · pausado</span>}
        </div>

        <div className="fw-action-row">
          <button
            className="fw-btn fw-btn-secondary"
            onClick={handlePauseResume}
            title={isPaused ? 'Retomar' : 'Pausar'}
          >
            {isPaused ? '▶' : '⏸'}
          </button>
          <button
            className="fw-btn fw-btn-danger"
            onClick={handleStop}
            title="Encerrar"
          >
            ⏹
          </button>
        </div>
      </div>
    )
  }

  // ── CHECK-IN ──────────────────────────────────────────────────────────────
  return (
    <div className="fw-checkin fw-panel">
      <div className="fw-checkin-title">
        {focus.config.isPomodoro && focus.remaining !== null && focus.remaining <= 0
          ? '🍅 Pomodoro concluído!'
          : 'Sessão encerrada'}
      </div>
      <div className="fw-checkin-dur">
        {focus.formatTime(focus.elapsed)}
      </div>

      <p className="fw-label">Como foi?</p>
      <div className="fw-mood-row">
        {MOOD_OPTIONS.map(m => (
          <button
            key={m.value}
            className={`fw-mood-btn ${checkinMood === m.value ? 'fw-mood-active' : ''}`}
            onClick={() => setCheckinMood(m.value)}
            title={m.label}
          >
            {m.emoji}
          </button>
        ))}
      </div>

      <textarea
        className="fw-notes-input"
        placeholder="Notas (opcional)…"
        value={checkinNotes}
        onChange={e => setCheckinNotes(e.target.value)}
        rows={2}
        maxLength={500}
      />

      <div className="fw-checkin-actions">
        {focus.config.isPomodoro && focus.remaining !== null && focus.remaining <= 0 && (
          <button
            className="fw-btn fw-btn-secondary"
            onClick={handleProlongar}
            disabled={isEnding}
          >
            +25min
          </button>
        )}
        <button
          className="fw-btn fw-btn-primary"
          onClick={handleCheckinSave}
          disabled={isEnding}
        >
          {isEnding ? '…' : 'Salvar'}
        </button>
      </div>
    </div>
  )
}
