# OrchFlow — Sprint 3D: Input de Voz via Whisper

## O que entra

Botão 🎤 no chat. Clica, fala, solta.
A voz passa pelo mesmo pipeline do texto — normalizer → memória → Groq intent → wizard.
Nenhuma mudança no fluxo de intenção. A origem mudou. O tratamento é o mesmo.

---

## Como funciona

```
Clica 🎤 → MediaRecorder (browser) grava
Solta    → envia áudio para /api/voice/transcribe
           Groq Whisper transcreve em português
           texto retorna para o ChatPanel
           segue o pipeline normal de intenção
```

Mensagens de voz aparecem com tag 🎤 no chat para identificar a origem.

---

## Modelos Groq usados

| Função | Modelo |
|--------|--------|
| Transcrição de voz | `whisper-large-v3-turbo` |
| Interpretação de intenção | `llama-3.3-70b-versatile` |

Ambos gratuitos no plano Groq free.

---

## Estrutura do zip

```
sprint3d/
├── backend/
│   ├── app/
│   │   ├── routers/voice.py   ← NOVO — endpoint /api/voice/transcribe
│   │   └── main.py            ← versão 0.5.0 com voice router
├── frontend/
│   ├── src/
│   │   ├── hooks/useVoiceInput.ts          ← NOVO
│   │   └── components/layout/ChatPanel.tsx ← botão de voz integrado
│   └── voice-styles-append.css             ← CSS do botão de voz
└── LEIA-ME-SPRINT3D.md
```

---

## INSTALAÇÃO

### 1. Backend

```
sprint3d/backend/app/routers/voice.py → orchflow/backend/app/routers/ (NOVO)
sprint3d/backend/app/main.py          → orchflow/backend/app/          (substitui)
```

Reinicia uvicorn — deve mostrar versão `0.5.0`.
Swagger deve mostrar `/api/voice/transcribe`.

### 2. Frontend

```
sprint3d/frontend/src/hooks/useVoiceInput.ts
→ orchflow/frontend/src/hooks/  (NOVO)

sprint3d/frontend/src/components/layout/ChatPanel.tsx
→ orchflow/frontend/src/components/layout/  (substitui)
```

Cole o conteúdo de `voice-styles-append.css` no **final** do `src/styles.css`.

### 3. Reinicia frontend

```powershell
# Ctrl+C no terminal do npm run dev, depois:
npm run dev
```

---

## Checklist Sprint 3D

- [ ] Swagger mostra `POST /api/voice/transcribe`
- [ ] Botão 🎤 aparece no chat (à esquerda do input)
- [ ] Clicar no botão pede permissão de microfone
- [ ] Botão fica vermelho pulsando durante gravação
- [ ] Soltar → fica âmbar enquanto transcreve
- [ ] Texto transcrito aparece no chat com tag 🎤
- [ ] Wizard abre normalmente com o texto transcrito
- [ ] Falar "cria tarefa urgente" → wizard com Q1 inferido

Sprint 3D completo ✓

**Próximo — Sprint 3E:** Input de imagem e PDF — OCR + mapeamento de campos + wizard
