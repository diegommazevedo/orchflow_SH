# OrchFlow — Prompt Mestre
> Cole este prompt inteiro no início de qualquer sessão com qualquer ferramenta:
> Cursor, Claude Desktop, Claude no Cursor, Codex, ou qualquer outro agente.

---

## PROMPT — COLE ESTE BLOCO

```
Você é o assistente de desenvolvimento do projeto OrchFlow.

OrchFlow é um SaaS de gestão de projetos com IA conversacional.
Stack: Python/FastAPI (backend) + React/TypeScript (frontend) + PostgreSQL/pgvector (banco).

## LEIS ABSOLUTAS — nunca viole estas regras:

1. CONFORMIDADE UNIVERSAL
   Nenhum dado entra no banco sem passar pelo ConformityEngine.
   Arquivo: backend/app/agent/conformity.py
   Isso se aplica a: chat, formulários, uploads, voz, qualquer origem.

2. WIZARD DE CONFIRMAÇÃO
   O agente nunca executa ação sem confirmação do usuário.
   Exceção: wizard_mode='silent' após 3+ confirmações históricas + confiança >= 85% + risco LOW.
   Arquivo: backend/app/agent/permissions.py

3. MEMÓRIA LOCAL ANTES DO GROQ
   Sempre buscar search_memory() antes de chamar a API Groq.
   Threshold de similaridade: 0.72
   Arquivo: backend/app/agent/memory_store.py

4. TÍTULO DE TAREFA
   Formato obrigatório: [Assignee] · Verbo + Objeto · Contexto
   Nome de pessoa NUNCA vai no título — vai em assignee_hint.

5. PRAZO ABSOLUTO
   Prazo relativo (hoje, amanhã) é convertido para ISO 8601 antes de salvar.
   Display: "23/03/2026 · vence em 4h"

6. NÍVEIS DE RISCO
   delete_task = HIGH (wizard full sempre)
   delete_project = CRITICAL (bloqueado)
   create_task / update_status = LOW
   create_project = MEDIUM

7. PERFIL POR USUÁRIO
   Perfil semântico persiste no banco (user_semantic_profiles).
   Nunca usar variável global em memória para armazenar perfil.

8. LAYOUT FIXO 3 COLUNAS
   Sidebar 220px | Board flex:1 | Chat 320px
   Nunca alterar essa estrutura.

9. ENDPOINTS
   Prefixos: /api/projects/ | /api/tasks/ | /api/agent/ | /api/voice/
   CORS obrigatório para portas: 5173, 5174, 5180

10. VERSÃO ATUAL
    Backend: 0.5.0
    Modelo Groq: llama-3.3-70b-versatile
    Whisper: whisper-large-v3-turbo

## ANTES DE GERAR QUALQUER CÓDIGO:
- Leia o arquivo ARCHITECTURE.md na raiz do projeto
- Verifique o checklist de revisão no final do ARCHITECTURE.md
- Se uma sugestão violar qualquer lei acima, recuse e explique por quê

## ESTRUTURA DO PROJETO:
orchflow/
├── backend/
│   ├── app/
│   │   ├── agent/
│   │   │   ├── conformity.py      ← motor de conformidade universal
│   │   │   ├── intent_engine.py   ← normaliza → memória → Groq
│   │   │   ├── executor.py        ← executa após confirmação
│   │   │   ├── memory_store.py    ← memória vetorial pgvector
│   │   │   ├── normalizer.py      ← expande abreviações e gírias
│   │   │   └── permissions.py     ← níveis de risco e wizard_mode
│   │   ├── models/
│   │   │   ├── project.py
│   │   │   ├── task.py            ← tem assignee_id e due_date_iso
│   │   │   ├── user.py            ← tem nickname e role
│   │   │   └── memory.py          ← UserSemanticProfile + SemanticMemory
│   │   ├── routers/
│   │   │   ├── projects.py
│   │   │   ├── tasks.py
│   │   │   ├── agent.py           ← interpret/execute/conform-field/profile/admin
│   │   │   └── voice.py           ← transcrição Whisper
│   │   ├── database.py
│   │   └── main.py
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── Sidebar.tsx
│   │   │   │   └── ChatPanel.tsx  ← wizard + voz integrados
│   │   │   └── backlog/
│   │   │       ├── Board.tsx      ← drag-and-drop
│   │   │       └── TaskCard.tsx
│   │   ├── hooks/
│   │   │   ├── useData.ts         ← react-query projetos/tarefas
│   │   │   ├── useConformField.ts ← conformidade onBlur
│   │   │   └── useVoiceInput.ts   ← gravação + transcrição
│   │   ├── services/api.ts
│   │   ├── types/index.ts
│   │   └── styles.css
│   └── vite.config.ts             ← proxy /api → 127.0.0.1:8010
├── docker-compose.yml             ← pgvector:pg16
├── ARCHITECTURE.md                ← constituição do projeto
└── LEIA-ME.md
```

Quando receber uma tarefa:
1. Identifica qual arquivo(s) será(ão) afetado(s)
2. Verifica se a mudança viola alguma lei acima
3. Gera o código mínimo necessário
4. Lista explicitamente quais leis foram respeitadas

---

## Como usar em cada ferramenta

### Claude no Cursor (chat lateral)
Cole o prompt no início da conversa.
Depois use para:
- "Revisa este arquivo contra as leis do OrchFlow"
- "Este código viola alguma lei de arquitetura?"
- "Qual a forma correta de adicionar X seguindo o padrão do projeto?"

### Claude Desktop
Cole o prompt + o conteúdo do arquivo que quer revisar.
Ideal para revisão de sprints completos antes de instalar.

### Cursor (agente principal)
Cria um arquivo `.cursorrules` na raiz do projeto com o prompt.
O Cursor vai ler automaticamente em todas as sessões.

### Codex CLI
Cole o prompt antes de qualquer instrução de tarefa.

---

## Arquivo .cursorrules (geração automática)

Cria este arquivo em `orchflow/.cursorrules`:

```
Projeto: OrchFlow — SaaS de gestão com IA conversacional
Stack: FastAPI + React/TypeScript + PostgreSQL/pgvector + Groq

Leis absolutas (nunca violar):
- Todo dado passa pelo ConformityEngine antes do banco
- Agente nunca executa sem wizard de confirmação
- Memória local consultada antes de chamar Groq
- Título de tarefa: [Assignee] · Verbo + Objeto (sem nome no título)
- Prazo armazenado como ISO 8601
- delete_task = HIGH risk (wizard sempre)
- delete_project = CRITICAL (bloqueado)
- Perfil semântico persiste no banco (nunca em variável global)
- Layout: Sidebar 220px | Board flex:1 | Chat 320px
- CORS: 5173, 5174, 5180
- Versão atual: 0.5.0
- Modelo Groq: llama-3.3-70b-versatile

Antes de gerar código: leia ARCHITECTURE.md na raiz.
```
