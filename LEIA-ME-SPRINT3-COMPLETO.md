# OrchFlow — Sprint 3 COMPLETO

## O que este zip entrega

Sprint 3 inteiro consolidado — 3A + 3B + patch completo.
Substitui tudo que veio antes nos sprints 3A e 3B.

---

## Novidades consolidadas

### Motor de conformidade universal
Nenhum dado entra no banco sem tratamento.
Mesmo pipeline para chat, formulário e uploads futuros.

| Entrada bruta | Saída conformada |
|---------------|-----------------|
| "revisar aq schema" | "Revisar schema do banco de dados" |
| "hj" | 23/03/2026 · vence em 4h |
| "pro zé" | assignee separado do título |
| "jose silva" | José Silva |
| "r$1500" | R$ 1.500,00 |

### Wizard dinâmico com raciocínio visível
- Campos já preenchidos — você só corrige o errado
- Linha de inferência: "urgente + hj → Q1" — você vê o raciocínio
- Responsável (@zé) em campo separado, nunca no título
- Prazo com gap ao vivo: "vence em 4h", "venceu ontem"
- Clica no valor para editar inline

### Níveis de risco
| Operação | Risco | Wizard |
|----------|-------|--------|
| criar/mover tarefa | LOW | compact |
| criar projeto | MEDIUM | full |
| deletar tarefa | HIGH | full sempre |
| deletar projeto | CRITICAL | bloqueado |

### Conformidade em formulários de tela
Hook `useConformField` — qualquer input da interface passa
pelo mesmo motor no `onBlur`. Campo fica com borda âmbar se corrigido.

---

## Estrutura do zip

```
sprint3-complete/
├── backend/
│   ├── app/
│   │   ├── agent/
│   │   │   ├── conformity.py      ← NOVO — motor universal
│   │   │   ├── intent_engine.py   ← atualizado
│   │   │   ├── executor.py        ← atualizado com conformidade
│   │   │   ├── normalizer.py      ← atualizado
│   │   │   └── permissions.py     ← igual 3B
│   │   ├── models/
│   │   │   ├── task.py            ← + assignee_id + due_date_iso
│   │   │   └── user.py            ← + nickname + role
│   │   ├── routers/
│   │   │   └── agent.py           ← + /conform-field endpoint
│   │   └── main.py
│   └── requirements.txt           ← + unidecode
├── frontend/
│   ├── src/
│   │   ├── hooks/useConformField.ts  ← NOVO
│   │   └── components/layout/ChatPanel.tsx ← completo
│   └── wizard-styles-sprint3-final.css
└── LEIA-ME-SPRINT3-COMPLETO.md
```

---

## INSTALAÇÃO

### 1. Chave Groq no .env
```
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxx
```

### 2. Backend — copia e instala
```
sprint3-complete/backend/app/agent/    → orchflow/backend/app/agent/     (substitui tudo)
sprint3-complete/backend/app/models/   → orchflow/backend/app/models/    (substitui task.py e user.py)
sprint3-complete/backend/app/routers/agent.py → orchflow/backend/app/routers/
sprint3-complete/backend/app/main.py   → orchflow/backend/app/
sprint3-complete/backend/requirements.txt → orchflow/backend/
```

```bash
cd orchflow/backend
venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Frontend — copia
```
sprint3-complete/frontend/src/components/layout/ChatPanel.tsx
→ orchflow/frontend/src/components/layout/

sprint3-complete/frontend/src/hooks/useConformField.ts
→ orchflow/frontend/src/hooks/
```

### 4. CSS — substitui wizard anterior
Abre `orchflow/frontend/src/styles.css`.
Remove tudo a partir do comentário `/* ── WIZARD` até o final.
Cola o conteúdo de `wizard-styles-sprint3-final.css` no lugar.

### 5. Reinicia tudo
```bash
# Terminal 1
cd orchflow/backend && venv\Scripts\activate
uvicorn app.main:app --reload --port 8000

# Terminal 2
cd orchflow/frontend && npm run dev
```

---

## Checklist Sprint 3 completo

- [ ] `pip install` sem erros (unidecode instalado)
- [ ] Backend em :8000/docs mostra /api/agent/interpret, /execute, /conform-field
- [ ] "mete task urgente pro zé revisar o schema hj" → wizard com título lapidado, @zé separado, prazo com gap, Q1 com justificativa
- [ ] Confirmar cria tarefa no board
- [ ] Deletar tarefa → wizard full sempre (HIGH risk)
- [ ] Após 3 confirmações de criar tarefa → toast silencioso
- [ ] GET /api/agent/profile/default → mostra perfil com histórico

Sprint 3 completo ✓

**Próximo — Sprint 3C:** Memória vetorial pgvector — perfil semântico permanente por usuário
