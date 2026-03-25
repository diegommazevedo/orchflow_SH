# OrchFlow — Checkpoint Log
> Append-only. Nunca editar entradas anteriores.
> Consultar só o último bloco para saber onde estamos.
> Atualizado pelo arquiteto (Claude no chat externo) ao fechar cada sprint.

---

## [CP-001] — Sprint 1 + 2 ✅
**Data:** 2026-03
**Entregue:**
- Setup completo: FastAPI + React/TypeScript + PostgreSQL/pgvector + Docker
- Schema inicial: projects, tasks, users
- Frontend: layout 3 colunas, board Kanban com drag-and-drop
- API CRUD completa para projetos e tarefas
- Proxy Vite /api → backend

**Versão:** 0.2.0
**Porta backend:** 8010 (8000 bloqueada no ambiente)
**Porta frontend:** 5180

---

## [CP-002] — Sprint 3A + 3B ✅
**Data:** 2026-03
**Entregue:**
- Groq integrado (llama-3.3-70b-versatile)
- Wizard de confirmação: full / compact / silent / block
- 6 operações via chat: create/update/delete/list task + create/list project
- Normalizer: expande gírias e abreviações antes do Groq
- Níveis de risco por operação (LOW/MEDIUM/HIGH/CRITICAL)
- Campos editáveis inline no wizard
- Nota de inferência visível ("urgente + hj → Q1")

**Versão:** 0.3.0

---

## [CP-003] — Sprint 3B patch ✅
**Data:** 2026-03
**Entregue:**
- ConformityEngine universal: título lapidado, nome fora do título
- Assignee_hint extraído antes de normalizar
- Formato título: [Assignee] · Verbo + Objeto · Contexto
- Prazo absoluto ISO 8601 + gap ao vivo no frontend
- Hook useConformField para formulários (onBlur → conformidade)
- Endpoint /api/agent/conform-field

**Modelos task:** assignee_id + due_date_iso adicionados
**Modelos user:** nickname + role adicionados

---

## [CP-004] — Sprint 3C ✅
**Data:** 2026-03
**Entregue:**
- Memória vetorial permanente: UserSemanticProfile + SemanticMemory
- search_memory() antes de chamar Groq (threshold 0.72)
- Embedding bag-of-words 64 dimensões + Jaccard fallback
- Perfil persiste no banco (não mais em RAM)
- Dicionário pessoal aprendido e salvo por usuário
- Endpoints: /memory/stats + /admin/profiles + /admin/visibility
- Migração: sprint3c_schema.sql

**Versão:** 0.4.0

---

## [CP-005] — Sprint 3D ✅
**Data:** 2026-03
**Entregue:**
- Voz via Groq Whisper (whisper-large-v3-turbo)
- Hook useVoiceInput: MediaRecorder → transcribe → pipeline normal
- Botão 🎤 no ChatPanel (vermelho pulsando = gravando, âmbar = transcrevendo)
- Mensagens de voz marcadas com tag 🎤 no chat
- Endpoint /api/voice/transcribe

**Versão:** 0.5.0

---

## [CP-006] — Sprint 3E ✅
**Data:** 2026-03
**Entregue:**
- Upload de contrato PDF → projeto + backlog completo
- doc_extractor.py → contract_parser.py → backlog_reviewer.py
- Segunda passagem (retokenização): review_notes + suggested_subtasks
- ContractWizard: revisão campo a campo antes de salvar
- Botão 📎 no ChatPanel (abre PDF ou planilha)
- ImportPage com aba PDF
- Endpoint /api/upload/contract + /contract/confirm

**Versão:** 0.6.0
**Dependência:** pdfplumber==0.11.0

---

## [CP-007] — Sprint 3F ✅
**Data:** 2026-03
**Entregue:**
- Import de .xlsx e .csv em lote
- sheet_extractor → sheet_mapper (Groq mapeia colunas) → sheet_processor
- SheetWizard: stepper 2 etapas (mapeamento → revisão tasks)
- ImportPage: duas abas independentes (PDF + planilha)
- ChatPanel 📎 detecta extensão → abre wizard correto
- file_id temporário com TTL 30min + limpeza após confirm
- Endpoint /api/upload/sheet + /sheet/confirm

**Versão:** 0.7.0
**Dependência:** openpyxl==3.1.2

---

## [CP-008] — Governança + Cockpit ✅
**Data:** 2026-03
**Entregue:**
- ARCHITECTURE.md — constituição do projeto (12 leis)
- .cursorrules — guardrail automático no Cursor
- PROMPT_MESTRE.md — prompt universal para qualquer ferramenta
- CURSOR_CONTEXT.md — contexto comprimido (<800 palavras) para o Cursor
- CHECKPOINT.md — este arquivo, log append-only de marcos
- Decisão: Claude no chat externo = cockpit/arquiteto
  Claude no Cursor = executor/auditor
  Sem duplicação de contexto, custo controlado

**Modelo de trabalho definido:**
  Chat externo → Spec + Cursor Prompt + Checklist
  Cursor Agent → executa
  Claude no Cursor → audita
  Checkpoint → atualizado ao fechar sprint

---

## [CP-016] V1.5.0 — fixes export + lixeira + erros UX
**Data:** 2026-03

**Entregue:**
- Exportação PDF/Excel: encoding seguro + colunas; tasks deletadas excluídas dos exports; `ExportMenu` com Bearer no fetch.
- Soft delete: `deleted_at` / `deleted_by`; restore; purge permanente só na lixeira; endpoints trash/restore/permanent.
- Frontend: `TrashPage`, item Lixeira na sidebar com badge, `ErrorToastHost` + mapa HTTP amigável no client `api` e fallbacks de rede.
- Activity: ação `restored` no feed.

**Pendente (fora deste CP):** branch `v1-fixes` → merge `main` → tag `v1.5.0`; V2 (`v2-dev`) conforme spec do arquiteto.

**Versão API backend:** 1.5.0 (conforme `main.py` na época do merge).

---

## [PRÓXIMO]
Sprint 4 — Dashboard ROI
ou
Sprint 5 — Multi-usuário + Auth
**Decisão pendente.**
