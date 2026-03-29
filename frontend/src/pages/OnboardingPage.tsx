/**
 * OnboardingPage — Sprint 8: Wizard de configuração inicial da organização
 *
 * 5 steps lineares:
 * 1. Nome da organização
 * 2. Vertical do negócio (grid de cards)
 * 3. Missão (textarea com sugestão por vertical)
 * 4. Vocabulário (6 campos inline)
 * 5. Template de vertical
 *
 * Dispara automaticamente quando onboarding_completed=false.
 */
import { useState } from 'react'
import { advanceOnboarding, completeOnboarding } from '../services/api'
import type { Workspace } from '../types'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface Props {
  workspace: Workspace
  onComplete: (ws: Workspace) => void
  onSkip:     () => void
}

// ── Constantes ────────────────────────────────────────────────────────────────

const VERTICALS = [
  { key: 'tech',         icon: '💻', label: 'Tecnologia'  },
  { key: 'legal',        icon: '⚖️', label: 'Jurídico'    },
  { key: 'health',       icon: '🏥', label: 'Saúde'       },
  { key: 'construction', icon: '🏗️', label: 'Construção'  },
  { key: 'education',    icon: '📚', label: 'Educação'    },
  { key: 'retail',       icon: '🛒', label: 'Varejo'      },
  { key: 'finance',      icon: '💰', label: 'Finanças'    },
  { key: 'other',        icon: '⬡',  label: 'Outro'       },
]

const MISSION_SUGGESTIONS: Record<string, string> = {
  tech:         'Construir soluções tecnológicas que simplificam a vida das pessoas.',
  legal:        'Oferecer assessoria jurídica ágil e transparente aos nossos clientes.',
  health:       'Promover saúde e bem-estar com cuidado humanizado.',
  construction: 'Edificar espaços com qualidade, prazo e segurança.',
  education:    'Transformar vidas por meio da educação acessível e de qualidade.',
  retail:       'Conectar pessoas aos produtos que fazem diferença no cotidiano.',
  finance:      'Simplificar a gestão financeira de pessoas e empresas.',
  other:        'Criar valor real para nossos clientes e a sociedade.',
}

const VOCAB_FIELDS: { key: string; label: string; placeholder: string }[] = [
  { key: 'term_project', label: 'Você chama Projeto de', placeholder: 'Projeto' },
  { key: 'term_task',    label: 'Você chama Tarefa de',  placeholder: 'Tarefa'  },
  { key: 'term_sprint',  label: 'Você chama Sprint de',  placeholder: 'Sprint'  },
  { key: 'term_backlog', label: 'Você chama Backlog de', placeholder: 'Backlog' },
  { key: 'term_member',  label: 'Você chama Membro de',  placeholder: 'Membro'  },
  { key: 'term_client',  label: 'Você chama Cliente de', placeholder: 'Cliente' },
]

// ── Progress bar ──────────────────────────────────────────────────────────────

function ProgressBar({ step, total }: { step: number; total: number }) {
  return (
    <div className="ob-progress">
      <div className="ob-progress-bar" style={{ width: `${(step / total) * 100}%` }} />
      <span className="ob-progress-label">{step}/{total}</span>
    </div>
  )
}

// ── OnboardingPage ────────────────────────────────────────────────────────────

export default function OnboardingPage({ workspace, onComplete, onSkip }: Props) {
  const [step, setStep]       = useState(1)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState<string | null>(null)

  // Step 1
  const [orgName, setOrgName]       = useState(workspace.name || '')
  const [legalName, setLegalName]   = useState(workspace.legal_name || '')

  // Step 2
  const [vertical, setVertical]     = useState(workspace.vertical || '')

  // Step 3
  const [mission, setMission]       = useState(workspace.mission || '')

  // Step 4
  const [vocab, setVocab]           = useState<Record<string, string>>({
    term_project: workspace.vocabulary?.term_project || '',
    term_task:    workspace.vocabulary?.term_task    || '',
    term_sprint:  workspace.vocabulary?.term_sprint  || '',
    term_backlog: workspace.vocabulary?.term_backlog || '',
    term_member:  workspace.vocabulary?.term_member  || '',
    term_client:  workspace.vocabulary?.term_client  || '',
  })

  const TOTAL = 5

  async function handleNext() {
    setError(null)
    setSaving(true)
    try {
      let data: Record<string, unknown> = {}

      if (step === 1) {
        if (!orgName.trim()) { setError('Nome da organização é obrigatório.'); setSaving(false); return }
        data = { name: orgName.trim(), legal_name: legalName.trim() || undefined }
      } else if (step === 2) {
        if (!vertical) { setError('Selecione a vertical do negócio.'); setSaving(false); return }
        data = { vertical }
      } else if (step === 3) {
        data = { mission: mission.trim() || undefined }
      } else if (step === 4) {
        const filtered: Record<string, string> = {}
        for (const [k, v] of Object.entries(vocab)) { if (v.trim()) filtered[k] = v.trim() }
        data = { vocabulary: Object.keys(filtered).length ? filtered : undefined }
      } else if (step === 5) {
        // template handled inline via advance then complete
        data = {}
      }

      await advanceOnboarding(workspace.id, step, data)

      if (step < TOTAL) {
        setStep(s => s + 1)
      } else {
        const updated = await completeOnboarding(workspace.id)
        onComplete(updated)
      }
    } catch {
      setError('Erro ao salvar. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  function handleBack() {
    setError(null)
    setStep(s => Math.max(1, s - 1))
  }

  function getMissionSuggestion() {
    return vertical ? (MISSION_SUGGESTIONS[vertical] ?? '') : ''
  }

  return (
    <div className="ob-overlay">
      <div className="ob-card">
        {/* Header */}
        <div className="ob-header">
          <div className="ob-logo">
            <div className="ob-logo-dot" />
            <span>OrchFlow</span>
          </div>
          <button className="ob-skip-btn" onClick={onSkip} title="Pular configuração">
            Pular configuração →
          </button>
        </div>

        <ProgressBar step={step} total={TOTAL} />

        {/* ── Step 1: Nome ────────────────────────────────── */}
        {step === 1 && (
          <div className="ob-step">
            <h2 className="ob-step-title">Como se chama sua organização?</h2>
            <p className="ob-step-sub">Esse é o nome que sua equipe vai ver no sistema.</p>
            <label className="ob-label">
              Nome de exibição <span className="ob-required">*</span>
              <input
                className="ob-input"
                value={orgName}
                onChange={e => setOrgName(e.target.value)}
                placeholder="Ex: Escritório Silva & Associados"
                autoFocus
              />
            </label>
            <label className="ob-label">
              Nome legal (opcional)
              <input
                className="ob-input"
                value={legalName}
                onChange={e => setLegalName(e.target.value)}
                placeholder="Ex: Silva Consultoria Jurídica LTDA"
              />
            </label>
          </div>
        )}

        {/* ── Step 2: Vertical ────────────────────────────── */}
        {step === 2 && (
          <div className="ob-step">
            <h2 className="ob-step-title">Em qual segmento sua organização atua?</h2>
            <p className="ob-step-sub">Isso nos ajuda a configurar o sistema para sua área.</p>
            <div className="ob-vertical-grid">
              {VERTICALS.map(v => (
                <div
                  key={v.key}
                  className={`ob-vertical-card${vertical === v.key ? ' ob-vertical-selected' : ''}`}
                  onClick={() => setVertical(v.key)}
                >
                  <span className="ob-vertical-icon">{v.icon}</span>
                  <span className="ob-vertical-label">{v.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Step 3: Missão ──────────────────────────────── */}
        {step === 3 && (
          <div className="ob-step">
            <h2 className="ob-step-title">Qual é a missão da sua organização?</h2>
            <p className="ob-step-sub">Em uma frase. Opcional, mas poderoso para o contexto da IA.</p>
            {getMissionSuggestion() && !mission && (
              <div className="ob-suggestion">
                <span className="ob-suggestion-label">Sugestão para {vertical}:</span>
                <button
                  className="ob-suggestion-apply"
                  onClick={() => setMission(getMissionSuggestion())}
                >
                  Usar esta →
                </button>
                <p className="ob-suggestion-text">{getMissionSuggestion()}</p>
              </div>
            )}
            <label className="ob-label">
              Missão (opcional)
              <textarea
                className="ob-textarea"
                value={mission}
                onChange={e => setMission(e.target.value)}
                placeholder="Ex: Transformar a gestão de projetos com tecnologia e IA."
                rows={3}
              />
            </label>
          </div>
        )}

        {/* ── Step 4: Vocabulário ─────────────────────────── */}
        {step === 4 && (
          <div className="ob-step">
            <h2 className="ob-step-title">Como sua equipe chama as coisas?</h2>
            <p className="ob-step-sub">Customize os termos do sistema. Opcional — pode mudar depois.</p>
            <div className="ob-vocab-grid">
              {VOCAB_FIELDS.map(f => (
                <label key={f.key} className="ob-label">
                  {f.label} <span className="ob-vocab-placeholder">({f.placeholder})</span>
                  <input
                    className="ob-input"
                    value={vocab[f.key] || ''}
                    onChange={e => setVocab(v => ({ ...v, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                  />
                </label>
              ))}
            </div>
          </div>
        )}

        {/* ── Step 5: Template ────────────────────────────── */}
        {step === 5 && (
          <div className="ob-step">
            <h2 className="ob-step-title">Quer começar com um template?</h2>
            <p className="ob-step-sub">
              Aplicamos colunas Kanban e campos customizados para{' '}
              <strong>{VERTICALS.find(v => v.key === vertical)?.label ?? 'sua vertical'}</strong>.
              Você pode personalizar depois.
            </p>
            <div className="ob-template-box">
              <div className="ob-template-icon">
                {VERTICALS.find(v => v.key === vertical)?.icon ?? '⬡'}
              </div>
              <div className="ob-template-info">
                <div className="ob-template-name">
                  Template {VERTICALS.find(v => v.key === vertical)?.label ?? 'Geral'}
                </div>
                <div className="ob-template-desc">
                  Colunas e campos pré-configurados para {vertical || 'sua área'}.
                  O template é sugestão — confirme antes de aplicar.
                </div>
              </div>
            </div>
            <p className="ob-template-note">
              💡 Você pode aplicar templates a qualquer momento nas configurações do projeto.
            </p>
          </div>
        )}

        {/* Erro */}
        {error && <div className="ob-error">{error}</div>}

        {/* Ações */}
        <div className="ob-actions">
          {step > 1 && (
            <button className="ob-btn ob-btn-back" onClick={handleBack} disabled={saving}>
              ← Voltar
            </button>
          )}
          <button
            className="ob-btn ob-btn-next"
            onClick={handleNext}
            disabled={saving}
          >
            {saving ? 'Salvando…' : step < TOTAL ? 'Próximo →' : 'Concluir ✓'}
          </button>
        </div>
      </div>
    </div>
  )
}
