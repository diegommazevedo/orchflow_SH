import { useState, useRef, useEffect } from 'react'
import { useCreateTask } from '../../hooks/useData'

interface Message {
  role: 'user' | 'agent'
  text: string
}

interface Props {
  projectId: string | null
}

export function ChatPanel({ projectId }: Props) {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'agent', text: 'Olá. Estou conectado ao seu workspace.\n\nDigite o que quer fazer. Exemplo: "cria tarefa revisar o banco"' }
  ])
  const [input, setInput] = useState('')
  const createTask = useCreateTask()
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function addMsg(role: Message['role'], text: string) {
    setMessages(prev => [...prev, { role, text }])
  }

  function handleSend() {
    const text = input.trim()
    if (!text) return
    setInput('')
    addMsg('user', text)

    // Parser simples local — Sprint 3 isso vai para o agente real via Groq
    const lower = text.toLowerCase()
    if ((lower.includes('cria') || lower.includes('adiciona') || lower.includes('nova')) && projectId) {
      // extrai o título removendo palavras-comando
      const title = text
        .replace(/^(cria|adiciona|nova|novo|criar|adicionar)\s+(tarefa\s+)?/i, '')
        .trim()

      if (title.length > 2) {
        createTask.mutate(
          { title, project_id: projectId, quadrant: 'q2' },
          {
            onSuccess: () => addMsg('agent', `✓ Tarefa criada no backlog:\n\n"${title}"\n\nQuadrante: Q2 · Status: Backlog`),
            onError: () => addMsg('agent', 'Erro ao criar tarefa. O backend está rodando?'),
          }
        )
        addMsg('agent', 'Processando...')
        return
      }
    }

    if (!projectId) {
      addMsg('agent', 'Selecione um projeto na sidebar antes de criar tarefas.')
      return
    }

    addMsg('agent', 'Entendido. Em breve conectarei ao agente Groq para processar comandos mais complexos. Por ora, tente: "cria tarefa [nome da tarefa]"')
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <span style={{ fontSize: 16 }}>⬡</span>
        <div className="chat-title">Agente OrchFlow</div>
        <div className="chat-status">
          <div className="status-dot" />
          online
        </div>
      </div>

      <div className="chat-messages">
        {messages.map((m, i) => (
          <div key={i} className={`msg msg-${m.role}`}>
            <div className="msg-sender">{m.role === 'user' ? 'você //' : '// agente'}</div>
            <div className="msg-bubble" style={{ whiteSpace: 'pre-line' }}>{m.text}</div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="chat-input-area">
        <div className="chat-input-wrap">
          <textarea
            className="chat-input"
            placeholder="diga o que quer fazer..."
            rows={1}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
          />
          <button className="send-btn" onClick={handleSend}>↑</button>
        </div>
        <div className="chat-hint">enter para enviar · shift+enter nova linha</div>
      </div>
    </div>
  )
}
