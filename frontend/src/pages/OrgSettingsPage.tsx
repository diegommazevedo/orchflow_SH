/**
 * OrgSettingsPage — Sprint 8: Configurações da Organização
 *
 * Seções:
 * 1. Identidade — nome, nome legal, missão, logo (URL), cor primária
 * 2. Vertical e indústria — vertical, indústria, porte
 * 3. Vocabulário — 6 campos editáveis com preview em tempo real
 * 4. Localização — timezone, locale
 * 5. Danger Zone — refazer onboarding
 */
import { useEffect, useState } from 'react'
import {
  resetOnboarding,
  updateVocabulary,
  updateWorkspace,
} from '../services/api'
import { useVocabulary } from '../contexts/VocabularyContext'
import type { OrgVocabulary, Workspace } from '../types'

// ── Constantes ────────────────────────────────────────────────────────────────

const VERTICALS = [
  { key: 'tech',         label: 'Tecnologia'  },
  { key: 'legal',        label: 'Jurídico'    },
  { key: 'health',       label: 'Saúde'       },
  { key: 'construction', label: 'Construção'  },
  { key: 'education',    label: 'Educação'    },
  { key: 'retail',       label: 'Varejo'      },
  { key: 'finance',      label: 'Finanças'    },
  { key: 'other',        label: 'Outro'       },
]

const TIMEZONES = [
  'America/Sao_Paulo',
  'America/Manaus',
  'America/Belem',
  'America/Noronha',
  'UTC',
  'Europe/Lisbon',
  'Europe/London',
]

const LOCALES = [
  { value: 'pt-BR', label: 'Português (Brasil)' },
  { value: 'en-US', label: 'English (US)' },
  { value: 'es',    label: 'Español' },
]

const VOCAB_FIELDS: { key: keyof OrgVocabulary; label: string }[] = [
  { key: 'term_project', label: 'Projeto' },
  { key: 'term_task',    label: 'Tarefa'  },
  { key: 'term_sprint',  label: 'Sprint'  },
  { key: 'term_backlog', label: 'Backlog' },
  { key: 'term_member',  label: 'Membro'  },
  { key: 'term_client',  label: 'Cliente' },
]

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  workspace: Workspace
  onUpdated: (ws: Workspace) => void
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function OrgSettingsPage({ workspace, onUpdated }: Props) {
  const { vocabulary } = useVocabulary()

  // Identidade
  const [name, setName]           = useState(workspace.name || '')
  const [legalName, setLegalName] = useState(workspace.legal_name || '')
  const [mission, setMission]     = useState(workspace.mission || '')
  const [logoUrl, setLogoUrl]     = useState(workspace.logo_url || '')
  const [color, setColor]         = useState(workspace.primary_color || '#89b4fa')

  // Vertical
  const [vertical, setVertical]   = useState(workspace.vertical || '')
  const [industry, setIndustry]   = useState(workspace.industry || '')
  const [sizeRange, setSizeRange] = useState(workspace.size_range || '')

  // Vocabulário
  const [vocab, setVocab] = useState<OrgVocabulary>({
    term_project: vocabulary.term_project,
    term_task:    vocabulary.term_task,
    term_sprint:  vocabulary.term_sprint,
    term_backlog: vocabulary.term_backlog,
    term_member:  vocabulary.term_member,
    term_client:  vocabulary.term_client,
  })

  // Localização
  const [timezone, setTimezone]   = useState(workspace.timezone || 'America/Sao_Paulo')
  const [locale, setLocale]       = useState(workspace.locale || 'pt-BR')

  const [saving, setSaving]       = useState(false)
  const [saved, setSaved]         = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)

  // Preview da cor em tempo real
  useEffect(() => {
    document.documentElement.style.setProperty('--accent', color || '#89b4fa')
  }, [color])

  async function handleSave() {
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const updated = await updateWorkspace(workspace.id, {
        name:          name.trim() || undefined,
        legal_name:    legalName.trim() || undefined,
        mission:       mission.trim() || undefined,
        logo_url:      logoUrl.trim() || undefined,
        primary_color: color || undefined,
        vertical:      vertical || undefined,
        industry:      industry.trim() || undefined,
        size_range:    sizeRange.trim() || undefined,
        timezone:      timezone || undefined,
        locale:        locale || undefined,
      })
      await updateVocabulary(workspace.id, vocab)
      onUpdated({ ...updated, vocabulary: vocab })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch {
      setError('Erro ao salvar. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  async function handleReset() {
    try {
      await resetOnboarding(workspace.id)
      setConfirmReset(false)
      window.location.reload()
    } catch {
      setError('Erro ao resetar onboarding.')
    }
  }

  return (
    <div className="org-settings-page">
      <div className="org-settings-header">
        <h2 className="org-settings-title">⬡ Configurações da Organização</h2>
        <div className="org-settings-actions">
          {error && <span className="org-settings-error">{error}</span>}
          {saved && <span className="org-settings-saved">✓ Salvo</span>}
          <button className="btn-primary-sm" onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar alterações'}
          </button>
        </div>
      </div>

      {/* ── 1. Identidade ──────────────────────────────────────────────── */}
      <section className="org-section">
        <h3 className="org-section-title">Identidade</h3>
        <div className="org-fields-grid">
          <label className="org-label">
            Nome de exibição
            <input className="org-input" value={name} onChange={e => setName(e.target.value)} />
          </label>
          <label className="org-label">
            Nome legal
            <input className="org-input" value={legalName} onChange={e => setLegalName(e.target.value)} placeholder="Razão social" />
          </label>
          <label className="org-label org-label-full">
            Missão
            <textarea
              className="org-input org-textarea"
              value={mission}
              onChange={e => setMission(e.target.value)}
              placeholder="Em uma frase, qual é a missão da organização?"
              rows={2}
            />
          </label>
          <label className="org-label org-label-full">
            Logo (URL)
            <input
              className="org-input"
              value={logoUrl}
              onChange={e => setLogoUrl(e.target.value)}
              placeholder="https://..."
            />
            {logoUrl && (
              <img src={logoUrl} alt="Logo preview" className="org-logo-preview" />
            )}
          </label>
          <label className="org-label">
            Cor primária
            <div className="org-color-row">
              <input
                type="color"
                className="org-color-input"
                value={color}
                onChange={e => setColor(e.target.value)}
              />
              <input
                className="org-input org-input-sm"
                value={color}
                onChange={e => setColor(e.target.value)}
                placeholder="#89b4fa"
                maxLength={7}
              />
              <span className="org-color-preview" style={{ background: color }} />
            </div>
          </label>
        </div>
      </section>

      {/* ── 2. Vertical e indústria ────────────────────────────────────── */}
      <section className="org-section">
        <h3 className="org-section-title">Vertical e indústria</h3>
        <div className="org-fields-grid">
          <label className="org-label">
            Vertical
            <select className="org-input" value={vertical} onChange={e => setVertical(e.target.value)}>
              <option value="">— Selecione —</option>
              {VERTICALS.map(v => (
                <option key={v.key} value={v.key}>{v.label}</option>
              ))}
            </select>
          </label>
          <label className="org-label">
            Indústria
            <input className="org-input" value={industry} onChange={e => setIndustry(e.target.value)} placeholder="Ex: Advocacia empresarial" />
          </label>
          <label className="org-label">
            Porte
            <select className="org-input" value={sizeRange} onChange={e => setSizeRange(e.target.value)}>
              <option value="">— Selecione —</option>
              <option value="1-5">1-5 pessoas</option>
              <option value="6-20">6-20 pessoas</option>
              <option value="21-50">21-50 pessoas</option>
              <option value="51-200">51-200 pessoas</option>
              <option value="200+">200+ pessoas</option>
            </select>
          </label>
        </div>
      </section>

      {/* ── 3. Vocabulário ─────────────────────────────────────────────── */}
      <section className="org-section">
        <h3 className="org-section-title">Vocabulário</h3>
        <p className="org-section-sub">Como sua equipe chama as coisas. Preview em tempo real.</p>
        <div className="org-vocab-grid">
          {VOCAB_FIELDS.map(f => (
            <label key={f.key} className="org-label">
              <span className="org-vocab-default">{f.label}</span> → chama de
              <input
                className="org-input"
                value={vocab[f.key]}
                onChange={e => setVocab(v => ({ ...v, [f.key]: e.target.value }))}
                placeholder={f.label}
              />
              <span className="org-vocab-preview">
                Preview: <strong>{vocab[f.key] || f.label}</strong>
              </span>
            </label>
          ))}
        </div>
      </section>

      {/* ── 4. Localização ─────────────────────────────────────────────── */}
      <section className="org-section">
        <h3 className="org-section-title">Localização</h3>
        <div className="org-fields-grid">
          <label className="org-label">
            Fuso horário
            <select className="org-input" value={timezone} onChange={e => setTimezone(e.target.value)}>
              {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          </label>
          <label className="org-label">
            Idioma
            <select className="org-input" value={locale} onChange={e => setLocale(e.target.value)}>
              {LOCALES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </label>
        </div>
      </section>

      {/* ── 5. Danger Zone ──────────────────────────────────────────────── */}
      <section className="org-section org-danger-zone">
        <h3 className="org-section-title org-danger-title">⚠ Danger Zone</h3>
        {!confirmReset ? (
          <div>
            <p className="org-section-sub">Refaz o wizard de configuração inicial da organização.</p>
            <button className="org-danger-btn" onClick={() => setConfirmReset(true)}>
              Refazer onboarding
            </button>
          </div>
        ) : (
          <div className="org-danger-confirm">
            <p>Tem certeza? O wizard de onboarding será reiniciado.</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="org-danger-btn" onClick={handleReset}>Confirmar reset</button>
              <button className="btn-secondary-sm" onClick={() => setConfirmReset(false)}>Cancelar</button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
