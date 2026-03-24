# OrchFlow — Sprint 3C: Memória Vetorial Permanente

## O que muda

### Antes (3A/3B)
Perfil do usuário vivia em memória RAM.
Reiniciou o uvicorn → perdeu tudo.
Cada comando chamava o Groq.

### Agora (3C)
Perfil salvo permanentemente no PostgreSQL.
Cada comando confirmado vira memória semântica.
Próxima vez que você digitar algo similar → responde da memória local.
Zero tokens Groq gastos para comandos conhecidos.

---

## Como funciona a memória

```
Você digita: "mete task urgente pro zé revisar aq schema hj"
    ↓
Normaliza → busca no banco por similaridade
    ↓
Score >= 0.72? → retorna da memória (zero token Groq)
Score < 0.72?  → chama Groq → salva resultado no banco
    ↓
Você confirma → hit_count++ → próxima busca mais precisa
```

Quanto mais você usa, menos o Groq é chamado.
O custo cai progressivamente com o tempo.

---

## Perfil por usuário

Cada usuário tem:
- `confidence_threshold` — a partir de que % executa sem wizard
- `personal_dict` — abreviações aprendidas permanentemente
- `auto_execute_count` — histórico de confirmações por ação
- `trust_level` — 0=novato / 1=regular / 2=avançado
- `is_public` — admin pode tornar o perfil público (memória compartilhada)

---

## Novos endpoints

| Endpoint | O que faz |
|----------|-----------|
| `GET /api/agent/memory/stats/{user_id}` | Quantas memórias, top ações, total hits |
| `GET /api/agent/admin/profiles` | Lista todos os perfis (admin) |
| `PATCH /api/agent/admin/profile/{uid}/visibility` | Torna perfil público/privado |

---

## Estrutura do zip

```
sprint3c/
├── backend/
│   ├── app/
│   │   ├── agent/
│   │   │   ├── intent_engine.py   ← busca memória antes do Groq
│   │   │   └── memory_store.py    ← NOVO — acesso à memória vetorial
│   │   ├── models/
│   │   │   └── memory.py          ← NOVO — tabelas de memória
│   │   ├── routers/
│   │   │   └── agent.py           ← + memory/stats + admin endpoints
│   │   └── main.py                ← versão 0.4.0
│   └── scripts/
│       └── sprint3c_schema.sql    ← migração se banco já existia
└── LEIA-ME-SPRINT3C.md
```

---

## INSTALAÇÃO

### 1. Copia os arquivos

```
sprint3c/backend/app/agent/memory_store.py   → orchflow/backend/app/agent/  (NOVO)
sprint3c/backend/app/agent/intent_engine.py  → orchflow/backend/app/agent/  (substitui)
sprint3c/backend/app/models/memory.py        → orchflow/backend/app/models/ (NOVO)
sprint3c/backend/app/routers/agent.py        → orchflow/backend/app/routers/(substitui)
sprint3c/backend/app/main.py                 → orchflow/backend/app/         (substitui)
```

### 2. Migração do banco

Se o banco já existia (veio dos sprints anteriores):
```powershell
# conecta no postgres e roda o SQL
docker exec -i orchflow-postgres-1 psql -U orchflow -d orchflow < backend/scripts/sprint3c_schema.sql
```

Se for banco novo — o `create_all` no startup cria tudo automaticamente.

### 3. Reinicia o uvicorn

```powershell
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8010
```

O log deve mostrar `version": "0.4.0"` no GET /.

---

## Checklist Sprint 3C

- [ ] Arquivos copiados
- [ ] Banco migrado (ou novo)
- [ ] uvicorn reiniciado — versão 0.4.0
- [ ] Swagger mostra `/api/agent/memory/stats/{user_id}`
- [ ] Manda um comando → confirma → manda o mesmo comando novamente
- [ ] Segunda vez aparece `from_memory: true` na resposta do /interpret
- [ ] `GET /api/agent/memory/stats/default` → memory_count > 0
- [ ] `GET /api/agent/profile/default` → perfil persiste após reiniciar uvicorn

Sprint 3C completo ✓

**Próximo — Sprint 3D:** Input de voz via Whisper (Groq tem grátis)
