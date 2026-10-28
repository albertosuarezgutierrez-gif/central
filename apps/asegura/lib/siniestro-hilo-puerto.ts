// Puerto del hilo de siniestro: comprobaciones comunes de las rutas `/api/operador/siniestro/{hilo,cierre,ia}` y
// `/api/operador/siniestros/esperando`. Sin `correduriaId` se usa la correduría única (igual que
// `/api/operador/siniestro`); si viene, tiene que ser la de esta correduría (403 si no).
import { NextResponse } from 'next/server'
import { aseguraConfigurada } from './asegura-db'
import { correduriaUnica } from './cartera'
import { CABECERA_ACTOR } from './actor'

/** La correduría pedida (o la única, si no se pide ninguna), comprobada; o la respuesta de error lista para devolver. */
export async function correduriaPedida(pedida: unknown): Promise<{ ok: true; id: string } | { ok: false; res: NextResponse }> {
  if (!aseguraConfigurada()) return { ok: false, res: NextResponse.json({ estado: 'sin_configurar' }, { status: 503 }) }
  const correduria = await correduriaUnica()
  if (!correduria) return { ok: false, res: NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 503 }) }
  if (typeof pedida !== 'string' || pedida.trim() === '') return { ok: true, id: correduria.id }
  if (pedida.trim() !== correduria.id) {
    return { ok: false, res: NextResponse.json({ estado: 'error', motivo: 'correduriaId no es el de esta correduría' }, { status: 403 }) }
  }
  return { ok: true, id: correduria.id }
}

export function respuestaFallo(f: { estado: string; motivo: string; status: number }): NextResponse {
  return NextResponse.json({ estado: f.estado, motivo: f.motivo }, { status: f.status })
}

/** Quién escribe: `actor` del cuerpo, si no la cabecera `x-actor`, si no `plataforma`. Sin PII. */
export function actorDe(req: Request, b: Record<string, unknown>): string {
  if (typeof b.actor === 'string' && b.actor.trim() !== '') return b.actor.trim().slice(0, 200)
  const h = (req.headers.get(CABECERA_ACTOR) ?? '').trim()
  return h !== '' ? h.slice(0, 200) : 'plataforma'
}

export function cadena(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}
