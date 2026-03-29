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

## [CP-017] Baseline / backup de versão — fim V1.x antes da Sprint V2
**Data:** 2026-03-25

**Função deste bloco:** congelar o estado “última V1 estável” antes de abrir trabalho V2. Não substitui tag Git — é o registro humano no log.

**Versão de referência:** **V1.5.0** (Git tag `v1.5.0` no repositório de entrega; API backend 1.5.0).

**O que entra no backup lógico (não apagar sem decisão):**
- **Core:** FastAPI + React/TS + PostgreSQL/pgvector + Groq; ConformityEngine + wizard de agente; layout Sidebar 220px | Board | Chat 320px.
- **V1.5 entregue:** soft delete + lixeira + restore + purge; export PDF/Xlsx corrigido; erros HTTP centralizados na instância `api` (+ exceção auth com mensagens amigáveis); `ErrorToast`, `TrashPage`, activity `restored`.
- **Fora de escopo V1:** schema dinâmico, templates de vertical, Kanban configurável por projeto, SchemaAgent — ficam exclusivamente na **Sprint V2** (branch `v2-dev` quando criada).

**Regra de trabalho a partir daqui:** não misturar entregas V2 em `main` até V1 estar explicitamente fechado no processo do arquiteto; desenvolvimento V2 em branch dedicada.

**Próximo marco esperado:** [CP-018] ou equivalente ao primeiro fecho parcial da Sprint V2 (conforme spec do arquiteto).

---

## [PRÓXIMO]
**Sprint V2** — schema dinâmico, campos customizados, templates de vertical, colunas Kanban configuráveis, agente de abstração (SchemaAgent) com wizard obrigatório, leis V2 em ARCHITECTURE.md.
**Branch sugerida:** `v2-dev` · **Base:** tag `v1.5.0` ou `main` alinhado a ela.

---

## [CP-018] Frente 1 — KanbanColumn + Task.status (fecho parcial V2)
**Data:** 2026-03-25

**Entregue (incremento sobre baseline V2 já existente):**
- `Task.status` → `String(100)` sem classe `TaskStatus` no modelo; migração PG em `main.py` para VARCHAR(100).
- `app/services/kanban_status.py` — validação de slug contra `kanban_columns` do projeto; `POST/PATCH` tasks e `PATCH …/status` retornam **422** se slug inválido; criação de task coage status inicial para coluna padrão se legado não bater.
- `POST /api/projects/` chama `ensure_project_kanban_defaults` após criar projeto (seed imediato de colunas).
- `Board.tsx` — colunas só da API (`useKanbanColumns`); sem fallback `STATUS_COLUMNS`; skeleton genérico; estado de erro se Kanban vazio/falha.
- `KanbanSettings.tsx` — `onError` na remoção com toast via `orchflow:api-error` (mensagem 400 do backend ou `friendlyHttpStatus`).
- Referência SQL: `backend/app/migrations/v2_kanban_columns.sql`.
- `CURSOR_CONTEXT.md` — versão API 2.0.0, routers V2, `kanban_status`, `useV2`.

**Nota para auditoria:** API de colunas permanece em **`/api/kanban/...`** (não `/api/projects/{id}/columns` da spec alternativa). Rotas canónicas documentadas em `ARCHITECTURE.md` / `api.ts`.

**Próximo:** Frente 2 — CustomField + ConformityEngine (refinar conforme spec do arquiteto).

---

## [CP-019] Frente 4 — SchemaAgent + wizard HIGH ✅
**Data:** 2026-03-26

**Entregue:**
- Backend: `backend/app/agent/schema_agent.py` refeito com `analyze_project_schema` read-only e `execute_accepted_suggestions` aplicando somente IDs em `accepted_ids`.
- Tipos Pydantic novos em `backend/app/schemas/schema_agent.py`: `SchemaSuggestion`, `SchemaAnalysisResult`, `SchemaApplyRequest`, `SchemaApplyResult`.
- Rotas canónicas: `GET /api/projects/{project_id}/schema-analysis` e `POST /api/projects/{project_id}/schema-apply`.
- `ActivityLog`: ação `schema_agent_applied` com snapshot de aceitos/rejeitados por projeto.
- Frontend: tipos SchemaAgent V2.3, `analyzeSchema/applySchema` em `services/api.ts`, hook `useSchemaAgent` em `hooks/useV2.ts`.
- UI: `frontend/src/components/schema/SchemaAgentWizard.tsx` com toggles por sugestão (HIGH default rejeitado), contador aceitas/rejeitadas e confirmação final em lote (dupla confirmação para HIGH).
- Integração no settings do board em `frontend/src/components/kanban/KanbanSettings.tsx`.
- API atualizada para `2.3.0` em `backend/app/main.py`; `CURSOR_CONTEXT.md` e `ARCHITECTURE.md` alinhados.

---

## [CP-020] Cleanup — redirect /agents para configurações ✅
**Data:** 2026-03-26

**Entregue:**
- `frontend/src/pages/AgentsPage.tsx` substituída por redirect imediato (`useEffect`) para o fluxo de configurações no board.
- Com projeto ativo (ou primeiro disponível): seleciona projeto e retorna para `view='board'` com toast de orientação para abrir configurações.
- Sem projeto: retorna para `view='board'` com toast `"Selecione um projeto para acessar as configurações."`.
- `frontend/src/App.tsx` atualizado para passar `firstProjectId`, `onSelectProject` e `onNavigate` ao novo `AgentsPage`.
- `frontend/src/components/layout/Sidebar.tsx` atualizado: item `agents` renomeado de **Agentes** para **Configurações**.

---

## [CP-021] Backup completo local + clone externo `leilaoflow` ✅
**Data:** 2026-03-26

**Objetivo:**
- Congelar checkpoint completo pós-fechamento V2.
- Criar cópia externa do workspace para continuidade isolada.

**Entregue:**
- Checkpoint completo registrado neste arquivo (append-only).
- Workspace `orchflow` clonado para pasta externa `C:\\Users\\fzeni\\OneDrive\\Projects\\leilaoflow`.

**Observações:**
- Operação de cópia local (sem alterar código funcional).
- Commit Git ficará para sincronização com o repositório de entrega (limitação de ambiente local sem `.git` ativo).

---

## [CP-021] Sprint 5 Fase 2 — auth completo 12/12 (em progresso) ✅
**Data:** 2026-03-26

**Fechado nesta fase:**
- Routers protegidos com `get_current_user` + `get_current_workspace` nos fluxos críticos de Sprint 5.
- Substituição de usos diretos de `user_id='default'` nos trechos migrados para `str(current_user.id)`.
- Login frontend com OAuth buttons, callback OAuth dedicado e roteamento mínimo por URL sem react-router.
- Header `X-Workspace-Id` enviado automaticamente no client e refresh automático de access token em 401.
- Migração `v3_auth.sql` com verificação final que bloqueia projetos sem `workspace_id`.
- `CURSOR_CONTEXT.md` atualizado com versão 3.0.0, leis 14/15 e nota `DISABLE_AUTH=true` dev-only.

---

## [CP-022] Ciclo de refinamento UX/UI ✅
**Data:** 2026-03

**Entregue:**
- Topbar fixa em 100% das telas + breadcrumb navegável sem duplicação
  (OrchFlow › Workspace › Projeto › View)
- Chat minimizável: recolhe para 30%, input sempre visível,
  badge de mensagem nova, persiste em localStorage
- Campo de input do chat: textarea com auto-resize 40px–160px,
  Enter envia / Shift+Enter quebra linha
- Avatares de assignee nos cards com cor estável por nome
- Feed de atividade colapsável no TaskDetailPanel (▸ Atividade)
  com nomes de usuário, ações em PT, tempo relativo
- Seletor de projeto no topo da sidebar com dropdown, busca inline,
  editar, clonar, excluir (+ endpoint POST /clone no backend)
- Fusão de projetos registrada no roadmap como Sprint F1 🔲

**Nota de produto:**
OrchFlow opera como framework de orquestração — não como produto de
gestão. Templates, CustomField, SchemaAgent e o regimento de agentes
são os pontos de extensão. Próximo ciclo natural: SDK + Marketplace.

**Versão:** 3.0.0 (sem bump — refinamento não é breaking change)

---

## [CP-023-pre] Declaração arquitetural — chassi do framework
**Data:** 2026-03
**Declarado pelo fundador:**
- Chassi imutável: Organização → Projeto → Backlog +
  Sprint → Tarefa → Subtarefa
- Sprint tem dois tipos: recorrente e encaixe
- Hierarquia é personalizável dentro do chassi,
  nunca no lugar dele
- OrchFlow é framework de orquestração baseado no
  modelo mental: Organização / Pessoas /
  Produtos ou Serviços / Processos
- Lei 16 adicionada ao ARCHITECTURE.md
- Roadmap reordenado: sprints 6–10 + F1
**Impacto:** reordena todo roadmap a partir da Sprint 6.
**Próximo passo:** CP-023 — seletor de projeto (fechar
o que está aberto antes de iniciar Sprint 6)

---

## [CP-023] Seletor de projeto no topo da sidebar ✅
**Data:** 2026-03
**Entregue:**
- ProjectSelector no topo da sidebar em todas as views
- Dropdown de troca com busca inline (quando > 5 projetos)
- Ações: editar (modal inline), clonar, excluir (com confirmação)
- POST /api/projects/{id}/clone — copia colunas + campos,
  não copia tasks/sprints/membros
- Clone seleciona projeto novo automaticamente + toast
- Excluir seleciona próximo projeto ou estado vazio
- Lista limitada a 5 com "ver todos (n)"
- ESC fecha dropdown e menu
- ActivityLog registra project_cloned
**Arquivos:** projects.py, api.ts, useData.ts,
ProjectSelector.tsx, Sidebar.tsx, styles.css
**Versão:** 3.0.0 (sem bump — feature incremental)

---

## [CP-024] Blindagem crítica de segurança ✅
**Data:** 2026-03
**Entregue:**
- Rate limiting: /auth/login 5/min, /register 3/min,
  /refresh 10/min por IP (slowapi)
- Refresh token migrado para httpOnly cookie —
  zero exposição em localStorage ou response body
- Boot aborta com RuntimeError se DISABLE_AUTH=true
  em ENVIRONMENT=production
- Zero text(f"...") em todo backend — SQL injection
  eliminado, 100% parametrizado
- Refresh token rotation: uso único, revoga anterior,
  token interceptado inútil após primeiro uso
- Middleware de limite de payload: 10MB por request
- Path params UUID tipados como UUID em todos os routers
- DELETE em cascade (coluna, campo) gera ActivityLog
  antes de executar
- Validação de força de senha: mín 8 chars,
  1 maiúscula, 1 número
**Verificação:** 9/9 ✅ + tsc zero erros + zero
  REFRESH_TOKEN_KEY residual + zero text(f" no backend
**Arquivos:** auth.py, auth_service.py, main.py,
  kanban.py, fields.py, workspaces.py, .env.example,
  AuthContext.tsx, api.ts, OAuthCallbackPage.tsx,
  types/index.ts

---

## [CP-025] Sprint 6 — Subtarefas ✅
**Data:** 2026-03
**Entregue:**
- parent_task_id em Task — sem nova tabela,
  compatível com schema existente
- Profundidade máxima 1 nível (sub-subtarefa = 422)
- Subtarefa valida mesmo projeto que pai
- GET /api/tasks/{id}/subtasks
- Contadores: subtask_count + completed_subtask_count
- SubtaskList: barra de progresso X/Y, criação inline,
  checkbox de conclusão, delete com confirmação
- TaskCard: badge "X/Y ◻" (verde/amarelo/cinza)
- Cascade: excluir pai deleta subtarefas
- CURSOR_CONTEXT.md atualizado
**Verificação:** 10/10 ✅ + tsc zero erros
**Arquivos:** v3_subtasks.sql, task.py, tasks.py,
  types/index.ts, api.ts, useData.ts, SubtaskList.tsx,
  TaskDetailPanel.tsx, TaskCard.tsx, styles.css,
  CURSOR_CONTEXT.md
**Chassi:** Organização → Projeto → Backlog →
  Sprint → Tarefa → Subtarefa — COMPLETO ✅

---

## [CP-026] Sprint 7 — Sprint tipada ✅
**Data:** 2026-03
**Entregue:**
- Sprint type: standard, recorrente, encaixe
- Sprint recorrente: recurrence_unit, recurrence_interval,
  auto_create, parent_sprint_id, sequence_number
- Fechar sprint move tasks não concluídas para backlog
- Fechar sprint recorrente com auto_create=True cria
  próximo sprint automaticamente
- Próximo sprint copia tasks is_recurring=True
  (novas instâncias, não move)
- ActivityLog: sprint_closed + sprint_auto_created
- SprintPanel com badge por tipo (cinza/azul/amarelo)
- Wizard de confirmação ao fechar (tasks → backlog)
- is_recurring toggle no TaskDetailPanel
- Ícone ↻ no TaskCard para tasks recorrentes
- Todos endpoints com auth + assert_project_in_workspace
**Verificação:** 12/12 ✅
**Arquivos:** v3_sprint_types.sql, sprint.py, task.py,
  sprint_service.py, sprints.py, tasks.py, main.py,
  types/index.ts, useSprints.ts, SprintPanel.tsx,
  TaskCard.tsx, styles.css, CURSOR_CONTEXT.md

---

## [CP-027] Sprint 7.5 — AI Token Manager ✅
**Data:** 2026-03
**Entregue:**
- Tabelas: ai_engines, ai_wallets, ai_usage_logs,
  ai_wallet_transactions
- Seed: 4 motores (Groq LLaMA, Groq Whisper,
  GPT-4o, Claude Sonnet)
- ai_router.py: route_request verifica saldo antes
  de chamar motor — HTTP 402 se insuficiente
- Debit + log atômicos com rollback em exceção
- Seleção de motor por capability + custo
- intent_engine, contract_parser, sheet_mapper
  integrados ao ai_router (fallback graceful)
- voice.py loga transcrição em ai_usage_logs
- 5 endpoints: wallet, usage, engines, credit, alert
- POST /wallet/credit exige Admin (HTTP 403)
- API keys OPENAI/ANTHROPIC só em variáveis de ambiente
- AITokensPage: 5 seções completas
- Sidebar: item "IA & Créditos" com badge saldo baixo
- Lei registrada: "Toda chamada de IA passa pelo
  ai_router — nunca chamar motor diretamente"
**Nota:** schema_agent.py é heurística pura —
  não chama motor de IA, sem integração necessária
**Verificação:** 13/13 ✅ + tsc zero erros
**Arquivos:** v3_ai_tokens.sql, ai_engine.py,
  ai_router.py, intent_engine.py, contract_parser.py,
  sheet_mapper.py, voice.py, ai_tokens.py, main.py,
  types/index.ts, api.ts, useAITokens.ts,
  AITokensPage.tsx, App.tsx, Sidebar.tsx,
  CURSOR_CONTEXT.md

---

## [CP-028] Sprint 8 — Organização como Entidade ✅
**Data:** 2026-03-28
**Entregue:**
- Migration v3_organization.sql: 10 colunas em workspaces
  + tabela org_vocabulary (1:1) + seed ON CONFLICT
- workspace.py model: campos de identidade + OrgVocabulary
  (term_project, term_task, term_sprint, term_backlog,
  term_member, term_client) + vocabulary relationship
- schemas/workspace.py: WorkspaceUpdate, OrgVocabularyUpdate,
  OrgVocabularyOut, WorkspaceOut Pydantic schemas
- onboarding_service.py: advance (5 passos) + complete
  + reset, ActivityLog em cada etapa
- workspaces.py router reescrito: PATCH identity,
  PATCH vocabulary, onboarding advance/complete/reset,
  GET /mine retorna identidade completa + vocabulário
- main.py: migração Sprint 8 no startup (idempotente)
- types/index.ts: Workspace estendido + OrgVocabulary interface
- api.ts: getWorkspace, updateWorkspace, getVocabulary,
  updateVocabulary, advanceOnboarding, completeOnboarding,
  resetOnboarding
- VocabularyContext.tsx: VocabularyProvider + useVocabulary
  + t(key) — termos customizados da organização
- OnboardingPage.tsx: wizard 5 passos (nome, vertical,
  missão, vocabulário, template), progress bar, skip
- OrgSettingsPage.tsx: 5 seções + danger zone (reset)
- App.tsx: VocabularyProvider wrapper, primary_color → --accent,
  showOnboarding auto-trigger, case 'org_settings'
- Sidebar.tsx: 'org_settings' no AppView + NAV_ITEMS
- Topbar.tsx: VIEW_LABELS['org_settings'] e ['ai_tokens']
- styles.css: .ob-* (onboarding) + .org-* (org settings)
- CURSOR_CONTEXT.md: Lei 21, Sprint 8 ✅, endpoints Sprint 8
**Lei registrada (21):** Vocabulário customizado sempre via
  VocabularyContext.t(key) — nunca hardcode de termos como
  "Projeto", "Tarefa", "Sprint" nos componentes
**Verificação:** tsc --noEmit zero erros ✅
**Arquivos:** v3_organization.sql, workspace.py (model),
  schemas/workspace.py, onboarding_service.py,
  routers/workspaces.py, main.py, types/index.ts,
  api.ts, VocabularyContext.tsx, OnboardingPage.tsx,
  OrgSettingsPage.tsx, App.tsx, Sidebar.tsx, Topbar.tsx,
  styles.css, CURSOR_CONTEXT.md

---

## [CP-029] Auditoria de segurança — 8 correções + hardening ✅
**Data:** 2026-03-28

**Entregue:**
- **CORREÇÃO 1 — Headers HTTP de segurança:** SecurityHeadersMiddleware
  adicionado ao main.py (X-Content-Type-Options, X-Frame-Options,
  Referrer-Policy, Permissions-Policy). JWT_SECRET validado no boot.
- **CORREÇÃO 2 — Banco de dados:** pool_pre_ping, pool_recycle=1800,
  SSL obrigatório em produção (sslmode=require). database.py hardened.
- **CORREÇÃO 3 — Container não-root:** Dockerfile com adduser appuser +
  chown /app. Processo corre como usuário sem privilégios.
- **CORREÇÃO 3C — OAuth CSRF + one-time code:** state cookie httpOnly
  10min em /auth/google e /auth/github. Callback valida state vs cookie.
  Token não mais na URL — substituído por one-time code (60s TTL) via
  /auth/oauth/exchange. OAuthCallbackPage.tsx reescrita para usar ?code=.
- **CORREÇÃO 4 — Multi-tenant isolation:** executor.py + upload.py +
  agent.py filtram todos os dados por workspace_id. Project.workspace_id
  verificado antes de qualquer operação. Endpoint /execute valida projeto
  pertence ao workspace antes de executar.
- **CORREÇÃO 5 — Rate limiting por usuário + confirmação HMAC:**
  Rate limiting via slowapi por user_id (não só IP) em /interpret
  (30/min), /execute (20/min), /transcribe (10/min). Confirmation token
  HMAC-SHA256 (5min TTL) vincula intent ao workspace — previne replay.
  access_token removido do localStorage — apenas memória (singleton).
- **CORREÇÃO 6 — Voice 415 + sanitização:** MIME inválido retorna 415
  (antes ignorado). Stack trace nunca exposto — except Exception → 500
  genérico.
- **CORREÇÃO 7 — Invite token hash:** SHA-256 do token salvo no banco;
  raw token enviado por e-mail; workspaces.py retorna raw_token da tuple.
- **CORREÇÃO 8 — Admin scope por workspace:** _assert_workspace_admin()
  scoped ao workspace_id do path em todos os 6 endpoints admin.
  Dependência require_admin substituída.
- **FIX SESSION — checkAuth explícito:** checkAuth não depende mais do
  interceptor como side-effect. Chama /auth/refresh explicitamente antes
  de getMe() — zero 401s desnecessários no console.
- **FIX DEADLOCK — interceptor guard:** interceptor nunca tenta refresh
  se a requisição que falhou é o próprio /auth/refresh (evita loop circular).
- **Dashboard como tela inicial:** App.tsx inicia em view='dashboard';
  Sidebar.tsx com Dashboard no topo do menu.

**Score final auditoria:** 16/16 ✅
**Verificação:** zero 401s espúrios + zero stack traces expostos +
  zero access_token em localStorage + HMAC vinculado a workspace.
**Arquivos:** main.py, database.py, Dockerfile, auth.py, auth_service.py,
  agent.py, executor.py, upload.py, voice.py, workspaces.py,
  workspace_service.py, dependencies.py, AuthContext.tsx, api.ts,
  OAuthCallbackPage.tsx, App.tsx, Sidebar.tsx
