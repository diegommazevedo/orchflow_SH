/** Cor estável a partir de um nome ou id (avatars / pills). */
export function nameToColor(name: string): string {
  const colors = ['#89b4fa', '#a6e3a1', '#f9e2af', '#fab387', '#cba6f7', '#89dceb']
  let hash = 0
  for (const c of name) hash = c.charCodeAt(0) + hash * 31
  return colors[Math.abs(hash) % colors.length]
}

/** Até 2 letras para avatar. */
export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/** Assignee no título OrchFlow: `[Nome] · verbo…` */
export function extractAssigneeFromTitle(title: string): string | null {
  const m = title.match(/^\[([^\]]+)\]\s*/)
  if (!m) return null
  const raw = m[1].trim()
  return raw || null
}
