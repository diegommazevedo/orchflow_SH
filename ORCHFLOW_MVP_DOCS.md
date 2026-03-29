# OrchFlow v3.0.0 — Documentação Analítica do MVP

> **Checkpoint:** `v3.0.0-mvp` · Deploy: Railway (backend) + Vercel (frontend) · Data: 29/03/2026

---

## Índice

1. [Visão Geral](#1-visão-geral)
2. [Arquitetura do Sistema](#2-arquitetura-do-sistema)
3. [Backend — Análise Completa](#3-backend--análise-completa)
4. [Banco de Dados — Schema Completo](#4-banco-de-dados--schema-completo)
5. [Frontend — Análise Completa](#5-frontend--análise-completa)
6. [Telas & Interface](#6-telas--interface)
7. [Fluxos Principais](#7-fluxos-principais)
8. [Integrações Externas](#8-integrações-externas)
9. [Deploy & Infraestrutura](#9-deploy--infraestrutura)
10. [Segurança](#10-segurança)

---

## 1. Visão Geral

**OrchFlow** é um sistema de gestão de projetos orientado por IA, construído para times que trabalham com contratos, backlogs e sprints. O MVP cobre:

| Pilar | Descrição |
|---|---|
| **Gestão de Projetos** | Kanban, Backlog, Sprint, Matrix Eisenhower, Timeline |
| **IA Assistida** | Parsing de contratos PDF, importação de planilhas, agente de intenção, transcrição de voz |
| **Multi-tenant** | Workspaces isolados, vocabulário customizável, membros com roles |
| **Produtividade** | Sessões focus (Pomodoro), mood tracking, ROI analytics |
| **Exportação** | PDF e XLSX de backlog, resumo e relatório de tempo |

---

## 2. Arquitetura do Sistema

```
┌─────────────────────────────────────────────────────────────────┐
│                         USUÁRIO / BROWSER                       │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTPS
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    VERCEL (Frontend CDN)                         │
│  React 18 + TypeScript + Vite · orchflow-sh.vercel.app          │
│                                                                  │
│  ┌─────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │
│  │ Kanban  │ │ Sprint   │ │ Matrix   │ │ AI Chat Panel    │   │
│  │  Board  │ │  Page    │ │Eisenhower│ │ (Intent Parser)  │   │
│  └─────────┘ └──────────┘ └──────────┘ └──────────────────┘   │
│                                                                  │
│  ┌─────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │
│  │ Import  │ │   ROI    │ │ AI Tokens│ │  Org Settings    │   │
│  │ Wizard  │ │Dashboard │ │  Wallet  │ │  + Vocabulary    │   │
│  └─────────┘ └──────────┘ └──────────┘ └──────────────────┘   │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTPS (VITE_API_URL)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              RAILWAY (Backend API)                               │
│  FastAPI 0.111 · Python 3.11 · Uvicorn                          │
│  orchflowsh-production.up.railway.app · Port 8080               │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Middleware Stack (outermost → innermost)               │   │
│  │  OrchFlowCorsGuardMiddleware                           │   │
│  │    → CORSMiddleware (explicit origins + regex)         │   │
│  │      → LimitRequestSizeMiddleware (10MB)               │   │
│  │        → SecurityHeadersMiddleware                     │   │
│  │          → FastAPI Router                              │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  20 Routers · 23 Tabelas · Rate Limiting (slowapi)              │
└──────────────┬──────────────────────────┬───────────────────────┘
               │ psycopg2                 │ httpx
               ▼                         ▼
┌──────────────────────┐    ┌────────────────────────────────────┐
│  PostgreSQL (Railway)│    │  APIs Externas                     │
│  23 tabelas          │    │  ┌──────────────┐ ┌─────────────┐ │
│  pgvector enabled    │    │  │  Groq API    │ │ Google OAuth│ │
│  postgres-volume     │    │  │  (LLaMA 3)   │ │ GitHub OAuth│ │
└──────────────────────┘    │  └──────────────┘ └─────────────┘ │
                            └────────────────────────────────────┘
```

---

## 3. Backend — Análise Completa

### 3.1 Estrutura de Arquivos

```
backend/
├── app/
│   ├── main.py               # Entrypoint: middlewares, routers, startup
│   ├── database.py           # Engine SQLAlchemy, SessionLocal
│   ├── models/               # 14 arquivos de modelos ORM
│   │   ├── user.py
│   │   ├── workspace.py
│   │   ├── project.py
│   │   ├── task.py
│   │   ├── sprint.py
│   │   ├── kanban.py
│   │   ├── activity.py
│   │   ├── focus.py
│   │   ├── schema.py
│   │   ├── template.py
│   │   ├── ai_engine.py
│   │   ├── memory.py
│   │   └── refresh_token.py
│   ├── routers/              # 20 routers FastAPI
│   │   ├── auth.py
│   │   ├── tasks.py
│   │   ├── projects.py
│   │   ├── workspaces.py
│   │   ├── sprints.py
│   │   ├── kanban.py
│   │   ├── comments.py
│   │   ├── focus.py
│   │   ├── analytics.py
│   │   ├── agent.py
│   │   ├── upload.py
│   │   ├── voice.py
│   │   ├── fields.py
│   │   ├── custom_fields.py
│   │   ├── templates.py
│   │   ├── export.py
│   │   ├── ai_tokens.py
│   │   ├── roi.py
│   │   └── schema_agent.py
│   ├── services/             # Lógica de negócio
│   ├── agent/                # Motor de IA: parsing, memória, conformidade
│   ├── auth/                 # JWT, OAuth, dependencies
│   ├── v2_seed.py            # Seed de colunas Kanban
│   └── scripts/
│       └── create_admin.py   # Criação de admin inicial
├── requirements.txt
├── Dockerfile
└── .env
```

### 3.2 Mapa de Endpoints

```
/api/auth/
  POST  /register          — Cadastro (rate: 3/min)
  POST  /login             — Login email+senha (rate: 10/min)
  POST  /refresh           — Renovar access token
  POST  /logout            — Revogar refresh token
  GET   /me                — Perfil do usuário autenticado
  GET   /google            — Iniciar OAuth Google
  GET   /google/callback   — Callback OAuth Google
  GET   /github            — Iniciar OAuth GitHub
  GET   /github/callback   — Callback OAuth GitHub
  POST  /oauth/exchange    — Trocar code por token

/api/projects/
  GET   /                  — Listar projetos do workspace
  POST  /                  — Criar projeto
  GET   /{id}              — Detalhe do projeto
  PATCH /{id}              — Editar projeto
  DELETE /{id}             — Deletar projeto
  POST  /{id}/apply-template — Aplicar template

/api/tasks/
  GET   /                  — Listar tasks (filtro: project_id, status, quadrant)
  POST  /                  — Criar task
  GET   /{id}              — Detalhe da task
  PATCH /{id}              — Editar task
  DELETE /{id}             — Soft-delete task
  POST  /{id}/status       — Mover status (Kanban slug)
  POST  /{id}/time         — Registrar tempo gasto

/api/sprints/
  GET   /project/{id}      — Listar sprints do projeto
  POST  /                  — Criar sprint
  PATCH /{id}              — Editar sprint
  DELETE /{id}             — Deletar sprint
  POST  /{id}/start        — Iniciar sprint (→ status: active)
  POST  /{id}/complete     — Concluir sprint (+velocidade)
  POST  /{id}/tasks        — Adicionar tasks ao sprint
  DELETE /{id}/tasks/{tid} — Remover task do sprint
  GET   /{id}/board        — Board do sprint com colunas

/api/kanban/
  GET   /{project_id}            — Colunas do projeto
  POST  /{project_id}            — Criar coluna
  PATCH /{project_id}/{col_id}   — Editar coluna
  DELETE /{project_id}/{col_id}  — Deletar coluna
  POST  /reorder                 — Reordenar colunas

/api/upload/
  POST  /detect            — Detectar tipo de arquivo (pdf/xlsx/csv/audio)
  POST  /contract          — Parsear contrato PDF → tasks via Groq
  POST  /contract/confirm  — Confirmar tasks extraídas → persistir
  POST  /sheet             — Mapear planilha → tasks
  POST  /sheet/confirm     — Confirmar mapeamento → persistir

/api/voice/
  POST  /transcribe        — Transcrever áudio via Groq Whisper (max 25MB)

/api/agent/
  POST  /parse             — Parsear intenção de linguagem natural
  POST  /parse/confirm     — Confirmar ação do agente
  GET   /memory/stats      — Stats de memória semântica

/api/export/
  GET   /backlog/{id}              — Exportar backlog (PDF ou XLSX)
  GET   /project/{id}/summary      — Exportar resumo do projeto (PDF)
  GET   /time/{id}                 — Exportar relatório de tempo (XLSX)

/api/focus/
  POST  /start             — Iniciar sessão focus
  POST  /{session_id}/end  — Encerrar sessão focus + mood
  GET   /active/{user_id}  — Sessão ativa
  GET   /history/{user_id} — Histórico de sessões
  POST  /snapshot          — Registrar snapshot de produtividade

/api/analytics/
  GET   /roi/{user_id}         — Métricas ROI
  GET   /heatmap/{user_id}     — Heatmap 90 dias

/api/comments/
  GET   /task/{task_id}    — Comentários da task
  POST  /task/{task_id}    — Adicionar comentário
  DELETE /{comment_id}     — Soft-delete comentário

/api/workspaces/
  POST  /workspaces/             — Criar workspace
  GET   /workspaces/mine         — Workspaces do usuário
  GET   /workspaces/{id}         — Detalhe workspace
  PATCH /workspaces/{id}         — Editar workspace
  GET   /workspaces/{id}/vocabulary   — Vocabulário customizado
  PATCH /workspaces/{id}/vocabulary   — Atualizar vocabulário
  POST  /workspaces/{id}/invite       — Convidar membro
  POST  /workspaces/{id}/members      — Listar membros
  DELETE /workspaces/{id}/members/{uid} — Remover membro

/api/fields/           — Custom Fields por projeto
/api/templates/        — Templates verticais
/api/ai/wallet         — AI Wallet (saldo, uso, alertas)
/api/roi/{user_id}     — ROI do usuário
```

### 3.3 Motor de IA (Agent)

```
┌────────────────────────────────────────────┐
│            AgentEngine                     │
│                                            │
│  Input: texto em linguagem natural         │
│         (ex: "criar task urgente amanhã")  │
│                                            │
│  1. IntentParser (Groq LLaMA 3)            │
│     → detecta: intent, entities, urgency   │
│                                            │
│  2. ConformityEngine                       │
│     → valida campos obrigatórios           │
│     → normaliza datas, status, quadrant    │
│                                            │
│  3. MemoryStore (pgvector)                 │
│     → recupera contexto semântico          │
│     → abbreviations do usuário             │
│                                            │
│  4. ActionProposal                         │
│     → retorna JSON estruturado para        │
│        confirmação do usuário              │
│                                            │
│  5. Confirm → persist no banco             │
└────────────────────────────────────────────┘
```

### 3.4 Pipeline de Importação de Contrato

```
Arquivo PDF
    │
    ▼
POST /upload/detect
    │ tipo: "contract_pdf"
    ▼
POST /upload/contract
    │ pdfplumber extrai texto
    │ Groq LLaMA 3 processa:
    │   → título do projeto
    │   → partes envolvidas
    │   → prazo / valor
    │   → lista de tarefas
    │   → contrato_summary
    ▼
ReviewTaskList (frontend)
    │ usuário revisa e ajusta
    ▼
POST /upload/contract/confirm
    │ cria Project + Tasks no banco
    │ kanban columns aplicadas
    ▼
Board Kanban populado ✅
```

---

## 4. Banco de Dados — Schema Completo

### 4.1 Diagrama Entidade-Relacionamento

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          DOMÍNIO: AUTH & WORKSPACE                       │
│                                                                          │
│  ┌───────────┐         ┌──────────────────┐         ┌───────────────┐  │
│  │  users    │────────►│workspace_members │◄────────│  workspaces   │  │
│  │─────────  │  1:N    │──────────────────│  N:1    │───────────────│  │
│  │ id (PK)   │         │ workspace_id(FK) │         │ id (PK)       │  │
│  │ name      │         │ user_id (FK)     │         │ name          │  │
│  │ email     │         │ role             │         │ slug          │  │
│  │ nickname  │         └──────────────────┘         │ vertical      │  │
│  │ role      │                                       │ primary_color │  │
│  │ password  │         ┌──────────────────┐         │ timezone      │  │
│  │ google_id │         │ org_vocabulary   │         └───────────────┘  │
│  │ github_id │         │──────────────────│                            │
│  │ avatar_url│         │ workspace_id(FK) │         ┌───────────────┐  │
│  │ is_active │         │ term_project     │         │workspace_     │  │
│  │ last_login│         │ term_task        │         │invites        │  │
│  └─────┬─────┘         │ term_sprint      │         └───────────────┘  │
│        │               └──────────────────┘                            │
│        │  ┌──────────────────┐                                         │
│        └─►│ refresh_tokens   │                                         │
│           └──────────────────┘                                         │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│                      DOMÍNIO: PROJETOS & TAREFAS                         │
│                                                                          │
│  ┌───────────────┐     ┌─────────────────┐     ┌────────────────────┐  │
│  │  workspaces   │────►│    projects     │────►│  kanban_columns    │  │
│  └───────────────┘     │─────────────────│     │────────────────────│  │
│                        │ id (PK)         │     │ id (PK)            │  │
│                        │ name            │     │ project_id (FK)    │  │
│                        │ description     │     │ name               │  │
│                        │ status          │     │ slug               │  │
│                        │ workspace_id(FK)│     │ color              │  │
│                        └────────┬────────┘     │ order              │  │
│                                 │              │ is_done            │  │
│                                 │ 1:N          └────────────────────┘  │
│                                 ▼                                       │
│                        ┌─────────────────┐                             │
│                        │     tasks       │◄──────────────────────┐     │
│                        │─────────────────│                        │     │
│                        │ id (PK)         │  self-ref (subtasks)   │     │
│                        │ title           │  parent_task_id (FK)───┘     │
│                        │ description     │                              │
│                        │ status          │──► kanban_column.slug        │
│                        │ quadrant (q1-q4)│                              │
│                        │ time_spent_min  │  ┌─────────────────────┐    │
│                        │ due_date_iso    │─►│    comments         │    │
│                        │ project_id (FK) │  │─────────────────────│    │
│                        │ assignee_id(FK) │  │ id, task_id, user_id│    │
│                        │ deleted_at      │  │ body, mentions      │    │
│                        │ is_recurring    │  │ deleted_at          │    │
│                        └────────┬────────┘  └─────────────────────┘    │
│                                 │                                       │
│                        ┌────────┴────────┐   ┌────────────────────┐   │
│                        │  sprint_tasks   │   │  activity_logs     │   │
│                        │  (join table)   │   │────────────────────│   │
│                        └────────┬────────┘   │ entity_type        │   │
│                                 │            │ entity_id          │   │
│                        ┌────────┴────────┐   │ action             │   │
│                        │    sprints      │   │ extra_data (JSONB) │   │
│                        │─────────────────│   └────────────────────┘   │
│                        │ id, project_id  │                             │
│                        │ name, goal      │                             │
│                        │ status          │                             │
│                        │ start/end_date  │                             │
│                        │ velocity        │                             │
│                        │ type            │                             │
│                        └─────────────────┘                             │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│                      DOMÍNIO: IA & PRODUTIVIDADE                         │
│                                                                          │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐  │
│  │  focus_sessions  │    │   ai_wallets     │    │ vertical_        │  │
│  │──────────────────│    │──────────────────│    │ templates        │  │
│  │ user_id (FK)     │    │ workspace_id(FK) │    │──────────────────│  │
│  │ task_id (FK)     │    │ balance_usd      │    │ name, slug       │  │
│  │ sprint_id (FK)   │    │ total_spent_usd  │    │ custom_fields    │  │
│  │ mood (enum)      │    │ alert_threshold  │    │  (JSONB)         │  │
│  │ is_pomodoro      │    └──────────────────┘    │ kanban_columns   │  │
│  └──────────────────┘                            │  (JSONB)         │  │
│                           ┌──────────────────┐   └──────────────────┘  │
│  ┌──────────────────┐    │  ai_usage_logs   │                          │
│  │ productivity_    │    │──────────────────│   ┌──────────────────┐   │
│  │ snapshots        │    │ workspace_id     │   │  custom_fields   │   │
│  │──────────────────│    │ user_id          │   │──────────────────│   │
│  │ user_id          │    │ engine_id        │   │ project_id (FK)  │   │
│  │ date (ISO)       │    │ input_tokens     │   │ field_type       │   │
│  │ focus_minutes    │    │ output_tokens    │   │ options (JSONB)  │   │
│  │ tasks_completed  │    │ cost_usd         │   └──────────────────┘   │
│  │ mood_avg (0-2)   │    └──────────────────┘                          │
│  └──────────────────┘                                                   │
│                           ┌──────────────────────────────────────────┐  │
│  ┌──────────────────┐    │       semantic_memories                   │  │
│  │ user_semantic_   │    │──────────────────────────────────────────│  │
│  │ profiles         │    │ user_id (FK)                              │  │
│  │──────────────────│    │ content                                   │  │
│  │ user_id (FK)     │    │ embedding (pgvector)                      │  │
│  │ abbreviations    │    └──────────────────────────────────────────┘  │
│  │ preferences      │                                                   │
│  │ visibility       │                                                   │
│  └──────────────────┘                                                   │
└──────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Resumo das 23 Tabelas

| # | Tabela | Domínio | Registros Esperados |
|---|--------|---------|---------------------|
| 1 | `users` | Auth | Usuários da plataforma |
| 2 | `workspaces` | Workspace | Organizações/times |
| 3 | `workspace_members` | Workspace | Membros por workspace |
| 4 | `workspace_invites` | Workspace | Convites pendentes |
| 5 | `org_vocabulary` | Workspace | Vocabulário customizado |
| 6 | `refresh_tokens` | Auth | Tokens de renovação |
| 7 | `projects` | Projeto | Projetos do workspace |
| 8 | `tasks` | Tarefa | Tarefas (c/ soft-delete) |
| 9 | `kanban_columns` | Kanban | Colunas por projeto |
| 10 | `sprints` | Sprint | Sprints do projeto |
| 11 | `sprint_tasks` | Sprint | Join sprints ↔ tasks |
| 12 | `comments` | Atividade | Comentários de tasks |
| 13 | `activity_logs` | Atividade | Log imutável de eventos |
| 14 | `focus_sessions` | Focus | Sessões Pomodoro/livre |
| 15 | `productivity_snapshots` | Focus | Snapshots diários |
| 16 | `custom_fields` | Schema | Campos customizados |
| 17 | `custom_field_values` | Schema | Valores dos campos |
| 18 | `vertical_templates` | Template | Templates por vertical |
| 19 | `ai_engines` | IA | Engines disponíveis |
| 20 | `ai_wallets` | IA | Saldo por workspace |
| 21 | `ai_usage_logs` | IA | Uso de tokens |
| 22 | `ai_wallet_transactions` | IA | Créditos/débitos |
| 23 | `semantic_memories` | IA | Memórias vetoriais |

---

## 5. Frontend — Análise Completa

### 5.1 Stack Técnica

| Tecnologia | Versão | Uso |
|---|---|---|
| React | 18 | UI framework |
| TypeScript | 5.x | Tipagem estática |
| Vite | 5.4 | Build tool |
| Axios | — | HTTP client com interceptors |
| CSS custom | — | Design system próprio |

### 5.2 Estrutura de Arquivos

```
frontend/src/
├── App.tsx                    # Router principal + layout shell
├── main.tsx                   # Entrypoint React
├── pages/                     # 16 páginas
├── components/                # Componentes organizados por domínio
│   ├── agent/                 # SchemaAgentPanel
│   ├── auth/                  # ProtectedRoute
│   ├── backlog/               # Board, TaskCard, TaskDetailPanel,
│   │                          #   TaskComments, SubtaskList, ActivityFeed
│   ├── fields/                # CustomFieldForm, Renderer, Panel, TaskFields
│   ├── focus/                 # FocusWidget (Pomodoro)
│   ├── kanban/                # KanbanSettings
│   ├── layout/                # Sidebar, Topbar, ChatPanel, ProjectSelector
│   ├── schema/                # SchemaAgentWizard
│   ├── sprint/                # SprintCard, SprintPanel
│   ├── templates/             # TemplateSelector, TemplateWizard
│   ├── ui/                    # ErrorToast, ExportMenu
│   └── upload/                # ContractWizard, SheetWizard,
│                              #   ReviewTaskList, SmartDropzone
├── hooks/                     # 14 custom hooks
├── services/                  # api.ts, roiApi.ts, sheetApi.ts
├── contexts/                  # AuthContext, VocabularyContext
├── types/                     # Tipos TypeScript
└── utils/                     # array.ts, avatar.ts
```

### 5.3 Mapa de Rotas

```
/login              → LoginPage
/register           → RegisterPage
/workspace_new      → WorkspaceNewPage
/auth/callback      → OAuthCallbackPage
/                   → App Shell (autenticado)
    view=board      → Board.tsx (Kanban — padrão)
    view=list       → ListView
    view=matrix     → MatrixPage (Eisenhower)
    view=timeline   → TimelinePage
    view=sprint     → SprintPage
    /import         → ImportPage
    /roi            → RoiDashboard
    /agents         → AgentsPage
    /trash          → TrashPage
    /ai_tokens      → AITokensPage
    /org_settings   → OrgSettingsPage
```

### 5.4 Axios Instance & Auth

```typescript
// services/api.ts
const API_ROOT = import.meta.env.VITE_API_URL ?? ''

const api = axios.create({
  baseURL: API_ROOT ? `${API_ROOT}/api` : '/api',
  headers: { 'Content-Type': 'application/json' }
})

// Interceptor: injeta Authorization: Bearer <token>
// Interceptor: em 401, tenta /auth/refresh automaticamente
// Interceptor: em falha de refresh, redireciona para /login
```

---

## 6. Telas & Interface

### 6.1 Layout Shell

```
┌─────────────────────────────────────────────────────────────────────┐
│  TOPBAR                                                              │
│  [OrchFlow Logo] [ProjectSelector ▼] [views: Board|List|Matrix|...] │
│                                          [Focus ⏱] [Export ↓] [👤] │
├──────────┬──────────────────────────────────────────────────────────┤
│ SIDEBAR  │  ÁREA PRINCIPAL (view-dependente)                        │
│          │                                                           │
│ [Search] │                                                           │
│          │                                                           │
│ Projects │                                                           │
│  ├ Proj1 │                                                           │
│  └ Proj2 │                                                           │
│          │                                                           │
│ Sprints  │                                                           │
│  ├ Spr1  │                                                           │
│  └ Spr2  │                                                           │
│          │                                                           │
│ ─────── │                                                           │
│ Import   │                                                           │
│ ROI      │                                                           │
│ Agentes  │                                                           │
│ ─────── │                                                           │
│ Workspace│                                                           │
│ Config   │                                                           │
└──────────┴──────────────────────────────────────────────────────────┘
                                   │
                          Chat Panel (lateral direito)
                          [Input: "criar task urgente..."] [🎤]
```

### 6.2 Tela: Kanban Board

```
┌──────────────────────────────────────────────────────────────────────────┐
│  [ + Nova Task ]                                        [Exportar ↓]     │
│                                                                          │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐  │
│  │  A FAZER  (3)│ │ EM CURSO  (2)│ │  REVISÃO  (1)│ │  FEITO    (4)│  │
│  │──────────────│ │──────────────│ │──────────────│ │──────────────│  │
│  │ ┌──────────┐ │ │ ┌──────────┐ │ │ ┌──────────┐ │ │ ┌──────────┐ │  │
│  │ │Task Card │ │ │ │Task Card │ │ │ │Task Card │ │ │ │Task Card │ │  │
│  │ │ [Q2] 🔴  │ │ │ │ [Q1] 🔴  │ │ │ │ [Q3] 🟡  │ │ │ │ [Q4] 🟢  │ │  │
│  │ │ Assignee │ │ │ │ Assignee │ │ │ │ Assignee │ │ │ │ Assignee │ │  │
│  │ │ Due: 3/4 │ │ │ │ Due: 2/4 │ │ │ │ Due: 5/4 │ │ │ │ ──────── │ │  │
│  │ └──────────┘ │ │ └──────────┘ │ │ └──────────┘ │ │ └──────────┘ │  │
│  │ ┌──────────┐ │ │ ┌──────────┐ │ │              │ │ ┌──────────┐ │  │
│  │ │Task Card │ │ │ │Task Card │ │ │   [ + Add ]  │ │ │Task Card │ │  │
│  │ └──────────┘ │ │ └──────────┘ │ │              │ │ └──────────┘ │  │
│  │ [ + Add ]   │ │ [ + Add ]   │ │              │ │              │  │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘

  Task Detail Panel (lateral direito ao clicar em card):
  ┌──────────────────────────┐
  │ Título da Task        [✕]│
  │ ─────────────────────── │
  │ Status:  [Em Curso  ▼]  │
  │ Quadrant:[Q1        ▼]  │
  │ Assignee:[Avatar    ▼]  │
  │ Due Date:[── / ── / ──] │
  │ Sprint:  [Sprint 2  ▼]  │
  │ ─────────────────────── │
  │ Descrição...            │
  │ ─────────────────────── │
  │ Custom Fields           │
  │  Campo1: valor          │
  │  Campo2: valor          │
  │ ─────────────────────── │
  │ Subtasks (2)            │
  │  ☑ Subtask concluída    │
  │  ☐ Subtask pendente     │
  │ ─────────────────────── │
  │ Comentários             │
  │  👤 Comentário...       │
  │ [Adicionar comentário]  │
  │ ─────────────────────── │
  │ Atividade recente       │
  └──────────────────────────┘
```

### 6.3 Tela: Matrix Eisenhower

```
┌──────────────────────────────────────────────────────────┐
│            MATRIX EISENHOWER                             │
│                                                          │
│            URGENTE          NÃO URGENTE                 │
│         ┌─────────────────┬─────────────────┐           │
│         │  Q1 — FAZER     │  Q2 — PLANEJAR  │           │
│ IMPOR-  │  ───────────    │  ────────────── │           │
│ TANTE   │  [Task A] 🔴    │  [Task C] 🟡    │           │
│         │  [Task B] 🔴    │  [Task D] 🟡    │           │
│         │                 │                 │           │
│         ├─────────────────┼─────────────────┤           │
│         │  Q3 — DELEGAR   │  Q4 — ELIMINAR  │           │
│ NÃO     │  ────────────── │  ────────────── │           │
│ IMPOR-  │  [Task E] 🔵    │  [Task G] ⚪    │           │
│ TANTE   │  [Task F] 🔵    │  [Task H] ⚪    │           │
│         │                 │                 │           │
│         └─────────────────┴─────────────────┘           │
└──────────────────────────────────────────────────────────┘
```

### 6.4 Tela: Sprint Board

```
┌──────────────────────────────────────────────────────────────────┐
│  Sprint 2 — "Lançamento MVP"          [Iniciar] [Concluir]       │
│  Meta: Deploy completo e funcional    12/03 → 26/03              │
│  Velocidade: 24 pts                                              │
│                                                                  │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐               │
│  │ A FAZER  (5)│ │EM CURSO  (3)│ │  FEITO   (8)│               │
│  │─────────────│ │─────────────│ │─────────────│               │
│  │ [Task...] │ │ [Task...] │ │ [Task...] │               │
│  └─────────────┘ └─────────────┘ └─────────────┘               │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Burndown Chart                                           │   │
│  │  pts 30 │╲                                              │   │
│  │       20 │  ╲──                                         │   │
│  │       10 │     ╲──────╲                                 │   │
│  │        0 └─────────────────────                         │   │
│  │           D1   D5   D10   D14                           │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

### 6.5 Tela: Import Wizard (PDF/Sheet)

```
PASSO 1 — Upload
┌─────────────────────────────────────────────┐
│         SmartDropzone                       │
│  ┌─────────────────────────────────────┐   │
│  │                                     │   │
│  │   ⬆ Arraste ou clique para enviar   │   │
│  │   PDF, XLSX, CSV ou Áudio           │   │
│  │                                     │   │
│  └─────────────────────────────────────┘   │
│  Detectando tipo de arquivo...             │
└─────────────────────────────────────────────┘

PASSO 2 — Revisão (ContractWizard / SheetWizard)
┌─────────────────────────────────────────────┐
│  Contrato detectado: "Contrato XYZ.pdf"     │
│  ─────────────────────────────────────────  │
│  Projeto sugerido: "Projeto XYZ"            │
│  Prazo: 30/06/2026                          │
│  Valor: R$ 150.000                          │
│  ─────────────────────────────────────────  │
│  Tasks extraídas (7):                       │
│  ☑ [Q1] Levantamento de requisitos          │
│  ☑ [Q1] Desenvolvimento do módulo A         │
│  ☑ [Q2] Documentação técnica               │
│  ☑ [Q3] Reunião de alinhamento              │
│  ☐ [Q4] Relatório final (desmarcar?)        │
│  ─────────────────────────────────────────  │
│        [Cancelar]    [Confirmar Import]     │
└─────────────────────────────────────────────┘
```

### 6.6 Tela: ROI Dashboard

```
┌──────────────────────────────────────────────────────────────────┐
│  ROI & PRODUTIVIDADE                                             │
│                                                                  │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐            │
│  │ Focus Total  │ │Tasks Concl.  │ │  Streak      │            │
│  │   47.3h      │ │    128       │ │  12 dias     │            │
│  └──────────────┘ └──────────────┘ └──────────────┘            │
│                                                                  │
│  HEATMAP — 90 dias                                              │
│  Jan ─────────────────────────── Mar                           │
│  ░░▒▒░░▒▓▓▒░░▒▒▒▓▓▓▒░░▒▒▒▒▓▓▓▒░░▒▒▒░▒▓▓▒░░▒▒▒▓▓▓              │
│  (░=0 ▒=1-3h ▓=4-6h █=6h+)                                     │
│                                                                  │
│  MOOD TREND                                                      │
│  ████████░░██████████████░░░████████████░░████████              │
│  (█=flow ░=ok ·=bloqueado)                                      │
│                                                                  │
│  VELOCIDADE POR SPRINT                                          │
│   pts 30 │    ██                                               │
│        20 │ ██ ██ ██                                           │
│        10 │ ██ ██ ██ ██                                        │
│           └──────────────── sprints                            │
└──────────────────────────────────────────────────────────────────┘
```

### 6.7 Tela: AI Chat Panel

```
┌──────────────────────────────────────────────┐
│  AGENTE ORCHFLOW                          [✕]│
│  ────────────────────────────────────────    │
│                                              │
│  🤖 Olá! Como posso ajudar?                 │
│                                              │
│  👤 "criar task urgente revisão contrato     │
│      para amanhã no projeto XYZ"            │
│                                              │
│  🤖 Entendi! Vou criar:                     │
│  ┌────────────────────────────────────────┐ │
│  │ 📋 Revisão do contrato                 │ │
│  │ Projeto: XYZ                           │ │
│  │ Quadrant: Q1 (Urgente + Importante)    │ │
│  │ Due: amanhã (30/03/2026)               │ │
│  │ Status: A Fazer                        │ │
│  └────────────────────────────────────────┘ │
│                                              │
│  [Cancelar]          [✅ Confirmar]         │
│  ────────────────────────────────────────    │
│  [🎤 Voz] [Digite sua mensagem...    ] [➤] │
└──────────────────────────────────────────────┘
```

### 6.8 Tela: Login

```
┌──────────────────────────────────────────────┐
│                                              │
│          🎵 OrchFlow                        │
│                                              │
│  ┌────────────────────────────────────────┐ │
│  │  Email                                 │ │
│  │  admin@orchflow.dev                    │ │
│  └────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────┐ │
│  │  Senha                          [👁]   │ │
│  │  ••••••••                              │ │
│  └────────────────────────────────────────┘ │
│                                              │
│  [         Entrar          ]                 │
│                                              │
│  ─────── ou continue com ─────────          │
│  [G Google]              [⌥ GitHub]         │
│                                              │
│  Não tem conta? Cadastre-se                  │
└──────────────────────────────────────────────┘
```

---

## 7. Fluxos Principais

### 7.1 Fluxo de Autenticação

```
Browser                   Vercel                 Railway Backend
  │                         │                         │
  ├── POST /api/auth/login ──────────────────────────►│
  │                         │                         │ validate email+pw
  │                         │                         │ bcrypt.verify()
  │                         │                         │ gera access_token (15min)
  │                         │                         │ gera refresh_token (7d)
  │◄──────────────────────────────── 200 {tokens} ────┤
  │ localStorage.set('token')│                         │
  │                         │                         │
  ├── GET /api/projects/ ───────────────────────────► │
  │   Authorization: Bearer <token>                   │ JWT.decode(token, JWT_SECRET)
  │◄──────────────────────────────── 200 [projects] ──┤
  │                         │                         │
  │  [token expira]         │                         │
  ├── GET /api/tasks/ ──────────────────────────────► │
  │◄──────────────────────────────── 401 Unauthorized ┤
  │ interceptor axios       │                         │
  ├── POST /api/auth/refresh ───────────────────────► │
  │   refresh_token in body │                         │ valida refresh_token
  │◄──────────────────────────────── 200 {new_tokens} ┤
  │ retry original request  │                         │
```

### 7.2 Fluxo de Import de Contrato

```
1. Usuário arrasta PDF no SmartDropzone
2. POST /upload/detect → { type: "contract_pdf" }
3. POST /upload/contract (multipart/form-data)
   → pdfplumber extrai texto completo
   → Groq LLaMA 3 analisa e retorna JSON estruturado:
      { project_title, deadline, value, tasks: [{title, quadrant, ...}] }
4. ContractWizard exibe ReviewTaskList
5. Usuário ajusta tasks (marcar/desmarcar)
6. POST /upload/contract/confirm
   → cria Project no banco
   → cria Tasks no banco
   → aplica kanban columns padrão
7. Redirect → Board Kanban do novo projeto
```

### 7.3 Fluxo de Focus Session

```
1. Usuário clica [▶ Focus] no FocusWidget
2. POST /focus/start { task_id, sprint_id, is_pomodoro: true }
3. Timer corre (25min Pomodoro ou livre)
4. POST /focus/{id}/end { mood: "flow", notes: "..." }
5. Backend:
   → calcula duração em minutos
   → atualiza task.time_spent_minutes
   → cria/atualiza productivity_snapshot do dia
6. ROI Dashboard reflete novos dados
```

---

## 8. Integrações Externas

| Serviço | Uso | Autenticação |
|---|---|---|
| **Groq API** (LLaMA 3 + Whisper) | Intent parsing, contract extraction, sheet mapping, voice transcription | `GROQ_API_KEY` |
| **Google OAuth** | Login social Google | `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` |
| **GitHub OAuth** | Login social GitHub | `GITHUB_CLIENT_ID` + `GITHUB_CLIENT_SECRET` |
| **Railway PostgreSQL** | Banco de dados principal | `DATABASE_URL` |
| **pgvector** | Memória semântica vetorial | (extension do Postgres) |

---

## 9. Deploy & Infraestrutura

```
┌─────────────────────────────────────────────────────────┐
│                    GitHub                               │
│  Repo: diegommazevedo/orchflow_SH                       │
│  Tag: v3.0.0-mvp                                        │
│  Branch principal: main                                 │
└──────────────┬────────────────────────┬─────────────────┘
               │ auto-deploy            │ auto-deploy
               ▼                        ▼
┌──────────────────────┐   ┌────────────────────────────┐
│  Railway             │   │  Vercel                    │
│  ──────────────────  │   │  ────────────────────────  │
│  Projeto:            │   │  Projeto: orchflow-sh      │
│  vibrant-exploration │   │  Domínio:                  │
│                      │   │  orchflow-sh.vercel.app    │
│  Serviços:           │   │                            │
│  ┌────────────────┐  │   │  Build: npm run build      │
│  │ orchflow_SH    │  │   │  Output: dist/             │
│  │ Port: 8080     │  │   │  SPA fallback: index.html  │
│  │ Dockerfile     │  │   │                            │
│  │ orchflowsh-    │  │   │  Env Vars:                 │
│  │ production.up. │  │   │  VITE_API_URL=             │
│  │ railway.app    │  │   │  orchflowsh-production...  │
│  └────────────────┘  │   └────────────────────────────┘
│  ┌────────────────┐  │
│  │ Postgres       │  │
│  │ postgres-      │  │
│  │ volume (persist│  │
│  └────────────────┘  │
│                      │
│  Env Vars:           │
│  DATABASE_URL        │
│  JWT_SECRET          │
│  SECRET_KEY          │
│  GROQ_API_KEY        │
│  GOOGLE_CLIENT_*     │
│  GITHUB_CLIENT_*     │
│  ALLOWED_ORIGINS     │
│  OAUTH_REDIRECT_*    │
└──────────────────────┘
```

### 9.1 Dockerfile (Resumo)

```dockerfile
FROM python:3.11-slim
RUN apt-get install gcc libpq-dev
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
RUN adduser appuser && chown -R appuser /app
USER appuser
EXPOSE 8080
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT}
```

### 9.2 Railway.toml

```toml
[build]
builder        = "dockerfile"
dockerfilePath = "backend/Dockerfile"

[deploy]
startCommand          = "uvicorn app.main:app --host 0.0.0.0 --port $PORT"
healthcheckPath       = "/"
healthcheckTimeout    = 300
restartPolicyType     = "ON_FAILURE"
restartPolicyMaxRetries = 3
```

---

## 10. Segurança

| Aspeto | Implementação |
|---|---|
| **Autenticação** | JWT (HS256) · access_token 15min · refresh_token 7d |
| **Passwords** | bcrypt hash via passlib |
| **Rate Limiting** | slowapi: /login 10/min · /register 3/min · /agent 5/min |
| **CORS** | OrchFlowCorsGuardMiddleware + CORSMiddleware (allow_origin_regex) |
| **Headers** | SecurityHeadersMiddleware: X-Frame-Options, X-Content-Type-Options, Referrer-Policy |
| **Payload Size** | LimitRequestSizeMiddleware: máx 10MB |
| **Multi-tenant** | Todas queries filtradas por workspace_id |
| **Soft Deletes** | Tasks e comentários marcados com deleted_at, nunca apagados |
| **OAuth** | State token + PKCE · Google e GitHub |
| **Secrets** | Nunca no código · sempre em env vars Railway/Vercel |

---

## 11. Estado do MVP (29/03/2026)

### ✅ Funcionalidades Completas

- [x] Autenticação email/senha + OAuth Google + GitHub
- [x] Multi-workspace com roles e vocabulário customizável
- [x] Kanban Board com colunas configuráveis
- [x] Sprint Management (standard, recorrente, encaixe)
- [x] Matrix Eisenhower (Q1-Q4)
- [x] Import de contratos PDF via Groq IA
- [x] Import de planilhas XLSX/CSV via Groq IA
- [x] Transcrição de voz via Groq Whisper
- [x] Agente de intenção (linguagem natural → tasks)
- [x] Custom Fields por projeto
- [x] Focus Sessions (Pomodoro + livre) com mood tracking
- [x] ROI Dashboard com heatmap 90 dias
- [x] Export PDF e XLSX (backlog, resumo, tempo)
- [x] AI Token Wallet com usage tracking
- [x] Templates verticais
- [x] Memória semântica (pgvector)
- [x] Activity Log imutável
- [x] Soft-delete com Trash
- [x] Deploy Railway (backend) + Vercel (frontend)

### 🔄 Pendências Pós-MVP

- [ ] Resolver 401 em produção (JWT_SECRET no Railway)
- [ ] Admin user no banco Railway
- [ ] Criar admin via Railway CLI (`railway run python scripts/create_admin.py`)
- [ ] Testes E2E
- [ ] Alembic migrations formais

---

*Documento gerado automaticamente em 29/03/2026 · OrchFlow v3.0.0-mvp*
