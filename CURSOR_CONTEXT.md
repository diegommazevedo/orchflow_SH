# OrchFlow — Cursor Context
> Versão comprimida. Leia uma vez no início da sessão.
> Não altere este arquivo — é mantido pelo arquiteto (Claude no chat externo).

---

## Produto
SaaS de gestão de projetos com IA conversacional.
Fundador: perfil arquiteto/comercial, voltou à programação via IA.
Lei central: o agente é o filtro entre input humano tosco e dado limpo no banco.

## Stack
- Backend: Python 3.11 + FastAPI 0.111 — porta 8010
- Frontend: React 18 + TypeScript + Vite — porta 5180
- Banco: PostgreSQL pg16 + pgvector
- IA: Groq — llama-3.3-70b-versatile / whisper-large-v3-turbo
- ORM: SQLAlchemy 2.0
- Versão atual (API): 3.0.0 — `app/main.py`

## Leis absolutas (nunca violar)
1. ConformityEngine em TODO dado antes do banco — `app/agent/conformity.py`
2. Wizard obrigatório antes de executar — `app/agent/permissions.py`
3. Memória local antes do Groq — `app/agent/memory_store.py` threshold 0.72
4. Título: `[Assignee] · Verbo + Objeto` — nome de pessoa NUNCA no título
5. Prazo: ISO 8601 no banco, gap calculado no frontend
6. delete_task = HIGH / delete_project = CRITICAL (wizard sempre)
7. Perfil semântico persiste no banco — nunca variável global
8. Layout fixo: Sidebar 220px | Board flex:1 | Chat 320px
9. CORS: 5173, 5174, 5175, 5180
10. Wizard_mode silent só após 3+ confirmações + confiança >= 85% + risco LOW
11. **Frente 2:** todo valor de `custom_field_values` passa por `conform_custom_field_value` antes do banco; `conformed_at` ao persistir (lei V2 reforçada).
12. **Frente 3:** template de vertical é **sugestão** — aplicação só após confirmação no UI (wizard MEDIUM); toda aplicação gera **ActivityLog** `template_applied` com snapshot (`template_id`, `columns_added`, `fields_added`, `skipped`).
13. **Frente 4:** SchemaAgent é sempre **HIGH** — wizard obrigatório, zero execução automática; `GET /schema-analysis` é read-only; `POST /schema-apply` aplica só `accepted_ids`.
14. **Sprint 5:** todo request protegido exige JWT válido + header `X-Workspace-Id`.
15. **Sprint 5:** dados sempre filtrados por `workspace_id` — nenhum endpoint retorna dados cross-workspace.
16. **Lei 16 (chassi):** hierarquia imutável **Organização → Projeto → Backlog + Sprint → Tarefa → Subtarefa** — personalização só *dentro* dos níveis, nunca no lugar deles. Ver `ARCHITECTURE.md` (definições, sprints recorrente vs encaixe, Workspace → Organization na Sprint 8).
17. **Sprint 5:** `DISABLE_AUTH=true` é somente para dev local; nunca habilitar em produção.
18. **Sprint 6 (subtarefas):** `parent_task_id` em Task. Máximo 1 nível de profundidade — subtarefas não podem ter subtarefas. Subtarefa deve estar no mesmo projeto do pai. Excluir pai → cascade deleta subtarefas.
19. **Sprint 7 (sprint tipado):** 3 tipos: `standard` | `recorrente` | `encaixe`. Recorrente exige `recurrence_unit` + `recurrence_interval`. Fechar sprint recorrente com `auto_create=True` gera próximo automaticamente e copia tasks com `is_recurring=True`. Encaixe nunca auto-cria. Tipo não pode mudar após criação.
20. **Sprint 7.5 (AI Token Manager):** toda chamada de IA passa por `ai_router.route_request` — nunca chamar motor diretamente. Saldo negativo nunca permitido — HTTP 402 antes de chamar qualquer motor. Debit + log atômicos (rollback se log falhar). API keys (OPENAI, ANTHROPIC) apenas em variáveis de ambiente, nunca no frontend.
21. **Sprint 8 (Organização):** `Workspace` é agora Organização com identidade completa. Vocabulário em `org_vocabulary` (1:1 com workspace). Onboarding wizard 5 passos — dispara automaticamente quando `onboarding_completed=false`. Cor primária via CSS variable `--accent` aplicada do `workspace.primary_color`. `VocabularyContext` expõe `t(key)` para todos os componentes. `onboarding_step` avança com `advance_onboarding`; `onboarding_completed=true` somente após `complete_onboarding`.

**Chassi imutável:** Organização → Projeto → Backlog + Sprint → Tarefa → Subtarefa *(detalhe completo na Lei 16 em ARCHITECTURE.md).*

## Estrutura crítica
```
backend/app/agent/
  conformity.py      ← motor universal
  intent_engine.py   ← normaliza → memória → Groq
  executor.py        ← executa após confirmação
  memory_store.py    ← pgvector + Jaccard
  normalizer.py      ← gírias, abreviações
  permissions.py     ← risco + wizard_mode
  doc_extractor.py   ← PDF → texto
  contract_parser.py ← texto → projeto + tasks
  backlog_reviewer.py← retokenização do backlog
  sheet_extractor.py ← xlsx/csv → estrutura
  sheet_mapper.py    ← colunas → campos OrchFlow
  sheet_processor.py ← linhas → tasks conformadas

backend/app/routers/
  projects.py / tasks.py / agent.py / voice.py / upload.py
  kanban.py / fields.py / custom_fields.py / templates.py / schema_agent.py / auth.py / workspaces.py
  ai_tokens.py  ← Sprint 7.5: GET wallet/usage/engines + POST credit + PATCH alert

backend/app/services/
  kanban_status.py  ← valida Task.status contra slugs do projeto
  template_service.py  ← aplica vertical (só adiciona; log obrigatório)
  sprint_service.py  ← Sprint 7: create/close/series, auto-criação recorrente
  ai_router.py  ← Sprint 7.5: orquestrador de IA (route_request, wallet, log)
  onboarding_service.py  ← Sprint 8: advance/complete/reset onboarding (5 passos)
  auth_service.py / oauth_service.py / workspace_service.py

backend/app/models/
  project.py / task.py (status = slug String, assignee_id, due_date_iso, parent_task_id) /
  kanban.py (KanbanColumn) / schema.py (CustomField, CustomFieldValue + conformed_at) / user.py / memory.py
  workspace.py  ← Sprint 8: identity columns (legal_name, vertical, mission, logo_url, primary_color, timezone, locale, industry, size_range, onboarding_completed, onboarding_step) + OrgVocabulary model
  ai_engine.py  ← Sprint 7.5: AIEngine, AIWallet, AIUsageLog, AIWalletTransaction

frontend/src/
  components/layout/Sidebar.tsx + ChatPanel.tsx (voz 🎤 + attach 📎)
  components/backlog/Board.tsx (drag-and-drop) + TaskCard.tsx
  components/fields/TaskCustomFields.tsx + FieldDefinitionPanel.tsx
  components/templates/TemplateSelector.tsx + TemplateWizard.tsx
  components/upload/ContractWizard.tsx + SheetWizard.tsx
  pages/ImportPage.tsx (abas PDF + planilha)
  pages/AITokensPage.tsx (Sprint 7.5 — carteira, uso, motores)
  pages/OnboardingPage.tsx (Sprint 8 — wizard 5 passos: nome, vertical, missão, vocab, template)
  pages/OrgSettingsPage.tsx (Sprint 8 — identidade, vertical, vocabulário, localização, danger zone)
  contexts/AuthContext.tsx + pages/LoginPage.tsx + pages/RegisterPage.tsx + pages/OAuthCallbackPage.tsx + pages/WorkspaceNewPage.tsx + components/auth/ProtectedRoute.tsx
  contexts/VocabularyContext.tsx (Sprint 8 — VocabularyProvider + useVocabulary + t(key))
  components/backlog/SubtaskList.tsx (Sprint 6 — subtarefas inline)
  components/sprint/SprintPanel.tsx (Sprint 7 — painel + criação por tipo)
  hooks/useData.ts (+ useSubtasks, useCreateSubtask) + useConformField.ts + useVoiceInput.ts + useV2.ts (Kanban, campos, templates, schema-agent, useSchemaAgent, useFieldDefinitions, useTaskFieldValues, useTemplates, useApplyTemplate, useTemplateDetail)
  hooks/useAITokens.ts (Sprint 7.5 — useAIWallet, useAIUsage, useAIEngines)
  services/api.ts / types/index.ts / styles.css
```

## Endpoints ativos
```
/api/projects/    /api/tasks/
/api/projects/{id}/fields  /api/tasks/{id}/field-values  (Frente 2)
/api/projects/{id}/apply-template  (Frente 3 — canónico)
/api/kanban/{project_id}  /api/fields/  /api/templates/  (incl. /templates/by-id/{uuid})
/api/projects/{id}/schema-analysis  /api/projects/{id}/schema-apply
/api/tasks/{id}/subtasks  (Sprint 6)
/api/sprints/{id}/close  /api/sprints/{id}/series  (Sprint 7)
/api/ai/wallet  /api/ai/usage  /api/ai/engines  (Sprint 7.5)
/api/ai/wallet/credit  /api/ai/wallet/alert  (Sprint 7.5)
/api/workspaces/{id}  PATCH identity  PATCH vocabulary  (Sprint 8)
/api/workspaces/{id}/onboarding/steps  advance  complete  reset  (Sprint 8)
/api/agent/interpret  /execute  /conform-field
/api/agent/profile/{uid}  /memory/stats/{uid}
/api/agent/admin/profiles  /admin/profile/{uid}/visibility
/api/voice/transcribe
/api/upload/contract  /contract/confirm
/api/upload/sheet     /sheet/confirm
```

## Roadmap (a partir da Sprint 6 — ver ARCHITECTURE §11)
| Sprint | Foco |
|--------|------|
| 6 ✅ | Subtarefas — `parent_task_id`, UI aninhada, contadores |
| 7 ✅ | Sprint tipada — recorrente (auto-criação) + encaixe (espontâneo) |
| 7.5 ✅ | AI Token Manager — carteira, ai_router, motores múltiplos, dashboard |
| 8 ✅ | Organization — Workspace como Organização com identidade, vocabulário, onboarding wizard |
| SEC ✅ | Auditoria de segurança — 16/16 (CP-029): headers, SSL, OAuth CSRF, multi-tenant, HMAC, rate limit por usuário, token só em memória |
| 9 🔲 | Perfil semântico público/privado/template + contexto de Organização |
| 10 🔲 | Marketplace — processos de uma org compartilhados com outras |
| F1 🔲 | Fusão de projetos — merge + wizard de conflitos |

**Próximo passo operacional:** Deploy (Railway + Vercel) + configurar 3 API keys (Groq, OpenAI, Anthropic) nas variáveis de ambiente de produção. Depois Sprint 9.
**Sprint 8:** Organization entregue — Workspace elevado a Organização, vocabulário customizável (org_vocabulary), onboarding wizard 5 passos (auto-trigger), primary_color via CSS --accent, OrgSettingsPage, VocabularyContext + t().
**SEC (CP-029):** Auditoria completa — SecurityHeadersMiddleware, DB SSL, container não-root, OAuth CSRF state cookie, one-time code exchange, multi-tenant isolation, HMAC confirmation token, rate limit por user_id, access_token apenas em memória, checkAuth sem deadlock.

## Padrão de entrega
Cursor Prompt vem do chat externo com:
- Spec (o que fazer e por quê)
- Ordem de execução numerada
- Leis a respeitar por arquivo
Após execução: rodar checklist de auditoria no Claude do Cursor.
