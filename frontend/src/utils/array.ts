/**
 * Normaliza valores vindos da API: `?? []` não cobre `{}` (objeto vazio).
 */
export function toArr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : []
}
