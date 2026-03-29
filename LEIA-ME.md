# OrchFlow — LEIA-ME: Passo a Passo Completo

## O que tem neste zip

```
orchflow/
├── backend/              ← API Python + FastAPI
│   ├── app/
│   │   ├── main.py       ← entrada da API
│   │   ├── database.py   ← conexão com PostgreSQL
│   │   ├── models/       ← estrutura das tabelas
│   │   └── routers/      ← endpoints da API
│   ├── .env              ← suas variáveis de ambiente
│   └── requirements.txt  ← dependências Python
├── frontend/
│   └── orchflow-shell.html  ← interface visual pronta (abra no browser)
├── docker-compose.yml    ← sobe o banco com 1 comando
└── LEIA-ME.md            ← este arquivo
```

---

## PRÉ-REQUISITOS

Antes de começar, confirme que tem instalado:
- **Docker Desktop** — https://www.docker.com/products/docker-desktop
- **Python 3.11+** — https://www.python.org/downloads
- **Node.js 18+** — https://nodejs.org (para o frontend React futuro)

---

## PASSO 1 — Sobe o banco de dados

Abra o terminal na pasta `orchflow/` e rode:

```bash
docker compose up -d
```

Aguarde 15 segundos. O PostgreSQL com pgvector estará rodando em `localhost:5432`.

Para confirmar que está rodando:
```bash
docker ps
```
Você verá um container com "pgvector" no nome.

---

## PASSO 2 — Configura o backend

```bash
cd backend

# Cria o ambiente virtual Python
python -m venv venv

# Ativa o ambiente (Mac/Linux)
source venv/bin/activate

# Ativa o ambiente (Windows)
venv\Scripts\activate

# Instala as dependências
pip install -r requirements.txt
```

---

## PASSO 3 — Roda o backend

```bash
# Ainda dentro de backend/ com venv ativo
uvicorn app.main:app --reload --port 8000
```

Acesse no browser: **http://localhost:8000/docs**

Você verá o Swagger — a documentação automática da API.
Se abrir = backend funcionando ✓

---

## PASSO 4 — Veja a interface

Abra o arquivo `frontend/orchflow-shell.html` direto no browser.

Você verá o shell visual completo:
- Sidebar esquerda com navegação e projetos
- Board central com cards Kanban
- Chat do agente à direita (já interativo)

---

## PASSO 5 — Configure suas chaves

Edite o arquivo `backend/.env`:

```env
DATABASE_URL=postgresql://orchflow:orchflow@localhost:5432/orchflow
SECRET_KEY=troque-esta-chave-em-producao
GROQ_API_KEY=coloque-sua-chave-groq-aqui
```

Para pegar sua chave Groq gratuita: https://console.groq.com

---

## CHECKLIST SPRINT 1

- [ ] Docker rodando (`docker ps` mostra container postgres)
- [ ] Backend respondendo em http://localhost:8000
- [ ] Swagger abrindo em http://localhost:8000/docs
- [ ] Interface visual abrindo no browser
- [ ] Chave Groq configurada no .env

Quando tudo marcado = Sprint 1 completo ✓
Próximo passo: conectar o frontend React ao backend via API.
