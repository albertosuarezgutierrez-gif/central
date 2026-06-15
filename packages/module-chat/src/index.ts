// Motor de mensajería 1-a-1 agnóstico. Dos partes: 'gestor' y 'titular'.
export type ParteChat = 'gestor' | 'titular'

export type Mensaje = {
  id: string
  remitente: ParteChat
  texto: string
  leido_gestor: boolean
  leido_titular: boolean
  creada_at: string
}

/** La parte contraria (a quién va dirigido un mensaje de `p`). */
export function contraparte(p: ParteChat): ParteChat {
  return p === 'gestor' ? 'titular' : 'gestor'
}

/** Nº de mensajes NO leídos por `quien` (los que envió la contraparte y aún no ha leído). */
export function noLeidos(mensajes: Mensaje[], quien: ParteChat): number {
  const otra = contraparte(quien)
  const campo = quien === 'gestor' ? 'leido_gestor' : 'leido_titular'
  return mensajes.filter(m => m.remitente === otra && !m[campo]).length
}

/** Ordena cronológicamente (ascendente) para pintar el hilo. No muta el array de entrada. */
export function ordenarCronologico(mensajes: Mensaje[]): Mensaje[] {
  return [...mensajes].sort((a, b) => a.creada_at.localeCompare(b.creada_at))
}

/** Normaliza el texto de un mensaje saliente; lanza si queda vacío o excede el límite. */
export function validarTexto(texto: string, maxLen = 4000): string {
  const t = (texto ?? '').trim()
  if (!t) throw new Error('El mensaje está vacío')
  if (t.length > maxLen) throw new Error(`El mensaje supera ${maxLen} caracteres`)
  return t
}
