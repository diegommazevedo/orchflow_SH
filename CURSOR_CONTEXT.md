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
- Versão atual: 0.7.0

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

backend/app/models/
  project.py / task.py (assignee_id, due_date_iso) /
  user.py (nickname, role) / memory.py (perfil semântico)

frontend/src/
  components/layout/Sidebar.tsx + ChatPanel.tsx (voz 🎤 + attach 📎)
  components/backlog/Board.tsx (drag-and-drop) + TaskCard.tsx
  components/upload/ContractWizard.tsx + SheetWizard.tsx
  pages/ImportPage.tsx (abas PDF + planilha)
  hooks/useData.ts + useConformField.ts + useVoiceInput.ts
  services/api.ts / types/index.ts / styles.css
```

## Endpoints ativos
```
/api/projects/    /api/tasks/
/api/agent/interpret  /execute  /conform-field
/api/agent/profile/{uid}  /memory/stats/{uid}
/api/agent/admin/profiles  /admin/profile/{uid}/visibility
/api/voice/transcribe
/api/upload/contract  /contract/confirm
/api/upload/sheet     /sheet/confirm
```

## Próximo sprint
Sprint 4 — Dashboard ROI (tempo investido, receita vs custo)
ou
Sprint 5 — Multi-usuário + Auth (muda user_id: 'default' para auth real)
Decisão pendente com o arquiteto.

## Padrão de entrega
Cursor Prompt vem do chat externo com:
- Spec (o que fazer e por quê)
- Ordem de execução numerada
- Leis a respeitar por arquivo
Após execução: rodar checklist de auditoria no Claude do Cursor.
