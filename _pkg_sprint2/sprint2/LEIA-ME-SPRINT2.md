# OrchFlow — Sprint 2: Frontend React + Drag-and-Drop

## O que tem neste zip

```
sprint2/
└── frontend/
    ├── src/
    │   ├── main.tsx              ← entry point React
    │   ├── App.tsx               ← componente raiz com estado global
    │   ├── styles.css            ← CSS global completo
    │   ├── types/index.ts        ← tipos TypeScript
    │   ├── services/api.ts       ← chamadas ao backend FastAPI
    │   ├── hooks/useData.ts      ← hooks react-query (projetos + tarefas)
    │   └── components/
    │       ├── layout/
    │       │   ├── Sidebar.tsx   ← lista projetos, cria projeto
    │       │   └── ChatPanel.tsx ← chat com parser local
    │       └── backlog/
    │           ├── Board.tsx     ← colunas Kanban + drag-and-drop
    │           └── TaskCard.tsx  ← card arrastável
    ├── package.json
    ├── vite.config.ts            ← proxy /api → localhost:8000
    ├── tsconfig.json
    └── index.html
```

---

## PASSO A PASSO

### 1. Substitui a pasta frontend

Copia o conteúdo desta pasta `frontend/` para dentro da sua pasta `orchflow/frontend/`
(substitui tudo que estava lá antes — só o `orchflow-shell.html` pode manter como referência)

### 2. Instala as dependências

```bash
cd orchflow/frontend
npm install
```

### 3. Confirma que o backend está rodando

Em outro terminal:
```bash
cd orchflow/backend
source venv/bin/activate   # Windows: venv\Scripts\activate
uvicorn app.main:app --reload --port 8000
```

### 4. Roda o frontend

```bash
cd orchflow/frontend
npm run dev
```

Acessa: **http://localhost:5173**

---

## O que você verá

- **Sidebar real** — lista projetos do banco, cria novo projeto
- **Board Kanban real** — tarefas carregadas da API, 3 colunas
- **Drag-and-drop** — arrasta card entre Backlog / Em andamento / Concluído → salva no banco
- **Chat funcional** — digita "cria tarefa [nome]" → cria direto no banco via API
- **Botão ×** nos cards para deletar tarefas

---

## Checklist Sprint 2

- [ ] `npm install` sem erros
- [ ] Frontend abrindo em http://localhost:5173
- [ ] Criar projeto pela sidebar funciona
- [ ] Cards aparecem no board após criar tarefa
- [ ] Drag-and-drop muda status e persiste no banco
- [ ] Chat cria tarefas via "cria tarefa [nome]"

Quando tudo verde = Sprint 2 completo ✓

**Próximo — Sprint 3:** Agente Groq real no chat (interpreta linguagem natural completa e executa ações no sistema)
