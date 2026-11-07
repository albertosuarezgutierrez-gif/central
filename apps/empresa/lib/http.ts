// Utilidades de las rutas del puerto del operador. El Bearer es SU secreto (HERRAMIENTAS_OPERADOR_SECRET), no el de otra app.
import { NextResponse } from 'next/server'
import { bearerValido, ENV_OPERADOR } from './secretos.ts'
import { esUuid } from './rls.ts'

export const noAutorizado = () => NextResponse.json({ error: 'no_autorizado' }, { status: 401 })
export const operadorAutorizado = (req: Request) => bearerValido(req.headers.get('authorization'), ENV_OPERADOR)

/** El actor (email del operador en plataforma) es OBLIGATORIO: queda en `envio.confirmado_por` y en `evento`. */
export function actorValido(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim().toLowerCase()
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(t) && t.length <= 200 ? t : null
}

export const uuidONull = (v: unknown): string | null => (esUuid(v) ? v.toLowerCase() : null)
export const textoONull = (v: unknown, max = 200): string | null => {
  if (typeof v !== 'string') return null
  const t = v.replace(/\s+/g, ' ').trim()
  return t ? t.slice(0, max) : null
}
