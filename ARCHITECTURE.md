# OrchFlow — Architecture Laws
> Este arquivo é a constituição do projeto.
> Nenhum código, agente ou ferramenta pode violar estas leis.
> Em caso de dúvida, este arquivo prevalece sobre qualquer sugestão externa.

---

## 1. Stack Técnica — Imutável

| Camada | Tecnologia | Versão mínima |
|--------|------------|---------------|
| Backend | Python + FastAPI | 3.11+ / 0.111+ |
| Frontend | React + TypeScript | 18+ / 5+ |
| Banco | PostgreSQL + pgvector | pg16 |
| IA / Agentes | Groq API | llama-3.3-70b-versatile |
| Voz | Groq Whisper | whisper-large-v3-turbo |
| ORM | SQLAlchemy | 2.0+ |
| Build | Vite | 5+ |

**Nunca substituir tecnologia da stack sem aprovação arquitetural explícita.**

---

## 2. Lei da Conformidade Universal

> **Nenhum dado entra no banco sem passar pelo ConformityEngine.**

> **Princípio arquitetural:**
> "Conformidade é infraestrutura, não feature.
> Toda entrada de dado — independente da origem —
> passa pelo ConformityEngine antes de ir ao banco.
> O fluxo do usuário nunca é bloqueado pela conformidade.
> A conformidade é silenciosa nas origens diretas (formulário)
> e visível mas não bloqueante nas origens complexas
> (chat, upload). O usuário sempre pode ver o resultado
> — nunca é obrigado a revisar."

Não importa a origem:
- Chat (texto ou voz)
- Formulário de tela (evento onBlur)
- Upload de arquivo (imagem, PDF, planilha)
- API externa

Pipeline obrigatório:
```
Origem raw
  → Normalizer (abreviações, gírias, erros)
  → ConformityEngine (formata, lapida, padroniza)
  → Preview ao usuário (opcional por modo)
  → Aceite (automático no modo silent)
  → Banco
```

**Modos de conformidade por origem:**

| Origem | Modo | Comportamento |
|--------|------|---------------|
| Formulário inline (TaskDetailPanel, etc.) | `silent` | Auto-aplica em background, mostra ✓ por 2s, erro nunca bloqueia |
| Chat → pipeline | `pipeline` | normalizer → memória → Groq → conformity |
| Wizard de import/review (ReviewTaskList, Wizards) | `wizard` | Mostra sugestão visível, usuário aceita ou edita |
| Upload (SmartDropzone) | `pipeline` | conformity em cada campo antes do ReviewTaskList |

Em todos os casos: **dado bruto nunca chega ao banco.**

Arquivo de referência: `backend/app/agent/conformity.py`
Hook de referência: `frontend/src/hooks/useConformField.ts`

---

## 3. Lei do Wizard de Confirmação

> **O agente nunca executa sem confirmação — exceto em modo silent.**

Regras:
- `wizard_mode = full` → campos editáveis, botão confirmar/cancelar
- `wizard_mode = compact` → resumo + 1 clique
- `wizard_mode = silent` → executa direto + toast (só após N confirmações históricas)
- `wizard_mode = block` → bloqueado, requer admin

Modo silent só é atingido quando:
- Risco da operação = LOW
- Confiança >= `user.confidence_threshold` (default 0.85)
- `auto_execute_count[action]` >= 3

Arquivo de referência: `backend/app/agent/permissions.py`

---

## 4. Lei da Memória Local

> **Busca memória local ANTES de chamar Groq.**

Pipeline de intenção:
```
Input normalizado
  → search_memory() → score >= 0.72? → retorna da memória (zero token)
  → score < 0.72 → chama Groq → salva resultado na memória
```

Embedding: bag-of-words leve (64 dimensões) + Jaccard como fallback.
Perfil semântico: persistido em `user_semantic_profiles` no PostgreSQL.
Meta: 90% das requests resolvidas localmente após período de uso.

Arquivo de referência: `backend/app/agent/memory_store.py`

---

## 5. Lei do Título Lapidado

> **Nomes de pessoas NUNCA entram no título de uma tarefa.**

Formato obrigatório do título:
```
[Assignee] · Verbo + Objeto · Contexto
```

Exemplo:
- ❌ "pro zé revisar schema" (nome no título, sem verbo claro)
- ✅ "[Zé] Revisar schema do banco de dados · OrchFlow MVP"

Assignee vai no campo `assignee_hint` → resolvido para `assignee_id` via lookup de usuários.

---

## 6. Lei do Prazo Absoluto

> **Prazo relativo entra, data absoluta sai.**

- Input: "hj", "amanhã", "semana que vem"
- Output no banco: ISO 8601 — `"2026-03-23"`
- Display: `"23/03/2026 · vence em 4h"` ou `"venceu há 2 dias"`

Gap calculado em tempo real no frontend. Nunca armazenar expressão relativa no banco.

---

## 7. Lei dos Níveis de Risco

| Operação | Risco | Wizard |
|----------|-------|--------|
| create_task | LOW | compact / silent |
| update_task_status | LOW | compact / silent |
| list_tasks / list_projects | LOW | silent sempre |
| create_project | MEDIUM | full |
| delete_task | HIGH | full sempre |
| delete_project | CRITICAL | bloqueado |
| unknown | HIGH | full |

Arquivo de referência: `backend/app/agent/permissions.py`

---

## 8. Lei do Perfil por Usuário

> **Cada usuário tem seu espaço semântico isolado.**

- `personal_dict` — abreviações aprendidas individualmente
- `auto_execute_count` — histórico de confirmações por ação
- `confidence_threshold` — configurável por usuário
- `is_public` — controlado pelo admin
  - `private` → só aquele usuário usa
  - `public` → base compartilhada para novos usuários

Perfil persiste no banco. Reiniciar o servidor não apaga nada.

---

## 9. Lei da Arquitetura de 3 Colunas

> **O layout é fixo: sidebar esquerda / board central / chat direito.**

```
┌─────────────┬──────────────────────┬────────────┐
│   Sidebar   │    Board / Content   │    Chat    │
│  220px      │    flex: 1           │   320px    │
│  navegação  │    área principal    │   agente   │
│  projetos   │    kanban/matrix/    │   wizard   │
│  ROI        │    timeline/lista    │   input    │
└─────────────┴──────────────────────┴────────────┘
```

CSS variables: `--sidebar-w: 220px` / `--chat-w: 320px`

---

## 10. Lei dos Endpoints

Prefixos obrigatórios:
```
/api/projects/...
/api/tasks/...
/api/agent/...
  /interpret    POST — interpreta, não executa
  /execute      POST — executa após confirmação
  /conform-field POST — conformidade para formulários
  /profile/{uid} GET/PATCH
  /memory/stats/{uid} GET
  /admin/profiles GET
  /admin/profile/{uid}/visibility PATCH
/api/voice/...
  /transcribe   POST — áudio → texto
```

CORS obrigatório para: `5173`, `5174`, `5175`, `5180`

---

## V2 — Schema dinâmico (leis adicionais)

- **CustomFieldValue** — todo valor persistido passa pelo **ConformityEngine** antes do banco.
- **SchemaAgent** — análise e aplicação de sugestões **sempre** com wizard de confirmação (nível HIGH); nunca automático.
- **KanbanColumn** — deve existir **pelo menos uma** coluna com `is_done = true`; não é permitido remover a última coluna “done”.
- **Vertical templates** — são **sugestão**; o utilizador aplica com confirmação; **ActivityLog** com `template_applied` ao aplicar.
- **Task.status** — **string livre** (slug alinhado à coluna do kanban do projeto), não enum fixo no modelo.

---

### Lei 14 — JWT e X-Workspace-Id (Sprint 5)

> Todo request protegido exige JWT válido + header `X-Workspace-Id`.

### Lei 15 — Isolamento por workspace (Sprint 5)

> Dados sempre filtrados por `workspace_id` — nenhum endpoint retorna dados cross-workspace.

## Lei 16 — Chassi imutável do framework

> Organização → Projeto → Backlog + Sprint → Tarefa → Subtarefa.  
> Esta hierarquia é o chassi do framework OrchFlow.  
> Nenhum código, agente ou configuração pode remover esses níveis.  
> A personalização acontece dentro deles, nunca no lugar deles.

**Definições:**

- **Organização:** entidade raiz. Sempre existe. Tem identidade, missão e membros. Hoje implementada como **Workspace** — será elevada para **Organization** com identidade própria na Sprint 8.
- **Projeto:** unidade organizacional dentro da Organização. Pode ser departamento, área, célula, vertical, cliente. Mínimo 1 por Organização.
- **Backlog:** boca do funil. Toda tarefa nasce aqui. Repositório de tudo que existe no projeto.
- **Sprint:** mecanismo de execução. Grupo de tarefas chamadas/movidas do backlog. Gestão de tempo pode ser por sprint (duração do ciclo) ou por tarefa (estimativa). **Tipos:** **recorrente** (cadência fixa, auto-criação), **encaixe** (espontâneo, duração livre).
- **Tarefa:** unidade de trabalho. Nasce no backlog, é executada no sprint.
- **Subtarefa:** decomposição de uma tarefa. Vive dentro da tarefa pai. Herda o contexto do projeto e sprint.

**O que é personalizável DENTRO do chassi:**

- Quantidade de projetos
- Profundidade de subtarefas
- Tipos e recorrência de sprints
- Campos customizados em qualquer nível
- Colunas Kanban dentro do sprint
- Nomenclatura de cada nível

---

## 11. Roadmap de Sprints

| Sprint | Status | Entrega |
|--------|--------|---------|
| 1 | ✅ | Setup + banco + estrutura base |
| 2 | ✅ | Frontend React + drag-and-drop |
| 3A | ✅ | Groq + wizard + 6 operações CRUD |
| 3B | ✅ | Wizard dinâmico + permissões + dicionário |
| 3B patch | ✅ | Conformidade universal + título lapidado |
| 3C | ✅ | Memória vetorial permanente por usuário |
| 3D | ✅ | Voz via Whisper |
| 3E | ✅ | Imagem/PDF — OCR + mapeamento de campos |
| 3F | ✅ | Planilha/CSV — importação em lote |
| V2 | ✅ | Schema dinâmico, templates, kanban configurável, SchemaAgent |
| Busca Universal | ✅ | Campo fixo topo central, 6 entidades, debounce 300ms |
| V2.1 cleanup | ✅ | Redirect /agents, deprecation endpoint legado, migração SQL normalizada |
| 4 | 🔲 | Dashboard ROI — tempo vs entregas |
| 5 | ✅ | Multi-usuário + Auth + Workspaces (JWT, OAuth, isolamento por workspace) |
| 6 | 🔲 | Subtarefas — parent_task_id, UI aninhada, contadores de progresso |
| 7 | 🔲 | Sprint tipada — recorrente (auto-criação) + encaixe (espontâneo) |
| 8 | 🔲 | Organização como entidade — elevar Workspace para Organization com missão, vertical, identidade |
| 9 | 🔲 | Perfil semântico público/privado/template com contexto de Organização |
| 10 | 🔲 | Marketplace — Processos de uma Organização compartilhados com outras |
| Sprint F1 | 🔲 | Fusão de projetos — merge com wizard de resolução de conflitos |

---

## 12. Versões da API

| Versão | Sprint | O que mudou |
|--------|--------|-------------|
| 0.1.0 | 1 | Base FastAPI |
| 0.2.0 | 2 | CRUD completo |
| 0.3.0 | 3A/3B | Agent router |
| 0.4.0 | 3C | Memória vetorial |
| 0.5.0 | 3D | Voice router |
| 1.5.0 | V1.5 | Soft delete, lixeira, export corrigido, erros UX centralizados |
| 2.0.0 | V2 F1 | KanbanColumn configurável, Task.status string livre |
| 2.1.0 | V2 F2 | CustomField + ConformityEngine para campos customizados |
| 2.2.0 | V2 F3 | Templates de vertical + ActivityLog template_applied |
| 2.3.0 | V2 F4 | SchemaAgent + wizard HIGH obrigatório |
| 3.0.0 | Sprint 5 | Auth JWT + OAuth, workspaces, filtros por workspace_id |

---

## Regras de Revisão de Código

Antes de aceitar qualquer código gerado por IA, verifique:

- [ ] Dado novo passa pelo `ConformityEngine` antes de ir ao banco?
- [ ] Ação destrutiva tem `wizard_mode = HIGH` ou `CRITICAL`?
- [ ] Título de tarefa está no formato `[Assignee] · Verbo + Objeto`?
- [ ] Prazo é armazenado como ISO 8601 no banco?
- [ ] Novo endpoint usa o prefixo correto `/api/...`?
- [ ] CORS inclui `5173`, `5174`, `5175`, `5180`?
- [ ] Perfil do usuário é carregado do banco (não de variável global)?
- [ ] Memória local é consultada antes do Groq?
- [ ] Nenhuma feature remove ou contorna um nível do chassi (Lei 16)?

---

## Sprint V2 — Fechamento

**Data:** 2026-03  
**Versão entregue:** 2.3.0

**Frentes concluídas:**
- F1: KanbanColumn configurável + Task.status string (CP-018)
- F2: CustomField + ConformityEngine (CP-018)
- F3: Templates de vertical + ActivityLog (CP-019)
- F4: SchemaAgent + wizard HIGH (CP-019)
- Busca Universal (CP-020 adjacente)
- Cleanup: redirect /agents, deprecation legado, SQL normalizado (CP-020)

**Leis V2 ativas (adicionadas ao core):**
- Lei 11: CustomFieldValue sempre passa por conform_custom_field_value antes do banco
- Lei 12: Template é sugestão — aplicação sempre com confirmação + ActivityLog template_applied
- Lei 13: SchemaAgent sempre HIGH — wizard obrigatório, zero execução automática

**Próximo ciclo planejado:**  
Sprint 6 em diante — ver §11 (chassi declarado na Lei 16); próximo passo operacional: CP-023 (seletor de projeto).

---

## Visão de produto — modelo mental universal

OrchFlow é a implementação operacional de um modelo mental universal de qualquer negócio ou organização:

```
Organização
  Pessoas
  Produtos ou Serviços
  Processos
```

Qualquer negócio do mundo é uma combinação específica desses quatro elementos. O chassi do framework (Lei 16) é a expressão operacional desse modelo:

- **Organização** → quem existe  
- **Projeto** → onde opera (departamento, área, vertical)  
- **Backlog** → o que existe para fazer (intenção)  
- **Sprint** → o que está sendo feito agora (execução)  
- **Tarefa** → a unidade de entrega  
- **Subtarefa** → a decomposição do trabalho  

O OrchFlow não é um sistema de gestão de projetos. É um framework que torna operacional a estrutura de qualquer organização — da barraca de feira ao escritório de advocacia, da clínica ao hospital, da software house à construtora.
